import { beforeEach, describe, expect, it } from 'vitest'
import { NewerThanApp, SchemaMismatch } from '../errors'
import type { Entry } from '../rows'
import { createFakeSheets, type FakeSheets } from './fakeSheets'
import { seedV2 } from './fixtures'
import { createSheetsStore } from './sheetsStore'

const coffee: Entry = {
  id: 'e1', kind: 'expense', date: '2024-01-05', money: { minor: 350, currency: 'GBP' },
  description: 'Coffee', place: 'Cafe', category: 'Groceries', account: 'Joint',
}
const salary: Entry = {
  id: 'i1', kind: 'income', date: '2024-01-25', money: { minor: 300000, currency: 'EUR' },
  description: 'Salary', category: 'Paycheck', account: 'Joint',
}
const move: Entry = {
  id: 't1', kind: 'transfer', date: '2024-01-26', money: { minor: 5000, currency: 'EUR' },
  description: 'Top up', account: 'Joint', toAccount: 'M-Cash',
}

let fake: FakeSheets
let now = 1_000_000
const make = () => createSheetsStore(fake, { 2024: 'sheet-2024' }, { now: () => now, newId: () => 'gen-id' })

beforeEach(() => {
  fake = createFakeSheets()
  now = 1_000_000
  seedV2(fake, 'sheet-2024', {
    entries: [
      { row: 10, entry: coffee },
      { row: 10, entry: salary },
      { row: 10, entry: move },
    ],
  })
})

describe('sheets store: read', () => {
  it('reads all three tabs, lists and rates in exactly one batchGet', async () => {
    const store = make()
    const entries = await store.list(2024)
    const lists = await store.lists(2024)
    const rates = await store.rates(2024)
    expect(fake.count('batchGet')).toBe(1)
    expect(entries.map((e) => e.id).sort()).toEqual(['e1', 'i1', 't1'])
    expect(entries.find((e) => e.id === 'e1')).toEqual(coffee)
    expect(lists.expenseCategories).toContain('Groceries')
    expect(lists.incomeCategories).toEqual(['Paycheck', 'Interest'])
    expect(lists.accounts).toEqual(['Joint', 'M-Cash', 'T-Cash'])
    expect(lists.expenseBudgets.Groceries[0]).toBe(25000)
    expect(rates).toEqual({ base: 'EUR', rates: { EUR: 1, GBP: 1.15, USD: 0.9 } })
  })

  it('requests unformatted values', async () => {
    await make().list(2024)
    const call = fake.calls.find((c) => c.method === 'batchGet')!
    expect(call.args[2]).toBe('UNFORMATTED_VALUE')
  })

  it('rejects sheets that are not on the current schema', async () => {
    fake.book('sheet-2024').metadata.set('fitracker.schemaVersion', '0')
    await expect(make().list(2024)).rejects.toBeInstanceOf(SchemaMismatch)
  })

  it('returns cached data within the refresh interval and re-reads after it', async () => {
    const store = make()
    await store.refresh(2024)
    await store.refresh(2024)
    expect(fake.count('batchGet')).toBe(1)
    now += 16_000
    await store.refresh(2024)
    expect(fake.count('batchGet')).toBe(2)
    await store.refresh(2024, { force: true })
    expect(fake.count('batchGet')).toBe(3)
  })

  it('reports expected ids that are missing from the sheet', async () => {
    const store = make()
    const r = await store.refresh(2024, { expectIds: ['e1', 'gone'] })
    expect(r.missingIds).toEqual(['gone'])
  })

  it('fills in an id for a row typed directly in Sheets, writing column A only', async () => {
    const b = fake.book('sheet-2024')
    b.write('Expenses!B20:I20', [[45300, '', 4, '', 'Lunch', 'Bills', 'Joint', 'EUR']])
    const store = make()
    const entries = await store.list(2024)
    expect(entries.some((e) => e.description === 'Lunch')).toBe(true)
    await store.refresh(2024, { force: true })
    expect(b.get('Expenses!A20')?.v).toBe('gen-id')
    const writes = fake.calls.filter((c) => c.method === 'valuesBatchUpdate').flatMap((c) => c.args[1] as { range: string }[])
    expect(writes.every((w) => /!A\d+$/.test(w.range))).toBe(true)
  })

  it('re-checks the schema version now and then so a stale session notices a newer sheet', async () => {
    const store = make()
    await store.list(2024)
    fake.book('sheet-2024').metadata.set('fitracker.schemaVersion', '3')
    now += 6 * 60_000
    await expect(store.refresh(2024, { force: true })).rejects.toBeInstanceOf(NewerThanApp)
  })

  it('notifies subscribers after a refresh', async () => {
    const store = make()
    let n = 0
    const off = store.subscribe(() => n++)
    await store.refresh(2024, { force: true })
    off()
    await store.refresh(2024, { force: true })
    expect(n).toBe(1)
  })
})
