import { describe, expect, it } from 'vitest'
import { clearWrites, dateToSerial, entryToWrites, findFreeRow, ledgerRowValues, parseLedgerRow, parseSnapshotRow, rowToEntry, serialToDate, snapshotRowValues, todayLocal } from './rows'
import type { Entry } from './rows'
import type { Account, Snapshot } from './types'

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

const acct = (name: string, currency: Account['currency']): Account => ({ name, currency, active: true, inMonthly: true, inAnnual: true })
const accounts = [acct('Joint', 'EUR'), acct('Cash GBP', 'GBP')]

describe('parseLedgerRow', () => {
  it('parses an expense row', () => {
    expect(parseLedgerRow(['id1', 45292, 'expense', 12.5, 'Shop', 'Milk', 'Groceries', 'Joint'], accounts)).toEqual({
      value: { id: 'id1', kind: 'expense', date: '2024-01-01', money: { minor: 1250, currency: 'EUR' }, place: 'Shop', description: 'Milk', category: 'Groceries', account: 'Joint' },
    })
  })
  it('takes the currency from the account', () => {
    const r = parseLedgerRow(['id1', 45292, 'expense', 12.5, '', '', 'Groceries', 'Cash GBP'], accounts)
    expect('value' in r && r.value.money.currency).toBe('GBP')
  })
  it('a transfer needs a known, different destination', () => {
    expect(parseLedgerRow(['i', 45292, 'transfer', 5, '', '', '', 'Joint', 'Joint'], accounts)).toMatchObject({ reason: 'toAccount' })
    expect(parseLedgerRow(['i', 45292, 'transfer', 5, '', '', '', 'Joint', 'Nowhere'], accounts)).toMatchObject({ reason: 'toAccount' })
    expect(parseLedgerRow(['i', 45292, 'transfer', 5, '', 'Move', '', 'Joint', 'Cash GBP'], accounts)).toEqual({
      value: { id: 'i', kind: 'transfer', date: '2024-01-01', money: { minor: 500, currency: 'EUR' }, description: 'Move', account: 'Joint', toAccount: 'Cash GBP' },
    })
  })
  it.each([
    ['text date', ['i', 'x', 'expense', 5, '', '', 'G', 'Joint'], 'date'],
    ['text amount', ['i', 45292, 'expense', 'ten', '', '', 'G', 'Joint'], 'amount'],
    ['negative amount', ['i', 45292, 'expense', -5, '', '', 'G', 'Joint'], 'amount'],
    ['zero amount', ['i', 45292, 'expense', 0, '', '', 'G', 'Joint'], 'amount'],
    ['unknown type', ['i', 45292, 'spend', 5, '', '', 'G', 'Joint'], 'type'],
    ['unknown account', ['i', 45292, 'expense', 5, '', '', 'G', 'Nowhere'], 'account'],
    ['no account', ['i', 45292, 'expense', 5, '', '', 'G', ''], 'account'],
  ])('%s is not understood', (_n, row, reason) => {
    expect(parseLedgerRow(row, accounts)).toMatchObject({ reason })
  })
  it('skips an empty row and a row with only column J content', () => {
    expect(parseLedgerRow(['', '', '', '', '', '', '', '', ''], accounts)).toEqual({ skip: true })
    expect(parseLedgerRow([], accounts)).toEqual({ skip: true })
    expect(parseLedgerRow(['', '', '', '', '', '', '', '', '', 12], accounts)).toEqual({ skip: true })
  })
  it('a missing id parses with id empty', () => {
    const r = parseLedgerRow(['', 45292, 'income', 5, '', 'Pay', 'Paycheck', 'Joint'], accounts)
    expect('value' in r && r.value.id).toBe('')
  })
  it('reports the description or place of a failing row for display', () => {
    expect(parseLedgerRow(['i', 45292, 'expense', 'ten', 'Shop', 'Milk', 'G', 'Joint'], accounts)).toEqual({ reason: 'amount', text: 'Milk' })
    expect(parseLedgerRow(['i', 45292, 'expense', 'ten', 'Shop', '', 'G', 'Joint'], accounts)).toEqual({ reason: 'amount', text: 'Shop' })
  })
})

describe('ledgerRowValues', () => {
  const entries: Entry[] = [
    { id: 'a', kind: 'expense', date: '2024-01-01', money: { minor: 1250, currency: 'EUR' }, place: 'Shop', description: 'Milk', category: 'Groceries', account: 'Joint' },
    { id: 'b', kind: 'income', date: '2024-02-02', money: { minor: 100000, currency: 'EUR' }, description: 'Pay', category: 'Paycheck', account: 'Joint' },
    { id: 'c', kind: 'transfer', date: '2024-03-03', money: { minor: 500, currency: 'EUR' }, description: 'Move', account: 'Joint', toAccount: 'Cash GBP' },
  ]
  it('round-trips through parseLedgerRow', () => {
    for (const e of entries) {
      const values = ledgerRowValues(e)
      expect(values).toHaveLength(9)
      expect(parseLedgerRow(values, accounts)).toEqual({ value: e })
    }
  })
  it('writes the amount as a sheet number and the date as a serial', () => {
    expect(ledgerRowValues(entries[0])).toEqual(['a', 45292, 'expense', 12.5, 'Shop', 'Milk', 'Groceries', 'Joint', ''])
  })
  it('keeps formula-like text literal', () => {
    const v = ledgerRowValues({ ...entries[0], description: '=1+1' })
    expect(v[5]).toBe('=1+1')
    expect(ledgerRowValues({ ...entries[0], description: "'quoted" })[5]).toBe("'quoted")
  })
})

describe('snapshot rows', () => {
  it('parses a snapshot', () => {
    expect(parseSnapshotRow(['s1', 45292, 'Cash GBP', 100.25, 'note'], accounts)).toEqual({
      value: { id: 's1', date: '2024-01-01', account: 'Cash GBP', balance: { minor: 10025, currency: 'GBP' }, note: 'note' },
    })
  })
  it('accepts zero and negative balances', () => {
    expect(parseSnapshotRow(['s', 45292, 'Joint', 0, ''], accounts)).toMatchObject({ value: { balance: { minor: 0 } } })
    expect(parseSnapshotRow(['s', 45292, 'Joint', -20.5, ''], accounts)).toMatchObject({ value: { balance: { minor: -2050 } } })
  })
  it.each([
    ['unknown account', ['s', 45292, 'Nowhere', 5, ''], 'account'],
    ['text balance', ['s', 45292, 'Joint', 'lots', ''], 'amount'],
    ['text date', ['s', 'x', 'Joint', 5, ''], 'date'],
  ])('%s is not understood', (_n, row, reason) => {
    expect(parseSnapshotRow(row, accounts)).toMatchObject({ reason })
  })
  it('skips an empty row', () => expect(parseSnapshotRow(['', '', '', '', ''], accounts)).toEqual({ skip: true }))
  it('round-trips through snapshotRowValues', () => {
    const s: Snapshot = { id: 's1', date: '2024-01-01', account: 'Cash GBP', balance: { minor: 10025, currency: 'GBP' }, note: 'n' }
    expect(snapshotRowValues(s)).toEqual(['s1', 45292, 'Cash GBP', 100.25, 'n'])
    expect(parseSnapshotRow(snapshotRowValues(s), accounts)).toEqual({ value: s })
  })
})
