// Seeds a fake spreadsheet in schema v2. Used by tests and by the offline end-to-end mode.
import { dateToSerial, entryToWrites, ledgerRowValues, snapshotRowValues, todayLocal, type Entry } from '../rows'
import { BOOK_VERSION, LEDGER, META_KEY, SETUP, SNAPSHOTS, TABS, KINDS, SCHEMA_VERSION, rateFormula } from '../schema'
import { toSheetNumber } from '../money'
import type { Lists, Reference, Snapshot } from '../types'
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

// ---- v3 ledger layout (one multi-year book). Unit fixtures use fixed 2026 budgets; only devFake uses the current year. ----
const acct = (name: string, currency: 'EUR' | 'GBP' | 'USD') => ({ name, currency, active: true, inMonthly: true, inAnnual: true })
const cat = (name: string, type: 'expense' | 'income') => ({ name, type, active: true })

export const DEFAULT_REFERENCE: Reference = {
  base: 'EUR',
  accounts: [acct('Joint', 'EUR'), acct('M-Cash', 'EUR'), acct('T-Cash', 'GBP')],
  categories: [cat('Business', 'expense'), cat('Groceries', 'expense'), cat('Bills', 'expense'), cat('Recreation', 'expense'), cat('Paycheck', 'income'), cat('Interest', 'income')],
  budgets: [
    { year: 2026, type: 'expense', category: 'Business', monthly: 15000 },
    { year: 2026, type: 'expense', category: 'Groceries', monthly: 25000 },
    { year: 2026, type: 'expense', category: 'Bills', monthly: 5000 },
    { year: 2026, type: 'expense', category: 'Recreation', monthly: 10000 },
    { year: 2026, type: 'income', category: 'Paycheck', monthly: 280000 },
    { year: 2026, type: 'income', category: 'Interest', monthly: 0 },
  ],
}

export type SeedRate = { month: string; GBP: number; USD: number }

/**
 * Seeds a fake spreadsheet in the v3 layout: headers, the J2 array formula cell, reference tabs, Rates rows as
 * values with the row of `today`'s month as live formula cells (added when missing), entries and snapshots from
 * row 2, and the version tag unless `metadata: false`.
 */
export function seedLedger(
  fake: FakeSheets,
  id: string,
  opts: { reference?: Reference; entries?: Entry[]; snapshots?: Snapshot[]; rates?: SeedRate[]; metadata?: boolean; today?: string } = {},
): void {
  const b = fake.book(id)
  const ref = opts.reference ?? DEFAULT_REFERENCE
  for (const tab of ['Ledger', 'Snapshots', 'Settings', 'Accounts', 'Categories', 'Budgets', 'Rates']) b.tab(tab)
  b.write('Ledger!A1:J1', [[...LEDGER.headers]])
  b.set('Ledger!J2', { f: '=ARRAYFORMULA(IF(LEN(B2:B&C2:C&D2:D&H2:H)=0,"",...))', v: '' })
  b.write('Snapshots!A1:E1', [[...SNAPSHOTS.headers]])
  b.write('Accounts!A1:E1', [['name', 'currency', 'active', 'In Monthly', 'In Annual']])
  b.write('Categories!A1:C1', [['name', 'type', 'active']])
  b.write('Budgets!A1:D1', [['year', 'type', 'category', 'monthly amount']])
  b.write('Rates!A1:C1', [['month', 'GBP', 'USD']])
  b.write('Settings!A1:B1', [['Base currency', ref.base]])
  b.write('Accounts!A2:E' + (1 + ref.accounts.length), ref.accounts.map((a) => [a.name, a.currency, a.active, a.inMonthly, a.inAnnual]))
  b.write('Categories!A2:C' + (1 + ref.categories.length), ref.categories.map((c) => [c.name, c.type, c.active]))
  if (ref.budgets.length) b.write('Budgets!A2:D' + (1 + ref.budgets.length), ref.budgets.map((x) => [x.year, x.type, x.category, toSheetNumber(x.monthly)]))

  const thisMonth = (opts.today ?? todayLocal()).slice(0, 7) + '-01'
  const rates = [...(opts.rates ?? [])].sort((x, y) => x.month.localeCompare(y.month))
  rates.forEach((r, i) => b.write(`Rates!A${2 + i}:C${2 + i}`, [[dateToSerial(r.month), r.GBP, r.USD]]))
  if (!rates.some((r) => r.month === thisMonth)) {
    const row = 2 + rates.length
    b.set(`Rates!A${row}`, dateToSerial(thisMonth))
    b.set(`Rates!B${row}`, { f: rateFormula('GBP', ref.base), v: fake.liveRates.GBP })
    b.set(`Rates!C${row}`, { f: rateFormula('USD', ref.base), v: fake.liveRates.USD })
  }

  const entries = opts.entries ?? []
  if (entries.length) b.write(`Ledger!A2:I${1 + entries.length}`, entries.map(ledgerRowValues))
  const snapshots = opts.snapshots ?? []
  if (snapshots.length) b.write(`Snapshots!A2:E${1 + snapshots.length}`, snapshots.map(snapshotRowValues))
  if (opts.metadata !== false) b.metadata.set(META_KEY, String(BOOK_VERSION))
}
