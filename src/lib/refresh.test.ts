import { describe, expect, it } from 'vitest'
import { refreshInterval } from './refresh'

describe('refreshInterval', () => {
  it('starts at 15 seconds and grows with the ledger, capped at two minutes', () => {
    expect(refreshInterval(0)).toBe(15_000)
    expect(refreshInterval(10_000)).toBe(65_000)
    expect(refreshInterval(1e6)).toBe(120_000)
  })
})
