import { describe, expect, it } from 'vitest'
import { shiftMonth } from './format'

describe('shiftMonth', () => {
  it('moves within the year', () => {
    expect(shiftMonth('2024-05', 1, 2024)).toBe('2024-06')
    expect(shiftMonth('2024-05', -1, 2024)).toBe('2024-04')
  })
  it('clamps at January and December of the selected year', () => {
    expect(shiftMonth('2024-01', -1, 2024)).toBe('2024-01')
    expect(shiftMonth('2024-12', 1, 2024)).toBe('2024-12')
  })
})
