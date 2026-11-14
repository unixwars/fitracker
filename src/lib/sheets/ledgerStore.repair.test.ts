import { describe, expect, it } from 'vitest'
import { ledgerRowValues, type Entry } from '../rows'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const e = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2026-11-03', money: { minor: 1250, currency: 'EUR' }, description: `d-${id}`, place: 'Shop', category: 'Groceries', account: 'Joint', ...extra,
})
function setup() {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12', entries: [e('a'), e('b')] })
  fake.book('S1').set('Ledger!B2', 'not a date') // row 2 (id a) is now unreadable
  return { fake, store: createLedgerStore(fake, 'S1', { now: () => 1000 }) }
}

describe('unreadable rows carry what is needed to fix them', () => {
  it('a Ledger row with an id reports the id and the raw cells; a duplicate id reports no id', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!A5:I5', [ledgerRowValues(e('b'))]) // copy of b, row 5
    const u = await store.unreadable()
    expect(u.find((x) => x.row === 2)).toMatchObject({ reason: 'date', id: 'a', raw: ['a', 'not a date', 'expense', 12.5, 'Shop', 'd-a', 'Groceries', 'Joint'] })
    expect(u.find((x) => x.row === 5)).toMatchObject({ reason: 'duplicateId' })
    expect(u.find((x) => x.row === 5)?.id).toBeUndefined()
  })
})

describe('repair mode (fix or delete an unreadable row by its id)', () => {
  it('a normal edit refuses an unreadable row; a repair edit writes the corrected entry to that row only', async () => {
    const { fake, store } = setup()
    await expect(store.edit(e('a'))).rejects.toMatchObject({ name: 'RowChanged' })
    await store.edit(e('a', { description: 'fixed' }), undefined, { repair: true })
    expect(fake.book('S1').read('Ledger!A2:I2', 'UNFORMATTED_VALUE')[0][1]).toBe(46329) // 2026-11-03 as a serial
    expect(fake.book('S1').get('Ledger!F2')?.v).toBe('fixed')
    expect(fake.book('S1').get('Ledger!A3')?.v).toBe('b') // the next row is untouched
    await store.refresh({ force: true })
    expect(await store.unreadable()).toEqual([])
    expect((await store.list()).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('a repair edit still refuses an entry that does not match its account currency', async () => {
    const { store } = setup()
    await expect(store.edit(e('a', { money: { minor: 100, currency: 'GBP' } }), undefined, { repair: true })).rejects.toMatchObject({ name: 'AccountChanged' })
  })
  it('a repair delete clears A to I of that row only and hands back the entry it was given', async () => {
    const { fake, store } = setup()
    const out = await store.delete('a', e('a'), { repair: true })
    expect(out.previous.id).toBe('a')
    expect(fake.book('S1').read('Ledger!A2:I2', 'UNFORMATTED_VALUE').flat().filter((x) => x !== '')).toEqual([])
    expect(fake.book('S1').get('Ledger!A3')?.v).toBe('b')
  })
  it('repair never acts on a duplicated id, a missing id, or a row that moved', async () => {
    const { fake, store } = setup()
    await expect(store.edit(e('zzz'), undefined, { repair: true })).rejects.toMatchObject({ name: 'RowGone' })
    fake.book('S1').write('Ledger!A5:I5', [ledgerRowValues(e('a'))])
    await expect(store.edit(e('a'), undefined, { repair: true })).rejects.toMatchObject({ name: 'RowChanged' })
    await expect(store.delete('a', e('a'), { repair: true })).rejects.toMatchObject({ name: 'RowChanged' })
    expect(fake.count('valuesBatchClear')).toBe(0)
  })
})

describe('sheetInfo', () => {
  it('the fake returns a title and the numeric id of each tab', async () => {
    const { fake } = setup()
    fake.book('S1').title = 'My ledger'
    const info = await fake.sheetInfo('S1')
    expect(info.title).toBe('My ledger')
    expect(Object.keys(info.tabs)).toEqual(expect.arrayContaining(['Ledger', 'Snapshots', 'Rates']))
    expect(typeof info.tabs.Ledger).toBe('number')
  })
})
