import type { AnnualView } from './annual'
import type { BalancesView } from './balances'
import { messages } from './messages'
import type { MonthView } from './month'

export type BarData = { labels: string[]; series: { name: string; values: number[] }[] }
export type LineData = { name: string; values: (number | null)[] }

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }))

const shown = (c: { planned: { minor: number }; actual: { minor: number } }) => c.planned.minor > 0 || c.actual.minor > 0

export function monthBudgetChart(view: MonthView): BarData {
  const rows = view.expenses.categories.filter(shown)
  return { labels: rows.map((c) => c.name), series: [{ name: messages.planned.toLowerCase(), values: rows.map((c) => c.planned.minor) }, { name: messages.actual.toLowerCase(), values: rows.map((c) => c.actual.minor) }] }
}

export function monthShareChart(view: MonthView): { labels: string[]; values: number[] } {
  const rows = view.expenses.categories.filter((c) => c.actual.minor > 0)
  return { labels: rows.map((c) => c.name), values: rows.map((c) => c.actual.minor) }
}

export function yearIncomeExpenseChart(year: AnnualView): BarData & { line: LineData } {
  return {
    labels: MONTHS,
    series: [{ name: messages.income.toLowerCase(), values: year.months.map((m) => m.income.actual.minor) }, { name: messages.expenses.toLowerCase(), values: year.months.map((m) => m.expenses.actual.minor) }],
    line: { name: messages.savingsRate.toLowerCase(), values: year.months.map((m) => m.savingsRate) },
  }
}

export function yearByCategoryChart(year: AnnualView): BarData {
  return { labels: MONTHS, series: year.expenseCategories.filter((c) => c.total.minor > 0).map((c) => ({ name: c.name, values: c.byMonth.map((m) => m.minor) })) }
}

export function yearShareChart(year: AnnualView): { labels: string[]; values: number[] } {
  const rows = year.expenseCategories.filter((c) => c.total.minor > 0)
  return { labels: rows.map((c) => c.name), values: rows.map((c) => c.total.minor) }
}

export function netWorthChart(b: BalancesView): { labels: string[]; series: { name: string; values: (number | null)[] }[] } {
  return { labels: MONTHS, series: b.accounts.map((a) => ({ name: a.name, values: a.byMonth.map((m) => m?.minor ?? null) })) }
}

export function flowsChart(b: BalancesView): BarData {
  return { labels: b.flows.map((f) => f.name), series: [{ name: messages.inflows, values: b.flows.map((f) => f.inflow.minor) }, { name: messages.outflows, values: b.flows.map((f) => f.outflow.minor) }] }
}
