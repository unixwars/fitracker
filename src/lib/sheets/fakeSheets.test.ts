import { describe, expect, it } from 'vitest'
import { ApiError } from '../errors'
import { BOOK_VERSION, META_KEY } from '../schema'
import { createFakeSheets, type FakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'

const entryRow = (n: number) => [`id${n}`, 45292, 'expense', 1, '', '', 'Groceries', 'Joint']

function ledgerWith(rows: number): { fake: FakeSheets; id: string } {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1')
  fake.book('S1').write(`Ledger!A2:I${rows + 1}`, Array.from({ length: rows }, (_, i) => entryRow(i + 1)))
  return { fake, id: 'S1' }
}

describe('fake valuesAppend (the semantics spike S1 confirms live)', () => {
  it('lands after the last non-empty row, around a cleared gap', async () => {
    const { fake, id } = ledgerWith(20) // rows 2..21
    fake.book(id).clear('Ledger!A8:I9')
    const out = await fake.valuesAppend(id, 'Ledger!A:I', [entryRow(99)])
    expect(out.updatedRange).toBe('Ledger!A22:I22')
    expect(fake.book(id).get('Ledger!A22')?.v).toBe('id99')
  })
  it('reuses a cleared LAST row', async () => {
    const { fake, id } = ledgerWith(20)
    fake.book(id).clear('Ledger!A21:I21')
    expect((await fake.valuesAppend(id, 'Ledger!A:I', [entryRow(99)])).updatedRange).toBe('Ledger!A21:I21')
  })
  it('writes several rows consecutively and reports them', async () => {
    const { fake, id } = ledgerWith(20)
    const out = await fake.valuesAppend(id, 'Ledger!A:I', [entryRow(90), entryRow(91), entryRow(92)])
    expect(out.updatedRange).toBe('Ledger!A22:I24')
    expect(fake.book(id).get('Ledger!A24')?.v).toBe('id92')
  })
  it('two concurrent appends use different rows', async () => {
    const { fake, id } = ledgerWith(20)
    const [a, b] = await Promise.all([fake.valuesAppend(id, 'Ledger!A:I', [entryRow(90)]), fake.valuesAppend(id, 'Ledger!A:I', [entryRow(91)])])
    expect(new Set([a.updatedRange, b.updatedRange]).size).toBe(2)
  })
  it('respects a hand-typed row below the table', async () => {
    const { fake, id } = ledgerWith(20)
    fake.book(id).write('Ledger!A25:I25', [entryRow(77)])
    expect((await fake.valuesAppend(id, 'Ledger!A:I', [entryRow(99)])).updatedRange).toBe('Ledger!A26:I26')
  })
  it('column J does not count towards the table end', async () => {
    const { fake, id } = ledgerWith(20)
    fake.book(id).set('Ledger!J30', 12)
    expect((await fake.valuesAppend(id, 'Ledger!A:I', [entryRow(99)])).updatedRange).toBe('Ledger!A22:I22')
  })
  it('appends to Snapshots after the header', async () => {
    const { fake, id } = ledgerWith(1)
    expect((await fake.valuesAppend(id, 'Snapshots!A:E', [['s1', 45292, 'Joint', 5, '']])).updatedRange).toBe('Snapshots!A2:E2')
  })
})

describe('fake writes and hooks', () => {
  it('USER_ENTERED stores a GOOGLEFINANCE formula with the live rate as its value', async () => {
    const { fake, id } = ledgerWith(1)
    fake.liveRates.GBP = 1.2
    await fake.valuesBatchUpdate(id, [{ range: 'Rates!B9', values: [['=GOOGLEFINANCE("CURRENCY:GBPEUR")']] }], 'USER_ENTERED')
    expect(fake.book(id).get('Rates!B9')).toEqual({ f: '=GOOGLEFINANCE("CURRENCY:GBPEUR")', v: 1.2 })
    await fake.valuesBatchUpdate(id, [{ range: 'Rates!B10', values: [['=GOOGLEFINANCE("CURRENCY:GBPEUR")']] }])
    expect(fake.book(id).get('Rates!B10')).toEqual({ v: '=GOOGLEFINANCE("CURRENCY:GBPEUR")' })
  })
  it('setMetadata stores the value', async () => {
    const { fake, id } = ledgerWith(1)
    await fake.setMetadata(id, 'k', '3')
    expect(await fake.getMetadata(id, 'k')).toBe('3')
  })
  it('beforeNextWrite runs before the write lands and afterNextWrite after', async () => {
    const { fake, id } = ledgerWith(1)
    const seen: string[] = []
    fake.beforeNextWrite(() => seen.push(`before:${String(fake.book(id).get('Ledger!A9')?.v)}`))
    fake.afterNextWrite(() => seen.push(`after:${String(fake.book(id).get('Ledger!A9')?.v)}`))
    await fake.valuesBatchUpdate(id, [{ range: 'Ledger!A9', values: [['x']] }])
    expect(seen).toEqual(['before:undefined', 'after:x'])
  })
  it('strictTabs makes a read of a missing tab a 400 like the real API', async () => {
    const { fake, id } = ledgerWith(1)
    await expect(fake.batchGet(id, ['Ledger!A1:J1'])).resolves.toBeTruthy()
    fake.strictTabs = true
    await expect(fake.batchGet(id, ['Nowhere!A1:B2'])).rejects.toMatchObject({ status: 400 })
    await expect(fake.batchGet(id, ['Nowhere!A1:B2'])).rejects.toBeInstanceOf(ApiError)
  })
})

describe('seedLedger', () => {
  it('writes the headers, the version tag, the J2 formula and a live current-month Rates row', () => {
    const fake = createFakeSheets()
    seedLedger(fake, 'S1', { today: '2026-11-12' })
    const b = fake.book('S1')
    expect(b.read('Ledger!A1:J1', 'UNFORMATTED_VALUE')[0]).toHaveLength(10)
    expect(b.get('Ledger!J2')?.f).toMatch(/^=ARRAYFORMULA/)
    expect(b.metadata.get(META_KEY)).toBe(String(BOOK_VERSION))
    expect(b.get('Rates!A2')?.v).toBe(46327) // 2026-11-01
    expect(b.get('Rates!B2')).toEqual({ f: '=GOOGLEFINANCE("CURRENCY:GBPEUR")', v: 1.17 })
  })
  it('can leave the version tag out', () => {
    const fake = createFakeSheets()
    seedLedger(fake, 'S1', { metadata: false })
    expect(fake.book('S1').metadata.has(META_KEY)).toBe(false)
  })
  it('seeds entries from row 2 and snapshots from row 2', () => {
    const fake = createFakeSheets()
    seedLedger(fake, 'S1', {
      entries: [{ id: 'a', kind: 'expense', date: '2024-01-01', money: { minor: 1250, currency: 'EUR' }, description: 'Milk', category: 'Groceries', account: 'Joint' }],
      snapshots: [{ id: 's1', date: '2024-01-01', account: 'Joint', balance: { minor: 10000, currency: 'EUR' }, note: '' }],
    })
    const b = fake.book('S1')
    expect(b.read('Ledger!A2:I2', 'UNFORMATTED_VALUE')[0]).toEqual(['a', 45292, 'expense', 12.5, '', 'Milk', 'Groceries', 'Joint'])
    expect(b.read('Snapshots!A2:E2', 'UNFORMATTED_VALUE')[0]).toEqual(['s1', 45292, 'Joint', 100])
  })
})
