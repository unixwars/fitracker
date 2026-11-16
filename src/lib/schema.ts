// The single source of truth for the sheet layout: tab names, columns, ranges, version.
import type { Currency } from './types'

export type Kind = 'expense' | 'income' | 'transfer'

export const META_KEY = 'fitracker.schemaVersion'

// One multi-year book (spec 3.2 to 3.5).
export const BOOK_VERSION = 3

export const LEDGER = {
  tab: 'Ledger',
  firstRow: 2,
  lastRow: 1000, // only used by the find-free-row alternative if spike S1 fails
  headers: ['id', 'date', 'type', 'amount', 'place', 'description', 'category', 'account', 'to_account', 'base_amount'],
  cols: { id: 'A', date: 'B', type: 'C', amount: 'D', place: 'E', description: 'F', category: 'G', account: 'H', toAccount: 'I', base: 'J' },
  ranges: { rows: 'Ledger!A2:I', typesToAccounts: 'Ledger!C2:I', rowsWithBase: 'Ledger!A2:J', ids: 'Ledger!A2:A', header: 'Ledger!A1:J1' },
} as const

export const SNAPSHOTS = {
  tab: 'Snapshots',
  firstRow: 2,
  headers: ['id', 'date', 'account', 'balance', 'note'],
  ranges: { rows: 'Snapshots!A2:E', ids: 'Snapshots!A2:A', accounts: 'Snapshots!C2:C', header: 'Snapshots!A1:E1' },
} as const

// The reference tabs the app may append to (docs/designs/specs/2026-11-16-add-accounts-categories.md). The caps are the
// template's: Accounts is trimmed to 1 + MAX_ACCOUNTS rows and Balances warns above 40; the category views list at most
// 30 active expense and 15 active income categories. schema.test.ts ties these numbers to template/build-template.gs.
export const ACCOUNTS = {
  tab: 'Accounts',
  firstRow: 2,
  lastRow: 41,
  lastCol: 'E',
  headers: ['name', 'currency', 'active', 'In Monthly', 'In Annual'],
  max: 40,
  ranges: { rows: 'Accounts!A2:E', header: 'Accounts!A1:E1' },
} as const

export const CATEGORIES = {
  tab: 'Categories',
  firstRow: 2,
  lastCol: 'C',
  headers: ['name', 'type', 'active'],
  maxExpense: 30,
  maxIncome: 15,
  ranges: { rows: 'Categories!A2:C', header: 'Categories!A1:C1' },
} as const

export const REFERENCE = {
  base: 'Settings!B1',
  accounts: ACCOUNTS.ranges.rows,
  categories: CATEGORIES.ranges.rows,
  budgets: 'Budgets!A2:D',
} as const

export const RATES = { tab: 'Rates', firstRow: 2, ranges: { rows: 'Rates!A2:C', months: 'Rates!A2:A' } } as const

/** A1 range of one whole row of a tab from column A to `lastCol`, e.g. rowRange('Ledger', 7, 'I') is Ledger!A7:I7. */
export const rowRange = (tab: string, row: number, lastCol: string): string => `${tab}!A${row}:${lastCol}${row}`

/** The live current-rate cell formula of the Rates month row (one unit of `currency` in `base`). */
export const rateFormula = (currency: 'GBP' | 'USD', base: Currency): string => `=GOOGLEFINANCE("CURRENCY:${currency}${base}")`
