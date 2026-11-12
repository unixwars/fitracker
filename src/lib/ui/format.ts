import { formatMoney } from '../money'
import type { Money } from '../types'

export const fmt = (m: Money): string => formatMoney(m)

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function shiftMonth(month: string, delta: number, year: number): string {
  const idx = Number(month.slice(5, 7)) - 1 + delta
  const clamped = Math.min(11, Math.max(0, idx))
  return `${year}-${String(clamped + 1).padStart(2, '0')}`
}
