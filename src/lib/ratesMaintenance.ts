import { rateFormula } from './schema'
import type { Currency } from './types'

export type RateCell = { value: number | null; formula: string | null }
// `row` is the sheet row of the Rates tab.
export type RateCellRow = { row: number; month: string; GBP: RateCell; USD: RateCell }
export type RatesPlan = {
  freeze: { row: number; values: Partial<Record<'GBP' | 'USD', number>> } | null
  append: { row: number; month: string; formulas: { GBP: string; USD: string } } | null
}

const CURRENCIES_ON_ROW = ['GBP', 'USD'] as const

/**
 * What the first refresh of a new month writes to Rates (spec 3.4): freeze the last closed month's live cells as
 * values, and append the current month's row with the live formulas. Typed values are never overwritten, a live
 * cell that is not a number is not frozen, and an existing current-month row is never appended twice.
 */
export function planRatesMaintenance(rows: RateCellRow[], today: string, base: Currency): RatesPlan {
  const thisMonth = today.slice(0, 7) + '-01'
  if (rows.some((r) => r.month > thisMonth)) return { freeze: null, append: null }

  const closed = rows.filter((r) => r.month < thisMonth)
  const target = closed.length ? closed.reduce((a, b) => (b.month > a.month ? b : a)) : null
  let freeze: RatesPlan['freeze'] = null
  if (target) {
    const values: Partial<Record<'GBP' | 'USD', number>> = {}
    for (const c of CURRENCIES_ON_ROW) {
      const cell = target[c]
      if (cell.formula !== null && cell.value !== null && Number.isFinite(cell.value)) values[c] = cell.value
    }
    if (Object.keys(values).length) freeze = { row: target.row, values }
  }

  if (rows.some((r) => r.month === thisMonth)) return { freeze, append: null }
  const lastRow = rows.reduce((max, r) => Math.max(max, r.row), 1)
  return {
    freeze,
    append: { row: lastRow + 1, month: thisMonth, formulas: { GBP: rateFormula('GBP', base), USD: rateFormula('USD', base) } },
  }
}
