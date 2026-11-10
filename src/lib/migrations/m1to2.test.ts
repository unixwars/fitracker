import { beforeEach, describe, expect, it } from 'vitest'
import { FlaggedRows } from '../errors'
import { META_KEY } from '../schema'
import { createFakeSheets, type FakeSheets } from '../sheets/fakeSheets'
import { seedV0, V0_CONVERSION } from '../sheets/fixtures'
import { pendingMigrations, runMigrations } from './index'

const ID = 'sheet-1'
let fake: FakeSheets
let n = 0
const newId = () => `id${++n}`
const base = {
  rows: [
    { kind: 'expense' as const, row: 10, cells: { B: 45292, D: 5, E: 'Cafe', F: 'Coffee', G: 'Groceries', H: 'Joint' } }, // GBP via D
    { kind: 'expense' as const, row: 12, cells: { B: 45293, C: 20, F: 'Taxi', G: 'Bills', H: 'Joint' } }, // EUR typed over C
    { kind: 'expense' as const, row: 14, cells: { B: 45294, C: 10, D: 7, F: 'Both', G: 'Bills', H: 'Joint' } }, // C wins
    { kind: 'expense' as const, row: 16, cells: { B: 45295, F: 'Date only' } }, // incomplete row stays empty
    { kind: 'income' as const, row: 10, cells: { B: 45296, C: 2000, E: 'Salary', F: 'Joint', G: 'Paycheck' } },
    { kind: 'transfer' as const, row: 10, cells: { B: 45297, D: 100, E: 'Top up', F: 'Joint', G: 'M-Cash' } },
  ],
}

beforeEach(() => {
  fake = createFakeSheets()
  n = 0
  seedV0(fake, ID, base)
})

const writes = () => fake.calls.filter((c) => ['applyOps', 'valuesBatchUpdate', 'valuesBatchClear'].includes(c.method)).length

describe('pendingMigrations', () => {
  it('runs 0->1 then 1->2 from a raw template', () => {
    expect(pendingMigrations(0).map((m) => [m.from, m.to])).toEqual([[0, 1], [1, 2]])
  })
})

describe('migration 1 -> 2', () => {
  it('classifies every row into Amount and Currency', async () => {
    await runMigrations(fake, ID, { newId })
    const b = fake.book(ID)
    expect([b.get('Expenses!D10')?.v, b.get('Expenses!I10')?.v]).toEqual([5, 'GBP'])
    expect([b.get('Expenses!D12')?.v, b.get('Expenses!I12')?.v]).toEqual([20, 'EUR'])
    expect([b.get('Expenses!D14')?.v, b.get('Expenses!I14')?.v]).toEqual([10, 'EUR'])
    expect(b.get('Expenses!D16')).toBeUndefined()
    expect(b.get('Expenses!I16')).toBeUndefined()
    expect([b.get('Income!D10')?.v, b.get('Income!H10')?.v]).toEqual([2000, 'EUR'])
    expect([b.get('Transfers!D10')?.v, b.get('Transfers!H10')?.v]).toEqual([100, 'GBP'])
  })

  it('keeps amounts typed in the euro column as EUR whatever base currency is chosen', async () => {
    await runMigrations(fake, ID, { newId, baseCurrency: 'GBP' })
    const b = fake.book(ID)
    expect(b.get('Expenses!I12')?.v).toBe('EUR')
    expect(b.get('Setup!U8')?.v).toBe('GBP')
    expect(b.get('Setup!U16')?.f).toBe('=GOOGLEFINANCE("CURRENCY:"&T16&$U$8)')
    expect(b.get('Setup!U17')?.v).toBe(1)
  })

  it('migrates rows below the template range and leaves nothing in C under the array formula', async () => {
    const b = fake.book(ID)
    b.set('Expenses!C1001', { f: V0_CONVERSION(1001).f, v: '' }) // a row inserted by hand pushed the formulas down
    b.write('Expenses!B1001:H1001', [[45300, '', 7, 'Cafe', 'Late', 'Bills', 'Joint']])
    await runMigrations(fake, ID, { newId })
    const after = fake.book(ID) // the fake swaps in a new book for each atomic batch
    expect([after.get('Expenses!D1001')?.v, after.get('Expenses!I1001')?.v]).toEqual([7, 'GBP'])
    expect(after.get('Expenses!C1001')).toBeUndefined()
    expect(after.get('Expenses!A1001')?.v).toBeDefined()
  })

  it('leaves exactly one array formula in C10 and nothing below it', async () => {
    await runMigrations(fake, ID, { newId })
    const b = fake.book(ID)
    expect(b.get('Expenses!C10')?.f).toMatch(/^=ARRAYFORMULA\(IF\(D10:D="","",D10:D\*IF\(I10:I="GBP",Setup!\$U\$17/)
    expect(b.get('Income!C10')?.f).toContain('H10:H')
    for (const r of [11, 12, 14, 500, 1000]) expect(b.get(`Expenses!C${r}`)).toBeUndefined()
    expect(b.get('Income!C10')?.f).toBeDefined()
  })

  it('relabels headers, adds the currency dropdown and resets the amount format', async () => {
    await runMigrations(fake, ID, { newId })
    const b = fake.book(ID)
    expect(b.get('Expenses!D9')?.v).toBe('Amount')
    expect(b.get('Expenses!I9')?.v).toBe('Currency')
    expect(b.get('Income!H9')?.v).toBe('Currency')
    expect(b.validations.some((v) => v.range === 'Expenses!I10:I' && v.values.join() === 'EUR,GBP,USD')).toBe(true)
    expect(b.formats['Expenses!D10:D']).toBeDefined()
  })

  it('writes the base currency and the three rate cells to Setup', async () => {
    await runMigrations(fake, ID, { newId })
    const b = fake.book(ID)
    expect(b.get('Setup!U8')?.v).toBe('EUR')
    expect([b.get('Setup!T16')?.v, b.get('Setup!T17')?.v, b.get('Setup!T18')?.v]).toEqual(['EUR', 'GBP', 'USD'])
    expect(b.get('Setup!U16')?.v).toBe(1)
    expect(b.get('Setup!U17')?.f).toBe('=GOOGLEFINANCE("CURRENCY:"&T17&$U$8)')
    expect(b.get('Setup!U18')?.f).toBe('=GOOGLEFINANCE("CURRENCY:"&T18&$U$8)')
  })

  it('makes a backup of the v1 state and stamps version 2', async () => {
    await runMigrations(fake, ID, { newId })
    const b = fake.book(ID)
    expect(b.sheets.has('Expenses (backup v0)')).toBe(true)
    expect(b.sheets.has('Expenses (backup v1)')).toBe(true)
    expect(b.get('Expenses (backup v1)!C12')?.v).toBe(20)
    expect(b.metadata.get(META_KEY)).toBe('2')
  })

  it('stops before writing anything when a row cannot be classified', async () => {
    fake.book(ID).set('Expenses!C20', { f: '=20*1.17', v: 23.4 })
    fake.book(ID).set('Expenses!B20', 45300)
    const err = await runMigrations(fake, ID, { newId }).catch((e) => e)
    expect(err).toBeInstanceOf(FlaggedRows)
    expect(err.rows).toEqual([{ kind: 'expense', row: 20, reason: expect.any(String) }])
    expect(fake.book(ID).metadata.get(META_KEY)).toBe('1') // 0->1 already applied atomically, 1->2 not started
    expect(fake.book(ID).get('Expenses!D9')?.v).toBe('£ Amount')
  })

  it('is a no-op on a v2 sheet and leaves a failed step unchanged', async () => {
    await runMigrations(fake, ID, { newId })
    const before = writes()
    await runMigrations(fake, ID, { newId })
    expect(writes()).toBe(before)

    const f2 = createFakeSheets()
    seedV0(f2, ID, base)
    await runMigrations(f2, ID, { newId, to: 1 })
    f2.failApplyAfter(5)
    await expect(runMigrations(f2, ID, { newId })).rejects.toThrow()
    expect(f2.book(ID).get('Expenses!D9')?.v).toBe('£ Amount')
    expect(f2.book(ID).metadata.get(META_KEY)).toBe('1')
  })
})
