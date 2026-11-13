import { backfillId } from '../ids'
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
    const unreadable: Unreadable[] = []
    const entryRows: { row: number; entry: Entry }[] = []
    const snapshotItems: { row: number; snapshot: Snapshot }[] = []
    ;(ledger ?? []).forEach((row, i) => {
      const sheetRow = LEDGER.firstRow + i
      const r = parseLedgerRow(row, reference.accounts)
      if ('skip' in r) return
      if ('reason' in r) { unreadable.push({ tab: 'Ledger', row: sheetRow, reason: r.reason, text: r.text }); return }
      entryRows.push({ row: sheetRow, entry: r.value })
    })
    ;(snapshotRows ?? []).forEach((row, i) => {
      const sheetRow = SNAPSHOTS.firstRow + i
      const r = parseSnapshotRow(row, reference.accounts)
      if ('skip' in r) return
      if ('reason' in r) { unreadable.push({ tab: 'Snapshots', row: sheetRow, reason: r.reason, text: r.text }); return }
      snapshotItems.push({ row: sheetRow, snapshot: r.value })
    })

    await backfillIds(entryRows, snapshotItems)

    const entries: Entry[] = []
    const snapshots: Snapshot[] = []
    const rows = new Map<string, RowRef>()
    for (const { row, entry } of entryRows) if (entry.id !== '') { entries.push(entry); rows.set(entry.id, { tab: 'Ledger', row }) }
    for (const { row, snapshot } of snapshotItems) if (snapshot.id !== '') { snapshots.push(snapshot); rows.set(snapshot.id, { tab: 'Snapshots', row }) }
    return { fetchedAt: now(), entries, snapshots, reference, rates: parseRates(rates ?? []), unreadable, rows }
  }

  // Gives hand-typed rows an id (spec 3.2): one write to column A only (consecutive rows as one block), then a read-back
  // of just the written cells so the store adopts the value the sheet holds. An id that did not stick leaves the row
  // without an id (unusable, retried on the next refresh).
  async function backfillIds(entryRows: { row: number; entry: Entry }[], snapshotItems: { row: number; snapshot: Snapshot }[]): Promise<void> {
    const targets = [
      ...entryRows.filter((x) => x.entry.id === '').map((x) => ({ tab: 'Ledger' as const, row: x.row, set: (id: string) => { x.entry.id = id }, id: backfillId('Ledger', x.row, [x.entry.date, x.entry.money.minor, x.entry.account ?? '']) })),
      ...snapshotItems.filter((x) => x.snapshot.id === '').map((x) => ({ tab: 'Snapshots' as const, row: x.row, set: (id: string) => { x.snapshot.id = id }, id: backfillId('Snapshots', x.row, [x.snapshot.date, x.snapshot.balance.minor, x.snapshot.account]) })),
    ]
    if (!targets.length) return
    const blocks: { tab: 'Ledger' | 'Snapshots'; first: number; last: number }[] = []
    for (const t of [...targets].sort((a, b) => (a.tab === b.tab ? a.row - b.row : a.tab.localeCompare(b.tab)))) {
      const open = blocks[blocks.length - 1]
      if (open && open.tab === t.tab && open.last + 1 === t.row) open.last = t.row
      else blocks.push({ tab: t.tab, first: t.row, last: t.row })
    }
    const range = (b: { tab: string; first: number; last: number }) => (b.first === b.last ? `${b.tab}!A${b.first}` : `${b.tab}!A${b.first}:A${b.last}`)
    await api.valuesBatchUpdate(
      spreadsheetId,
      blocks.map((b) => ({ range: range(b), values: targets.filter((t) => t.tab === b.tab && t.row >= b.first && t.row <= b.last).sort((x, y) => x.row - y.row).map((t) => [t.id]) })),
    )
    const back = await api.batchGet(spreadsheetId, blocks.map(range), 'UNFORMATTED_VALUE')
    blocks.forEach((b, i) => {
      for (const t of targets.filter((x) => x.tab === b.tab && x.row >= b.first && x.row <= b.last)) {
        const cell = back[i]?.[t.row - b.first]?.[0]
        t.set(cell === undefined || cell === null ? '' : String(cell).trim())
      }
    })
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
