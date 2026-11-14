import { describe, expect, it } from 'vitest'
import type { Entry } from '../rows'
import { ledgerRowValues } from '../rows'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const e = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2026-11-03', money: { minor: 1250, currency: 'EUR' }, description: `d-${id}`, place: 'Shop', category: 'Groceries', account: 'Joint', ...extra,
})
function setup(entries: Entry[]) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12', entries })
  return { fake, store: createLedgerStore(fake, 'S1', { now: () => 1000 }) }
}

describe('duplicate ids (review M2)', () => {
  it('lists the first row only and reports every later row as unreadable', async () => {
    const { fake, store } = setup([e('a'), e('b')])
    fake.book('S1').write('Ledger!A4:I4', [ledgerRowValues(e('a', { money: { minor: 999, currency: 'EUR' } }))]) // a copied row keeps its id
    expect((await store.list()).map((x) => x.id)).toEqual(['a', 'b'])
    expect(await store.unreadable()).toEqual([{ tab: 'Ledger', row: 4, reason: 'duplicateId', text: 'd-a' }])
  })
  it('refuses to edit or delete an id that occurs twice and clears nothing', async () => {
    const { fake, store } = setup([e('a'), e('b')])
    fake.book('S1').write('Ledger!A4:I4', [ledgerRowValues(e('a'))])
    await expect(store.delete('a')).rejects.toMatchObject({ name: 'RowChanged' })
    await expect(store.edit(e('a', { description: 'x' }))).rejects.toMatchObject({ name: 'RowChanged' })
    expect(fake.count('valuesBatchClear')).toBe(0)
    expect(fake.book('S1').get('Ledger!A2')?.v).toBe('a')
  })
})

describe('the located row must still hold the id (review M4)', () => {
  it('flags a delete when a sort moved the row between the two reads, and clears nothing', async () => {
    const { fake, store } = setup([e('a'), e('b')])
    const real = fake.batchGet.bind(fake)
    let n = 0
    fake.batchGet = async (...args) => {
      const out = await real(...args)
      if (++n === 1) fake.injectWrite('S1', 'Ledger!A2:I3', [ledgerRowValues(e('b')), ledgerRowValues(e('a'))]) // sorted right after the id read
      return out
    }
    await expect(store.delete('a')).rejects.toMatchObject({ name: 'RowChanged' })
    expect(fake.count('valuesBatchClear')).toBe(0)
  })
  it('does the same for a snapshot delete', async () => {
    const fake = createFakeSheets()
    const s = (id: string) => ({ id, date: '2026-10-31', account: 'Joint', balance: { minor: 100, currency: 'EUR' as const }, note: '' })
    seedLedger(fake, 'S1', { today: '2026-11-12', snapshots: [s('s1'), s('s2')] })
    const store = createLedgerStore(fake, 'S1', { now: () => 1000 })
    const real = fake.batchGet.bind(fake)
    let n = 0
    fake.batchGet = async (...args) => {
      const out = await real(...args)
      if (++n === 1) fake.injectWrite('S1', 'Snapshots!A2:E3', [['s2', 46326, 'Joint', 1, ''], ['s1', 46326, 'Joint', 1, '']])
      return out
    }
    await expect(store.deleteSnapshot('s1')).rejects.toMatchObject({ name: 'RowChanged' })
    expect(fake.count('valuesBatchClear')).toBe(0)
  })
})

describe('a missing tab on a tagged book (review m1)', () => {
  it('is an unrecognised layout, not a generic error, so writes stop', async () => {
    const { fake, store } = setup([e('a')])
    fake.strictTabs = true
    fake.book('S1').sheets.delete('Snapshots')
    await expect(store.list()).rejects.toMatchObject({ name: 'UnrecognisedLayout' })
    await expect(store.addMany([e('z')])).rejects.toMatchObject({ name: 'UnrecognisedLayout' })
  })
})
