import type { Entry } from './rows'
import type { Currency, Money } from './types'

export type Suggestion = { text: string; category?: string; account?: string; currency?: Currency }

const HALF_LIFE_DAYS = 90
const DAY = 86_400_000

// Ranks the user's own past values by frequency, decayed by age. An empty prefix lists the top ones. Category, account and currency come from the latest entry using that text.
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
  const ordered = [...groups.values()].sort((a, b) => b.score - a.score || b.latest.date.localeCompare(a.latest.date))
  return ordered.slice(0, limit).map(({ latest }) => {
    const s: Suggestion = { text: latest[field]!.trim() }
    if (latest.category) s.category = latest.category
    if (latest.account) s.account = latest.account
    s.currency = latest.money.currency
    return s
  })
}

// Amounts previously paid at exactly this place (case-insensitive), ranked like suggest().
export function usualAmounts(place: string, history: Entry[], now: Date = new Date(), limit = 3): Money[] {
  const p = place.trim().toLowerCase()
  if (!p) return []
  const groups = new Map<string, { money: Money; score: number; latest: string }>()
  for (const e of history) {
    if (e.place?.trim().toLowerCase() !== p) continue
    const age = Math.max(0, (now.getTime() - Date.parse(e.date)) / DAY)
    const weight = Math.pow(0.5, age / HALF_LIFE_DAYS)
    const key = `${e.money.currency}${e.money.minor}`
    const g = groups.get(key)
    if (!g) groups.set(key, { money: e.money, score: weight, latest: e.date })
    else { g.score += weight; if (e.date > g.latest) g.latest = e.date }
  }
  return [...groups.values()].sort((a, b) => b.score - a.score || b.latest.localeCompare(a.latest)).slice(0, limit).map((g) => g.money)
}
