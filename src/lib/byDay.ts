import type { Entry } from './rows'

export type Day = { date: string; entries: Entry[] }

/** One month of the ledger grouped by date, newest day first, and inside a day the entry added last first (the ledger has no time of day, so a later row is the best sign of a later entry). Transfers and every account are included: this is a browser, not a total. */
export function groupByDay(entries: Entry[], month: string): Day[] {
  const days = new Map<string, Entry[]>()
  for (const e of entries) {
    if (!e.date.startsWith(month)) continue
    const day = days.get(e.date)
    if (day) day.push(e)
    else days.set(e.date, [e])
  }
  return [...days].sort(([a], [b]) => b.localeCompare(a)).map(([date, list]) => ({ date, entries: [...list].reverse() }))
}
