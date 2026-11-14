import type { Currency, Money } from './types'

// Returns minor units (2 digits) or null. One separator, a dot or a comma, is the decimal point; thousands
// separators are not accepted, so an amount can only be read one way (Spanish keyboards show a comma, English a dot).
export function parseAmount(input: string): number | null {
  const m = /^(\d{1,12})(?:\.(\d{0,2}))?$/.exec(input.trim().replace(',', '.'))
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}

/** What the amount field keeps while typing: digits and one dot (a comma becomes the dot), at most two decimals. */
export function cleanAmountInput(raw: string): string {
  const v = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const dot = v.indexOf('.')
  if (dot < 0) return v
  const int = v.slice(0, dot) || '0'
  return `${int}.${v.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`
}

export function toMinor(sheetNumber: number): number {
  return Math.round(sheetNumber * 100)
}

export function toSheetNumber(minor: number): number {
  return minor / 100
}

export function formatMoney(m: Money, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(m.minor / 100)
}

function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n))
}

// rates: value of one unit of each currency in the base currency (base = 1).
export function convert(m: Money, to: Currency, rates: Record<Currency, number>): Money {
  if (m.currency === to) return m
  return { minor: roundHalfAway((m.minor * rates[m.currency]) / rates[to]), currency: to }
}
