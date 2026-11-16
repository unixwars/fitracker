import { rateFor, toBase } from './rates'
import type { Entry } from './rows'
import type { Currency, Money, RateRow, Reference, Snapshot } from './types'

export type AccountSeries = { name: string; currency: Currency; byMonth: (Money | null)[] } // month-end balance in base; null before/after, or when a rate is missing
export type Flow = { name: string; inflow: Money; outflow: Money }
export type BalancesView = {
  year: number
  accounts: AccountSeries[]
  netWorth: (number | null)[] // base minor units per month-end; null when no account has a value
  flows: Flow[]
  missingRates: Currency[]
}

/** Active accounts that have no balance snapshot at all: their Year balances start from zero, so they are only a sum of entries. */
export function accountsWithoutSnapshot(lists: Reference, snapshots: Snapshot[]): string[] {
  const have = new Set(snapshots.map((s) => s.account))
  return lists.accounts.filter((a) => a.active && !have.has(a.name)).map((a) => a.name)
}

type Input = { entries: Entry[]; snapshots: Snapshot[]; lists: Reference; rates: RateRow[]; year: number; today: string }

const pad = (n: number) => String(n).padStart(2, '0')
const monthEnd = (year: number, m: number) => {
  const d = new Date(Date.UTC(year, m, 0)).getUTCDate() // day 0 of next month
  return `${year}-${pad(m)}-${pad(d)}`
}

/**
 * Month-end balance per account and the year's flows, as the Balances tab computes them (docs/month-rules.md):
 * the latest snapshot on or before the month end (the last row wins a tie), plus income, minus expenses and transfers
 * out, plus transfers in converted at the entry month's rate, for entries after the snapshot date; shown in base at the
 * month-end rate. Every account is listed, not only those ticked In Annual.
 */
export function balancesView({ entries, snapshots, lists, rates, year, today }: Input): BalancesView {
  const base = lists.base
  const missing = new Set<Currency>()
  const accounts: AccountSeries[] = lists.accounts.map((acc) => {
    const own = snapshots.filter((s) => s.account === acc.name)
    const byMonth = Array.from({ length: 12 }, (_, i): Money | null => {
      const end = monthEnd(year, i + 1)
      if (`${year}-${pad(i + 1)}-01` > today) return null
      let snapDate = ''
      let balance = 0
      for (const s of own) if (s.date <= end && s.date >= snapDate) { snapDate = s.date; balance = s.balance.minor } // >= : the last row wins a tie
      let minor = balance // a float: transfers in are not rounded until the month-end conversion, as in the sheet
      for (const x of entries) {
        if (x.date <= snapDate || x.date > end) continue
        if (x.kind === 'income' && x.account === acc.name) minor += x.money.minor
        else if (x.kind === 'expense' && x.account === acc.name) minor -= x.money.minor
        else if (x.kind === 'transfer') {
          if (x.account === acc.name) minor -= x.money.minor
          if (x.toAccount === acc.name) {
            const month = x.date.slice(0, 7)
            const from = rateFor(rates, x.money.currency, base, month)
            const to = rateFor(rates, acc.currency, base, month)
            if (from !== null && to !== null) minor += (x.money.minor * from) / to
            else missing.add(from === null ? x.money.currency : acc.currency)
          }
        }
      }
      const rate = rateFor(rates, acc.currency, base, end.slice(0, 7))
      if (rate === null) { missing.add(acc.currency); return null }
      return { minor: Math.round(minor * rate), currency: base }
    })
    return { name: acc.name, currency: acc.currency, byMonth }
  })
  const netWorth = Array.from({ length: 12 }, (_, i) => {
    const cells = accounts.map((a) => a.byMonth[i]).filter((c): c is Money => c !== null)
    return cells.length ? cells.reduce((a, c) => a + c.minor, 0) : null
  })

  const flows: Flow[] = lists.accounts.map((acc) => ({ name: acc.name, inflow: { minor: 0, currency: base }, outflow: { minor: 0, currency: base } }))
  const flowOf = (name: string) => flows.find((f) => f.name === name)
  for (const x of entries) {
    if (!x.date.startsWith(`${year}-`)) continue
    const b = toBase(x.money, rates, base, x.date.slice(0, 7))
    if (!b) { missing.add(x.money.currency); continue }
    if (x.kind === 'income') { const f = flowOf(x.account ?? ''); if (f) f.inflow.minor += b.minor }
    else if (x.kind === 'expense') { const f = flowOf(x.account ?? ''); if (f) f.outflow.minor += b.minor }
    else if (x.kind === 'transfer') {
      const from = flowOf(x.account ?? ''); if (from) from.outflow.minor += b.minor
      const to = flowOf(x.toAccount ?? ''); if (to) to.inflow.minor += b.minor
    }
  }
  return { year, accounts, netWorth, flows, missingRates: [...missing].sort() }
}
