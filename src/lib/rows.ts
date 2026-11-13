import { CURRENCIES, type Account, type Currency, type Money, type Snapshot, type UnreadableReason } from './types'
import { toMinor, toSheetNumber } from './money'
import { FIRST_ROW, TABS, colIndex, type Field, type Kind } from './schema'

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

const FIELDS: Field[] = ['place', 'description', 'category', 'account', 'toAccount']
const isBlank = (v: unknown) => v === undefined || v === null || v === ''

// Row is A..last as returned by the API. Returns null for blank rows and rows without a usable
// date or amount (those are left for a human to fix in the sheet).
export function rowToEntry(kind: Kind, row: unknown[], base: Currency = 'EUR'): Entry | null {
  const { cols } = TABS[kind]
  const at = (letter: string) => row[colIndex(letter)]
  const amount = at(cols.amount)
  const date = at(cols.date)
  if (typeof amount !== 'number' || typeof date !== 'number') return null
  const cur = at(cols.currency)
  const currency = (CURRENCIES as readonly unknown[]).includes(cur) ? (cur as Currency) : base
  const entry: Entry = {
    id: isBlank(at(cols.id)) ? '' : String(at(cols.id)),
    kind,
    date: serialToDate(date),
    money: { minor: toMinor(amount), currency },
    description: '',
  }
  for (const f of FIELDS) {
    const letter = cols.fields[f]
    if (!letter) continue
    const v = at(letter)
    if (!isBlank(v)) entry[f] = String(v)
  }
  return entry
}

export type Write = { range: string; values: unknown[][] }

export function entryToWrites(e: Entry, row: number): Write[] {
  const { name, cols } = TABS[e.kind]
  const first = colIndex(cols.amount)
  const last = colIndex(cols.currency)
  const cells: unknown[] = []
  for (let i = first; i <= last; i++) {
    const letter = String.fromCharCode(65 + i)
    if (letter === cols.amount) cells.push(toSheetNumber(e.money.minor))
    else if (letter === cols.currency) cells.push(e.money.currency)
    else {
      const f = FIELDS.find((x) => cols.fields[x] === letter)
      cells.push(f ? (e[f] ?? '') : '')
    }
  }
  return [
    { range: `${name}!${cols.id}${row}`, values: [[e.id]] },
    { range: `${name}!${cols.date}${row}`, values: [[dateToSerial(e.date)]] },
    { range: `${name}!${cols.amount}${row}:${cols.currency}${row}`, values: [cells] },
  ]
}

export function clearWrites(kind: Kind, row: number): { range: string }[] {
  const { name, cols } = TABS[kind]
  return [
    { range: `${name}!${cols.id}${row}` },
    { range: `${name}!${cols.date}${row}` },
    { range: `${name}!${cols.amount}${row}:${cols.currency}${row}` },
  ]
}

// Columns start at FIRST_ROW; arrays may be shorter than the tab (the API trims trailing blanks).
export function findFreeRow(kind: Kind, ids: unknown[], b: unknown[], d: unknown[], desc: unknown[]): number | 'full' {
  const n = Math.max(ids.length, b.length, d.length, desc.length)
  for (let i = 0; i < n; i++) {
    if (isBlank(ids[i]) && isBlank(b[i]) && isBlank(d[i]) && isBlank(desc[i])) return FIRST_ROW + i
  }
  const next = FIRST_ROW + n
  return next > TABS[kind].lastRow ? 'full' : next
}

// ---- v3 ledger layout (spec 3.2): one Ledger row is A..I = id, date, type, amount, place, description,
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
