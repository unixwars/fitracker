import type { Entry } from './rows'
import type { Reference } from './types'

/**
 * Expenses and income whose category is empty or not in `Categories` for their type. They are read and counted (the Month
 * screen files them under Uncategorised), so they are not unreadable, but a person will want to give them a category.
 * Inactive categories still count as valid: an old entry keeps its category after it is retired. Newest first.
 */
export function needsCategory(entries: Entry[], ref: Reference): Entry[] {
  const known = { expense: new Set<string>(), income: new Set<string>() }
  for (const c of ref.categories) known[c.type].add(c.name)
  return entries
    .filter((x) => x.kind !== 'transfer' && !(x.category && known[x.kind].has(x.category)))
    .sort((a, b) => b.date.localeCompare(a.date))
}
