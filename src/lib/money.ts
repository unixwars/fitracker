import type { Currency, Money } from './types'

const GROUPED_DOT = /^[1-9]\d{0,2}(\.\d{3})+$/
const GROUPED_COMMA = /^[1-9]\d{0,2}(,\d{3})+$/

// Returns minor units (2 digits) or null. A lone separator followed by exactly three digits is
// read as a thousands group; followed by one or two digits as the decimal separator.
export function parseAmount(input: string): number | null {
  const s = input.trim()
  if (!/^\d[\d.,]*$/.test(s)) return null
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  let intPart = s
  let frac = ''
  if (last >= 0) {
    const sep = s[last]
    const tail = s.slice(last + 1)
    const sameCount = s.split(sep).length - 1
    if ((tail.length === 1 || tail.length === 2) && sameCount === 1) {
      intPart = s.slice(0, last)
      frac = tail
    } else if (tail.length !== 3) {
      return null
    }
  }
  if (!/^\d+$/.test(intPart) && !GROUPED_DOT.test(intPart) && !GROUPED_COMMA.test(intPart)) return null
  const digits = intPart.replace(/[.,]/g, '')
  if (digits.length > 12) return null
  return Number(digits) * 100 + Number(frac.padEnd(2, '0'))
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
