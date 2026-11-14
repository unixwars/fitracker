import type { Entry } from './rows'
import type { RateRow, Reference, Snapshot, Unreadable } from './types'

export type AddResult = { id: string; ok: boolean; reason?: 'AccountChanged' }
export type RefreshOpts = { force?: boolean; expectIds?: string[] }

// The data seam: one multi-year ledger. Screens, the outbox and prediction use this; only the Sheets adapter knows about Sheets.
export interface EntryStore {
  list(): Promise<Entry[]>
  lists(): Promise<Reference>
  rates(): Promise<RateRow[]>
  snapshots(): Promise<Snapshot[]>
  /** Rows the app does not understand (spec 3.2): never listed, never written, shown under Needs attention. */
  unreadable(): Promise<Unreadable[]>
  addMany(entries: Entry[]): Promise<AddResult[]>
  /** `repair` fixes or removes a row the app could not read (found by its id, which must occur once). */
  edit(entry: Entry, expectedPrevious?: Entry, opts?: { repair?: boolean }): Promise<{ previous: Entry }>
  delete(id: string, expectedPrevious?: Entry, opts?: { repair?: boolean }): Promise<{ previous: Entry }>
  addSnapshot(s: Snapshot): Promise<AddResult>
  deleteSnapshot(id: string): Promise<{ previous: Snapshot }>
  /** Spec 3.4: freeze the closed month's live Rates cells and append the current month's row. */
  maintainRates(today: string): Promise<void>
  /** Re-reads the book (at most once per refresh interval unless forced); reports expected ids that are gone. */
  refresh(opts?: RefreshOpts): Promise<{ missingIds: string[] }>
  subscribe(fn: () => void): () => void
}
