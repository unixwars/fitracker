import { describe, expect, it } from 'vitest'
import { canGoNext, latestMonth } from './navLimit'

const e = (date: string) => ({ date })

describe('latestMonth', () => {
  it('is the current month when no entry is later', () => {
    expect(latestMonth([e('2026-03-02')], '2026-11-16')).toBe('2026-11')
    expect(latestMonth([], '2026-11-16')).toBe('2026-11')
  })
  it('is the month of the latest entry when it is in the future', () => {
    expect(latestMonth([e('2026-03-02'), e('2027-02-10')], '2026-11-16')).toBe('2027-02')
  })
  it('ignores entries with a malformed date', () => {
    expect(latestMonth([e(''), e('garbage')], '2026-11-16')).toBe('2026-11')
  })
})

describe('canGoNext', () => {
  it('stops at the latest month', () => {
    expect(canGoNext('2026-10', 1, '2026-11')).toBe(true)
    expect(canGoNext('2026-11', 1, '2026-11')).toBe(false)
    expect(canGoNext('2026-12', 1, '2026-11')).toBe(false)
  })
  it('a year step stops at the year of the latest month', () => {
    expect(canGoNext('2025-11', 12, '2026-11')).toBe(true)
    expect(canGoNext('2026-02', 12, '2026-11')).toBe(false)
    expect(canGoNext('2026-11', 12, '2027-02')).toBe(true)
  })
})
