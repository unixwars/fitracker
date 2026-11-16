import { describe, expect, it } from 'vitest'
import { cleanBalanceInput, initialSnapshotForm, parseBalance, toSnapshot, validateSnapshot } from './snapshotForm'
import type { Reference } from './types'

const ref: Reference = {
  base: 'EUR',
  accounts: [
    { name: 'Joint', currency: 'EUR', active: true, inMonthly: true, inAnnual: true },
    { name: 'Card', currency: 'GBP', active: true, inMonthly: true, inAnnual: true },
    { name: 'Old', currency: 'EUR', active: false, inMonthly: false, inAnnual: false },
  ],
  categories: [],
  budgets: [],
}

describe('parseBalance', () => {
  it('reads minor units, allows a minus sign and zero, one decimal separator', () => {
    expect(parseBalance('100.25')).toBe(10025)
    expect(parseBalance('100,5')).toBe(10050)
    expect(parseBalance('-12.30')).toBe(-1230)
    expect(parseBalance('0')).toBe(0)
  })
  it('rejects text, thousands separators and several signs', () => {
    for (const bad of ['', 'abc', '1,000.50', '--5', '5-', '1e3', '- 5']) expect(parseBalance(bad)).toBeNull()
  })
  it('does not turn -0 into a negative zero', () => {
    expect(Object.is(parseBalance('-0'), 0)).toBe(true)
  })
})

describe('initialSnapshotForm', () => {
  it('starts on today with the first active account', () => {
    expect(initialSnapshotForm(ref, '2026-11-15')).toEqual({ date: '2026-11-15', account: 'Joint', balance: '', note: '' })
  })
  it('starts on the account used last when it is still active', () => {
    expect(initialSnapshotForm(ref, '2026-11-15', 'Card').account).toBe('Card')
    expect(initialSnapshotForm(ref, '2026-11-15', 'Old').account).toBe('Joint')
    expect(initialSnapshotForm(ref, '2026-11-15', 'Gone').account).toBe('Joint')
  })
  it('has no account when none is active', () => {
    expect(initialSnapshotForm({ ...ref, accounts: [] }, '2026-11-15').account).toBe('')
  })
})

describe('validateSnapshot', () => {
  const ok = { date: '2026-11-15', account: 'Card', balance: '10.50', note: '' }
  it('accepts a valid form', () => expect(validateSnapshot(ok, ref)).toEqual({}))
  it('needs a known active account, a real date and a balance', () => {
    expect(validateSnapshot({ ...ok, account: '' }, ref).account).toBeDefined()
    expect(validateSnapshot({ ...ok, account: 'Old' }, ref).account).toBeDefined()
    expect(validateSnapshot({ ...ok, date: '2026-02-30' }, ref).date).toBeDefined()
    expect(validateSnapshot({ ...ok, date: '' }, ref).date).toBeDefined()
    expect(validateSnapshot({ ...ok, balance: 'x' }, ref).balance).toBeDefined()
  })
})

describe('toSnapshot', () => {
  it('uses the account currency, trims the note and keeps the id', () => {
    expect(toSnapshot({ date: '2026-11-15', account: 'Card', balance: '-3,5', note: ' paid ' }, 's1', ref)).toEqual({
      id: 's1', date: '2026-11-15', account: 'Card', balance: { minor: -350, currency: 'GBP' }, note: 'paid',
    })
  })
})

describe('cleanBalanceInput', () => {
  it('keeps a leading minus, digits and one dot with two decimals', () => {
    expect(cleanBalanceInput('-12,345')).toBe('-12.34')
    expect(cleanBalanceInput('1-2')).toBe('12')
    expect(cleanBalanceInput('abc')).toBe('')
    expect(cleanBalanceInput('-')).toBe('-')
  })
})
