import type { DeviceSettings } from './config'
import { parseAmount } from './money'
import type { Suggestion } from './predict'
import { convertMoney } from './rates'
import { todayLocal, type Entry, type Kind } from './rows'
import type { Currency, Money, RateRow, Reference } from './types'

export type FormState = {
  kind: Kind
  amount: string
  currency: Currency // the currency the amount is typed in; the account decides the stored one
  date: string
  place: string
  description: string
  category: string
  account: string
  toAccount: string
  convertConfirmed: boolean
}
export type Errors = Partial<Record<'amount' | 'category' | 'account' | 'toAccount' | 'currency' | 'rate', string>>

/** Active categories of that type, in sheet order. */
export const categoriesFor = (kind: Kind, ref: Reference): string[] =>
  kind === 'transfer' ? [] : ref.categories.filter((c) => c.active && c.type === kind).map((c) => c.name)

/** Active accounts, in sheet order. */
export const accountNames = (ref: Reference): string[] => ref.accounts.filter((a) => a.active).map((a) => a.name)

export const accountCurrency = (ref: Reference, name: string): Currency | null => ref.accounts.find((a) => a.name === name)?.currency ?? null

const valid = (v: string | undefined, options: string[]) => (v && options.includes(v) ? v : '')

export function initialForm(device: DeviceSettings, ref: Reference, now: Date = new Date()): FormState {
  const kind = device.kind
  const account = valid(device.lastCategory[`${kind}:account`], accountNames(ref))
  return {
    kind,
    amount: '',
    currency: accountCurrency(ref, account) ?? ref.base,
    date: todayLocal(now),
    place: '',
    description: '',
    category: valid(device.lastCategory[`${kind}:category`], categoriesFor(kind, ref)),
    account,
    toAccount: '',
    convertConfirmed: false,
  }
}

/** Picking an account resets the input currency to the account's and drops any earlier conversion confirmation. */
export function chooseAccount(form: FormState, name: string, ref: Reference): FormState {
  return { ...form, account: name, currency: accountCurrency(ref, name) ?? form.currency, convertConfirmed: false }
}

export function applySuggestion(form: FormState, s: Suggestion, ref: Reference, field: 'place' | 'description'): FormState {
  let next: FormState = { ...form, [field]: s.text }
  if (field === 'place' && s.description && !form.description.trim()) next.description = s.description // never over what was typed
  next.category = valid(s.category, categoriesFor(form.kind, ref)) || form.category
  const account = valid(s.account, accountNames(ref))
  if (account && account !== form.account) next = chooseAccount(next, account, ref)
  return next
}

export function switchKind(form: FormState, kind: Kind, device: DeviceSettings, ref: Reference): FormState {
  const account = valid(device.lastCategory[`${kind}:account`], accountNames(ref))
  return {
    ...form,
    kind,
    category: valid(device.lastCategory[`${kind}:category`], categoriesFor(kind, ref)),
    account,
    currency: accountCurrency(ref, account) ?? form.currency,
    convertConfirmed: false,
    toAccount: '',
  }
}

/** Set when the typed currency differs from the chosen account's: the amount must be converted first. */
export function currencyIssue(form: FormState, ref: Reference): { account: Currency; input: Currency } | null {
  const account = accountCurrency(ref, form.account)
  return account && account !== form.currency ? { account, input: form.currency } : null
}

/** The typed amount in the account's currency at the rate of the date's month; null without an amount, account or rate. */
export function convertedAmount(form: FormState, ref: Reference, rates: RateRow[]): Money | null {
  const account = accountCurrency(ref, form.account)
  const minor = parseAmount(form.amount)
  if (!account || minor === null) return null
  return convertMoney({ minor, currency: form.currency }, account, rates, ref.base, form.date.slice(0, 7))
}

// Checks against every known account and category (also inactive ones), so an old entry stays editable.
export function validate(form: FormState, ref: Reference, rates: RateRow[]): Errors {
  const errors: Errors = {}
  const minor = parseAmount(form.amount)
  if (minor === null || minor <= 0) errors.amount = 'amount'
  const accounts = ref.accounts.map((a) => a.name)
  if (form.kind !== 'transfer' && !valid(form.category, ref.categories.filter((c) => c.type === form.kind).map((c) => c.name))) errors.category = 'category'
  if (!valid(form.account, accounts)) errors.account = 'account'
  if (form.kind === 'transfer' && (!valid(form.toAccount, accounts) || form.toAccount === form.account)) errors.toAccount = 'toAccount'
  if (currencyIssue(form, ref)) {
    if (!form.convertConfirmed) errors.currency = 'currency'
    if (minor !== null && convertedAmount(form, ref, rates) === null) errors.rate = 'rate'
  }
  return errors
}

/** An amount typed in another currency is stored converted, in the account's currency. */
export function toEntry(form: FormState, id: string, ref: Reference, rates: RateRow[]): Entry {
  const typed: Money = { minor: parseAmount(form.amount) ?? 0, currency: form.currency }
  const money = currencyIssue(form, ref) ? (convertedAmount(form, ref, rates) ?? typed) : typed
  const entry: Entry = { id, kind: form.kind, date: form.date, money, description: form.description.trim(), account: form.account }
  if (form.kind === 'expense' && form.place.trim()) entry.place = form.place.trim()
  if (form.kind !== 'transfer') entry.category = form.category
  if (form.kind === 'transfer') entry.toAccount = form.toAccount
  return entry
}

export function resetAfterSave(form: FormState, ref: Reference): FormState {
  return { ...form, amount: '', place: '', description: '', toAccount: '', currency: accountCurrency(ref, form.account) ?? form.currency, convertConfirmed: false }
}

export function rememberChoices(device: DeviceSettings, form: FormState): Partial<DeviceSettings> {
  const lastCategory = { ...device.lastCategory }
  if (form.category) lastCategory[`${form.kind}:category`] = form.category
  if (form.account) lastCategory[`${form.kind}:account`] = form.account
  return { kind: form.kind, lastCategory }
}

export function entryToForm(e: Entry): FormState {
  return {
    kind: e.kind,
    amount: (e.money.minor / 100).toFixed(2),
    currency: e.money.currency,
    date: e.date,
    place: e.place ?? '',
    description: e.description,
    category: e.category ?? '',
    account: e.account ?? '',
    toAccount: e.toAccount ?? '',
    convertConfirmed: false,
  }
}
