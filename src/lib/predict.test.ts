import { describe, expect, it } from 'vitest'
import { suggest } from './predict'
import type { Entry } from './rows'

const now = new Date('2024-06-01T12:00:00Z')
const mk = (date: string, place: string, extra: Partial<Entry> = {}): Entry => ({
  id: date + place, kind: 'expense', date, money: { minor: 100, currency: 'EUR' }, description: '', place, ...extra,
})

const history: Entry[] = [
  mk('2024-05-30', 'Tesco', { category: 'Groceries', account: 'Joint', money: { minor: 100, currency: 'GBP' } }),
  mk('2024-05-20', 'Tesco', { category: 'Groceries', account: 'Joint' }),
  mk('2024-05-10', 'Tesco', { category: 'Groceries', account: 'Joint' }),
  mk('2024-05-31', 'Taxi One', { category: 'Transportation', account: 'M-Cash' }),
  mk('2022-01-01', 'Old Cafe', { category: 'Recreation', account: 'Joint' }),
  mk('2022-01-02', 'Old Cafe'), mk('2022-01-03', 'Old Cafe'), mk('2022-01-04', 'Old Cafe'), mk('2022-01-05', 'Old Cafe'),
  mk('2024-05-31', 'TESCO Express', { category: 'Groceries' }),
]

describe('suggest', () => {
  it('matches the prefix case-insensitively', () => {
    const r = suggest('place', 'tes', history, now).map((s) => s.text)
    expect(r).toContain('Tesco')
    expect(r).toContain('TESCO Express')
    expect(r).not.toContain('Taxi One')
  })
  it('ranks frequent recent items above rarer ones', () => {
    expect(suggest('place', 't', history, now)[0].text).toBe('Tesco')
  })
  it('lets a single recent use outrank many very old ones', () => {
    const r = suggest('place', '', history, now).map((s) => s.text)
    expect(r.indexOf('Taxi One')).toBeLessThan(r.indexOf('Old Cafe'))
  })
  it('returns the most recent items for an empty prefix, honouring the limit', () => {
    expect(suggest('place', '', history, now, 2)).toHaveLength(2)
  })
  it('ranks an empty prefix by frequency, not only by the latest date', () => {
    // Tesco: 3 recent uses; Taxi One: 1 use but one day newer than Tesco's latest.
    expect(suggest('place', '', history, now)[0].text).toBe('Tesco')
  })
  it('carries category, account and currency from the latest use', () => {
    expect(suggest('place', 'Tesco', history, now)[0]).toEqual({
      text: 'Tesco', category: 'Groceries', account: 'Joint', currency: 'GBP',
    })
  })
  it('suggests descriptions and ignores entries without the field', () => {
    const h = [mk('2024-05-01', 'x', { description: 'Lunch' }), { ...mk('2024-05-02', 'y'), place: undefined, description: '' }]
    expect(suggest('description', 'lu', h, now).map((s) => s.text)).toEqual(['Lunch'])
  })
})

import { usualAmounts } from './predict'
describe('usualAmounts', () => {
  const h = [
    mk('2024-05-30', 'Tesco', { money: { minor: 1250, currency: 'GBP' } }),
    mk('2024-05-20', 'Tesco', { money: { minor: 1250, currency: 'GBP' } }),
    mk('2024-05-10', 'tesco', { money: { minor: 3000, currency: 'GBP' } }),
    mk('2024-05-31', 'Taxi One', { money: { minor: 900, currency: 'EUR' } }),
  ]
  it('lists the amounts paid at a place, most usual first, case-insensitively', () => {
    expect(usualAmounts('TESCO', h, now)).toEqual([{ minor: 1250, currency: 'GBP' }, { minor: 3000, currency: 'GBP' }])
  })
  it('honours the limit and returns nothing for an unknown or empty place', () => {
    expect(usualAmounts('Tesco', h, now, 1)).toHaveLength(1)
    expect(usualAmounts('Nowhere', h, now)).toEqual([])
    expect(usualAmounts('  ', h, now)).toEqual([])
  })
})
