import { shiftMonth } from './ui/format'

/** The last month worth browsing: the current one, or a later one only when the ledger has an entry in it. */
export function latestMonth(entries: { date: string }[], today: string): string {
  let latest = today.slice(0, 7)
  for (const e of entries) {
    const m = e.date.slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(m) && m > latest) latest = m
  }
  return latest
}

/** Whether stepping `delta` months (1 for a month, 12 for a year) forward stays within the months that can have records; a year step compares years. */
export function canGoNext(month: string, delta: number, latest: string): boolean {
  const next = shiftMonth(month, delta)
  return delta >= 12 ? next.slice(0, 4) <= latest.slice(0, 4) : next <= latest
}

/** The first month worth browsing: the current one, or an earlier one only when the ledger has an entry in it. */
export function earliestMonth(entries: { date: string }[], today: string): string {
  let earliest = today.slice(0, 7)
  for (const e of entries) {
    const m = e.date.slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(m) && m < earliest) earliest = m
  }
  return earliest
}

/** The backward twin of canGoNext: stops at the earliest month that can have records. */
export function canGoPrev(month: string, delta: number, earliest: string): boolean {
  const prev = shiftMonth(month, -delta)
  return delta >= 12 ? prev.slice(0, 4) >= earliest.slice(0, 4) : prev >= earliest
}
