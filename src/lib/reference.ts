import { toMinor } from './money'
import { serialToDate } from './rows'
import { CURRENCIES, type Account, type Budget, type Category, type Currency, type RateRow, type Reference } from './types'

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim())
const flag = (v: unknown): boolean => v === true || (typeof v === 'string' && v.trim().toUpperCase() === 'TRUE')
const currencyOf = (v: unknown): Currency | null => (CURRENCIES as readonly string[]).includes(text(v)) ? (text(v) as Currency) : null
const number = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Settings!B1, Accounts, Categories and Budgets (raw values, header excluded) into one Reference. Bad rows are skipped. */
export function parseReference(base: unknown[][], accounts: unknown[][], categories: unknown[][], budgets: unknown[][]): Reference {
  const accountRows: Account[] = []
  for (const r of accounts) {
    const name = text(r[0])
    const currency = currencyOf(r[1])
    if (name && currency) accountRows.push({ name, currency, active: flag(r[2]), inMonthly: flag(r[3]), inAnnual: flag(r[4]) })
  }
  const categoryRows: Category[] = []
  for (const r of categories) {
    const name = text(r[0])
    const type = text(r[1])
    if (name && (type === 'expense' || type === 'income')) categoryRows.push({ name, type, active: flag(r[2]) })
  }
  const budgetRows: Budget[] = []
  for (const r of budgets) {
    const year = number(r[0])
    const type = text(r[1])
    const category = text(r[2])
    const amount = number(r[3])
    if (year !== null && category && amount !== null && (type === 'expense' || type === 'income')) {
      budgetRows.push({ year, type, category, monthly: toMinor(amount) })
    }
  }
  return { base: currencyOf(base[0]?.[0]) ?? 'EUR', accounts: accountRows, categories: categoryRows, budgets: budgetRows }
}

/** Rates!A2:C. A month is any date forced to the first of its month; blank or error cells are null. */
export function parseRates(rows: unknown[][]): RateRow[] {
  const out: RateRow[] = []
  for (const r of rows) {
    const serial = number(r[0])
    if (serial === null) continue
    out.push({ month: serialToDate(serial).slice(0, 7) + '-01', GBP: number(r[1]), USD: number(r[2]) })
  }
  return out.sort((a, b) => a.month.localeCompare(b.month))
}
