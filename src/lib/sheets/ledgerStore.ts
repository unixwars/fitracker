import { refreshInterval } from '../refresh'
import { parseRates, parseReference } from '../reference'
import { parseLedgerRow, parseSnapshotRow, type Entry } from '../rows'
import { LEDGER, RATES, REFERENCE, SNAPSHOTS } from '../schema'
import type { LedgerStore, RefreshOpts } from '../store'
import type { RateRow, Reference, Snapshot, Unreadable } from '../types'
import type { SheetsApi } from './types'
import { ensureVersion } from './version'

export type StoreOptions = { now?: () => number; newId?: () => string; ttlMs?: number }

type RowRef = { tab: 'Ledger' | 'Snapshots'; row: number }
type Data = {
  fetchedAt: number
  entries: Entry[]
  snapshots: Snapshot[]
  reference: Reference
  rates: RateRow[]
  unreadable: Unreadable[]
  rows: Map<string, RowRef> // id -> where it sits (Ledger or Snapshots)
  idless: RowRef[] // parseable rows without an id yet (Task 10 backfills them)
}

const VERSION_RECHECK_MS = 5 * 60_000
const notYet = (): never => { throw new Error('not implemented') }

export function createLedgerStore(api: SheetsApi, spreadsheetId: string, options: StoreOptions = {}): LedgerStore & { _internals: Internals } {
  const now = options.now ?? Date.now
  const newId = options.newId ?? (() => crypto.randomUUID())
  let cache: Data | null = null
  let stale = false
  let inflight: Promise<Data> | null = null
  let verifiedAt: number | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((fn) => fn())

  async function checkVersion(): Promise<void> {
    if (verifiedAt !== null && now() - verifiedAt < VERSION_RECHECK_MS) return
    await ensureVersion(api, spreadsheetId)
    verifiedAt = now()
  }

  async function fetchBook(): Promise<Data> {
    await checkVersion()
    const [ledger, base, accounts, categories, budgets, rates, snapshotRows] = await api.batchGet(
      spreadsheetId,
      [LEDGER.ranges.rows, REFERENCE.base, REFERENCE.accounts, REFERENCE.categories, REFERENCE.budgets, RATES.ranges.rows, SNAPSHOTS.ranges.rows],
      'UNFORMATTED_VALUE',
    )
    const reference = parseReference(base ?? [], accounts ?? [], categories ?? [], budgets ?? [])
    const entries: Entry[] = []
    const snapshots: Snapshot[] = []
    const unreadable: Unreadable[] = []
    const rows = new Map<string, RowRef>()
    const idless: RowRef[] = []
    ;(ledger ?? []).forEach((row, i) => {
      const sheetRow = LEDGER.firstRow + i
      const r = parseLedgerRow(row, reference.accounts)
      if ('skip' in r) return
      if ('reason' in r) { unreadable.push({ tab: 'Ledger', row: sheetRow, reason: r.reason, text: r.text }); return }
      if (r.value.id === '') { idless.push({ tab: 'Ledger', row: sheetRow }); return }
      entries.push(r.value)
      rows.set(r.value.id, { tab: 'Ledger', row: sheetRow })
    })
    ;(snapshotRows ?? []).forEach((row, i) => {
      const sheetRow = SNAPSHOTS.firstRow + i
      const r = parseSnapshotRow(row, reference.accounts)
      if ('skip' in r) return
      if ('reason' in r) { unreadable.push({ tab: 'Snapshots', row: sheetRow, reason: r.reason, text: r.text }); return }
      if (r.value.id === '') { idless.push({ tab: 'Snapshots', row: sheetRow }); return }
      snapshots.push(r.value)
      rows.set(r.value.id, { tab: 'Snapshots', row: sheetRow })
    })
    return { fetchedAt: now(), entries, snapshots, reference, rates: parseRates(rates ?? []), unreadable, rows, idless }
  }

  async function load(force = false): Promise<Data> {
    if (cache && !force && !stale && now() - cache.fetchedAt < (options.ttlMs ?? refreshInterval(cache.entries.length))) return cache
    if (!inflight) inflight = fetchBook().finally(() => { inflight = null })
    const data = await inflight
    cache = data
    stale = false
    notify()
    return data
  }
  const markDirty = () => {
    stale = true
    notify()
  }

  const store: LedgerStore = {
    async list() { return (await load()).entries },
    async lists() { return (await load()).reference },
    async rates() { return (await load()).rates },
    async snapshots() { return (await load()).snapshots },
    async unreadable() { return (await load()).unreadable },
    async refresh(opts: RefreshOpts = {}) {
      const data = await load(opts.force)
      return { missingIds: (opts.expectIds ?? []).filter((id) => !data.rows.has(id)) }
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    addMany: async () => notYet(),
    edit: async () => notYet(),
    delete: async () => notYet(),
    addSnapshot: async () => notYet(),
    deleteSnapshot: async () => notYet(),
    maintainRates: async () => notYet(),
  }
  return Object.assign(store, { _internals: { api, spreadsheetId, load, markDirty, checkVersion, newId, now } as Internals })
}

export type Internals = {
  api: SheetsApi
  spreadsheetId: string
  load: (force?: boolean) => Promise<Data>
  markDirty: () => void
  checkVersion: () => Promise<void>
  newId: () => string
  now: () => number
}
