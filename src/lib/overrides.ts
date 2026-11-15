import type { Reference } from './types'

// Shared settings stored as DOCUMENT developer metadata, one entry per name, so two people changing different items
// never overwrite each other. An override beats the sheet inside the app only; no cell is ever written.
export const OVERRIDE_PREFIX = 'fitracker.'
const ACCOUNT = OVERRIDE_PREFIX + 'account.'
const ACCOUNT_ICON = OVERRIDE_PREFIX + 'icon.account.'
const CATEGORY_ICON = OVERRIDE_PREFIX + 'icon.category.'
const MAX_KEY_BYTES = 256
const MAX_EMOJI_UNITS = 16

export type AccountOverride = { inMonthly?: boolean; inAnnual?: boolean }
export type Overrides = {
  accounts: Map<string, AccountOverride>
  accountIcons: Map<string, string>
  categoryIcons: Map<string, string>
}

export const NO_OVERRIDES = (): Overrides => ({ accounts: new Map(), accountIcons: new Map(), categoryIcons: new Map() })

function key(prefix: string, name: string): string {
  const k = prefix + name
  if (new TextEncoder().encode(k).length > MAX_KEY_BYTES) throw new Error('Name too long to store a shared setting')
  return k
}
export const accountKey = (name: string) => key(ACCOUNT, name)
export const accountIconKey = (name: string) => key(ACCOUNT_ICON, name)
export const categoryIconKey = (name: string) => key(CATEGORY_ICON, name)

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
/** One visible emoji (a grapheme that is not plain text). Keeps values short and renderable. */
export function isEmoji(s: string): boolean {
  if (!s || s.length > MAX_EMOJI_UNITS) return false
  const graphemes = segmenter ? [...segmenter.segment(s)] : [{ segment: s }]
  return graphemes.length === 1 && /\p{Extended_Pictographic}/u.test(s)
}

function parseToggle(value: string): AccountOverride | null {
  try {
    const v = JSON.parse(value) as { m?: unknown; a?: unknown }
    if (!v || typeof v !== 'object') return null
    const out: AccountOverride = {}
    if (typeof v.m === 'boolean') out.inMonthly = v.m
    if (typeof v.a === 'boolean') out.inAnnual = v.a
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

export function parseOverrides(entries: Record<string, string>): Overrides {
  const out = NO_OVERRIDES()
  for (const [k, value] of Object.entries(entries)) {
    if (!value) continue
    if (k.startsWith(ACCOUNT_ICON)) { if (isEmoji(value)) out.accountIcons.set(k.slice(ACCOUNT_ICON.length), value) }
    else if (k.startsWith(CATEGORY_ICON)) { if (isEmoji(value)) out.categoryIcons.set(k.slice(CATEGORY_ICON.length), value) }
    else if (k.startsWith(ACCOUNT)) {
      const t = parseToggle(value)
      if (t) out.accounts.set(k.slice(ACCOUNT.length), t)
    }
  }
  return out
}

export function applyOverrides(ref: Reference, o: Overrides): Reference {
  if (!o.accounts.size) return ref
  return { ...ref, accounts: ref.accounts.map((a) => ({ ...a, ...o.accounts.get(a.name) })) }
}

/** The metadata value after one toggle is set to `value`; '' (no override) when every field matches the sheet. */
export function toggleValue(current: AccountOverride | undefined, field: 'inMonthly' | 'inAnnual', value: boolean, sheetValue: boolean): string {
  const next: AccountOverride = { ...current }
  if (value === sheetValue) delete next[field]
  else next[field] = value
  const out: { a?: boolean; m?: boolean } = {}
  if (next.inAnnual !== undefined) out.a = next.inAnnual
  if (next.inMonthly !== undefined) out.m = next.inMonthly
  return Object.keys(out).length ? JSON.stringify(out) : ''
}
