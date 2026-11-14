import { describe, expect, it } from 'vitest'
import { monthView, UNCATEGORISED } from './month'
import type { Entry } from './rows'
import { DEFAULT_REFERENCE } from './sheets/fixtures'
import type { RateRow, Reference } from './types'

const ref: Reference = DEFAULT_REFERENCE // Joint EUR, M-Cash EUR, T-Cash GBP; 2026 budgets
const rates: RateRow[] = [
  { month: '2026-09-01', GBP: 1.1, USD: 0.9 },
  { month: '2026-10-01', GBP: 1.15, USD: 0.9 },
  { month: '2026-11-01', GBP: 1.3, USD: 0.95 },
]
const e = (o: Partial<Entry> & Pick<Entry, 'kind' | 'date' | 'money'>): Entry => ({ id: 'x', description: '', account: 'Joint', ...o })

const entries: Entry[] = [
  e({ kind: 'expense', date: '2026-10-05', money: { minor: 5000, currency: 'EUR' }, category: 'Groceries' }),
  e({ kind: 'expense', date: '2026-10-31', money: { minor: 1000, currency: 'GBP' }, category: 'Groceries', account: 'T-Cash' }),
  e({ kind: 'expense', date: '2026-10-10', money: { minor: 2000, currency: 'EUR' }, category: 'Business' }),
  e({ kind: 'expense', date: '2026-11-01', money: { minor: 3000, currency: 'EUR' }, category: 'Bills' }),
  e({ kind: 'expense', date: '2026-10-12', money: { minor: 700, currency: 'EUR' }, category: 'Mystery' }),
  e({ kind: 'transfer', date: '2026-10-15', money: { minor: 99999, currency: 'EUR' }, account: 'Joint', toAccount: 'M-Cash' }),
  e({ kind: 'income', date: '2026-10-25', money: { minor: 300000, currency: 'EUR' }, category: 'Paycheck' }),
]
const view = (o: Partial<Parameters<typeof monthView>[0]> = {}) => monthView({ entries, lists: ref, rates, month: '2026-10', ...o })

describe('monthView', () => {
  const v = view()
  it('sums actuals by category within the month, converting each entry with its own month', () => {
    const groceries = v.expenses.categories.find((c) => c.name === 'Groceries')!
    expect(groceries.actual).toEqual({ minor: 6150, currency: 'EUR' }) // 5000 + 1000 GBP * 1.15
    expect(groceries.planned).toEqual({ minor: 25000, currency: 'EUR' })
    expect(groceries.byCurrency).toEqual([{ minor: 5000, currency: 'EUR' }, { minor: 1000, currency: 'GBP' }])
  })
  it('includes the last day of the month and excludes the first of the next', () => {
    expect(v.expenses.categories.find((c) => c.name === 'Bills')!.actual.minor).toBe(0)
  })
  it('splits Business from Regular, totals, and ignores transfers', () => {
    expect(v.expenses.actual.minor).toBe(8850)
    expect(v.expenses.business.minor).toBe(2000)
    expect(v.expenses.regular.minor).toBe(6850)
    expect(v.expenses.planned.minor).toBe(55000)
  })
  it('groups categories not in the list under Uncategorised', () => {
    expect(v.expenses.categories.find((c) => c.name === UNCATEGORISED)!.actual.minor).toBe(700)
  })
  it('computes income and the savings rate, none without income', () => {
    expect(v.income.actual.minor).toBe(300000)
    expect(v.savingsRate).toBeCloseTo((300000 - 8850) / 300000)
    expect(view({ entries: [] }).savingsRate).toBeNull()
  })
  it('shows no savings rate when spending is above income (it would be negative)', () => {
    const over = view({ entries: [
      e({ kind: 'income', date: '2026-11-02', money: { minor: 14146, currency: 'EUR' }, category: 'Interest', account: 'Joint' }),
      e({ kind: 'expense', date: '2026-11-03', money: { minor: 42331, currency: 'EUR' }, category: 'Bills', account: 'Joint' }),
    ], month: '2026-11' })
    expect(over.income.actual.minor).toBe(14146) // the entries are inside the viewed month
    expect(over.savingsRate).toBeNull()
  })
  it('a rate of exactly zero is shown', () => {
    const even = view({ entries: [
      e({ kind: 'income', date: '2026-11-02', money: { minor: 1000, currency: 'EUR' }, category: 'Interest', account: 'Joint' }),
      e({ kind: 'expense', date: '2026-11-03', money: { minor: 1000, currency: 'EUR' }, category: 'Bills', account: 'Joint' }),
    ], month: '2026-11' })
    expect(even.savingsRate).toBe(0)
  })
  it('converts a GBP entry with the rate of the viewed month, not another', () => {
    const gbp = [e({ kind: 'expense', date: '2026-11-02', money: { minor: 1000, currency: 'GBP' }, category: 'Bills', account: 'T-Cash' })]
    expect(view({ entries: gbp, month: '2026-11' }).expenses.actual.minor).toBe(1300)
    expect(view({ entries: [{ ...gbp[0], date: '2026-10-02' }], month: '2026-10' }).expenses.actual.minor).toBe(1150)
  })
  it('flags approximation only when more than one currency is combined', () => {
    expect(v.approx).toBe(true)
    expect(view({ entries: entries.filter((x) => x.money.currency === 'EUR') }).approx).toBe(false)
  })
})

describe('accounts ticked In Monthly', () => {
  it('counts only ticked accounts and reports how many are included', () => {
    const noT: Reference = { ...ref, accounts: ref.accounts.map((a) => (a.name === 'T-Cash' ? { ...a, inMonthly: false } : a)) }
    const v = view({ lists: noT })
    expect(v.accounts).toEqual({ included: 2, total: 3 })
    expect(v.expenses.actual.minor).toBe(7700)
    expect(view().accounts).toEqual({ included: 3, total: 3 })
  })
})

describe('unavailable exchange rates', () => {
  it('leaves the entry out of the base totals and reports the currency, native amounts still listed', () => {
    const v = view({ rates: [{ month: '2026-10-01', GBP: null, USD: 0.9 }, { month: '2026-11-01', GBP: 1.3, USD: 0.95 }] })
    expect(v.missingRates).toEqual(['GBP'])
    expect(v.expenses.actual.minor).toBe(7700)
    expect(Number.isNaN(v.expenses.actual.minor)).toBe(false)
    expect(v.expenses.categories.find((c) => c.name === 'Groceries')!.byCurrency).toContainEqual({ minor: 1000, currency: 'GBP' })
  })
  it('reports nothing when every needed rate is there', () => expect(view().missingRates).toEqual([]))
})

describe('budgets and categories', () => {
  it("takes planned from the month's year only", () => {
    expect(view({ month: '2025-10', entries: [] }).expenses.planned.minor).toBe(0)
  })
  it('lists an inactive category only when it has entries', () => {
    const r: Reference = { ...ref, categories: ref.categories.map((c) => (c.name === 'Recreation' || c.name === 'Bills' ? { ...c, active: false } : c)) }
    const names = view({ lists: r, entries: [e({ kind: 'expense', date: '2026-10-03', money: { minor: 100, currency: 'EUR' }, category: 'Bills' })] }).expenses.categories.map((c) => c.name)
    expect(names).toEqual(['Business', 'Groceries', 'Bills'])
  })
})
