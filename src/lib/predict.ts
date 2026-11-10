import type { Entry } from './rows'
import type { Currency } from './types'

export type Suggestion = { text: string; category?: string; account?: string; currency?: Currency }

const HALF_LIFE_DAYS = 90
const DAY = 86_400_000

// Ranks the user's own past values by frequency, decayed by age. An empty prefix lists the most
// recent first. Category, account and currency come from the latest entry using that text.
export function suggest(field: 'place' | 'description', prefix: string, history: Entry[], now: Date = new Date(), limit = 5): Suggestion[] {
  const p = prefix.trim().toLowerCase()
  const groups = new Map<string, { latest: Entry; score: number }>()
  for (const e of history) {
    const text = e[field]?.trim()
    if (!text || !text.toLowerCase().startsWith(p)) continue
    const age = Math.max(0, (now.getTime() - Date.parse(e.date)) / DAY)
    const weight = Math.pow(0.5, age / HALF_LIFE_DAYS)
    const key = text.toLowerCase()
    const g = groups.get(key)
    if (!g) groups.set(key, { latest: e, score: weight })
    else {
      g.score += weight
      if (e.date > g.latest.date) g.latest = e
    }
  }
  const ordered = [...groups.values()].sort((a, b) =>
    p === '' ? b.latest.date.localeCompare(a.latest.date) : b.score - a.score || b.latest.date.localeCompare(a.latest.date))
  return ordered.slice(0, limit).map(({ latest }) => {
    const s: Suggestion = { text: latest[field]!.trim() }
    if (latest.category) s.category = latest.category
    if (latest.account) s.account = latest.account
    s.currency = latest.money.currency
    return s
  })
}
