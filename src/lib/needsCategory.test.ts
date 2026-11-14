import { describe, expect, it } from 'vitest'
import { needsCategory } from './needsCategory'
import type { Entry } from './rows'
import { DEFAULT_REFERENCE } from './sheets/fixtures'
import type { Reference } from './types'

const e = (id: string, o: Partial<Entry> = {}): Entry => ({ id, kind: 'expense', date: '2026-11-01', money: { minor: 500, currency: 'EUR' }, description: '', account: 'Joint', category: 'Groceries', ...o })

describe('needsCategory: entries that count but sit under Uncategorised', () => {
  it('lists expenses and income whose category is empty or not in Categories for their type, newest first', () => {
    const list = needsCategory([
      e('ok'), e('empty', { category: undefined, date: '2026-10-01' }), e('unknown', { category: 'Nope', date: '2026-11-05' }),
      e('wrongType', { kind: 'income', category: 'Groceries', date: '2026-09-01' }), // Groceries is an expense category
    ], DEFAULT_REFERENCE)
    expect(list.map((x) => x.id)).toEqual(['unknown', 'empty', 'wrongType'])
  })
  it('ignores transfers, and an inactive category is still a valid one for an old entry', () => {
    const ref: Reference = { ...DEFAULT_REFERENCE, categories: DEFAULT_REFERENCE.categories.map((c) => (c.name === 'Groceries' ? { ...c, active: false } : c)) }
    expect(needsCategory([e('t', { kind: 'transfer', category: undefined, toAccount: 'M-Cash' }), e('old')], ref)).toEqual([])
  })
})
