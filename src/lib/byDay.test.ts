import { describe, expect, it } from 'vitest'
import { groupByDay } from './byDay'
import type { Entry } from './rows'

const e = (id: string, date: string, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date, money: { minor: 100, currency: 'EUR' }, description: id, category: 'Groceries', account: 'Joint', ...o,
})

describe('groupByDay', () => {
  it('groups the month newest day first and keeps ledger order inside a day', () => {
    const days = groupByDay([e('a', '2026-11-03'), e('b', '2026-11-10'), e('c', '2026-11-03'), e('d', '2026-11-10')], '2026-11')
    expect(days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-03'])
    expect(days[0].entries.map((x) => x.id)).toEqual(['b', 'd'])
    expect(days[1].entries.map((x) => x.id)).toEqual(['a', 'c'])
  })
  it('leaves out other months, even with the same day number', () => {
    expect(groupByDay([e('a', '2026-10-31'), e('b', '2026-12-01'), e('c', '2026-11-01')], '2026-11').flatMap((d) => d.entries.map((x) => x.id))).toEqual(['c'])
  })
  it('lists income and transfers too, and entries of any account', () => {
    const days = groupByDay([e('a', '2026-11-02', { kind: 'income' }), e('b', '2026-11-02', { kind: 'transfer', toAccount: 'Cash' }), e('c', '2026-11-02', { account: 'Elsewhere' })], '2026-11')
    expect(days[0].entries).toHaveLength(3)
  })
  it('returns no days for an empty month', () => {
    expect(groupByDay([], '2026-11')).toEqual([])
  })
})
