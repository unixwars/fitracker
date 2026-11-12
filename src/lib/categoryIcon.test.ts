import { describe, expect, it } from 'vitest'
import { categoryIcon, ICON_PATHS } from './categoryIcon'

describe('categoryIcon', () => {
  it('maps the template categories', () => {
    expect(categoryIcon('Business')).toBe('work')
    expect(categoryIcon('Bills')).toBe('bills')
    expect(categoryIcon('Groceries')).toBe('groceries')
    expect(categoryIcon('Recreation')).toBe('recreation')
    expect(categoryIcon('Shopping')).toBe('shopping')
    expect(categoryIcon('Transportation')).toBe('transport')
    expect(categoryIcon('Vacation')).toBe('travel')
    expect(categoryIcon('Health')).toBe('health')
    expect(categoryIcon('Paycheck')).toBe('pay')
    expect(categoryIcon('Interest')).toBe('growth')
    expect(categoryIcon('Dividend')).toBe('growth')
    expect(categoryIcon('Refund')).toBe('refund')
  })

  it('ignores case and surrounding space', () => {
    expect(categoryIcon('  GROCERIES ')).toBe('groceries')
    expect(categoryIcon('car')).toBe('transport')
    expect(categoryIcon('Car insurance')).toBe('bills')
  })

  it('matches words, not substrings', () => {
    expect(categoryIcon('Cards')).toBe('other')
    expect(categoryIcon('Healthcare')).toBe('health')
  })

  it('falls back to a generic icon for unknown or empty names', () => {
    expect(categoryIcon('Other')).toBe('other')
    expect(categoryIcon('Uncategorised')).toBe('other')
    expect(categoryIcon('')).toBe('other')
  })

  it('has a drawing for every icon it can return', () => {
    for (const name of ['Business', 'Bills', 'Groceries', 'Recreation', 'Shopping', 'Transportation', 'Vacation', 'Health', 'Paycheck', 'Interest', 'Refund', 'x'])
      expect(ICON_PATHS[categoryIcon(name)]).toMatch(/^M/)
  })
})
