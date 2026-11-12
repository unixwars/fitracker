import { beforeEach, describe, expect, it } from 'vitest'
import { NewerThanApp, UnrecognisedLayout } from '../errors'
import { META_KEY } from '../schema'
import { createFakeSheets, type FakeSheets } from '../sheets/fakeSheets'
import { seedV0, seedV2, V0_CONVERSION } from '../sheets/fixtures'
import { detectVersion, pendingMigrations, runMigrations } from './index'

const ID = 'sheet-1'
let fake: FakeSheets
let n = 0
const newId = () => `id${++n}`

beforeEach(() => {
  fake = createFakeSheets()
  n = 0
  seedV0(fake, ID, {
    rows: [
      { kind: 'expense', row: 10, cells: { B: 45292, D: 5, E: 'Cafe', F: 'Coffee', G: 'Groceries', H: 'Joint' } },
      { kind: 'expense', row: 12, cells: { B: 45293, C: 20, F: 'Taxi', G: 'Bills', H: 'Joint' } },
      { kind: 'income', row: 10, cells: { B: 45294, C: 2000, E: 'Salary', F: 'Joint', G: 'Paycheck' } },
    ],
  })
})

const writes = () => fake.calls.filter((c) => ['applyOps', 'valuesBatchUpdate', 'valuesBatchClear'].includes(c.method)).length

describe('detectVersion', () => {
  it('reads the stored version', async () => {
    fake.book(ID).metadata.set(META_KEY, '1')
    expect(await detectVersion(fake, ID)).toBe(1)
  })
  it('classifies a raw template by its headers as version 0', async () => {
    expect(await detectVersion(fake, ID)).toBe(0)
  })
  it('classifies a v2-headed sheet without metadata as version 2 and stamps it', async () => {
    const f = createFakeSheets()
    seedV2(f, 'x', { metadata: false })
    expect(await detectVersion(f, 'x')).toBe(2)
    expect(f.book('x').metadata.get(META_KEY)).toBe('2')
  })
  it('rejects unknown headers without writing anything', async () => {
    fake.book(ID).set('Expenses!B9', 'Foo')
    await expect(detectVersion(fake, ID)).rejects.toBeInstanceOf(UnrecognisedLayout)
    expect(writes()).toBe(0)
  })
})

describe('runMigrations 0 -> 1', () => {
  it('writes ids for every non-empty row only, and hides column A', async () => {
    await runMigrations(fake, ID, { newId, to: 1 })
    const b = fake.book(ID)
    expect(b.get('Expenses!A10')?.v).toBe('id1')
    expect(b.get('Expenses!A11')).toBeUndefined()
    expect(b.get('Expenses!A12')?.v).toBeDefined()
    expect(new Set(['Expenses!A10', 'Expenses!A12', 'Income!A10'].map((r) => b.get(r)?.v)).size).toBe(3)
    expect(b.get('Transfers!A10')).toBeUndefined()
    for (const t of ['Expenses', 'Income', 'Transfers']) expect(b.hidden.has(`${t}!A`)).toBe(true)
    expect(b.metadata.get(META_KEY)).toBe('1')
  })

  it('keeps the original values and the conversion formulas', async () => {
    await runMigrations(fake, ID, { newId, to: 1 })
    const b = fake.book(ID)
    expect(b.get('Expenses!D10')?.v).toBe(5)
    expect(b.get('Expenses!C10')?.f).toBe(V0_CONVERSION(10).f)
  })

  it('makes a backup copy of every entry tab before changing anything', async () => {
    await runMigrations(fake, ID, { newId, to: 1 })
    const b = fake.book(ID)
    for (const t of ['Expenses', 'Income', 'Transfers']) expect(b.sheets.has(`${t} (backup v0)`)).toBe(true)
    expect(b.get('Expenses (backup v0)!D10')?.v).toBe(5)
    expect(b.get('Expenses (backup v0)!A10')).toBeUndefined()
  })

  it('applies the whole step atomically: a mid-step failure changes nothing', async () => {
    fake.failApplyAfter(3)
    await expect(runMigrations(fake, ID, { newId, to: 1 })).rejects.toThrow()
    const b = fake.book(ID)
    expect(b.get('Expenses!A10')).toBeUndefined()
    expect(b.sheets.has('Expenses (backup v0)')).toBe(false)
    expect(b.metadata.get(META_KEY)).toBeUndefined()
  })

  it('is a no-op when run again', async () => {
    await runMigrations(fake, ID, { newId, to: 1 })
    const before = writes()
    await runMigrations(fake, ID, { newId, to: 1 })
    expect(writes()).toBe(before)
  })

  it('refuses a sheet newer than the app', async () => {
    fake.book(ID).metadata.set(META_KEY, '3')
    await expect(runMigrations(fake, ID, { newId })).rejects.toBeInstanceOf(NewerThanApp)
    expect(writes()).toBe(0)
  })
})

describe('pendingMigrations', () => {
  it('lists the steps from the current version', () => {
    expect(pendingMigrations(0).map((m) => [m.from, m.to])).toContainEqual([0, 1])
    expect(pendingMigrations(1).every((m) => m.from >= 1)).toBe(true)
  })
})
