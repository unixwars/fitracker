import { describe, expect, it } from 'vitest'
import {
  accountCurrency, accountNames, applySuggestion, categoriesFor, chooseAccount, convertedAmount, currencyIssue,
  entryToForm, initialForm, rememberChoices, resetAfterSave, switchKind, toEntry, validate,
} from './addForm'
import type { DeviceSettings } from './config'
import { DEFAULT_REFERENCE } from './sheets/fixtures'
import type { RateRow, Reference } from './types'

const ref = DEFAULT_REFERENCE // Joint EUR, M-Cash EUR, T-Cash GBP; base EUR
const device: DeviceSettings = { kind: 'income', theme: 'system', places: [], lastCategory: { 'expense:category': 'Bills', 'expense:account': 'T-Cash' } }
const now = new Date('2026-10-10T23:30:00-04:00')
const rates: RateRow[] = [
  { month: '2026-09-01', GBP: 1.1, USD: 0.9 },
  { month: '2026-10-01', GBP: 1.16, USD: 0.92 },
  { month: '2026-11-01', GBP: 1.3, USD: 0.95 },
]
const base = initialForm({ ...device, kind: 'expense' }, ref, now)

describe('lists', () => {
  it('offers active accounts and categories of the kind, in sheet order', () => {
    const r: Reference = { ...ref, accounts: ref.accounts.map((a) => (a.name === 'M-Cash' ? { ...a, active: false } : a)), categories: ref.categories.map((c) => (c.name === 'Bills' ? { ...c, active: false } : c)) }
    expect(accountNames(r)).toEqual(['Joint', 'T-Cash'])
    expect(categoriesFor('expense', r)).toEqual(['Business', 'Groceries', 'Recreation'])
    expect(categoriesFor('income', r)).toEqual(['Paycheck', 'Interest'])
    expect(categoriesFor('transfer', r)).toEqual([])
    expect(accountCurrency(r, 'T-Cash')).toBe('GBP')
    expect(accountCurrency(r, 'Nope')).toBeNull()
  })
})

describe('initialForm', () => {
  it('defaults to today (local), the remembered kind and the remembered account with its currency', () => {
    expect(initialForm(device, ref, now)).toMatchObject({ date: '2026-10-10', kind: 'income', amount: '', convertConfirmed: false, currency: 'EUR' })
    const f = initialForm({ ...device, kind: 'expense' }, ref, now)
    expect(f).toMatchObject({ category: 'Bills', account: 'T-Cash', currency: 'GBP' })
  })
  it('drops a remembered category or account that is gone or inactive', () => {
    const f = initialForm({ ...device, kind: 'expense', lastCategory: { 'expense:category': 'Deleted', 'expense:account': 'Gone' } }, ref, now)
    expect(f).toMatchObject({ category: '', account: '', currency: 'EUR' })
  })
})

describe('chooseAccount and currencyIssue', () => {
  it('sets the currency from the account and resets the confirmation', () => {
    const f = chooseAccount({ ...base, convertConfirmed: true, currency: 'USD' }, 'Joint', ref)
    expect(f).toMatchObject({ account: 'Joint', currency: 'EUR', convertConfirmed: false })
  })
  it("has no issue when the input currency is the account's, and flags GBP typed on Joint", () => {
    const joint = chooseAccount(base, 'Joint', ref)
    expect(currencyIssue(joint, ref)).toBeNull()
    expect(currencyIssue({ ...joint, currency: 'GBP' }, ref)).toEqual({ account: 'EUR', input: 'GBP' })
  })
})

describe('applySuggestion', () => {
  it('fills category and account, and the currency follows the account; unknown values are ignored', () => {
    const f = { ...base, place: 'x' }
    const out = applySuggestion(f, { text: 'Tesco', category: 'Groceries', account: 'Joint' }, ref, 'place')
    expect(out).toMatchObject({ place: 'Tesco', category: 'Groceries', account: 'Joint', currency: 'EUR' })
    const bad = applySuggestion(f, { text: 'Tesco', category: 'Nope', account: 'Nowhere' }, ref, 'place')
    expect(bad).toMatchObject({ category: 'Bills', account: 'T-Cash', currency: 'GBP' })
  })
  it('puts a description suggestion in the description field', () => {
    expect(applySuggestion(base, { text: 'Lunch' }, ref, 'description').description).toBe('Lunch')
  })
})

describe('validate', () => {
  const ok = { ...base, amount: '12,50', category: 'Bills', account: 'Joint', currency: 'EUR' as const }
  it('accepts a complete form', () => expect(validate(ok, ref, rates)).toEqual({}))
  it('requires a positive amount', () => {
    for (const amount of ['', '0', 'abc', '-3']) expect(validate({ ...ok, amount }, ref, rates).amount).toBeDefined()
  })
  it('requires category and account, and different accounts for a transfer', () => {
    expect(validate({ ...ok, category: '' }, ref, rates).category).toBeDefined()
    expect(validate({ ...ok, account: '' }, ref, rates).account).toBeDefined()
    const t = { ...ok, kind: 'transfer' as const, account: 'Joint', toAccount: 'Joint', category: '' }
    expect(validate(t, ref, rates).toAccount).toBeDefined()
    expect(validate({ ...t, toAccount: 'M-Cash' }, ref, rates)).toEqual({})
  })
  it('still accepts an inactive account or category an old entry uses', () => {
    const r: Reference = { ...ref, accounts: ref.accounts.map((a) => (a.name === 'Joint' ? { ...a, active: false } : a)), categories: ref.categories.map((c) => (c.name === 'Bills' ? { ...c, active: false } : c)) }
    expect(validate(ok, r, rates)).toEqual({})
  })
  it('asks for confirmation until convertConfirmed, then passes', () => {
    const gbp = { ...ok, currency: 'GBP' as const }
    expect(validate(gbp, ref, rates).currency).toBeDefined()
    expect(validate({ ...gbp, convertConfirmed: true }, ref, rates)).toEqual({})
  })
  it('reports a missing rate for the entry month, but needs none when the account is the input currency', () => {
    const gbp = { ...ok, currency: 'GBP' as const, convertConfirmed: true, date: '2025-01-05' }
    expect(validate(gbp, ref, rates).rate).toBeDefined()
    expect(convertedAmount(gbp, ref, rates)).toBeNull()
    expect(validate({ ...ok, date: '2025-01-05' }, ref, [])).toEqual({})
  })
})

describe('toEntry', () => {
  it('builds integer minor units and trims text', () => {
    const f = { ...base, amount: '12,5', place: ' Cafe ', description: ' Coffee ', category: 'Bills', account: 'T-Cash' }
    expect(toEntry(f, 'id1', ref, rates)).toEqual({
      id: 'id1', kind: 'expense', date: '2026-10-10', money: { minor: 1250, currency: 'GBP' },
      description: 'Coffee', place: 'Cafe', category: 'Bills', account: 'T-Cash',
    })
  })
  it("stores an overridden amount converted into the account's currency at the entry month's rate, with no note", () => {
    const f = { ...chooseAccount(base, 'Joint', ref), amount: '10,00', currency: 'GBP' as const, convertConfirmed: true, description: 'Taxi' }
    const e = toEntry(f, 'i', ref, rates)
    expect(e.money).toEqual({ minor: 1160, currency: 'EUR' })
    expect(e.description).toBe('Taxi')
    expect(toEntry({ ...f, date: '2026-11-03' }, 'i', ref, rates).money).toEqual({ minor: 1300, currency: 'EUR' })
  })
  it('omits fields that do not apply to the kind', () => {
    const f = { ...initialForm({ ...device, kind: 'income' }, ref, now), amount: '5', place: 'x', category: 'Paycheck', account: 'Joint', toAccount: 'M-Cash' }
    const e = toEntry(f, 'i', ref, rates)
    expect(e.place).toBeUndefined()
    expect(e.toAccount).toBeUndefined()
  })
})

describe('resetAfterSave, rememberChoices, entryToForm, switchKind', () => {
  it("clears amount and text and puts the currency back to the account's", () => {
    const f = { ...chooseAccount(base, 'Joint', ref), amount: '5', place: 'x', description: 'y', currency: 'GBP' as const, convertConfirmed: true }
    expect(resetAfterSave(f, ref)).toMatchObject({ amount: '', place: '', description: '', currency: 'EUR', convertConfirmed: false, account: 'Joint', date: '2026-10-10' })
  })
  it('remembers kind and the chosen category and account, not a currency', () => {
    const patch = rememberChoices(device, { ...base, category: 'Groceries', account: 'Joint' })
    expect(patch).toMatchObject({ kind: 'expense' })
    expect(patch).not.toHaveProperty('currency')
    expect(patch.lastCategory).toMatchObject({ 'expense:category': 'Groceries', 'expense:account': 'Joint' })
  })
  it('turns an entry back into editable form state', () => {
    const f = entryToForm({ id: 'a', kind: 'expense', date: '2026-10-05', money: { minor: 1250, currency: 'GBP' }, description: 'Coffee', place: 'Cafe', category: 'Bills', account: 'T-Cash' })
    expect(f).toEqual({ kind: 'expense', amount: '12.50', currency: 'GBP', date: '2026-10-05', place: 'Cafe', description: 'Coffee', category: 'Bills', account: 'T-Cash', toAccount: '', convertConfirmed: false })
  })
  it('switchKind restores the last category and account for the kind and clears the destination', () => {
    const f = switchKind({ ...initialForm(device, ref, now), amount: '5', toAccount: 'X' }, 'expense', device, ref)
    expect(f).toMatchObject({ kind: 'expense', category: 'Bills', account: 'T-Cash', currency: 'GBP', toAccount: '', amount: '5' })
    expect(switchKind(initialForm(device, ref, now), 'transfer', device, ref)).toMatchObject({ kind: 'transfer', category: '', account: '' })
  })
})
