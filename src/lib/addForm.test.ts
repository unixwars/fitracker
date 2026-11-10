import { describe, expect, it } from 'vitest'
import { applySuggestion, initialForm, rememberChoices, resetAfterSave, toEntry, validate } from './addForm'
import type { DeviceSettings } from './config'
import { DEFAULT_LISTS } from './sheets/fixtures'

const device: DeviceSettings = { currency: 'GBP', kind: 'income', places: [], lastCategory: { 'expense:category': 'Bills', 'expense:account': 'M-Cash' } }
const now = new Date('2024-01-10T23:30:00-05:00')

describe('initialForm', () => {
  it('defaults to today (local), the last used currency and the remembered kind', () => {
    const f = initialForm(device, DEFAULT_LISTS, now)
    expect(f).toMatchObject({ date: '2024-01-10', currency: 'GBP', kind: 'income', amount: '' })
  })
  it('pre-selects the last category and account used for the kind, if they still exist', () => {
    const f = initialForm({ ...device, kind: 'expense' }, DEFAULT_LISTS, now)
    expect(f.category).toBe('Bills')
    expect(f.account).toBe('M-Cash')
    const gone = initialForm({ ...device, kind: 'expense', lastCategory: { 'expense:category': 'Deleted' } }, DEFAULT_LISTS, now)
    expect(gone.category).toBe('')
  })
})

describe('applySuggestion', () => {
  it('fills category, account and currency from the suggestion, ignoring values not in the lists', () => {
    const f = initialForm({ ...device, kind: 'expense' }, DEFAULT_LISTS, now)
    const out = applySuggestion({ ...f, place: 'x' }, { text: 'Tesco', category: 'Groceries', account: 'Nowhere', currency: 'EUR' }, DEFAULT_LISTS, 'place')
    expect(out).toMatchObject({ place: 'Tesco', category: 'Groceries', account: 'M-Cash', currency: 'EUR' })
  })
  it('puts a description suggestion in the description field', () => {
    const f = initialForm({ ...device, kind: 'expense' }, DEFAULT_LISTS, now)
    expect(applySuggestion(f, { text: 'Lunch' }, DEFAULT_LISTS, 'description').description).toBe('Lunch')
  })
})

describe('selected year', () => {
  it('defaults the date inside the selected year when today is outside it', () => {
    expect(initialForm(device, DEFAULT_LISTS, new Date('2027-01-05T12:00:00'), 2026).date).toBe('2026-12-31')
    expect(initialForm(device, DEFAULT_LISTS, new Date('2027-01-05T12:00:00'), 2028).date).toBe('2028-01-01')
    expect(initialForm(device, DEFAULT_LISTS, new Date('2027-01-05T12:00:00'), 2027).date).toBe('2027-01-05')
  })
  it('rejects a date outside the selected year', () => {
    const f = { ...initialForm({ ...device, kind: 'expense' }, DEFAULT_LISTS, now), amount: '5', category: 'Bills', account: 'Joint', date: '2027-01-05' }
    expect(validate(f, DEFAULT_LISTS, 2026).date).toBeDefined()
    expect(validate({ ...f, date: '2026-12-31' }, DEFAULT_LISTS, 2026).date).toBeUndefined()
    expect(validate(f, DEFAULT_LISTS).date).toBeUndefined()
  })
})

describe('validate', () => {
  const ok = { ...initialForm({ ...device, kind: 'expense' }, DEFAULT_LISTS, now), amount: '12,50', category: 'Bills', account: 'Joint' }
  it('accepts a complete form', () => {
    expect(validate(ok, DEFAULT_LISTS)).toEqual({})
  })
  it('requires a positive amount', () => {
    for (const amount of ['', '0', 'abc', '-3']) expect(validate({ ...ok, amount }, DEFAULT_LISTS).amount).toBeDefined()
  })
  it('requires category and account, and different accounts for a transfer', () => {
    expect(validate({ ...ok, category: '' }, DEFAULT_LISTS).category).toBeDefined()
    expect(validate({ ...ok, account: '' }, DEFAULT_LISTS).account).toBeDefined()
    const t = { ...ok, kind: 'transfer' as const, account: 'Joint', toAccount: 'Joint', category: '' }
    expect(validate(t, DEFAULT_LISTS).toAccount).toBeDefined()
    expect(validate({ ...t, toAccount: 'M-Cash' }, DEFAULT_LISTS)).toEqual({})
  })
})

describe('toEntry', () => {
  it('builds integer minor units and trims text', () => {
    const f = { ...initialForm({ ...device, kind: 'expense' }, DEFAULT_LISTS, now), amount: '12,5', place: ' Cafe ', description: ' Coffee ', category: 'Bills', account: 'Joint' }
    expect(toEntry(f, 'id1')).toEqual({
      id: 'id1', kind: 'expense', date: '2024-01-10', money: { minor: 1250, currency: 'GBP' },
      description: 'Coffee', place: 'Cafe', category: 'Bills', account: 'Joint',
    })
  })
  it('omits fields that do not apply to the kind', () => {
    const f = { ...initialForm({ ...device, kind: 'income' }, DEFAULT_LISTS, now), amount: '5', place: 'x', category: 'Paycheck', account: 'Joint', toAccount: 'M-Cash' }
    const e = toEntry(f, 'i')
    expect(e.place).toBeUndefined()
    expect(e.toAccount).toBeUndefined()
  })
})

describe('resetAfterSave and rememberChoices', () => {
  it('keeps kind, currency, date, category and account but clears amount and text', () => {
    const f = { ...initialForm({ ...device, kind: 'expense' }, DEFAULT_LISTS, now), amount: '5', place: 'x', description: 'y', category: 'Bills', account: 'Joint' }
    expect(resetAfterSave(f)).toMatchObject({ amount: '', place: '', description: '', kind: 'expense', currency: 'GBP', category: 'Bills', account: 'Joint', date: '2024-01-10' })
  })
  it('remembers kind, currency and the chosen category and account for the kind', () => {
    const f = { ...initialForm({ ...device, kind: 'expense' }, DEFAULT_LISTS, now), category: 'Groceries', account: 'Joint' }
    const patch = rememberChoices(device, f)
    expect(patch).toMatchObject({ kind: 'expense', currency: 'GBP' })
    expect(patch.lastCategory).toMatchObject({ 'expense:category': 'Groceries', 'expense:account': 'Joint' })
  })
})

describe('entryToForm', () => {
  it('turns an entry back into editable form state', async () => {
    const { entryToForm } = await import('./addForm')
    const f = entryToForm({
      id: 'a', kind: 'expense', date: '2024-01-05', money: { minor: 1250, currency: 'GBP' },
      description: 'Coffee', place: 'Cafe', category: 'Bills', account: 'Joint',
    })
    expect(f).toEqual({ kind: 'expense', amount: '12.50', currency: 'GBP', date: '2024-01-05', place: 'Cafe', description: 'Coffee', category: 'Bills', account: 'Joint', toAccount: '' })
  })
})
