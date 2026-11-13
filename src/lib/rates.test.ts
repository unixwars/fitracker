import { describe, expect, it } from 'vitest'
import { convertMoney, rateFor, toBase } from './rates'
import type { RateRow } from './types'

const rows: RateRow[] = [
  { month: '2026-09-01', GBP: 1.15, USD: null },
  { month: '2026-10-01', GBP: 1.16, USD: 0.93 },
  { month: '2026-11-01', GBP: null, USD: 0.94 },
]

describe('rateFor', () => {
  it('is 1 for the base currency', () => expect(rateFor(rows, 'EUR', 'EUR', '2026-10')).toBe(1))
  it('uses the row of the entry month', () => expect(rateFor(rows, 'GBP', 'EUR', '2026-10')).toBe(1.16))
  it('uses the latest row on or before the month', () => expect(rateFor(rows, 'USD', 'EUR', '2026-12')).toBe(0.94))
  it('is null before the first row', () => expect(rateFor(rows, 'GBP', 'EUR', '2026-08')).toBeNull())
  it('falls back to the previous numeric value when only the LAST (live) row is blank', () => {
    expect(rateFor(rows, 'GBP', 'EUR', '2026-11')).toBe(1.16)
    expect(rateFor(rows, 'GBP', 'EUR', '2026-12')).toBe(1.16)
  })
  it('is null for a blank cell in a middle row (the sheet shows an error there too)', () => {
    const middle: RateRow[] = [
      { month: '2026-09-01', GBP: 1.15, USD: 0.9 },
      { month: '2026-10-01', GBP: null, USD: 0.93 },
      { month: '2026-11-01', GBP: 1.17, USD: 0.94 },
    ]
    expect(rateFor(middle, 'GBP', 'EUR', '2026-10')).toBeNull()
  })
  it('is null when the table is empty', () => expect(rateFor([], 'GBP', 'EUR', '2026-10')).toBeNull())
})

describe('toBase and convertMoney', () => {
  it('converts to the base currency at the entry month rate', () => {
    expect(toBase({ minor: 1000, currency: 'GBP' }, rows, 'EUR', '2026-10')).toEqual({ minor: 1160, currency: 'EUR' })
  })
  it('a blank live cell uses the previous numeric rate (never 0)', () => {
    expect(toBase({ minor: 1000, currency: 'GBP' }, rows, 'EUR', '2026-11')).toEqual({ minor: 1160, currency: 'EUR' })
  })
  it('returns null when a rate is missing', () => {
    expect(toBase({ minor: 1000, currency: 'USD' }, rows, 'EUR', '2026-08')).toBeNull()
  })
  it('keeps a base amount unchanged', () => {
    expect(toBase({ minor: 500, currency: 'EUR' }, rows, 'EUR', '2026-10')).toEqual({ minor: 500, currency: 'EUR' })
  })
  it('converts between two non-base currencies, half away from zero', () => {
    expect(convertMoney({ minor: 1000, currency: 'GBP' }, 'USD', rows, 'EUR', '2026-10')).toEqual({ minor: 1247, currency: 'USD' })
  })
  it('convertMoney is null when either rate is missing', () => {
    expect(convertMoney({ minor: 1000, currency: 'GBP' }, 'USD', rows, 'EUR', '2026-09')).toBeNull()
  })
})
