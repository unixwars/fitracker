import { describe, expect, it } from 'vitest'
import { rowSummary } from './unreadableSummary'

const u = (raw: unknown[] | undefined, extra = {}) => ({ tab: 'Ledger' as const, row: 1844, reason: 'date' as const, text: 'Milk', raw, ...extra })

describe('rowSummary: what the Needs attention list shows for a row the app could not read', () => {
  it('titles it tab, row, amount as typed, and lists the other cells that were read', () => {
    const s = rowSummary(u(['id1', 'not a date', 'expense', 12.5, 'Shop', 'Milk', 'Groceries', 'Joint']))
    expect(s.title).toBe('Ledger › row 1844 › 12.50')
    expect(s.detail).toBe('date "not a date" · Shop · Milk · Groceries · Joint')
  })
  it('shows a valid date as a date and a text amount in quotes', () => {
    const s = rowSummary(u(['id1', 46340, 'expense', 'ten', '', 'x', '', 'Joint']))
    expect(s.title).toBe('Ledger › row 1844 › "ten"')
    expect(s.detail).toBe('2026-11-14 · x · Joint')
  })
  it('says so when the amount or the date is empty, and never prints an empty cell', () => {
    const s = rowSummary(u(['', '', 'expense', '', '', '', '', 'Joint']))
    expect(s.title).toBe('Ledger › row 1844 › no amount')
    expect(s.detail).toBe('no date · Joint')
  })
  it('falls back to the row text when the raw cells are not available (duplicate ids, snapshots)', () => {
    expect(rowSummary(u(undefined))).toEqual({ title: 'Ledger › row 1844', detail: 'Milk' })
    expect(rowSummary({ tab: 'Snapshots', row: 3, text: '' })).toEqual({ title: 'Snapshots › row 3', detail: '' })
  })
})
