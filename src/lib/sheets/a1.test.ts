import { describe, expect, it } from 'vitest'
import { parseRange } from './a1'

describe('parseRange', () => {
  it('parses cells and bounded ranges', () => {
    expect(parseRange('Expenses!A10:I20')).toEqual({ sheet: 'Expenses', c1: 1, r1: 10, c2: 9, r2: 20 })
    expect(parseRange('Setup!U8')).toEqual({ sheet: 'Setup', c1: 21, r1: 8, c2: 21, r2: 8 })
  })
  it('parses ranges that run to the bottom of the sheet', () => {
    expect(parseRange('Expenses!C10:C')).toEqual({ sheet: 'Expenses', c1: 3, r1: 10, c2: 3, r2: Infinity })
    expect(parseRange("'Expenses (backup v0)'!A10:I").r2).toBe(Infinity)
  })
})
