import { describe, expect, it } from 'vitest'
import { clearWrites, dateToSerial, entryToWrites, findFreeRow, rowToEntry, serialToDate, todayLocal } from './rows'
import type { Entry } from './rows'

describe('dates', () => {
  it('converts serial numbers both ways', () => {
    expect(serialToDate(45292)).toBe('2024-01-01')
    expect(dateToSerial('2024-01-01')).toBe(45292)
    expect(serialToDate(dateToSerial('2026-11-10'))).toBe('2026-11-10')
    expect(serialToDate(45292.75)).toBe('2024-01-01')
  })
  it('uses the local day, not the UTC day', () => {
    // 23:30 in New York (TZ fixed in vitest config) is already the next day in UTC
    expect(todayLocal(new Date('2024-01-10T23:30:00-05:00'))).toBe('2024-01-10')
  })
})

const expense: Entry = {
  id: 'abc', kind: 'expense', date: '2024-01-01', money: { minor: 1250, currency: 'GBP' },
  description: 'Coffee', place: 'Cafe', category: 'Groceries', account: 'Joint',
}

describe('rowToEntry', () => {
  it('maps an Expenses row (A..I)', () => {
    const row = ['abc', 45292, '', 12.5, 'Cafe', 'Coffee', 'Groceries', 'Joint', 'GBP']
    expect(rowToEntry('expense', row)).toEqual(expense)
  })
  it('maps an Income row, which swaps account and category', () => {
    const row = ['i1', 45292, '', 2000, 'Salary', 'Joint', 'Paycheck', 'EUR']
    expect(rowToEntry('income', row)).toEqual({
      id: 'i1', kind: 'income', date: '2024-01-01', money: { minor: 200000, currency: 'EUR' },
      description: 'Salary', account: 'Joint', category: 'Paycheck',
    })
  })
  it('maps a Transfers row with source and destination', () => {
    const row = ['t1', 45292, '', 100, 'Top up', 'Joint', 'M-Cash', 'USD']
    expect(rowToEntry('transfer', row)).toEqual({
      id: 't1', kind: 'transfer', date: '2024-01-01', money: { minor: 10000, currency: 'USD' },
      description: 'Top up', account: 'Joint', toAccount: 'M-Cash',
    })
  })
  it('treats a blank currency as the base and a blank row as null', () => {
    expect(rowToEntry('expense', ['', 45292, '', 5, '', 'x', 'Bills', 'Joint', ''], 'GBP')?.money.currency).toBe('GBP')
    expect(rowToEntry('expense', ['', '', '', '', '', '', '', '', ''])).toBeNull()
    expect(rowToEntry('expense', [])).toBeNull()
  })
  it('returns an empty id for rows typed in Sheets', () => {
    expect(rowToEntry('expense', [undefined, 45292, '', 5, '', 'x', 'Bills', 'Joint', 'EUR'])?.id).toBe('')
  })
})

describe('entryToWrites', () => {
  it('writes id, date serial number and D..last, never touching column C', () => {
    const w = entryToWrites(expense, 12)
    expect(w).toEqual([
      { range: 'Expenses!A12', values: [['abc']] },
      { range: 'Expenses!B12', values: [[45292]] },
      { range: 'Expenses!D12:I12', values: [[12.5, 'Cafe', 'Coffee', 'Groceries', 'Joint', 'GBP']] },
    ])
    for (const x of w) expect(x.range).not.toMatch(/!C/)
  })
  it('keeps hostile text as plain strings', () => {
    const w = entryToWrites({ ...expense, description: '=HYPERLINK("x")' }, 10)
    expect(w[2].values[0]).toContain('=HYPERLINK("x")')
  })
  it('uses the Income and Transfers column order', () => {
    const inc = entryToWrites({ id: 'i', kind: 'income', date: '2024-01-01', money: { minor: 100, currency: 'EUR' }, description: 'S', account: 'Joint', category: 'Paycheck' }, 10)
    expect(inc[2]).toEqual({ range: 'Income!D10:H10', values: [[1, 'S', 'Joint', 'Paycheck', 'EUR']] })
    const tr = entryToWrites({ id: 't', kind: 'transfer', date: '2024-01-01', money: { minor: 100, currency: 'EUR' }, description: 'N', account: 'Joint', toAccount: 'M-Cash' }, 10)
    expect(tr[2]).toEqual({ range: 'Transfers!D10:H10', values: [[1, 'N', 'Joint', 'M-Cash', 'EUR']] })
  })
})

describe('clearWrites', () => {
  it('clears A, B and D..last but leaves C', () => {
    expect(clearWrites('expense', 12).map((r) => r.range)).toEqual(['Expenses!A12', 'Expenses!B12', 'Expenses!D12:I12'])
    expect(clearWrites('income', 12).map((r) => r.range)).toEqual(['Income!A12', 'Income!B12', 'Income!D12:H12'])
  })
})

describe('findFreeRow', () => {
  it('returns the first row with nothing in id, date, amount or description', () => {
    const ids = ['a', '', 'c']
    const b = [45292, 45293, 45294]
    const d = [1, 2, 3]
    const desc = ['x', 'y', 'z']
    expect(findFreeRow('expense', ids, b, d, desc)).toBe(13)
  })
  it('skips rows that have any value and reuses cleared rows', () => {
    expect(findFreeRow('expense', ['a', '', ''], [45292, '', 45294], ['', '', ''], ['', '', ''])).toBe(11)
    expect(findFreeRow('expense', ['', ''], ['', ''], ['', 5], ['', ''])).toBe(10)
    expect(findFreeRow('expense', ['', ''], ['', ''], ['', ''], ['', 'note'])).toBe(10)
  })
  it('treats rows beyond the returned arrays as free', () => {
    expect(findFreeRow('expense', [], [], [], [])).toBe(10)
  })
  it('returns full when no row is free up to the tab last row', () => {
    const n = 1000 - 10 + 1
    const filled = Array.from({ length: n }, () => 'x')
    expect(findFreeRow('expense', filled, filled, filled, filled)).toBe('full')
  })
})
