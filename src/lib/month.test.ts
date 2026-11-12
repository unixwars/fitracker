import { describe, expect, it } from 'vitest'
import { monthView, UNCATEGORISED } from './month'
import type { Entry } from './rows'
import type { Lists } from './types'

const lists: Lists = {
  expenseCategories: ['Business', 'Groceries', 'Bills'],
  incomeCategories: ['Paycheck'],
  accounts: ['Joint'],
  expenseBudgets: {
    Business: [15000, 15000, ...Array(10).fill(15000)],
    Groceries: [25000, 20000, ...Array(10).fill(25000)],
    Bills: [5000, 5000, ...Array(10).fill(5000)],
  },
  incomeBudgets: { Paycheck: [280000, 280000, ...Array(10).fill(280000)] },
}
const rates = { EUR: 1, GBP: 1.15, USD: 0.9 }
const e = (o: Partial<Entry> & Pick<Entry, 'kind' | 'date' | 'money'>): Entry => ({ id: 'x', description: '', ...o })

const entries: Entry[] = [
  e({ kind: 'expense', date: '2024-01-05', money: { minor: 5000, currency: 'EUR' }, category: 'Groceries' }),
  e({ kind: 'expense', date: '2024-01-31', money: { minor: 1000, currency: 'GBP' }, category: 'Groceries' }),
  e({ kind: 'expense', date: '2024-01-10', money: { minor: 2000, currency: 'EUR' }, category: 'Business' }),
  e({ kind: 'expense', date: '2024-02-01', money: { minor: 3000, currency: 'EUR' }, category: 'Bills' }),
  e({ kind: 'expense', date: '2024-01-12', money: { minor: 700, currency: 'EUR' }, category: 'Mystery' }),
  e({ kind: 'transfer', date: '2024-01-15', money: { minor: 99999, currency: 'EUR' }, account: 'Joint', toAccount: 'X' }),
  e({ kind: 'income', date: '2024-01-25', money: { minor: 300000, currency: 'EUR' }, category: 'Paycheck' }),
]

describe('unavailable exchange rates', () => {
  it('excludes the currency from combined totals and reports it instead of showing NaN', () => {
    const v = monthView(entries, lists, '2024-01', { EUR: 1, GBP: NaN, USD: 0.9 }, 'EUR')
    expect(v.missingRates).toEqual(['GBP'])
    expect(Number.isNaN(v.expenses.actual.minor)).toBe(false)
    expect(v.expenses.actual.minor).toBe(7700) // 8850 without the GBP 1000 (= 1150)
    const groceries = v.expenses.categories.find((c) => c.name === 'Groceries')!
    expect(groceries.byCurrency).toContainEqual({ minor: 1000, currency: 'GBP' })
    expect(Number.isNaN(v.savingsRate as number)).toBe(false)
  })
  it('reports nothing when every needed rate is available', () => {
    expect(monthView(entries, lists, '2024-01', rates, 'EUR').missingRates).toEqual([])
  })
})

describe('monthView', () => {
  const v = monthView(entries, lists, '2024-01', rates, 'EUR')

  it('sums actuals by category within the month, converting currencies', () => {
    const groceries = v.expenses.categories.find((c) => c.name === 'Groceries')!
    expect(groceries.actual).toEqual({ minor: 6150, currency: 'EUR' })
    expect(groceries.planned).toEqual({ minor: 25000, currency: 'EUR' })
    expect(groceries.byCurrency).toEqual([{ minor: 5000, currency: 'EUR' }, { minor: 1000, currency: 'GBP' }])
  })
  it('includes the last day of the month and excludes the first of the next', () => {
    expect(v.expenses.categories.find((c) => c.name === 'Bills')!.actual.minor).toBe(0)
  })
  it('splits Business from Regular and totals planned and actual', () => {
    expect(v.expenses.actual.minor).toBe(8850)
    expect(v.expenses.business.minor).toBe(2000)
    expect(v.expenses.regular.minor).toBe(6850)
    expect(v.expenses.planned.minor).toBe(45000)
  })
  it('groups unknown categories and ignores transfers', () => {
    const u = v.expenses.categories.find((c) => c.name === UNCATEGORISED)!
    expect(u.actual.minor).toBe(700)
    expect(v.expenses.actual.minor).toBe(8850)
  })
  it('computes income and the savings rate', () => {
    expect(v.income.actual.minor).toBe(300000)
    expect(v.income.planned.minor).toBe(280000)
    expect(v.savingsRate).toBeCloseTo((300000 - 8850) / 300000)
  })
  it('flags approximation only when more than one currency is involved', () => {
    expect(v.approx).toBe(true)
    expect(monthView(entries.filter((x) => x.money.currency === 'EUR'), lists, '2024-01', rates, 'EUR').approx).toBe(false)
  })
  it('has no savings rate without income', () => {
    expect(monthView([], lists, '2024-01', rates, 'EUR').savingsRate).toBeNull()
  })
})
