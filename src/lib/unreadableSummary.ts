import { messages } from './messages'
import { serialToDate } from './rows'
import type { Unreadable } from './types'

const cell = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim())
// A number is shown as a number, text in quotes so that a wrong value is obvious.
const shown = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? '' : `"${cell(v)}"`)

/**
 * The title (tab, row, amount as typed) and a detail line (the other cells that were read) for a row the app could
 * not read, so the person can recognise it before opening the sheet. Without the raw cells it falls back to the row text.
 */
export function rowSummary(u: Pick<Unreadable, 'tab' | 'row' | 'text' | 'raw'>): { title: string; detail: string } {
  const base = messages.unreadableRow(u.tab, u.row)
  const raw = u.raw
  if (!raw) return { title: base, detail: u.text }
  const amount = typeof raw[3] === 'number' && Number.isFinite(raw[3]) ? raw[3].toFixed(2) : cell(raw[3]) ? shown(raw[3]) : messages.noAmount
  const date = typeof raw[1] === 'number' && Number.isFinite(raw[1]) ? serialToDate(raw[1]) : cell(raw[1]) ? `date ${shown(raw[1])}` : messages.noDate
  const rest = [raw[4], raw[5], raw[6], raw[7]].map(cell).filter(Boolean)
  return { title: `${base} › ${amount}`, detail: [date, ...rest].join(' · ') }
}
