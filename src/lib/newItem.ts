import { CATEGORIES, ACCOUNTS } from './schema'
import type { EntryType } from './types'

export type NameProblem = 'empty' | 'tooLong' | 'invalidChars' | 'duplicate' | 'full'

// Metadata keys are limited to 256 bytes and the longest prefix is "fitracker.icon.category." (24 bytes): longer names
// could be added but never given an icon or a toggle.
const MAX_NAME_BYTES = 232

/** The text that is stored and compared: trimmed and composed (NFC). */
export const normaliseName = (name: string): string => name.trim().normalize('NFC')

// The views read names as SUMIFS criteria: * ? ~ are wildcards, a leading < > = is a comparison. + - @ are refused as
// a cheap guard for spreadsheet paths that read text as a formula (the app writes RAW).
const problemWith = (name: string): NameProblem | null => {
  if (name === '') return 'empty'
  if (new TextEncoder().encode(name).length > MAX_NAME_BYTES) return 'tooLong'
  if (/[*?~]/.test(name) || /^[<>=+\-@]/.test(name)) return 'invalidChars'
  return null
}

// The sheet matches names without regard to case, so "cash" next to "Cash" would take Cash's currency.
const same = (a: string, b: string): boolean => normaliseName(a).toLowerCase() === normaliseName(b).toLowerCase()
// COUNTA counts any non-empty cell, so a number or a boolean in the name column counts too.
const present = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== ''

/** `columnA` is the raw name column of Accounts, rows the parser may skip included (every non-empty name counts toward the cap). */
export function validateNewAccount(name: string, columnA: unknown[]): NameProblem | null {
  const n = normaliseName(name)
  const problem = problemWith(n)
  if (problem) return problem
  const existing = columnA.filter(present).map((v) => String(v))
  if (existing.some((e) => same(e, n))) return 'duplicate'
  if (existing.length >= ACCOUNTS.max) return 'full'
  return null
}

/**
 * `rows` is every raw row of Categories (name, type, active). Inactive rows still clash by name; only active rows of the type
 * count toward its cap. The type is compared without regard to case and `active` must be a real TRUE, as the template's
 * COUNTIFS and FILTER do, so a hand-typed "Expense" row counts like the sheet counts it.
 */
export function validateNewCategory(name: string, type: EntryType, rows: unknown[][]): NameProblem | null {
  const n = normaliseName(name)
  const problem = problemWith(n)
  if (problem) return problem
  const ofType = rows.filter((r) => present(r?.[0]) && String(r?.[1] ?? '').trim().toLowerCase() === type)
  if (ofType.some((r) => same(String(r[0]), n))) return 'duplicate'
  const cap = type === 'expense' ? CATEGORIES.maxExpense : CATEGORIES.maxIncome
  if (ofType.filter((r) => r[2] === true).length >= cap) return 'full'
  return null
}
