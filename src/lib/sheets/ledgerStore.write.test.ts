import { describe, expect, it } from 'vitest'
import type { Entry } from '../rows'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const entry = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2026-11-03', money: { minor: 1250, currency: 'EUR' }, description: `d-${id}`, category: 'Groceries', account: 'Joint', ...extra,
})
const idsColumn = (fake: ReturnType<typeof createFakeSheets>, rows = 60) => fake.book('S1').read(`Ledger!A2:A${rows}`, 'UNFORMATTED_VALUE').map((r) => String(r[0] ?? ''))

function setup(rows = 0) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12', entries: Array.from({ length: rows }, (_, i) => entry(`seed${i}`)) })
  const store = createLedgerStore(fake, 'S1', { now: () => 1000 })
  return { fake, store }
}

describe('addMany (append, spike S1 branch A)', () => {
  it('appends three entries with one read before, one append and one read-back', async () => {
    const { fake, store } = setup(20) // rows 2..21
    fake.book('S1').clear('Ledger!A8:I9')
    const res = await store.addMany([entry('a'), entry('b'), entry('c')])
    expect(res).toEqual([{ id: 'a', ok: true }, { id: 'b', ok: true }, { id: 'c', ok: true }])
    expect(fake.count('batchGet')).toBe(2)
    expect(fake.count('valuesAppend')).toBe(1)
    expect(fake.count('valuesBatchUpdate')).toBe(0)
    expect(fake.book('S1').read('Ledger!A22:A24', 'UNFORMATTED_VALUE').flat()).toEqual(['a', 'b', 'c'])
  })
  it('an id already in the sheet is not appended again', async () => {
    const { fake, store } = setup(2)
    expect(await store.addMany([entry('seed0')])).toEqual([{ id: 'seed0', ok: true }])
    expect(fake.count('valuesAppend')).toBe(0)
  })
  it('duplicates in one call are appended once', async () => {
    const { fake, store } = setup()
    await store.addMany([entry('a'), entry('a')])
    expect(idsColumn(fake).filter((x) => x === 'a')).toHaveLength(1)
  })
  it('hostile text is stored literally', async () => {
    const { fake, store } = setup()
    await store.addMany([entry('a', { description: '=HYPERLINK("x")', place: "'quoted" })])
    expect(fake.book('S1').get('Ledger!F2')).toEqual({ v: '=HYPERLINK("x")' })
    expect(fake.book('S1').get('Ledger!E2')).toEqual({ v: "'quoted" })
  })
  it('writes only A to I and never J', async () => {
    const { fake, store } = setup()
    await store.addMany([entry('a')])
    expect(fake.calls.filter((c) => c.method === 'valuesAppend').map((c) => c.args[1])).toEqual(['Ledger!A:I'])
    expect(fake.book('S1').get('Ledger!J2')?.f).toMatch(/^=ARRAYFORMULA/)
    expect(fake.book('S1').get('Ledger!J3')).toBeUndefined()
  })
  it("refuses an entry whose currency differs from its account's (Review Focus 3) and an unknown account", async () => {
    const { fake, store } = setup()
    const res = await store.addMany([
      entry('a', { money: { minor: 500, currency: 'GBP' } }), // Joint is EUR
      entry('b', { account: 'Nowhere' }),
      entry('c', { kind: 'transfer', toAccount: 'Nowhere', category: undefined }),
      entry('d'),
    ])
    expect(res).toEqual([
      { id: 'a', ok: false, reason: 'AccountChanged' },
      { id: 'b', ok: false, reason: 'AccountChanged' },
      { id: 'c', ok: false, reason: 'AccountChanged' },
      { id: 'd', ok: true },
    ])
    expect(idsColumn(fake).filter(Boolean)).toEqual(['d'])
  })
  it('a hand-typed row below the table is not overwritten', async () => {
    const { fake, store } = setup(20)
    fake.book('S1').write('Ledger!A25:I25', [['typed', 46000, 'expense', 3, '', 'x', 'Groceries', 'Joint']])
    await store.addMany([entry('a')])
    expect(fake.book('S1').get('Ledger!A25')?.v).toBe('typed')
    expect(fake.book('S1').get('Ledger!A26')?.v).toBe('a')
  })
  it('an overwritten row is retried and the entry ends up once, on a new row', async () => {
    const { fake, store } = setup()
    fake.afterNextWrite(() => fake.book('S1').set('Ledger!A2', 'someone-else'))
    const res = await store.addMany([entry('a')])
    expect(res).toEqual([{ id: 'a', ok: true }])
    expect(idsColumn(fake).filter((x) => x === 'a')).toHaveLength(1)
  })
  it('a row that was moved (a sort) is found again and never appended twice', async () => {
    const { fake, store } = setup()
    fake.afterNextWrite(() => {
      const b = fake.book('S1')
      const values = b.read('Ledger!A2:I2', 'UNFORMATTED_VALUE')
      b.clear('Ledger!A2:I2')
      b.write('Ledger!A9:I9', values)
    })
    expect(await store.addMany([entry('a')])).toEqual([{ id: 'a', ok: true }])
    expect(fake.count('valuesAppend')).toBe(1)
    expect(idsColumn(fake).filter((x) => x === 'a')).toHaveLength(1)
  })
  it('gives up with an error after three failed attempts instead of looping', async () => {
    const { fake, store } = setup()
    const wipe = () => { fake.book('S1').clear('Ledger!A2:I60'); fake.afterNextWrite(wipe) }
    fake.afterNextWrite(wipe)
    await expect(store.addMany([entry('a')])).rejects.toThrow()
    expect(fake.count('valuesAppend')).toBeLessThanOrEqual(3)
  })
})
