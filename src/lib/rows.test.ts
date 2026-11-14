import { describe, expect, it } from 'vitest'
import { dateToSerial, ledgerRowValues, parseLedgerRow, parseSnapshotRow, serialToDate, snapshotRowValues, todayLocal } from './rows'
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
