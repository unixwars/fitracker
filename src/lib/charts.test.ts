import { describe, expect, it } from 'vitest'
import { arcPath, donutSlices, niceMax, seriesColor, shortMoney } from './charts'

describe('niceMax', () => {
  it('rounds up to 1, 2, 2.5 or 5 times a power of ten and never returns less than the value', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(-5)).toBe(1)
    expect(niceMax(7)).toBe(10)
    expect(niceMax(120)).toBe(200)
    expect(niceMax(3400)).toBe(5000)
    expect(niceMax(100)).toBe(100)
    for (const v of [0.3, 1, 9.9, 13, 99, 1234, 98765]) expect(niceMax(v)).toBeGreaterThanOrEqual(v)
  })
})

describe('donutSlices', () => {
  it('turns positive values into fractions that add up to one and skips zero and negative values', () => {
    const s = donutSlices([30, 0, 70, -5])
    expect(s.map((x) => x.index)).toEqual([0, 2])
    expect(s[0].fraction).toBeCloseTo(0.3)
    expect(s[1].start).toBeCloseTo(0.3)
    expect(s[1].end).toBeCloseTo(1)
  })
  it('is empty when nothing is positive', () => expect(donutSlices([0, -1])).toEqual([]))
})

describe('arcPath', () => {
  it('draws a ring segment and closes a full circle as two halves', () => {
    expect(arcPath(50, 50, 40, 25, 0, 0.25)).toMatch(/^M/)
    const full = arcPath(50, 50, 40, 25, 0, 1)
    expect(full.match(/A/g)!.length).toBeGreaterThanOrEqual(4)
    expect(full).not.toContain('NaN')
  })
})

describe('seriesColor', () => {
  it('cycles a fixed palette', () => {
    expect(seriesColor(0)).toBe(seriesColor(12))
    expect(seriesColor(0)).not.toBe(seriesColor(1))
  })
})

describe('shortMoney', () => {
  it('abbreviates axis values in major units', () => {
    expect(shortMoney(123456)).toBe('1.2k')
    expect(shortMoney(5000)).toBe('50')
    expect(shortMoney(-250000)).toBe('-2.5k')
    expect(shortMoney(0)).toBe('0')
  })
})
