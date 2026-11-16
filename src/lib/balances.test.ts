import { describe, expect, it } from 'vitest'
import { accountsWithoutSnapshot, balancesView } from './balances'
import type { Entry } from './rows'
import type { RateRow, Reference, Snapshot } from './types'

const lists: Reference = {
  base: 'EUR',
  accounts: [
    { name: 'Joint', currency: 'EUR', active: true, inMonthly: true, inAnnual: true },
    { name: 'Pound', currency: 'GBP', active: true, inMonthly: true, inAnnual: true },
  ],
  categories: [],
  budgets: [],
}
const rates: RateRow[] = [{ month: '2026-01-01', GBP: 1.2, USD: 0.9 }, { month: '2026-03-01', GBP: 1.5, USD: 0.9 }]
const e = (id: string, date: string, minor: number, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date, money: { minor, currency: 'EUR' }, description: id, category: 'X', account: 'Joint', ...o,
})
const snap = (id: string, date: string, account: string, minor: number, currency: 'EUR' | 'GBP' = 'EUR'): Snapshot => ({ id, date, account, balance: { minor, currency }, note: '' })
const view = (entries: Entry[], snapshots: Snapshot[], today = '2026-12-31') => balancesView({ entries, snapshots, lists, rates, year: 2026, today })
const joint = (v: ReturnType<typeof view>) => v.accounts.find((a) => a.name === 'Joint')!.byMonth.map((m) => m?.minor ?? null)

describe('balancesView month-end balances', () => {
  it('starts from the latest snapshot on or before the month end and adds what came after it', () => {
    const v = view([e('a', '2026-01-10', 1000), e('b', '2026-01-20', 5000, { kind: 'income' }), e('c', '2026-01-31', 300), e('old', '2026-01-05', 999)], [snap('s', '2026-01-09', 'Joint', 100000)])
    expect(joint(v)[0]).toBe(100000 - 1000 + 5000 - 300)
    expect(joint(v)[1]).toBe(joint(v)[0])
  })
  it('a snapshot dated the same day as an entry already includes it (end of day)', () => {
    expect(joint(view([e('a', '2026-01-09', 1000)], [snap('s', '2026-01-09', 'Joint', 100000)]))[0]).toBe(100000)
  })
  it('without a snapshot the balance is the sum of all entries so far', () => {
    expect(joint(view([e('a', '2025-12-01', 1000), e('b', '2026-02-02', 500, { kind: 'income' })], []))[0]).toBe(-1000)
    expect(joint(view([e('a', '2025-12-01', 1000), e('b', '2026-02-02', 500, { kind: 'income' })], []))[1]).toBe(-500)
  })
  it('the last snapshot row wins on a tie', () => {
    expect(joint(view([], [snap('a', '2026-01-09', 'Joint', 2), snap('b', '2026-01-09', 'Joint', 1)]))[0]).toBe(1)
  })
  it('transfers leave the source and arrive converted at the entry month rate', () => {
    const t = e('t', '2026-03-05', 10000, { kind: 'transfer', category: undefined, toAccount: 'Pound' }) // 100.00 EUR out, Mar GBP rate 1.5 -> 66.67 GBP in
    const v = view([t], [])
    expect(joint(v)[2]).toBe(-10000)
    const pound = v.accounts.find((a) => a.name === 'Pound')!
    expect(pound.currency).toBe('GBP')
    expect(pound.byMonth[1]?.minor).toBe(0)
    expect(pound.byMonth[2]?.minor).toBe(10000) // not rounded to 6667 GBP first, so no half-cent drift against the sheet
  })
  it('leaves months after the current one empty and sums the net worth of the months that have a value', () => {
    const v = view([], [snap('s', '2026-01-01', 'Joint', 5000)], '2026-02-10')
    expect(joint(v).slice(0, 4)).toEqual([5000, 5000, null, null])
    expect(v.netWorth.slice(0, 3)).toEqual([5000, 5000, null])
  })
  it('names a currency that has no rate and leaves that cell empty', () => {
    const v = balancesView({ entries: [], snapshots: [snap('s', '2026-01-01', 'Pound', 5000, 'GBP')], lists, rates: [], year: 2026, today: '2026-12-31' })
    expect(v.missingRates).toEqual(['GBP'])
    expect(v.accounts.find((a) => a.name === 'Pound')!.byMonth[0]).toBeNull()
  })
})

describe('balancesView transfers without a rate', () => {
  it('a transfer between two accounts of the same non-base currency needs the month rate: it leaves the source and is not counted in, like the sheet', () => {
    const l: Reference = { ...lists, accounts: [{ name: 'A', currency: 'GBP', active: true, inMonthly: true, inAnnual: true }, { name: 'B', currency: 'GBP', active: true, inMonthly: true, inAnnual: true }] }
    const v = balancesView({ entries: [e('t', '2026-03-05', 1000, { kind: 'transfer', account: 'A', toAccount: 'B', money: { minor: 1000, currency: 'GBP' }, category: undefined })], snapshots: [], lists: l, rates: [], year: 2026, today: '2026-12-31' })
    expect(v.missingRates).toEqual(['GBP'])
  })
})

describe('balancesView edge cases', () => {
  it('month ends in a leap year and an empty book', () => {
    const v = balancesView({ entries: [], snapshots: [snap('s', '2028-02-29', 'Joint', 100)], lists, rates, year: 2028, today: '2028-12-31' })
    expect(v.accounts[0].byMonth[1]?.minor).toBe(100) // snapshot on Feb 29 counts in February
    expect(balancesView({ entries: [], snapshots: [], lists: { ...lists, accounts: [] }, rates, year: 2026, today: '2026-12-31' }).netWorth.every((n) => n === null)).toBe(true)
  })
  it('a snapshot dated in the future is ignored until its month', () => {
    const v = view([], [snap('s', '2026-06-15', 'Joint', 900)], '2026-12-31')
    expect(joint(v).slice(4, 7)).toEqual([0, 900, 900])
  })
})

describe('balancesView flows', () => {
  it('inflows are income plus transfers in, outflows are expenses plus transfers out, in base at the entry month rate, for the year only', () => {
    const v = view([
      e('i', '2026-02-01', 20000, { kind: 'income' }),
      e('x', '2026-02-02', 5000),
      e('t', '2026-03-05', 3000, { kind: 'transfer', category: undefined, toAccount: 'Pound' }),
      e('p', '2026-03-06', 1000, { account: 'Pound', money: { minor: 1000, currency: 'GBP' } }),
      e('old', '2025-03-06', 7777),
    ], [])
    const f = (name: string) => v.flows.find((x) => x.name === name)!
    expect(f('Joint').inflow.minor).toBe(20000)
    expect(f('Joint').outflow.minor).toBe(5000 + 3000)
    expect(f('Pound').inflow.minor).toBe(3000)
    expect(f('Pound').outflow.minor).toBe(1500)
  })
})

describe('accountsWithoutSnapshot', () => {
  it('lists active accounts that no snapshot mentions', () => {
    const l: Reference = { ...lists, accounts: [...lists.accounts, { name: 'Closed', currency: 'EUR', active: false, inMonthly: false, inAnnual: false }] }
    expect(accountsWithoutSnapshot(l, [snap('s', '2026-01-01', 'Joint', 1)])).toEqual(['Pound'])
    expect(accountsWithoutSnapshot(l, [])).toEqual(['Joint', 'Pound'])
  })
})
