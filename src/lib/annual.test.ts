import { describe, expect, it } from 'vitest'
import { annualView } from './annual'
import type { Entry } from './rows'
import type { RateRow, Reference } from './types'

const lists: Reference = {
  base: 'EUR',
  accounts: [
    { name: 'Joint', currency: 'EUR', active: true, inMonthly: false, inAnnual: true },
    { name: 'Cash', currency: 'EUR', active: true, inMonthly: true, inAnnual: false },
    { name: 'Pound', currency: 'GBP', active: true, inMonthly: true, inAnnual: true },
  ],
  categories: [
    { name: 'Salary', type: 'income', active: true },
    { name: 'Food', type: 'expense', active: true },
    { name: 'Rent', type: 'expense', active: true },
  ],
  budgets: [{ year: 2026, type: 'expense', category: 'Food', monthly: 30000 }, { year: 2025, type: 'expense', category: 'Food', monthly: 1 }],
}
const rates: RateRow[] = [{ month: '2026-01-01', GBP: 1.2, USD: 0.9 }, { month: '2026-03-01', GBP: 1.5, USD: 0.9 }]
const e = (id: string, date: string, minor: number, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date, money: { minor, currency: 'EUR' }, description: id, category: 'Food', account: 'Joint', ...o,
})
const view = (entries: Entry[], year = 2026) => annualView({ entries, lists, rates, year })

describe('annualView', () => {
  it('has twelve months and sums income, expenses and net per month and for the year', () => {
    const v = view([e('a', '2026-01-10', 1000), e('b', '2026-01-20', 500, { category: 'Rent' }), e('c', '2026-02-01', 20000, { kind: 'income', category: 'Salary' })])
    expect(v.months).toHaveLength(12)
    expect(v.months[0].expenses.actual.minor).toBe(1500)
    expect(v.totals.expenses.minor).toBe(1500)
    expect(v.totals.income.minor).toBe(20000)
    expect(v.totals.net.minor).toBe(18500)
    expect(v.totals.savingsRate).toBeCloseTo(18500 / 20000)
  })
  it('counts only accounts ticked In Annual (not In Monthly)', () => {
    const v = view([e('a', '2026-01-10', 1000, { account: 'Cash' }), e('b', '2026-01-10', 700, { account: 'Joint' })])
    expect(v.totals.expenses.minor).toBe(700)
    expect(v.accounts).toEqual({ included: 2, total: 3 })
  })
  it('converts each entry at its own month rate and ignores transfers and other years', () => {
    const v = view([
      e('a', '2026-02-05', 1000, { account: 'Pound', money: { minor: 1000, currency: 'GBP' } }), // Jan row: 1.2
      e('b', '2026-03-05', 1000, { account: 'Pound', money: { minor: 1000, currency: 'GBP' } }), // Mar row: 1.5
      e('t', '2026-03-06', 9999, { kind: 'transfer', toAccount: 'Joint', category: undefined }),
      e('o', '2025-03-06', 9999),
    ])
    expect(v.months[1].expenses.actual.minor).toBe(1200)
    expect(v.months[2].expenses.actual.minor).toBe(1500)
    expect(v.totals.expenses.minor).toBe(2700)
    expect(v.approx).toBe(false)
  })
  it('has category by month rows with totals, planned from the year budget, and Uncategorised', () => {
    const v = view([e('a', '2026-01-10', 1000), e('b', '2026-03-10', 250), e('c', '2026-03-11', 40, { category: 'Gone' })])
    const food = v.expenseCategories.find((c) => c.name === 'Food')!
    expect(food.byMonth.map((m) => m.minor).slice(0, 3)).toEqual([1000, 0, 250])
    expect(food.total.minor).toBe(1250)
    expect(food.planned.minor).toBe(30000 * 12)
    expect(v.expenseCategories.find((c) => c.name === 'Uncategorised')!.total.minor).toBe(40)
    expect(v.totals.expenses.minor).toBe(1290)
  })
  it('names a currency without a rate and leaves it out of the totals', () => {
    const v = annualView({ entries: [e('a', '2026-01-10', 1000, { account: 'Pound', money: { minor: 1000, currency: 'USD' } })], lists, rates: [], year: 2026 })
    expect(v.missingRates).toEqual(['USD'])
    expect(v.totals.expenses.minor).toBe(0)
  })
  it('has no savings rate without income or when expenses exceed income', () => {
    expect(view([e('a', '2026-01-10', 1000)]).totals.savingsRate).toBeNull()
    expect(view([e('a', '2026-01-10', 1000), e('b', '2026-01-11', 500, { kind: 'income', category: 'Salary' })]).totals.savingsRate).toBeNull()
  })
})
