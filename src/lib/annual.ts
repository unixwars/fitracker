import { monthView, UNCATEGORISED, type CategoryRow, type MonthView } from './month'
import type { Entry } from './rows'
import type { Currency, Money, RateRow, Reference } from './types'

export type YearCategory = { name: string; byMonth: Money[]; total: Money; planned: Money }
export type AnnualView = {
  year: number
  months: MonthView[] // the twelve months, each computed exactly like the Month screen but with the In Annual accounts
  totals: { income: Money; expenses: Money; net: Money; savingsRate: number | null }
  expenseCategories: YearCategory[]
  incomeCategories: YearCategory[]
  approx: boolean
  missingRates: Currency[]
  accounts: { included: number; total: number }
}

type Input = { entries: Entry[]; lists: Reference; rates: RateRow[]; year: number }

function categoryRows(months: MonthView[], type: 'expenses' | 'income', base: Currency): YearCategory[] {
  const names: string[] = []
  for (const m of months) for (const c of m[type].categories) if (!names.includes(c.name)) names.push(c.name)
  // Keep the list order of the first month that has the category, with Uncategorised last.
  names.sort((a, b) => Number(a === UNCATEGORISED) - Number(b === UNCATEGORISED))
  return names.map((name) => {
    const rows: (CategoryRow | undefined)[] = months.map((m) => m[type].categories.find((c) => c.name === name))
    const byMonth: Money[] = rows.map((r) => r?.actual ?? { minor: 0, currency: base })
    const sum = (f: (r: CategoryRow) => number) => ({ minor: rows.reduce((a, r) => a + (r ? f(r) : 0), 0), currency: base })
    return { name, byMonth, total: { minor: byMonth.reduce((a, m) => a + m.minor, 0), currency: base }, planned: sum((r) => r.planned.minor) }
  })
}

/** The year as twelve Month views over the accounts ticked In Annual (docs/month-rules.md, Annual). */
export function annualView({ entries, lists, rates, year }: Input): AnnualView {
  const base = lists.base
  const forYear: Reference = { ...lists, accounts: lists.accounts.map((a) => ({ ...a, inMonthly: a.inAnnual })) }
  const months = Array.from({ length: 12 }, (_, i) => monthView({ entries, lists: forYear, rates, month: `${year}-${String(i + 1).padStart(2, '0')}` }))
  const total = (f: (m: MonthView) => number): Money => ({ minor: months.reduce((a, m) => a + f(m), 0), currency: base })
  const income = total((m) => m.income.actual.minor)
  const expenses = total((m) => m.expenses.actual.minor)
  const net: Money = { minor: income.minor - expenses.minor, currency: base }
  return {
    year,
    months,
    totals: { income, expenses, net, savingsRate: income.minor > 0 && expenses.minor <= income.minor ? net.minor / income.minor : null },
    expenseCategories: categoryRows(months, 'expenses', base),
    incomeCategories: categoryRows(months, 'income', base),
    approx: months.some((m) => m.approx),
    missingRates: [...new Set(months.flatMap((m) => m.missingRates))].sort(),
    accounts: months[0].accounts,
  }
}
