import type { Entry, Kind } from './rows'
import type { Currency, Lists, RateRow, Reference, Snapshot, Unreadable } from './types'

export type AddResult = { id: string; ok: boolean; reason?: 'AccountChanged' | 'TabFull' }
export type RefreshOpts = { force?: boolean; expectIds?: string[] }

export interface EntryStore {
  list(year: number): Promise<Entry[]>
  lists(year: number): Promise<Lists>
  rates(year: number): Promise<{ base: Currency; rates: Record<Currency, number> }>
  addMany(year: number, entries: Entry[]): Promise<AddResult[]>
  edit(year: number, entry: Entry, expectedPrevious?: Entry): Promise<{ previous: Entry }>
  delete(year: number, kind: Kind, id: string, expectedPrevious?: Entry): Promise<{ previous: Entry }>
  /** Re-reads the year (at most once per interval unless forced); reports expected ids that are gone. */
  refresh(year: number, opts?: RefreshOpts): Promise<{ missingIds: string[] }>
  subscribe(fn: () => void): () => void
}

// The v3 data seam: one multi-year ledger. Task 27 retires EntryStore above and renames this to EntryStore.
export interface LedgerStore {
  list(): Promise<Entry[]>
  lists(): Promise<Reference>
  rates(): Promise<RateRow[]>
  snapshots(): Promise<Snapshot[]>
  /** Rows the app does not understand (spec 3.2): never listed, never written, shown under Needs attention. */
  unreadable(): Promise<Unreadable[]>
  addMany(entries: Entry[]): Promise<AddResult[]>
  edit(entry: Entry, expectedPrevious?: Entry): Promise<{ previous: Entry }>
  delete(id: string, expectedPrevious?: Entry): Promise<{ previous: Entry }>
  addSnapshot(s: Snapshot): Promise<AddResult>
  deleteSnapshot(id: string): Promise<{ previous: Snapshot }>
  /** Spec 3.4: freeze the closed month's live Rates cells and append the current month's row. */
  maintainRates(today: string): Promise<void>
  /** Re-reads the book (at most once per refresh interval unless forced); reports expected ids that are gone. */
  refresh(opts?: RefreshOpts): Promise<{ missingIds: string[] }>
  subscribe(fn: () => void): () => void
}
