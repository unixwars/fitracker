import type { Entry } from './rows'
import { CURRENCIES, type Currency, type Lists, type Money } from './types'

export const UNCATEGORISED = 'Uncategorised'
export const BUSINESS = 'Business'

export type CategoryRow = { name: string; planned: Money; actual: Money; byCurrency: Money[] }
export type Section = { planned: Money; actual: Money; categories: CategoryRow[] }
export type MonthView = {
  month: string
  expenses: Section & { business: Money; regular: Money }
  income: Section
  savingsRate: number | null
  approx: boolean // true when entries in more than one currency were combined
  missingRates: Currency[] // currencies used this month whose exchange rate is unavailable (left out of combined totals)
}

type Rates = Record<Currency, number>

function section(entries: Entry[], names: string[], budgets: Record<string, number[]>, monthIndex: number, rates: Rates, base: Currency, missing: Set<Currency>): Section {
  const known = new Set(names)
  const rows = names.map((name) => ({ name, native: new Map<Currency, number>(), planned: budgets[name]?.[monthIndex] ?? 0 }))
  const byName = new Map(rows.map((r) => [r.name, r]))
  let other: (typeof rows)[number] | undefined
  for (const en of entries) {
    const key = en.category && known.has(en.category) ? en.category : UNCATEGORISED
    let row = byName.get(key)
    if (!row) {
      other ??= { name: UNCATEGORISED, native: new Map(), planned: 0 }
      row = other
    }
    row.native.set(en.money.currency, (row.native.get(en.money.currency) ?? 0) + en.money.minor)
  }
  if (other) rows.push(other)
  const toBase = (native: Map<Currency, number>) => {
    let sum = 0
    for (const [cur, minor] of native) {
      if (Number.isFinite(rates[cur])) sum += minor * rates[cur]
      else missing.add(cur)
    }
    return Math.sign(sum) * Math.round(Math.abs(sum))
  }
  const categories: CategoryRow[] = rows.map((r) => ({
    name: r.name,
    planned: { minor: r.planned, currency: base },
    actual: { minor: toBase(r.native), currency: base },
    byCurrency: CURRENCIES.filter((c) => r.native.has(c)).map((c) => ({ minor: r.native.get(c)!, currency: c })),
  }))
  const sum = (f: (c: CategoryRow) => number): Money => ({ minor: categories.reduce((a, c) => a + f(c), 0), currency: base })
  return { planned: sum((c) => c.planned.minor), actual: sum((c) => c.actual.minor), categories }
}

export function monthView(entries: Entry[], lists: Lists, month: string, rates: Rates, base: Currency): MonthView {
  const monthIndex = Number(month.slice(5, 7)) - 1
  const inMonth = entries.filter((e) => e.date.startsWith(month))
  const missing = new Set<Currency>()
  const exp = section(inMonth.filter((e) => e.kind === 'expense'), lists.expenseCategories, lists.expenseBudgets, monthIndex, rates, base, missing)
  const inc = section(inMonth.filter((e) => e.kind === 'income'), lists.incomeCategories, lists.incomeBudgets, monthIndex, rates, base, missing)
  const business: Money = exp.categories.find((c) => c.name === BUSINESS)?.actual ?? { minor: 0, currency: base }
  const used = new Set(inMonth.filter((e) => e.kind !== 'transfer').map((e) => e.money.currency))
  const savingsRate = inc.actual.minor > 0 ? (inc.actual.minor - exp.actual.minor) / inc.actual.minor : null
  return {
    month,
    expenses: { ...exp, business, regular: { minor: exp.actual.minor - business.minor, currency: base } },
    income: inc,
    savingsRate,
    approx: used.size > 1,
    missingRates: [...missing].sort(),
  }
}
