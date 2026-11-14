import { describe, expect, it } from 'vitest'
import { repairDraft } from './repairDraft'
import { DEFAULT_REFERENCE } from './sheets/fixtures'

const today = '2026-11-14'
const ref = DEFAULT_REFERENCE // Joint EUR, M-Cash EUR, T-Cash GBP

describe('repairDraft: what can be read of a row the app does not understand', () => {
  it('keeps what is valid and fills what is not with defaults, so the form shows what is left to fix', () => {
    const d = repairDraft(['id1', 'not a date', 'expense', 12.5, 'Shop', 'Milk', 'Groceries', 'Joint'], ref, today)
    expect(d).toEqual({ id: 'id1', kind: 'expense', date: today, money: { minor: 1250, currency: 'EUR' }, description: 'Milk', place: 'Shop', category: 'Groceries', account: 'Joint' })
  })
  it('a text amount becomes 0 (the form refuses it until it is fixed) and an unknown type becomes expense', () => {
    const d = repairDraft(['id1', 46340, 'spend', 'ten', '', 'x', 'Groceries', 'Joint'], ref, today)
    expect(d.kind).toBe('expense')
    expect(d.money.minor).toBe(0)
    expect(d.date).toBe('2026-11-14')
  })
  it("an unknown account keeps the text (so it can be seen) and takes the base currency; a known one gives its currency", () => {
    expect(repairDraft(['i', 46340, 'expense', 5, '', '', 'Groceries', 'Nowhere'], ref, today)).toMatchObject({ account: 'Nowhere', money: { currency: 'EUR' } })
    expect(repairDraft(['i', 46340, 'expense', 5, '', '', 'Groceries', 'T-Cash'], ref, today).money).toEqual({ minor: 500, currency: 'GBP' })
  })
  it('a transfer keeps its destination; other kinds drop it; blank cells are empty', () => {
    expect(repairDraft(['i', 46340, 'transfer', 5, '', 'Move', '', 'Joint', 'M-Cash'], ref, today)).toMatchObject({ kind: 'transfer', toAccount: 'M-Cash' })
    expect(repairDraft(['i', 46340, 'expense', 5, '', '', 'Groceries', 'Joint', 'M-Cash'], ref, today).toAccount).toBeUndefined()
    expect(repairDraft(['i'], ref, today)).toMatchObject({ id: 'i', description: '', account: '' })
  })
})
