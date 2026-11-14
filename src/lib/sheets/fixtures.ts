// Seeds fake spreadsheets. Used by tests and by the offline end-to-end mode.
import { dateToSerial, ledgerRowValues, snapshotRowValues, todayLocal, type Entry } from '../rows'
import { BOOK_VERSION, LEDGER, META_KEY, SNAPSHOTS, rateFormula } from '../schema'
import { toSheetNumber } from '../money'
import type { Reference, Snapshot } from '../types'
import type { FakeSheets } from './fakeSheets'

/** A legacy yearly sheet (one tab per kind, a Setup tab, no Ledger tab): what the app must refuse to read or write. */
export function seedLegacy(fake: FakeSheets, id: string): void {
  const b = fake.book(id)
  b.set('Setup!C8', 2024)
  for (const tab of ['Expenses', 'Income', 'Transfers']) {
    b.set(`${tab}!B9`, 'Date')
    b.set(`${tab}!C9`, '€ Amount')
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
