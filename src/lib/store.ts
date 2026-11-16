import type { NameProblem } from './newItem'
import type { Entry } from './rows'
import type { Currency, EntryType, RateRow, Reference, Snapshot, Unreadable } from './types'

export type AddResult = { id: string; ok: boolean; reason?: 'AccountChanged' }
export type RefreshOpts = { force?: boolean; expectIds?: string[] }

/** What an add wrote, so a session-only Undo can clear exactly that row. */
export type AddedItem = { kind: 'account' | 'category'; row: number; cells: unknown[]; name: string }
export type AddItemResult = { ok: true; added: AddedItem } | { ok: false; reason: NameProblem | 'tryAgain' }
export type UndoItemResult = { ok: true } | { ok: false; reason: 'changed' | 'inUse' }

// The data seam: one multi-year ledger. Screens, the outbox and prediction use this; only the Sheets adapter knows about Sheets.
export interface EntryStore {
  list(): Promise<Entry[]>
  lists(): Promise<Reference>
  rates(): Promise<RateRow[]>
  snapshots(): Promise<Snapshot[]>
  /** Rows the app does not understand (spec 3.2): never listed, never written, shown under Needs attention. */
  unreadable(): Promise<Unreadable[]>
  /** Shared settings (`fitracker.*` developer metadata), raw key to value; null when it could not be read (keep what you had). See overrides.ts. */
  overrides(): Promise<Record<string, string> | null>
  /** Writes one shared setting; '' clears it. Needs a connection: it is not queued. */
  setOverride(key: string, value: string): Promise<void>
  addMany(entries: Entry[]): Promise<AddResult[]>
  /** `repair` fixes or removes a row the app could not read (found by its id, which must occur once). */
  edit(entry: Entry, expectedPrevious?: Entry, opts?: { repair?: boolean }): Promise<{ previous: Entry }>
  delete(id: string, expectedPrevious?: Entry, opts?: { repair?: boolean }): Promise<{ previous: Entry }>
  /**
   * Fixes or clears an unreadable Ledger row that has no usable id. The row is found by number, so it is re-read
   * first and the write is refused (RowChanged) unless it still holds exactly `expectedRaw`, the cells the person saw.
   */
  repairRowAt(row: number, expectedRaw: unknown[], entry: Entry): Promise<void>
  clearRowAt(row: number, expectedRaw: unknown[]): Promise<void>
  addSnapshot(s: Snapshot): Promise<AddResult>
  deleteSnapshot(id: string): Promise<{ previous: Snapshot }>
  /** Appends an account (active, ticked In Monthly and In Annual) to the first free row of `Accounts`. Needs a connection; never grows the tab. */
  addAccount(a: { name: string; currency: Currency }): Promise<AddItemResult>
  /** Appends an active category to the first free row of `Categories`. */
  addCategory(c: { name: string; type: EntryType }): Promise<AddItemResult>
  /** Clears the row an add wrote, only while it still holds exactly what was written and nothing in the ledger uses the name. */
  undoAddItem(added: AddedItem): Promise<UndoItemResult>
  /** Spec 3.4: freeze the closed month's live Rates cells and append the current month's row. */
  maintainRates(today: string): Promise<void>
  /** Re-reads the book (at most once per refresh interval unless forced); reports expected ids that are gone. */
  refresh(opts?: RefreshOpts): Promise<{ missingIds: string[] }>
  subscribe(fn: () => void): () => void
}
