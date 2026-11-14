import { describe, expect, it } from 'vitest'
import { backfillId } from './ids'

describe('backfillId', () => {
  it('is stable for the same row', () => {
    expect(backfillId('Ledger', 7, ['2026-11-03', 1250, 'Joint'])).toBe(backfillId('Ledger', 7, ['2026-11-03', 1250, 'Joint']))
  })
  it('starts with h and differs by tab, row and content', () => {
    const base = backfillId('Ledger', 7, ['2026-11-03', 1250, 'Joint'])
    expect(base.startsWith('h')).toBe(true)
    expect(backfillId('Snapshots', 7, ['2026-11-03', 1250, 'Joint'])).not.toBe(base)
    expect(backfillId('Ledger', 8, ['2026-11-03', 1250, 'Joint'])).not.toBe(base)
    expect(backfillId('Ledger', 7, ['2026-11-03', 1251, 'Joint'])).not.toBe(base)
    expect(backfillId('Ledger', 7, ['2026-11-03', 1250, 'M-Cash'])).not.toBe(base)
  })
  it('is long enough to be unique among a few thousand rows', () => {
    const ids = new Set<string>()
    for (let row = 2; row < 4002; row++) ids.add(backfillId('Ledger', row, ['2026-11-03', 1250, 'Joint']))
    expect(ids.size).toBe(4000)
  })
})
