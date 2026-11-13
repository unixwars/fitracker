import { describe, expect, it } from 'vitest'
import { parseRates, parseReference } from './reference'

const ref = (base: unknown[][] = [['EUR']], accounts: unknown[][] = [], categories: unknown[][] = [], budgets: unknown[][] = []) =>
  parseReference(base, accounts, categories, budgets)

describe('parseReference', () => {
  it('base defaults to EUR when empty or invalid, GBP is accepted', () => {
    expect(ref([]).base).toBe('EUR')
    expect(ref([['']]).base).toBe('EUR')
    expect(ref([['JPY']]).base).toBe('EUR')
    expect(ref([['GBP']]).base).toBe('GBP')
  })
  it('parses accounts with their ticks', () => {
    expect(ref(undefined, [['Joint', 'EUR', true, true, false]]).accounts).toEqual([
      { name: 'Joint', currency: 'EUR', active: true, inMonthly: true, inAnnual: false },
    ])
  })
  it('skips accounts without a name or with an unknown currency; blank boxes are false', () => {
    const a = ref(undefined, [['', 'EUR', true, true, true], ['X', 'JPY', true, true, true], ['New', 'GBP', '', '', '']]).accounts
    expect(a).toEqual([{ name: 'New', currency: 'GBP', active: false, inMonthly: false, inAnnual: false }])
  })
  it('keeps categories keyed by type and name, skips unknown types', () => {
    const c = ref(undefined, [], [['Other', 'income', true], ['Other', 'expense', false], ['Odd', 'transfer', true]]).categories
    expect(c).toEqual([
      { name: 'Other', type: 'income', active: true },
      { name: 'Other', type: 'expense', active: false },
    ])
  })
  it('parses budgets as minor units and skips text amounts', () => {
    const b = ref(undefined, [], [], [[2026, 'expense', 'Groceries', 250], [2026, 'expense', 'Bills', 'lots'], ['x', 'expense', 'Bills', 5]]).budgets
    expect(b).toEqual([{ year: 2026, type: 'expense', category: 'Groceries', monthly: 25000 }])
  })
})

describe('parseRates', () => {
  it('sorts ascending, forces the first of the month and nulls blanks', () => {
    expect(parseRates([[46296, 1.16, 0.93], [46266, 1.15, '']])).toEqual([
      { month: '2026-09-01', GBP: 1.15, USD: null },
      { month: '2026-10-01', GBP: 1.16, USD: 0.93 },
    ])
  })
  it('skips a non-numeric month and treats a formula error as null', () => {
    expect(parseRates([['soon', 1, 1], [46296, '#N/A', 0.9]])).toEqual([{ month: '2026-10-01', GBP: null, USD: 0.9 }])
  })
  it('forces a mid-month date to the first of its month', () => {
    expect(parseRates([[46310, 1.2, 0.95]])[0].month).toBe('2026-10-01')
  })
})
