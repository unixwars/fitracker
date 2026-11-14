import { serialToDate, type Entry, type Kind } from './rows'
import { toMinor } from './money'
import type { Reference } from './types'

const KINDS: readonly Kind[] = ['expense', 'income', 'transfer']
const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim())

/**
 * An entry to put in the edit form for a Ledger row the app could not read (A..I as returned by the API): what is
 * valid is kept, what is not gets a default (today, amount 0, kind expense), so the form refuses to save until the
 * person has fixed it. An account that does not exist is kept as typed so that it can be seen.
 */
export function repairDraft(row: unknown[], ref: Reference, today: string): Entry {
  const date = typeof row[1] === 'number' && Number.isFinite(row[1]) ? serialToDate(row[1]) : today
  const kind = KINDS.find((k) => k === text(row[2])) ?? 'expense'
  const account = text(row[7])
  const currency = ref.accounts.find((a) => a.name === account)?.currency ?? ref.base
  const amount = typeof row[3] === 'number' && Number.isFinite(row[3]) && row[3] > 0 ? toMinor(row[3]) : 0
  const entry: Entry = { id: text(row[0]), kind, date, money: { minor: amount, currency }, description: text(row[5]), account }
  if (text(row[4])) entry.place = text(row[4])
  if (kind !== 'transfer' && text(row[6])) entry.category = text(row[6])
  if (kind === 'transfer' && text(row[8])) entry.toAccount = text(row[8])
  return entry
}
