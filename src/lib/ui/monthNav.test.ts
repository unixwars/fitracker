import { describe, expect, it } from 'vitest'
import { shiftMonth } from './format'

describe('shiftMonth', () => {
  it('moves within the year', () => {
    expect(shiftMonth('2026-05', 1)).toBe('2026-06')
    expect(shiftMonth('2026-05', -1)).toBe('2026-04')
  })
  it('carries across years in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-03', -15)).toBe('2024-12')
  })
})
