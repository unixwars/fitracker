import { convert } from './money'
import type { Currency, Money, RateRow } from './types'

/**
 * Value of one unit of `currency` in `base` for `month` (YYYY-MM): the row is the latest on or before the month.
 * A blank cell there is null (the sheet's J shows an error too), EXCEPT in the last row of Rates, the live
 * current-month row: its cell may be unreadable through the API (spike S2), so the previous numeric value is used.
 */
export function rateFor(rates: RateRow[], currency: Currency, base: Currency, month: string): number | null {
  if (currency === base) return 1
  const key = `${month}-01`
  let at = -1
  for (let i = 0; i < rates.length; i++) if (rates[i].month <= key) at = i
  if (at < 0) return null
  const own = rates[at][currency as 'GBP' | 'USD']
  if (typeof own === 'number' && Number.isFinite(own)) return own
  if (at !== rates.length - 1) return null
  for (let i = at - 1; i >= 0; i--) {
    const v = rates[i][currency as 'GBP' | 'USD']
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

/** `m` converted into `to` with the rows of `month`; null when either rate is missing. */
export function convertMoney(m: Money, to: Currency, rates: RateRow[], base: Currency, month: string): Money | null {
  if (m.currency === to) return m
  const from = rateFor(rates, m.currency, base, month)
  const target = rateFor(rates, to, base, month)
  if (from === null || target === null) return null
  const table = { EUR: 1, GBP: 1, USD: 1 } as Record<Currency, number>
  table[m.currency] = from
  table[to] = target
  return convert(m, to, table)
}

export const toBase = (m: Money, rates: RateRow[], base: Currency, month: string): Money | null =>
  convertMoney(m, base, rates, base, month)
