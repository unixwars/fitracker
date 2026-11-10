export const CURRENCIES = ['EUR', 'GBP', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]
export type Money = { minor: number; currency: Currency }

// Budgets are minor units in the sheet's base currency, one value per month (Jan..Dec).
export type Lists = {
  expenseCategories: string[]
  incomeCategories: string[]
  accounts: string[]
  expenseBudgets: Record<string, number[]>
  incomeBudgets: Record<string, number[]>
}
