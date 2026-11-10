// The single source of truth for the sheet layout: tab names, columns, ranges, version.
import type { Currency } from './types'

export type Kind = 'expense' | 'income' | 'transfer'
export type Field = 'place' | 'description' | 'category' | 'account' | 'toAccount'

export const SCHEMA_VERSION = 2
export const META_KEY = 'fitracker.schemaVersion'
export const HEADER_ROW = 9
export const FIRST_ROW = 10

export type ColumnMap = {
  id: string
  date: string
  base: string // base-currency value, a sheet formula in v2: never written by the app
  amount: string
  currency: string // v2 only
  fields: Partial<Record<Field, string>>
}

type TabDef = {
  name: string
  lastRow: number // last row that carries the template's formulas
  cols: ColumnMap
  headersV0: string[] // B..last in the raw template
  headersV2: string[] // B..last after migration
}

export const TABS: Record<Kind, TabDef> = {
  expense: {
    name: 'Expenses',
    lastRow: 1000,
    cols: { id: 'A', date: 'B', base: 'C', amount: 'D', currency: 'I', fields: { place: 'E', description: 'F', category: 'G', account: 'H' } },
    headersV0: ['Date', '€ Amount', '£ Amount', 'Location', 'Description', 'Category', 'Account'],
    headersV2: ['Date', 'Base amount', 'Amount', 'Location', 'Description', 'Category', 'Account', 'Currency'],
  },
  income: {
    name: 'Income',
    lastRow: 986,
    cols: { id: 'A', date: 'B', base: 'C', amount: 'D', currency: 'H', fields: { description: 'E', account: 'F', category: 'G' } },
    headersV0: ['Date', '€ Amount', '£ Amount', 'Description', 'Account', 'Category'],
    headersV2: ['Date', 'Base amount', 'Amount', 'Description', 'Account', 'Category', 'Currency'],
  },
  transfer: {
    name: 'Transfers',
    lastRow: 1004,
    cols: { id: 'A', date: 'B', base: 'C', amount: 'D', currency: 'H', fields: { description: 'E', account: 'F', toAccount: 'G' } },
    headersV0: ['Date', '€ Amount', '£ Amount', 'Note', 'Source Account', 'Destination Account'],
    headersV2: ['Date', 'Base amount', 'Amount', 'Note', 'Source Account', 'Destination Account', 'Currency'],
  },
}

export const KINDS = Object.keys(TABS) as Kind[]

export const SETUP = {
  tab: 'Setup',
  year: 'Setup!C8',
  baseLabel: 'Setup!T8',
  baseCurrency: 'Setup!U8',
  rateLabels: 'Setup!T16:T18',
  rateCells: { EUR: 'Setup!U16', GBP: 'Setup!U17', USD: 'Setup!U18' } as Record<Currency, string>,
  rateRange: 'Setup!T16:U18',
  expenseCategories: 'Setup!B46:B68',
  incomeCategories: 'Setup!B16:B35',
  accounts: 'Setup!B76:B102',
  expenseBudgets: 'Setup!B46:N68', // name, then one column per month
  incomeBudgets: 'Setup!B16:N35',
}

export const colIndex = (letter: string): number => letter.charCodeAt(0) - 65
export const lastColumn = (kind: Kind): string => TABS[kind].cols.currency

export function dataRange(kind: Kind): string {
  const t = TABS[kind]
  return `${t.name}!A${FIRST_ROW}:${t.cols.currency}${t.lastRow}`
}

export function columnRange(kind: Kind, letter: string): string {
  const t = TABS[kind]
  return `${t.name}!${letter}${FIRST_ROW}:${letter}${t.lastRow}`
}

export function headerRange(kind: Kind): string {
  const t = TABS[kind]
  return `${t.name}!B${HEADER_ROW}:${t.cols.currency}${HEADER_ROW}`
}
