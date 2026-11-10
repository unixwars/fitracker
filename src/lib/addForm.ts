import type { DeviceSettings } from './config'
import { parseAmount } from './money'
import type { Suggestion } from './predict'
import { todayLocal, type Entry, type Kind } from './rows'
import type { Currency, Lists } from './types'

export type FormState = {
  kind: Kind
  amount: string
  currency: Currency
  date: string
  place: string
  description: string
  category: string
  account: string
  toAccount: string
}
export type Errors = Partial<Record<'amount' | 'category' | 'account' | 'toAccount', string>>

export const categoriesFor = (kind: Kind, lists: Lists): string[] =>
  kind === 'expense' ? lists.expenseCategories : kind === 'income' ? lists.incomeCategories : []

const valid = (v: string | undefined, options: string[]) => (v && options.includes(v) ? v : '')

export function initialForm(device: DeviceSettings, lists: Lists, now: Date = new Date()): FormState {
  const kind = device.kind
  return {
    kind,
    amount: '',
    currency: device.currency,
    date: todayLocal(now),
    place: '',
    description: '',
    category: valid(device.lastCategory[`${kind}:category`], categoriesFor(kind, lists)),
    account: valid(device.lastCategory[`${kind}:account`], lists.accounts),
    toAccount: '',
  }
}

export function applySuggestion(form: FormState, s: Suggestion, lists: Lists, field: 'place' | 'description'): FormState {
  const next: FormState = { ...form, [field]: s.text }
  next.category = valid(s.category, categoriesFor(form.kind, lists)) || form.category
  next.account = valid(s.account, lists.accounts) || form.account
  if (s.currency) next.currency = s.currency
  return next
}

export function validate(form: FormState, lists: Lists): Errors {
  const errors: Errors = {}
  const minor = parseAmount(form.amount)
  if (minor === null || minor <= 0) errors.amount = 'amount'
  if (form.kind !== 'transfer' && !valid(form.category, categoriesFor(form.kind, lists))) errors.category = 'category'
  if (!valid(form.account, lists.accounts)) errors.account = 'account'
  if (form.kind === 'transfer' && (!valid(form.toAccount, lists.accounts) || form.toAccount === form.account)) errors.toAccount = 'toAccount'
  return errors
}

export function toEntry(form: FormState, id: string): Entry {
  const entry: Entry = {
    id,
    kind: form.kind,
    date: form.date,
    money: { minor: parseAmount(form.amount) ?? 0, currency: form.currency },
    description: form.description.trim(),
    account: form.account,
  }
  if (form.kind === 'expense' && form.place.trim()) entry.place = form.place.trim()
  if (form.kind !== 'transfer') entry.category = form.category
  if (form.kind === 'transfer') entry.toAccount = form.toAccount
  return entry
}

export function resetAfterSave(form: FormState): FormState {
  return { ...form, amount: '', place: '', description: '', toAccount: '' }
}

export function rememberChoices(device: DeviceSettings, form: FormState): Partial<DeviceSettings> {
  const lastCategory = { ...device.lastCategory }
  if (form.category) lastCategory[`${form.kind}:category`] = form.category
  if (form.account) lastCategory[`${form.kind}:account`] = form.account
  return { kind: form.kind, currency: form.currency, lastCategory }
}
