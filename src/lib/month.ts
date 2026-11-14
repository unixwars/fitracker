import { toBase } from './rates'
import type { Entry } from './rows'
import { CURRENCIES, type Currency, type EntryType, type Money, type RateRow, type Reference } from './types'

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
  missingRates: Currency[] // currencies used this month whose rate for the month is unavailable (left out of combined totals)
  accounts: { included: number; total: number } // active accounts ticked In Monthly, and all active accounts
}

type Input = { entries: Entry[]; lists: Reference; rates: RateRow[]; month: string }

// One section (expenses or income). Each entry converts with the rate of ITS OWN month (the month being viewed).
function section(entries: Entry[], type: EntryType, ref: Reference, rates: RateRow[], month: string, missing: Set<Currency>): Section {
  const year = Number(month.slice(0, 4))
  const base = ref.base
  const names = new Set(ref.categories.filter((c) => c.type === type).map((c) => c.name))
  const planned = (name: string) => ref.budgets.filter((b) => b.year === year && b.type === type && b.category === name).reduce((a, b) => a + b.monthly, 0)
  const rows = new Map<string, { native: Map<Currency, number>; base: number }>()
  const add = (name: string, e: Entry) => {
    const row = rows.get(name) ?? { native: new Map<Currency, number>(), base: 0 }
    rows.set(name, row)
    row.native.set(e.money.currency, (row.native.get(e.money.currency) ?? 0) + e.money.minor)
    const b = toBase(e.money, rates, base, e.date.slice(0, 7))
    if (b) row.base += b.minor
    else missing.add(e.money.currency)
  }
  for (const e of entries) add(e.category && names.has(e.category) ? e.category : UNCATEGORISED, e)

  const order = ref.categories.filter((c) => c.type === type && (c.active || rows.has(c.name))).map((c) => c.name)
  if (rows.has(UNCATEGORISED)) order.push(UNCATEGORISED)
  const categories: CategoryRow[] = order.map((name) => {
    const row = rows.get(name)
    return {
      name,
      planned: { minor: name === UNCATEGORISED ? 0 : planned(name), currency: base },
      actual: { minor: row?.base ?? 0, currency: base },
      byCurrency: CURRENCIES.filter((c) => row?.native.has(c)).map((c) => ({ minor: row!.native.get(c)!, currency: c })),
    }
  })
  const sum = (f: (c: CategoryRow) => number): Money => ({ minor: categories.reduce((a, c) => a + f(c), 0), currency: base })
  return { planned: sum((c) => c.planned.minor), actual: sum((c) => c.actual.minor), categories }
}

export function monthView({ entries, lists, rates, month }: Input): MonthView {
  const base = lists.base
  const ticked = new Set(lists.accounts.filter((a) => a.inMonthly).map((a) => a.name))
  const inMonth = entries.filter((e) => e.date.startsWith(month) && e.kind !== 'transfer' && e.account !== undefined && ticked.has(e.account))
  const missing = new Set<Currency>()
  const exp = section(inMonth.filter((e) => e.kind === 'expense'), 'expense', lists, rates, month, missing)
  const inc = section(inMonth.filter((e) => e.kind === 'income'), 'income', lists, rates, month, missing)
  const business: Money = exp.categories.find((c) => c.name === BUSINESS)?.actual ?? { minor: 0, currency: base }
  const used = new Set(inMonth.map((e) => e.money.currency))
  const savingsRate = inc.actual.minor > 0 ? (inc.actual.minor - exp.actual.minor) / inc.actual.minor : null
  const active = lists.accounts.filter((a) => a.active)
  return {
    month,
    expenses: { ...exp, business, regular: { minor: exp.actual.minor - business.minor, currency: base } },
    income: inc,
    savingsRate,
    approx: used.size > 1,
    missingRates: [...missing].sort(),
    accounts: { included: active.filter((a) => a.inMonthly).length, total: active.length },
  }
}
