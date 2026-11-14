import { describe, expect, it } from 'vitest'
import { planRatesMaintenance, type RateCell, type RateCellRow } from './ratesMaintenance'
import { rateFormula } from './schema'

const live = (value: number | null): RateCell => ({ value, formula: '=GOOGLEFINANCE("X")' })
const typed = (value: number | null): RateCell => ({ value, formula: null })
const row = (r: number, month: string, GBP: RateCell, USD: RateCell): RateCellRow => ({ row: r, month, GBP, USD })
const TODAY = '2026-11-12'
const FORMULAS = { GBP: rateFormula('GBP', 'EUR'), USD: rateFormula('USD', 'EUR') }

describe('planRatesMaintenance', () => {
  it('new month: freezes the closed row and appends the current month', () => {
    const plan = planRatesMaintenance([row(8, '2026-10-01', live(1.16), live(0.93))], TODAY, 'EUR')
    expect(plan).toEqual({
      freeze: { row: 8, values: { GBP: 1.16, USD: 0.93 } },
      append: { row: 9, month: '2026-11-01', formulas: FORMULAS },
    })
  })
  it('month row already present: no append', () => {
    const plan = planRatesMaintenance([row(8, '2026-10-01', typed(1.16), typed(0.93)), row(9, '2026-11-01', live(1.17), live(0.94))], TODAY, 'EUR')
    expect(plan).toEqual({ freeze: null, append: null })
  })
  it('a closed row that is still live is frozen even when the current month row exists', () => {
    const plan = planRatesMaintenance([row(8, '2026-10-01', live(1.16), live(0.93)), row(9, '2026-11-01', live(1.17), live(0.94))], TODAY, 'EUR')
    expect(plan.freeze).toEqual({ row: 8, values: { GBP: 1.16, USD: 0.93 } })
    expect(plan.append).toBeNull()
  })
  it('a typed (non-formula) value is never frozen or overwritten', () => {
    const plan = planRatesMaintenance([row(8, '2026-10-01', typed(1.16), live(0.93))], TODAY, 'EUR')
    expect(plan.freeze).toEqual({ row: 8, values: { USD: 0.93 } })
    expect(planRatesMaintenance([row(8, '2026-10-01', typed(1.16), typed(0.93))], TODAY, 'EUR').freeze).toBeNull()
  })
  it('a formula cell without a numeric value is not frozen, but the append still happens (S2 fallback)', () => {
    const plan = planRatesMaintenance([row(8, '2026-10-01', live(null), live(null))], TODAY, 'EUR')
    expect(plan.freeze).toBeNull()
    expect(plan.append).toEqual({ row: 9, month: '2026-11-01', formulas: FORMULAS })
  })
  it('an empty table appends at row 2', () => {
    expect(planRatesMaintenance([], TODAY, 'EUR')).toEqual({ freeze: null, append: { row: 2, month: '2026-11-01', formulas: FORMULAS } })
  })
  it('after a gap of several months only the last row is frozen and only the current month is appended', () => {
    const plan = planRatesMaintenance([row(5, '2026-07-01', typed(1.1), typed(0.9)), row(6, '2026-08-01', live(1.15), live(0.92))], TODAY, 'EUR')
    expect(plan.freeze).toEqual({ row: 6, values: { GBP: 1.15, USD: 0.92 } })
    expect(plan.append).toEqual({ row: 7, month: '2026-11-01', formulas: FORMULAS })
  })
  it('a row dated after today (clock skew) gives an empty plan', () => {
    expect(planRatesMaintenance([row(8, '2026-12-01', live(1.2), live(0.95))], TODAY, 'EUR')).toEqual({ freeze: null, append: null })
  })
})

describe('append row (review m4)', () => {
  it('goes after the last used row even when that row has no month the plan can read', () => {
    const rows = [{ row: 2, month: '2026-10-01', GBP: { value: 1.1, formula: null }, USD: { value: 0.9, formula: null } }]
    expect(planRatesMaintenance(rows, '2026-11-05', 'EUR', 9).append?.row).toBe(10)
    expect(planRatesMaintenance(rows, '2026-11-05', 'EUR').append?.row).toBe(3)
  })
})
