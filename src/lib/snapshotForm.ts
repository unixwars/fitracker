import { cleanAmountInput, parseAmount } from './money'
import type { Reference, Snapshot } from './types'

export type SnapshotForm = { date: string; account: string; balance: string; note: string }
export type SnapshotErrors = Partial<Record<'date' | 'account' | 'balance', string>>

/** A balance in minor units. Like an amount, but it may be negative (a card owed) or zero. */
export function parseBalance(input: string): number | null {
  const t = input.trim()
  const negative = t.startsWith('-')
  const minor = parseAmount(negative ? t.slice(1) : t)
  if (minor === null || (negative && /^\s/.test(t.slice(1)))) return null
  return negative && minor !== 0 ? -minor : minor
}

export function initialSnapshotForm(ref: Reference, today: string, lastAccount?: string): SnapshotForm {
  const active = ref.accounts.filter((a) => a.active)
  const account = active.find((a) => a.name === lastAccount) ?? active[0]
  return { date: today, account: account?.name ?? '', balance: '', note: '' }
}

const validDate = (d: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) return false
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return t.toISOString().slice(0, 10) === d
}

export function validateSnapshot(f: SnapshotForm, ref: Reference): SnapshotErrors {
  const errors: SnapshotErrors = {}
  if (!ref.accounts.some((a) => a.active && a.name === f.account)) errors.account = 'account'
  if (!validDate(f.date)) errors.date = 'date'
  if (parseBalance(f.balance) === null) errors.balance = 'balance'
  return errors
}

export function toSnapshot(f: SnapshotForm, id: string, ref: Reference): Snapshot {
  const currency = ref.accounts.find((a) => a.name === f.account)?.currency ?? ref.base
  return { id, date: f.date, account: f.account, balance: { minor: parseBalance(f.balance) ?? 0, currency }, note: f.note.trim() }
}

/** What the balance field keeps while typing: an optional leading minus, digits and one dot (a comma becomes the dot), two decimals. */
export function cleanBalanceInput(raw: string): string {
  const negative = raw.trimStart().startsWith('-')
  return (negative ? '-' : '') + cleanAmountInput(raw.replace(/-/g, ''))
}
