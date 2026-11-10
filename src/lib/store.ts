import type { Entry, Kind } from './rows'
import type { Currency, Lists } from './types'

export type AddResult = { id: string; ok: boolean; reason?: 'TabFull' }
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
