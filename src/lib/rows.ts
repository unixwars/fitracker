import { type Account, type Money, type Snapshot, type UnreadableReason } from './types'
import { toMinor, toSheetNumber } from './money'
import type { Kind } from './schema'

export type { Kind } from './schema'

export type Entry = {
  id: string
  kind: Kind
  date: string // YYYY-MM-DD
  money: Money
  description: string
  place?: string
  category?: string
  account?: string
  toAccount?: string
}

const EPOCH = Date.UTC(1899, 11, 30)
const DAY = 86_400_000

export function serialToDate(n: number): string {
  return new Date(EPOCH + Math.floor(n) * DAY).toISOString().slice(0, 10)
}

export function dateToSerial(d: string): number {
  const [y, m, day] = d.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, day) - EPOCH) / DAY)
}

export function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

const isBlank = (v: unknown) => v === undefined || v === null || v === ''

// One Ledger row is A..I = id, date, type, amount, place, description,
// category, account, to_account. The currency is never stored: it is the account's.
export type RowResult<T> = { value: T } | { skip: true } | { reason: UnreadableReason; text: string }

const KINDS: readonly Kind[] = ['expense', 'income', 'transfer']
const cell = (row: unknown[], i: number): string => (isBlank(row[i]) ? '' : String(row[i]).trim())
const wholeNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null)

/** Reads one Ledger row (columns A..I). Rows the app cannot understand come back with a reason, never half-parsed. */
export function parseLedgerRow(row: unknown[], accounts: Account[]): RowResult<Entry> {
  if (Array.from({ length: 9 }, (_, i) => cell(row, i)).every((v) => v === '')) return { skip: true }
  const place = cell(row, 4)
  const description = cell(row, 5)
  const text = description || place
  const bad = (reason: UnreadableReason): RowResult<Entry> => ({ reason, text })
  const kind = cell(row, 2) as Kind
  if (!KINDS.includes(kind)) return bad('type')
  const date = wholeNumber(row[1])
  if (date === null) return bad('date')
  const amount = row[3]
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return bad('amount')
  const account = accounts.find((a) => a.name === cell(row, 7))
  if (!account) return bad('account')
  const entry: Entry = { id: cell(row, 0), kind, date: serialToDate(date), money: { minor: toMinor(amount), currency: account.currency }, description, account: account.name }
  if (place) entry.place = place
  const category = cell(row, 6)
  if (category) entry.category = category
  if (kind === 'transfer') {
    const to = accounts.find((a) => a.name === cell(row, 8))
    if (!to || to.name === account.name) return bad('toAccount')
    entry.toAccount = to.name
  }
  return { value: entry }
}

/** The nine values A..I of a Ledger row. Column J (base amount) is a sheet formula and is never written. */
export function ledgerRowValues(e: Entry): unknown[] {
  return [e.id, dateToSerial(e.date), e.kind, toSheetNumber(e.money.minor), e.place ?? '', e.description, e.category ?? '', e.account ?? '', e.toAccount ?? '']
}

/** Reads one Snapshots row (A..E = id, date, account, balance, note). Zero and negative balances are valid. */
export function parseSnapshotRow(row: unknown[], accounts: Account[]): RowResult<Snapshot> {
  if (Array.from({ length: 5 }, (_, i) => cell(row, i)).every((v) => v === '')) return { skip: true }
  const text = cell(row, 4)
  const date = wholeNumber(row[1])
  if (date === null) return { reason: 'date', text }
  const account = accounts.find((a) => a.name === cell(row, 2))
  if (!account) return { reason: 'account', text }
  const balance = row[3]
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return { reason: 'amount', text }
  return { value: { id: cell(row, 0), date: serialToDate(date), account: account.name, balance: { minor: toMinor(balance), currency: account.currency }, note: text } }
}

export function snapshotRowValues(s: Snapshot): unknown[] {
  return [s.id, dateToSerial(s.date), s.account, toSheetNumber(s.balance.minor), s.note]
}
