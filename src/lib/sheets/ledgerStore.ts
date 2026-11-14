import { backfillId } from '../ids'
import { refreshInterval } from '../refresh'
import { parseRates, parseReference } from '../reference'
import { RowChanged, RowGone, AccountChanged } from '../errors'
import { planRatesMaintenance, type RateCell, type RateCellRow } from '../ratesMaintenance'
import { dateToSerial, ledgerRowValues, serialToDate, parseLedgerRow, parseSnapshotRow, snapshotRowValues, type Entry } from '../rows'
import { LEDGER, RATES, REFERENCE, SNAPSHOTS, rowRange } from '../schema'
import type { AddResult, EntryStore, RefreshOpts } from '../store'
import type { RateRow, Reference, Snapshot, Unreadable } from '../types'
import { parseRange } from './a1'
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
const MAX_ADD_ATTEMPTS = 3
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim()

export function createLedgerStore(api: SheetsApi, spreadsheetId: string, options: StoreOptions = {}): EntryStore & { _internals: Internals } {
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
  // Appends rows with values:append (spec 3.2). Every attempt first reads ALL ids, so a row that is already in the sheet
  // anywhere (a retry after a lost response, a row moved by a sort) is never appended twice; the append is then read
  // back from the response's updatedRange and the rows that did not land are retried (at most three attempts).
  async function appendRows<T extends { id: string }>(
    items: T[],
    spec: { tab: 'Ledger' | 'Snapshots'; ids: string; append: string; values: (t: T) => unknown[]; acceptable: (t: T, accounts: Reference['accounts']) => boolean },
  ): Promise<AddResult[]> {
    await checkVersion()
    const results = new Map<string, AddResult>()
    let pending = items.filter((e, i) => items.findIndex((x) => x.id === e.id) === i)
    for (let attempt = 0; attempt < MAX_ADD_ATTEMPTS && pending.length; attempt++) {
      const [idCells, accountRows] = await api.batchGet(spreadsheetId, [spec.ids, REFERENCE.accounts], 'UNFORMATTED_VALUE')
      const present = new Set((idCells ?? []).map((r) => str(r?.[0])))
      const accounts = parseReference([], accountRows ?? [], [], []).accounts
      pending = pending.filter((e) => {
        if (present.has(e.id)) { results.set(e.id, { id: e.id, ok: true }); return false }
        if (!spec.acceptable(e, accounts)) { results.set(e.id, { id: e.id, ok: false, reason: 'AccountChanged' }); return false }
        return true
      })
      if (!pending.length) break
      const { updatedRange } = await api.valuesAppend(spreadsheetId, spec.append, pending.map(spec.values))
      const landed = parseRange(updatedRange)
      const [back] = await api.batchGet(spreadsheetId, [`${spec.tab}!A${landed.r1}:A${landed.r2}`], 'UNFORMATTED_VALUE')
      pending = pending.filter((e, i) => {
        if (str(back?.[i]?.[0]) !== e.id) return true
        results.set(e.id, { id: e.id, ok: true })
        return false
      })
    }
    markDirty()
    if (pending.length) throw new Error('Could not place all rows; try again')
    return items.map((e) => results.get(e.id)!)
  }

  const accountMatches = (e: Entry, accounts: Reference['accounts']): boolean => {
    const from = accounts.find((a) => a.name === e.account)
    const toKnown = e.kind !== 'transfer' || accounts.some((a) => a.name === e.toAccount && a.name !== e.account)
    return !!from && from.currency === e.money.currency && toKnown
  }

  const addMany = (entries: Entry[]): Promise<AddResult[]> =>
    appendRows(entries, { tab: 'Ledger', ids: LEDGER.ranges.ids, append: LEDGER.ranges.append, values: ledgerRowValues, acceptable: accountMatches })

  async function addSnapshot(s: Snapshot): Promise<AddResult> {
    const [result] = await appendRows([s], {
      tab: 'Snapshots', ids: SNAPSHOTS.ranges.ids, append: SNAPSHOTS.ranges.append, values: snapshotRowValues,
      acceptable: (x, accounts) => accounts.some((a) => a.name === x.account && a.currency === x.balance.currency),
    })
    return result
  }

  // The same entry if at least two of date, amount and place/description agree. Text only counts when both sides have
  // some, so two blank descriptions never vouch for each other.
  const looksSame = (a: Entry, b: Entry) => {
    const text = (e: Entry) => (e.place || e.description || '').trim().toLowerCase()
    let matches = (a.date === b.date ? 1 : 0) + (a.money.minor === b.money.minor && a.money.currency === b.money.currency ? 1 : 0)
    if (text(a) && text(b) && text(a) === text(b)) matches++
    return matches >= 2
  }

  // Finds a Ledger row by id (spec 3.2): read column A, then read just that row with the account list (so the currency
  // can be checked). Never by row number.
  async function locate(id: string, expectedPrevious?: Entry): Promise<{ row: number; previous: Entry; accounts: Reference['accounts'] }> {
    await checkVersion()
    const [idCells] = await api.batchGet(spreadsheetId, [LEDGER.ranges.ids], 'UNFORMATTED_VALUE')
    const at = (idCells ?? []).findIndex((r) => str(r?.[0]) === id)
    if (at < 0) throw new RowGone(id)
    const row = LEDGER.firstRow + at
    const [cells, accountRows] = await api.batchGet(spreadsheetId, [rowRange(LEDGER.tab, row, 'I'), REFERENCE.accounts], 'UNFORMATTED_VALUE')
    const accounts = parseReference([], accountRows ?? [], [], []).accounts
    const parsed = parseLedgerRow(cells?.[0] ?? [], accounts)
    if (!('value' in parsed)) throw new RowChanged(id)
    if (expectedPrevious && !looksSame(parsed.value, expectedPrevious)) throw new RowChanged(id)
    return { row, previous: parsed.value, accounts }
  }

  async function edit(entry: Entry, expectedPrevious?: Entry): Promise<{ previous: Entry }> {
    const { row, previous, accounts } = await locate(entry.id, expectedPrevious)
    if (!accountMatches(entry, accounts)) throw new AccountChanged(entry.id)
    await api.valuesBatchUpdate(spreadsheetId, [{ range: rowRange(LEDGER.tab, row, 'I'), values: [ledgerRowValues(entry)] }])
    markDirty()
    return { previous }
  }

  async function remove(id: string, expectedPrevious?: Entry): Promise<{ previous: Entry }> {
    const { row, previous } = await locate(id, expectedPrevious)
    await api.valuesBatchClear(spreadsheetId, [rowRange(LEDGER.tab, row, 'I')])
    markDirty()
    return { previous }
  }

  async function deleteSnapshot(id: string): Promise<{ previous: Snapshot }> {
    await checkVersion()
    const [idCells] = await api.batchGet(spreadsheetId, [SNAPSHOTS.ranges.ids], 'UNFORMATTED_VALUE')
    const at = (idCells ?? []).findIndex((r) => str(r?.[0]) === id)
    if (at < 0) throw new RowGone(id)
    const row = SNAPSHOTS.firstRow + at
    const [cells, accountRows] = await api.batchGet(spreadsheetId, [rowRange(SNAPSHOTS.tab, row, 'E'), REFERENCE.accounts], 'UNFORMATTED_VALUE')
    const parsed = parseSnapshotRow(cells?.[0] ?? [], parseReference([], accountRows ?? [], [], []).accounts)
    if (!('value' in parsed)) throw new RowChanged(id)
    await api.valuesBatchClear(spreadsheetId, [rowRange(SNAPSHOTS.tab, row, 'E')])
    markDirty()
    return { previous: parsed.value }
  }

  // Month-roll (spec 3.4): freeze the closed month's live rate cells as values and append the new month's live row.
  // Skipped for a non-EUR base; runs at most once per month per store; the months are re-read just before writing so a
  // second device that got there first is not duplicated.
  let ratesHandled: string | null = null
  async function maintainRates(today: string): Promise<void> {
    const month = today.slice(0, 7)
    if (ratesHandled === month) return
    await checkVersion()
    const data = await load()
    if (data.reference.base !== 'EUR') { ratesHandled = month; return }
    if (data.rates.some((r) => r.month === month + '-01')) { ratesHandled = month; return }
    const [formulas, values] = await Promise.all([
      api.batchGet(spreadsheetId, [RATES.ranges.rows], 'FORMULA'),
      api.batchGet(spreadsheetId, [RATES.ranges.rows], 'UNFORMATTED_VALUE'),
    ])
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const cellAt = (f: unknown, v: unknown): RateCell => ({ value: num(v), formula: typeof f === 'string' && f.startsWith('=') ? f : null })
    const rows: RateCellRow[] = []
    ;(formulas[0] ?? []).forEach((fr, i) => {
      const vr = values[0]?.[i] ?? []
      const serial = num(vr[0])
      if (serial === null) return
      rows.push({ row: RATES.firstRow + i, month: serialToDate(serial), GBP: cellAt(fr?.[1], vr[1]), USD: cellAt(fr?.[2], vr[2]) })
    })
    const plan = planRatesMaintenance(rows, today, data.reference.base)
    const writes: { range: string; values: unknown[][] }[] = []
    if (plan.freeze) {
      const f = plan.freeze
      if (f.values.GBP !== undefined) writes.push({ range: `Rates!B${f.row}`, values: [[f.values.GBP]] })
      if (f.values.USD !== undefined) writes.push({ range: `Rates!C${f.row}`, values: [[f.values.USD]] })
    }
    if (plan.append) {
      const [current] = await api.batchGet(spreadsheetId, [RATES.ranges.months], 'UNFORMATTED_VALUE')
      const exists = (current ?? []).some((r) => typeof r?.[0] === 'number' && serialToDate(r[0]) === plan.append!.month)
      if (!exists) {
        const a = plan.append
        writes.push({ range: `Rates!A${a.row}:C${a.row}`, values: [[dateToSerial(a.month), a.formulas.GBP, a.formulas.USD]] })
      }
    }
    if (writes.length) { await api.valuesBatchUpdate(spreadsheetId, writes, 'USER_ENTERED'); markDirty() }
    ratesHandled = month
  }

  const markDirty = () => {
    stale = true
    notify()
  }

  const store: EntryStore = {
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
    addMany,
    edit,
    delete: remove,
    addSnapshot,
    deleteSnapshot,
    maintainRates,
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
