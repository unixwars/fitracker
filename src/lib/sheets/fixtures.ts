// Seeds a fake spreadsheet in schema v2. Used by tests and by the offline end-to-end mode.
import { entryToWrites, type Entry } from '../rows'
import { META_KEY, SETUP, TABS, KINDS, SCHEMA_VERSION } from '../schema'
import type { Lists } from '../types'
import type { FakeSheets } from './fakeSheets'

export const DEFAULT_LISTS: Lists = {
  expenseCategories: ['Business', 'Groceries', 'Bills', 'Recreation'],
  incomeCategories: ['Paycheck', 'Interest'],
  accounts: ['Joint', 'M-Cash', 'T-Cash'],
  expenseBudgets: {
    Business: Array(12).fill(15000), Groceries: Array(12).fill(25000),
    Bills: Array(12).fill(5000), Recreation: Array(12).fill(10000),
  },
  incomeBudgets: { Paycheck: Array(12).fill(280000), Interest: Array(12).fill(0) },
}

export function seedV2(fake: FakeSheets, id: string, opts: { year?: number; base?: 'EUR' | 'GBP' | 'USD'; lists?: Lists; entries?: { row: number; entry: Entry }[]; metadata?: boolean } = {}): void {
  const b = fake.book(id)
  const lists = opts.lists ?? DEFAULT_LISTS
  b.set(SETUP.year, opts.year ?? 2024)
  b.set(SETUP.baseCurrency, opts.base ?? 'EUR')
  const labels = ['EUR', 'GBP', 'USD'] as const
  const rates = { EUR: 1, GBP: 1.15, USD: 0.9 }
  labels.forEach((c, i) => {
    b.set(`Setup!T${16 + i}`, c)
    b.set(`Setup!U${16 + i}`, rates[c])
  })
  const put = (startRow: number, names: string[], budgets?: Record<string, number[]>) =>
    names.forEach((n, i) => {
      b.set(`Setup!B${startRow + i}`, n)
      budgets?.[n]?.forEach((m, j) => b.set(`Setup!${String.fromCharCode(67 + j)}${startRow + i}`, m / 100))
    })
  put(46, lists.expenseCategories, lists.expenseBudgets)
  put(16, lists.incomeCategories, lists.incomeBudgets)
  put(76, lists.accounts)
  for (const k of KINDS) {
    const t = TABS[k]
    t.headersV2.forEach((h, i) => b.set(`${t.name}!${String.fromCharCode(66 + i)}9`, h))
    b.set(`${t.name}!C10`, { f: '=ARRAYFORMULA(...)', v: '' })
  }
  for (const { row, entry } of opts.entries ?? []) {
    for (const w of entryToWrites(entry, row)) b.write(w.range, w.values)
  }
  if (opts.metadata !== false) b.metadata.set(META_KEY, String(SCHEMA_VERSION))
}

const V0_CONVERSION = (row: number) => ({ f: `=IFERROR(__xludf.DUMMYFUNCTION("IF(NOT(ISBLANK(D${row})),GOOGLEFINANCE(""CURRENCY:GBPEUR"")*D${row},"""")"),"")`, v: '' })

export type V0Row = { kind: 'expense' | 'income' | 'transfer'; row: number; cells: Record<string, unknown> } // cells by column letter
export { V0_CONVERSION }

/** Seeds a fake spreadsheet in the raw template layout (version 0): EUR in C, GBP in D, formulas in C. */
export function seedV0(fake: FakeSheets, id: string, opts: { rows?: V0Row[]; year?: number; lists?: Lists } = {}): void {
  seedV2(fake, id, { year: opts.year, lists: opts.lists, metadata: false })
  const b = fake.book(id)
  for (const k of KINDS) {
    const t = TABS[k]
    b.clear(`${t.name}!B9:${t.cols.currency}9`)
    t.headersV0.forEach((h, i) => b.set(`${t.name}!${String.fromCharCode(66 + i)}9`, h))
    b.clear(`${t.name}!C10:C${t.lastRow}`)
    for (let r = 10; r <= t.lastRow; r++) b.set(`${t.name}!C${r}`, V0_CONVERSION(r))
  }
  for (const r of opts.rows ?? []) {
    const name = TABS[r.kind].name
    for (const [col, v] of Object.entries(r.cells)) b.set(`${name}!${col}${r.row}`, v)
  }
}
