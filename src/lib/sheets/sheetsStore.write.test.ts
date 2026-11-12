import { beforeEach, describe, expect, it } from 'vitest'
import { RowChanged, RowGone } from '../errors'
import type { Entry } from '../rows'
import { createFakeSheets, type FakeSheets } from './fakeSheets'
import { seedV2 } from './fixtures'
import { createSheetsStore } from './sheetsStore'

const ID = 'sheet-2024'
const mk = (id: string, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2024-01-05', money: { minor: 350, currency: 'GBP' },
  description: 'Coffee', place: 'Cafe', category: 'Groceries', account: 'Joint', ...o,
})
const inc = (id: string): Entry => ({ id, kind: 'income', date: '2024-01-25', money: { minor: 300000, currency: 'EUR' }, description: 'Salary', category: 'Paycheck', account: 'Joint' })

let fake: FakeSheets
const make = () => createSheetsStore(fake, { 2024: ID }, { newId: () => 'gen' })
const writtenRanges = () => fake.calls.filter((c) => c.method === 'valuesBatchUpdate').flatMap((c) => (c.args[1] as { range: string }[]).map((w) => w.range))

beforeEach(() => {
  fake = createFakeSheets()
  seedV2(fake, ID)
})

describe('addMany', () => {
  it('places entries on consecutive free rows with one read, one write and one read-back', async () => {
    const res = await make().addMany(2024, [mk('a'), mk('b'), inc('c')])
    expect(res.every((r) => r.ok)).toBe(true)
    expect(fake.count('batchGet')).toBe(2)
    expect(fake.count('valuesBatchUpdate')).toBe(1)
    const b = fake.book(ID)
    expect(b.get('Expenses!A10')?.v).toBe('a')
    expect(b.get('Expenses!A11')?.v).toBe('b')
    expect(b.get('Income!A10')?.v).toBe('c')
    expect(b.get('Expenses!D10')?.v).toBe(3.5)
    expect(b.get('Expenses!I10')?.v).toBe('GBP')
  })

  it('never writes column C or Setup', async () => {
    await make().addMany(2024, [mk('a'), inc('c')])
    for (const r of writtenRanges()) {
      expect(r).not.toMatch(/^Setup!/)
      expect(r).not.toMatch(/!C\d+/)
    }
    expect(fake.book(ID).get('Expenses!C10')?.f).toContain('ARRAYFORMULA')
  })

  it('moves an entry to the next free row when a competing write takes its row', async () => {
    fake.afterNextWrite(() => fake.injectWrite(ID, 'Expenses!A10:I10', [['other', 45292, '', 1, '', 'x', 'Bills', 'Joint', 'EUR']]))
    const res = await make().addMany(2024, [mk('a')])
    expect(res[0].ok).toBe(true)
    const b = fake.book(ID)
    expect(b.get('Expenses!A10')?.v).toBe('other')
    expect(b.get('Expenses!A11')?.v).toBe('a')
    expect(fake.count('valuesBatchUpdate')).toBe(2)
  })

  it('stores hostile text literally and the date as a serial number', async () => {
    await make().addMany(2024, [mk('a', { description: '=HYPERLINK("x")', place: '@home' })])
    const b = fake.book(ID)
    expect(b.get('Expenses!F10')).toEqual({ v: '=HYPERLINK("x")' })
    expect(b.get('Expenses!E10')).toEqual({ v: '@home' })
    expect(typeof b.get('Expenses!B10')?.v).toBe('number')
    const call = fake.calls.find((c) => c.method === 'valuesBatchUpdate')!
    expect(call.args[0]).toBe(ID)
  })

  it('reports TabFull without overwriting and still places other entries', async () => {
    const col = Array.from({ length: 991 }, () => ['x'])
    fake.book(ID).write('Expenses!A10:A1000', col)
    const res = await make().addMany(2024, [mk('a'), inc('c')])
    expect(res).toEqual([{ id: 'a', ok: false, reason: 'TabFull' }, { id: 'c', ok: true }])
    expect(fake.book(ID).get('Expenses!A1000')?.v).toBe('x')
    expect(fake.book(ID).get('Income!A10')?.v).toBe('c')
  })

  it('is idempotent: re-sending an entry that is already in the sheet writes nothing', async () => {
    const store = make()
    await store.addMany(2024, [mk('a')])
    const res = await store.addMany(2024, [mk('a')])
    expect(res).toEqual([{ id: 'a', ok: true }])
    expect(fake.count('valuesBatchUpdate')).toBe(1)
  })

  it('makes new entries visible to the next list', async () => {
    const store = make()
    await store.list(2024)
    await store.addMany(2024, [mk('a')])
    expect((await store.list(2024)).map((e) => e.id)).toContain('a')
  })
})

describe('edit', () => {
  beforeEach(() => {
    seedV2(fake, ID, { entries: [{ row: 10, entry: mk('a') }] })
  })

  it('finds the row by id, returns the previous values from the sheet and leaves C alone', async () => {
    const store = make()
    const { previous } = await store.edit(2024, mk('a', { description: 'Tea', money: { minor: 500, currency: 'EUR' } }))
    expect(previous).toEqual(mk('a'))
    const b = fake.book(ID)
    expect(b.get('Expenses!F10')?.v).toBe('Tea')
    expect(b.get('Expenses!D10')?.v).toBe(5)
    expect(b.get('Expenses!I10')?.v).toBe('EUR')
    expect(b.get('Expenses!C10')?.f).toContain('ARRAYFORMULA')
    for (const r of writtenRanges()) expect(r).not.toMatch(/!C\d+/)
  })

  it('rejects an unknown id with RowGone', async () => {
    await expect(make().edit(2024, mk('zzz'))).rejects.toBeInstanceOf(RowGone)
  })

  it('refuses to write when the row now holds a different entry', async () => {
    fake.book(ID).write('Expenses!B10:I10', [[45400, '', 99, '', 'Rent', 'Bills', 'Joint', 'EUR']])
    await expect(make().edit(2024, mk('a', { description: 'Tea' }), mk('a'))).rejects.toBeInstanceOf(RowChanged)
    expect(fake.book(ID).get('Expenses!F10')?.v).toBe('Rent')
  })

  it('lets a partial change through: last write wins', async () => {
    fake.book(ID).write('Expenses!F10', [['Latte']])
    const { previous } = await make().edit(2024, mk('a', { description: 'Tea' }), mk('a'))
    expect(previous.description).toBe('Latte')
    expect(fake.book(ID).get('Expenses!F10')?.v).toBe('Tea')
  })
})

describe('delete', () => {
  beforeEach(() => {
    seedV2(fake, ID, { entries: [{ row: 10, entry: mk('a') }] })
  })

  it('clears A, B and D..last, keeps the C formula, and the row is reused by the next add', async () => {
    const store = make()
    const { previous } = await store.delete(2024, 'expense', 'a')
    expect(previous).toEqual(mk('a'))
    const b = fake.book(ID)
    for (const ref of ['A10', 'B10', 'D10', 'E10', 'F10', 'I10']) expect(b.get(`Expenses!${ref}`)).toBeUndefined()
    expect(b.get('Expenses!C10')?.f).toContain('ARRAYFORMULA')
    await store.addMany(2024, [mk('n')])
    expect(b.get('Expenses!A10')?.v).toBe('n')
  })

  it('rejects an unknown id with RowGone', async () => {
    await expect(make().delete(2024, 'expense', 'nope')).rejects.toBeInstanceOf(RowGone)
  })
})

describe('wrong-row protection', () => {
  const noText = (id: string) => mk(id, { description: '', place: 'Cafe' })
  beforeEach(() => {
    seedV2(fake, ID, { entries: [{ row: 10, entry: noText('a') }] })
    // ids drifted away from their entries: row 10 still has id "a" but now holds another entry
    fake.book(ID).write('Expenses!B10:I10', [[45400, '', 999, 'Rent', '', 'Bills', 'Joint', 'EUR']])
  })
  it('refuses to edit it even though both descriptions are empty', async () => {
    await expect(make().edit(2024, { ...noText('a'), money: { minor: 100, currency: 'EUR' } }, noText('a'))).rejects.toBeInstanceOf(RowChanged)
    expect(fake.book(ID).get('Expenses!E10')?.v).toBe('Rent')
  })
  it('refuses to delete it', async () => {
    await expect(make().delete(2024, 'expense', 'a', noText('a'))).rejects.toBeInstanceOf(RowChanged)
    expect(fake.book(ID).get('Expenses!A10')?.v).toBe('a')
  })
  it('still lets a change to only the amount through', async () => {
    fake.book(ID).write('Expenses!B10:I10', [[45296, '', 999, 'Cafe', '', 'Groceries', 'Joint', 'GBP']])
    await expect(make().edit(2024, noText('a'), noText('a'))).resolves.toBeDefined()
  })
})
