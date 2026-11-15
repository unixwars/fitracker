import { describe, expect, it } from 'vitest'
import { annualView } from './annual'
import { balancesView } from './balances'
import { flowsChart, monthBudgetChart, monthShareChart, netWorthChart, yearByCategoryChart, yearIncomeExpenseChart, yearShareChart } from './chartData'
import { messages } from './messages'
import { monthView } from './month'
import type { Entry } from './rows'
import type { Reference } from './types'

const lists: Reference = {
  base: 'EUR',
  accounts: [{ name: 'Joint', currency: 'EUR', active: true, inMonthly: true, inAnnual: true }],
  categories: [{ name: 'Salary', type: 'income', active: true }, { name: 'Food', type: 'expense', active: true }, { name: 'Rent', type: 'expense', active: true }, { name: 'Idle', type: 'expense', active: true }],
  budgets: [{ year: 2026, type: 'expense', category: 'Food', monthly: 500 }],
}
const e = (id: string, date: string, minor: number, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date, money: { minor, currency: 'EUR' }, description: id, category: 'Food', account: 'Joint', ...o,
})
const entries = [e('a', '2026-01-10', 1000), e('b', '2026-01-11', 400, { category: 'Rent' }), e('c', '2026-02-01', 5000, { kind: 'income', category: 'Salary' }), e('d', '2026-02-02', 800)]
const month = monthView({ entries, lists, rates: [], month: '2026-01' })
const year = annualView({ entries, lists, rates: [], year: 2026 })

describe('month charts', () => {
  it('budget vs actual lists the categories that have a plan or spending, in minor units', () => {
    const c = monthBudgetChart(month)
    expect(c.labels).toEqual(['Food', 'Rent'])
    expect(c.series.map((s) => s.name)).toEqual([messages.planned.toLowerCase(), messages.actual.toLowerCase()])
    expect(c.series[1].values).toEqual([1000, 400])
  })
  it('share uses the actual spending of categories that have some', () => {
    expect(monthShareChart(month)).toEqual({ labels: ['Food', 'Rent'], values: [1000, 400] })
  })
})

describe('year charts', () => {
  it('income and expenses per month with the savings rate where it exists', () => {
    const c = yearIncomeExpenseChart(year)
    expect(c.labels).toHaveLength(12)
    expect(c.series[0].values[1]).toBe(5000)
    expect(c.series[1].values[0]).toBe(1400)
    expect(c.line.values[0]).toBeNull()
    expect(c.line.values[1]).toBeCloseTo((5000 - 800) / 5000)
  })
  it('spending by category by month stacks only categories that have spending', () => {
    const c = yearByCategoryChart(year)
    expect(c.series.map((s) => s.name)).toEqual(['Food', 'Rent'])
    expect(c.series[0].values.slice(0, 2)).toEqual([1000, 800])
  })
  it('year share is the category totals', () => {
    expect(yearShareChart(year)).toEqual({ labels: ['Food', 'Rent'], values: [1800, 400] })
  })
})

describe('balances charts', () => {
  const b = balancesView({ entries, snapshots: [], lists, rates: [], year: 2026, today: '2026-02-15' })
  it('net worth by account is drawn only for the months that have a value', () => {
    const c = netWorthChart(b)
    expect(c.labels).toHaveLength(12)
    expect(c.series[0].values.slice(0, 3)).toEqual([-1400, 2800, null])
  })
  it('flows per account', () => {
    const c = flowsChart(b)
    expect(c.labels).toEqual(['Joint'])
    expect(c.series.map((s) => s.values)).toEqual([[5000], [2200]])
  })
})
