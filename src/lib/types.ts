export const CURRENCIES = ['EUR', 'GBP', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]
export type Money = { minor: number; currency: Currency }

// The ledger book: reference tabs, rates and snapshots (one multi-year sheet).
export type EntryType = 'expense' | 'income'
export type Account = { name: string; currency: Currency; active: boolean; inMonthly: boolean; inAnnual: boolean }
export type Category = { name: string; type: EntryType; active: boolean }
// monthly is minor units in the base currency.
export type Budget = { year: number; type: EntryType; category: string; monthly: number }
export type Reference = { base: Currency; accounts: Account[]; categories: Category[]; budgets: Budget[] }
// month is YYYY-MM-01; GBP and USD are the base-currency value of one unit, null when the cell is blank or not a number.
export type RateRow = { month: string; GBP: number | null; USD: number | null }
export type Snapshot = { id: string; date: string; account: string; balance: Money; note: string }
export type UnreadableReason = 'date' | 'amount' | 'type' | 'account' | 'toAccount' | 'duplicateId'
export type Unreadable = { tab: 'Ledger' | 'Snapshots'; row: number; reason: UnreadableReason; text: string }
