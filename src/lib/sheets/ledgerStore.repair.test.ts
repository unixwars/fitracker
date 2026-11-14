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

describe('rows without a usable id are fixed by their row, but only while they still hold what the person was shown', () => {
  const junk = ['', 'xx', 'expense', 'ten', '', 'junk', 'Groceries', 'Joint']
  const withJunk = () => {
    const t = setup()
    t.fake.book('S1').write('Ledger!A4:I4', [junk])
    t.fake.book('S1').write('Ledger!A5:I5', [ledgerRowValues(e('b'))]) // a copy of b: a duplicate id
    return t
  }
  it('every unreadable Ledger row carries its raw cells, including a duplicate', async () => {
    const { store } = withJunk()
    const u = await store.unreadable()
    expect(u.find((x) => x.row === 4)?.raw).toEqual(junk)
    expect(u.find((x) => x.row === 5)).toMatchObject({ reason: 'duplicateId', raw: expect.any(Array) })
  })
  it('repairRowAt overwrites that row with the corrected entry and a new id; other rows are untouched', async () => {
    const { fake, store } = withJunk()
    const raw = (await store.unreadable()).find((x) => x.row === 4)!.raw!
    await store.repairRowAt(4, raw, e('new1', { description: 'fixed' }))
    expect(fake.book('S1').get('Ledger!A4')?.v).toBe('new1')
    expect(fake.book('S1').get('Ledger!F4')?.v).toBe('fixed')
    expect(fake.book('S1').get('Ledger!A3')?.v).toBe('b')
    await store.refresh({ force: true })
    expect((await store.list()).map((x) => x.id)).toContain('new1')
    expect((await store.unreadable()).some((x) => x.row === 4)).toBe(false)
  })
  it('a row that changed since it was shown (a sort, an insert, an edit) is refused and nothing is written', async () => {
    const { fake, store } = withJunk()
    const raw = (await store.unreadable()).find((x) => x.row === 4)!.raw!
    fake.book('S1').set('Ledger!D4', 'eleven') // someone edited it
    const writes = fake.count('valuesBatchUpdate')
    await expect(store.repairRowAt(4, raw, e('new1'))).rejects.toMatchObject({ name: 'RowChanged' })
    await expect(store.clearRowAt(4, raw)).rejects.toMatchObject({ name: 'RowChanged' })
    expect(fake.count('valuesBatchUpdate')).toBe(writes)
    expect(fake.count('valuesBatchClear')).toBe(0)
  })
  it('refuses a new id that already exists and an entry that does not match its account currency', async () => {
    const { store } = withJunk()
    const raw = (await store.unreadable()).find((x) => x.row === 4)!.raw!
    await expect(store.repairRowAt(4, raw, e('a'))).rejects.toMatchObject({ name: 'RowChanged' })
    await expect(store.repairRowAt(4, raw, e('new2', { money: { minor: 1, currency: 'GBP' } }))).rejects.toMatchObject({ name: 'AccountChanged' })
  })
  it('clearRowAt clears A to I of that row only', async () => {
    const { fake, store } = withJunk()
    const raw = (await store.unreadable()).find((x) => x.row === 4)!.raw!
    await store.clearRowAt(4, raw)
    expect(fake.book('S1').read('Ledger!A4:I4', 'UNFORMATTED_VALUE').flat().filter((x) => x !== '')).toEqual([])
    expect(fake.book('S1').get('Ledger!A3')?.v).toBe('b')
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
