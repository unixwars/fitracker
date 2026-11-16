import { backfillId } from '../ids'
import { isSettingKey, OVERRIDE_PREFIX } from '../overrides'
import { refreshInterval } from '../refresh'
import { parseRates, parseReference } from '../reference'
import { AccountChanged, ApiError, AuthExpired, ReferenceLayoutMismatch, RowChanged, RowGone, UnrecognisedLayout } from '../errors'
import { planRatesMaintenance, type RateCell, type RateCellRow } from '../ratesMaintenance'
import { dateToSerial, ledgerRowValues, serialToDate, parseLedgerRow, parseSnapshotRow, snapshotRowValues, type Entry } from '../rows'
import { normaliseName, validateNewAccount, validateNewCategory, type NameProblem } from '../newItem'
import { ACCOUNTS, CATEGORIES, LEDGER, RATES, REFERENCE, SNAPSHOTS, rowRange } from '../schema'
import type { AddItemResult, AddResult, AddedItem, EntryStore, RefreshOpts, UndoItemResult } from '../store'
import type { Currency, EntryType, RateRow, Reference, Snapshot, Unreadable } from '../types'
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
  overrides: Record<string, string> | null // shared settings: the fitracker.* developer metadata, raw; null when it could not be read
  rows: Map<string, RowRef> // id -> where it sits (Ledger or Snapshots)
  unreadableIds: Set<string> // ids on rows that exist but do not parse: present, not missing
}

const VERSION_RECHECK_MS = 5 * 60_000
const MAX_ADD_ATTEMPTS = 3
// One cell of every other tab, added to the read before a write: a renamed or removed tab is a 400 there, so an
// unrecognised layout aborts before any write (spec 4) at no extra request.
const TAB_GUARD = [LEDGER.ranges.header, SNAPSHOTS.ranges.header, REFERENCE.base, RATES.ranges.months] as const
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v)).trim()

export function createLedgerStore(api: SheetsApi, spreadsheetId: string, options: StoreOptions = {}): EntryStore & { _internals: Internals } {
  const now = options.now ?? Date.now
  const newId = options.newId ?? (() => crypto.randomUUID())
  let cache: Data | null = null
  let stale = false
  let inflight: Promise<Data> | null = null
  let writeCount = 0 // shared-setting writes so far, to tell a refresh that started before a write
  const written = new Map<string, { value: string; n: number }>()
  let verifiedAt: number | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((fn) => fn())

  async function checkVersion(): Promise<void> {
    if (verifiedAt !== null && now() - verifiedAt < VERSION_RECHECK_MS) return
    await ensureVersion(api, spreadsheetId)
    verifiedAt = now()
  }

  // A 400 on a tagged book means a tab was renamed or removed: that is an unrecognised layout, so writes stop (spec 4).
  async function read(ranges: string[], render: 'UNFORMATTED_VALUE' | 'FORMULA' = 'UNFORMATTED_VALUE'): Promise<unknown[][][]> {
    try {
      return await api.batchGet(spreadsheetId, ranges, render)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) throw new UnrecognisedLayout('A tab of the ledger is missing or renamed')
      throw err
    }
  }

  // A refresh that started before a setting was written may have read the old value: put the later writes back on top.
  function withLaterWrites(read: Record<string, string> | null, startedAt: number): Record<string, string> | null {
    const later = [...written].filter(([, w]) => w.n > startedAt)
    if (!later.length) return read
    const out = { ...(read ?? {}) }
    for (const [k, w] of later) out[k] = w.value
    return out
  }

  // Shared settings are best effort: a failure keeps the ones already known, but an expired sign-in still stops the refresh.
  async function readOverrides(): Promise<Record<string, string> | null> {
    try {
      return await api.listMetadata(spreadsheetId, OVERRIDE_PREFIX)
    } catch (err) {
      if (err instanceof AuthExpired) throw err
      return cache?.overrides ?? null
    }
  }

  async function fetchBook(): Promise<Data> {
    const startedAt = writeCount
    await checkVersion()
    const [[ledger, base, accounts, categories, budgets, rates, snapshotRows], overrides] = await Promise.all([
      read([LEDGER.ranges.rows, REFERENCE.base, REFERENCE.accounts, REFERENCE.categories, REFERENCE.budgets, RATES.ranges.rows, SNAPSHOTS.ranges.rows]),
      readOverrides(),
    ])
    const reference = parseReference(base ?? [], accounts ?? [], categories ?? [], budgets ?? [])
    const unreadable: Unreadable[] = []
    const unreadableIds = new Set<string>()
    const entryRows: { row: number; entry: Entry; raw: unknown[] }[] = []
    const snapshotItems: { row: number; snapshot: Snapshot }[] = []
    ;(ledger ?? []).forEach((row, i) => {
      const sheetRow = LEDGER.firstRow + i
      const r = parseLedgerRow(row, reference.accounts)
      if ('skip' in r) return
      if ('reason' in r) { unreadable.push({ tab: 'Ledger', row: sheetRow, reason: r.reason, text: r.text, id: str(row?.[0]) || undefined, raw: row }); if (str(row?.[0])) unreadableIds.add(str(row[0])); return }
      entryRows.push({ row: sheetRow, entry: r.value, raw: row })
    })
    ;(snapshotRows ?? []).forEach((row, i) => {
      const sheetRow = SNAPSHOTS.firstRow + i
      const r = parseSnapshotRow(row, reference.accounts)
      if ('skip' in r) return
      if ('reason' in r) { unreadable.push({ tab: 'Snapshots', row: sheetRow, reason: r.reason, text: r.text }); if (str(row?.[0])) unreadableIds.add(str(row[0])); return }
      snapshotItems.push({ row: sheetRow, snapshot: r.value })
    })

    await backfillIds(entryRows, snapshotItems)

    const entries: Entry[] = []
    const snapshots: Snapshot[] = []
    const rows = new Map<string, RowRef>()
    // An id belongs to one row. A row copied in Sheets brings its id along: the first row keeps it, every later row
    // is reported as unreadable (the person fixes it in the sheet) and is never listed or edited.
    const seen = new Set<string>()
    const claim = (id: string): boolean => (id === '' ? true : seen.has(id) ? false : (seen.add(id), true))
    for (const { row, entry, raw } of entryRows) {
      if (!claim(entry.id)) { unreadable.push({ tab: 'Ledger', row, reason: 'duplicateId', text: entry.description, raw }); continue }
      if (entry.id !== '') { entries.push(entry); rows.set(entry.id, { tab: 'Ledger', row }) }
    }
    for (const { row, snapshot } of snapshotItems) {
      if (!claim(snapshot.id)) { unreadable.push({ tab: 'Snapshots', row, reason: 'duplicateId', text: snapshot.note }); continue }
      if (snapshot.id !== '') { snapshots.push(snapshot); rows.set(snapshot.id, { tab: 'Snapshots', row }) }
    }
    // Only an id that occurs once can be used to fix a row by its id.
    const idCount = new Map<string, number>()
    for (const id of rows.keys()) idCount.set(id, 1)
    for (const u of unreadable) if (u.id) idCount.set(u.id, (idCount.get(u.id) ?? 0) + 1)
    for (const u of unreadable) if (u.id && idCount.get(u.id) !== 1) delete u.id
    return { fetchedAt: now(), entries, snapshots, reference, rates: parseRates(rates ?? []), unreadable, overrides: withLaterWrites(overrides, startedAt), rows, unreadableIds }
  }

  // Gives hand-typed rows an id (spec 3.2): one write to column A only (consecutive rows as one block), then a read-back
  // of just the written cells so the store adopts the value the sheet holds. An id that did not stick leaves the row
  // without an id (unusable, retried on the next refresh).
  async function backfillIds(entryRows: { row: number; entry: Entry; raw?: unknown[] }[], snapshotItems: { row: number; snapshot: Snapshot }[]): Promise<void> {
    const targets = [
      ...entryRows.filter((x) => x.entry.id === '').map((x) => ({ tab: 'Ledger' as const, row: x.row, set: (id: string) => { x.entry.id = id }, same: (c: unknown[]) => { const v = ledgerRowValues(x.entry); return c[1] === v[1] && c[3] === v[3] && c[7] === v[7] }, id: backfillId('Ledger', x.row, [x.entry.date, x.entry.money.minor, x.entry.account ?? '']) })),
      ...snapshotItems.filter((x) => x.snapshot.id === '').map((x) => ({ tab: 'Snapshots' as const, row: x.row, set: (id: string) => { x.snapshot.id = id }, same: (c: unknown[]) => { const v = snapshotRowValues(x.snapshot); return c[1] === v[1] && c[2] === v[2] && c[3] === v[3] }, id: backfillId('Snapshots', x.row, [x.snapshot.date, x.snapshot.balance.minor, x.snapshot.account]) })),
    ]
    if (!targets.length) return
    const blocks: { tab: 'Ledger' | 'Snapshots'; first: number; last: number }[] = []
    for (const t of [...targets].sort((a, b) => (a.tab === b.tab ? a.row - b.row : a.tab.localeCompare(b.tab)))) {
      const open = blocks[blocks.length - 1]
      if (open && open.tab === t.tab && open.last + 1 === t.row) open.last = t.row
      else blocks.push({ tab: t.tab, first: t.row, last: t.row })
    }
    const range = (b: { tab: string; first: number; last: number }) => (b.first === b.last ? `${b.tab}!A${b.first}` : `${b.tab}!A${b.first}:A${b.last}`)
    const whole = (b: { tab: string; first: number; last: number }) => `${b.tab}!A${b.first}:${b.tab === 'Ledger' ? 'I' : 'E'}${b.last}`
    await api.valuesBatchUpdate(
      spreadsheetId,
      blocks.map((b) => ({ range: range(b), values: targets.filter((t) => t.tab === b.tab && t.row >= b.first && t.row <= b.last).sort((x, y) => x.row - y.row).map((t) => [t.id]) })),
    )
    // Read the whole rows back: an id is adopted only if the row still holds the entry it was written for (a sort in
    // Sheets between the read and the write puts someone else there).
    const back = await read(blocks.map(whole), 'UNFORMATTED_VALUE')
    blocks.forEach((b, i) => {
      for (const t of targets.filter((x) => x.tab === b.tab && x.row >= b.first && x.row <= b.last)) {
        const cells = back[i]?.[t.row - b.first] ?? []
        const cell = cells[0]
        t.set(cell === undefined || cell === null || !t.same(cells) ? '' : String(cell).trim())
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
  // Adds rows below the last used row (spec 3.2, as amended by the live check: no values:append). Every attempt first reads ALL ids, so a row that is already in the sheet
  // anywhere (a retry after a lost response, a row moved by a sort) is never appended twice; the append is then read
  // back from the response's updatedRange and the rows that did not land are retried (at most three attempts).
  async function appendRows<T extends { id: string }>(
    items: T[],
    spec: { tab: 'Ledger' | 'Snapshots'; firstRow: number; ids: string; probe: string[]; lastCol: 'I' | 'E'; values: (t: T) => unknown[]; acceptable: (t: T, accounts: Reference['accounts']) => boolean },
  ): Promise<AddResult[]> {
    await checkVersion()
    const results = new Map<string, AddResult>()
    let pending = items.filter((e, i) => items.findIndex((x) => x.id === e.id) === i)
    for (let attempt = 0; attempt < MAX_ADD_ATTEMPTS && pending.length; attempt++) {
      const [idCells, accountRows, , , , , ...probes] = await read([spec.ids, REFERENCE.accounts, ...TAB_GUARD, ...spec.probe])
      const present = new Set((idCells ?? []).map((r) => str(r?.[0])))
      const accounts = parseReference([], accountRows ?? [], [], []).accounts
      pending = pending.filter((e) => {
        if (present.has(e.id)) { results.set(e.id, { id: e.id, ok: true }); return false }
        if (!spec.acceptable(e, accounts)) { results.set(e.id, { id: e.id, ok: false, reason: 'AccountChanged' }); return false }
        return true
      })
      if (!pending.length) break
      // Rows are written to an explicit free row, never with values:append: on the real template an append lands one
      // column to the right and over the J formula (live check). The free row is below the last row that holds
      // anything in A, B, D or the description, so a hand-typed row without an id is never overwritten.
      const used = Math.max((idCells ?? []).length, ...probes.map((p) => (p ?? []).length))
      const first = spec.firstRow + used
      const range = `${spec.tab}!A${first}:${spec.lastCol}${first + pending.length - 1}`
      const values = pending.map(spec.values)
      try {
        await api.valuesBatchUpdate(spreadsheetId, [{ range, values }])
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 400 && /grid limits/i.test(err.message))) throw err
        await api.growTab(spreadsheetId, spec.tab, first + pending.length + 500) // the tab is full: add rows, once
        await api.valuesBatchUpdate(spreadsheetId, [{ range, values }])
      }
      const landed = { r1: first, r2: first + pending.length - 1 }
      const [back] = await read([`${spec.tab}!A${landed.r1}:A${landed.r2}`], 'UNFORMATTED_VALUE')
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

  // Adds one row to a reference tab (Accounts or Categories). Rules, in order: the headers must be the layout (a person may
  // have inserted a column), the name must pass the checks against what the sheet holds right now, then the row goes to the
  // first free row (the last row holding anything in A or B, plus one; Accounts reuses an empty row inside its fixed 41 rows
  // and is never grown), is read back, and if another device wrote a different name to that row, the next row is tried.
  async function addReferenceItem(spec: {
    kind: 'account' | 'category'
    tab: string
    firstRow: number
    lastRow?: number // a tab with a fixed size is never grown
    lastCol: string
    headerRange: string
    rowsRange: string
    headers: readonly string[]
    name: string
    cells: unknown[]
    check: (rows: unknown[][]) => NameProblem | null
  }): Promise<AddItemResult> {
    await checkVersion()
    // The rows are read as FORMULA, so a cell that holds a formula (even one that shows nothing) is never mistaken for a free
    // one and overwritten (AGENTS.md: never overwrite a formula cell).
    const isFormula = (v: unknown) => typeof v === 'string' && v.trim().startsWith('=')
    const filled = (r: unknown[] | undefined) => str(r?.[0]) !== '' || str(r?.[1]) !== ''
    const free = (r: unknown[] | undefined) => !filled(r) && !(r ?? []).some(isFormula)
    for (let attempt = 0; attempt < MAX_ADD_ATTEMPTS; attempt++) {
      const [header, rows] = await read([spec.headerRange, spec.rowsRange, ...TAB_GUARD], 'FORMULA')
      const h = header?.[0] ?? []
      // The order and number of columns must be the layout; the spelling may differ in case, spaces and underscores (a converted
      // sheet has in_monthly where the template has In Monthly).
      const key = (x: unknown) => str(x).toLowerCase().replace(/[\s_]+/g, '')
      if (h.length !== spec.headers.length || !spec.headers.every((x, i) => key(h[i]) === key(x))) {
        throw new ReferenceLayoutMismatch(spec.tab, h.map((x) => str(x)), spec.headers)
      }
      const list = rows ?? []
      const problem = spec.check(list)
      if (problem) return { ok: false, reason: problem }
      let used = 0
      list.forEach((r, i) => { if (filled(r)) used = i + 1 })
      let first = spec.firstRow + used
      while (!free(list[first - spec.firstRow]) && (spec.lastRow === undefined || first <= spec.lastRow)) first++ // skip a row with a formula
      if (spec.lastRow !== undefined && first > spec.lastRow) {
        const gap = Array.from({ length: spec.lastRow - spec.firstRow + 1 }, (_, i) => i).find((i) => free(list[i]))
        if (gap === undefined) return { ok: false, reason: 'full' }
        first = spec.firstRow + gap
      }
      const range = `${spec.tab}!A${first}:${spec.lastCol}${first}`
      try {
        await api.valuesBatchUpdate(spreadsheetId, [{ range, values: [spec.cells] }])
      } catch (err) {
        if (err instanceof AuthExpired) throw err
        if (spec.lastRow === undefined && err instanceof ApiError && err.status === 400 && /grid limits/i.test(err.message)) {
          await api.growTab(spreadsheetId, spec.tab, first + 100) // Categories is not fixed in size: add rows, once
          await api.valuesBatchUpdate(spreadsheetId, [{ range, values: [spec.cells] }])
        } else {
          // A lost response does not mean a lost write: if the row now holds exactly what was written, it landed.
          const [now] = await read([range]).catch(() => [undefined])
          const row = now?.[0] ?? []
          if (row.length === spec.cells.length && spec.cells.every((c, i) => row[i] === c)) { markDirty(); return { ok: true, added: { kind: spec.kind, row: first, cells: spec.cells, name: spec.name } } }
          throw err
        }
      }
      const [back] = await read([range])
      if (normaliseName(str(back?.[0]?.[0])) === spec.name) {
        markDirty()
        return { ok: true, added: { kind: spec.kind, row: first, cells: spec.cells, name: spec.name } }
      }
      // another device wrote a different name to this row at the same moment: read again and take the next free row
    }
    return { ok: false, reason: 'tryAgain' }
  }

  async function addAccount(a: { name: string; currency: Currency }): Promise<AddItemResult> {
    const name = normaliseName(a.name)
    return addReferenceItem({
      kind: 'account', tab: ACCOUNTS.tab, firstRow: ACCOUNTS.firstRow, lastRow: ACCOUNTS.lastRow, lastCol: ACCOUNTS.lastCol,
      headerRange: ACCOUNTS.ranges.header, rowsRange: ACCOUNTS.ranges.rows, headers: ACCOUNTS.headers, name,
      cells: [name, a.currency, true, true, true],
      check: (rows) => validateNewAccount(name, rows.map((r) => r?.[0])),
    })
  }

  async function addCategory(c: { name: string; type: EntryType }): Promise<AddItemResult> {
    const name = normaliseName(c.name)
    return addReferenceItem({
      kind: 'category', tab: CATEGORIES.tab, firstRow: CATEGORIES.firstRow, lastCol: CATEGORIES.lastCol,
      headerRange: CATEGORIES.ranges.header, rowsRange: CATEGORIES.ranges.rows, headers: CATEGORIES.headers, name,
      cells: [name, c.type, true],
      check: (rows) => validateNewCategory(name, c.type, rows),
    })
  }

  // Session-only Undo of an add: clears the row (never deletes it), but only while it still holds exactly what was written and
  // no entry or snapshot uses the name.
  async function undoAddItem(added: AddedItem): Promise<UndoItemResult> {
    await checkVersion()
    const tab = added.kind === 'account' ? ACCOUNTS : CATEGORIES
    const range = `${tab.tab}!A${added.row}:${tab.lastCol}${added.row}`
    // Ledger C:I is [type, amount, place, description, category, account, to_account].
    const [current, ledger, snapshots, budgets] = await read([range, LEDGER.ranges.typesToAccounts, SNAPSHOTS.ranges.accounts, REFERENCE.budgets, ...TAB_GUARD])
    const row = current?.[0] ?? []
    if (row.length !== added.cells.length || !added.cells.every((c, i) => row[i] === c)) return { ok: false, reason: 'changed' }
    const sameName = (v: unknown) => normaliseName(str(v)).toLowerCase() === added.name.toLowerCase()
    const type = str(added.cells[1]).toLowerCase() // a category's type; the ledger and the budgets name it per type
    const used = added.kind === 'account'
      ? (ledger ?? []).some((r) => sameName(r?.[5]) || sameName(r?.[6])) || (snapshots ?? []).some((r) => sameName(r?.[0]))
      : (ledger ?? []).some((r) => str(r?.[0]).toLowerCase() === type && sameName(r?.[4])) || (budgets ?? []).some((r) => str(r?.[1]).toLowerCase() === type && sameName(r?.[2]))
    if (used) return { ok: false, reason: 'inUse' }
    await api.valuesBatchClear(spreadsheetId, [range])
    markDirty()
    return { ok: true }
  }

  const accountMatches = (e: Entry, accounts: Reference['accounts']): boolean => {
    const from = accounts.find((a) => a.name === e.account)
    const toKnown = e.kind !== 'transfer' || accounts.some((a) => a.name === e.toAccount && a.name !== e.account)
    return !!from && from.currency === e.money.currency && toKnown
  }

  const addMany = (entries: Entry[]): Promise<AddResult[]> =>
    appendRows(entries, { tab: 'Ledger', firstRow: LEDGER.firstRow, ids: LEDGER.ranges.ids, probe: ['Ledger!B2:B', 'Ledger!D2:D', 'Ledger!F2:F'], lastCol: 'I', values: ledgerRowValues, acceptable: accountMatches })

  async function addSnapshot(s: Snapshot): Promise<AddResult> {
    const [result] = await appendRows([s], {
      tab: 'Snapshots', firstRow: SNAPSHOTS.firstRow, ids: SNAPSHOTS.ranges.ids, probe: ['Snapshots!B2:B', 'Snapshots!D2:D', 'Snapshots!E2:E'], lastCol: 'E', values: snapshotRowValues,
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
  async function locate(id: string, expectedPrevious?: Entry, repair = false): Promise<{ row: number; previous: Entry | null; accounts: Reference['accounts'] }> {
    await checkVersion()
    const [idCells] = await read([LEDGER.ranges.ids, ...TAB_GUARD])
    const at = (idCells ?? []).findIndex((r) => str(r?.[0]) === id)
    if (at < 0) throw new RowGone(id)
    if ((idCells ?? []).filter((r) => str(r?.[0]) === id).length > 1) throw new RowChanged(id) // a copied row: ambiguous
    const row = LEDGER.firstRow + at
    const [cells, accountRows] = await read([rowRange(LEDGER.tab, row, 'I'), REFERENCE.accounts])
    if (str(cells?.[0]?.[0]) !== id) throw new RowChanged(id) // the rows moved between the two reads
    const accounts = parseReference([], accountRows ?? [], [], []).accounts
    const parsed = parseLedgerRow(cells?.[0] ?? [], accounts)
    if (repair) return { row, previous: 'value' in parsed ? parsed.value : null, accounts } // fixing a row that cannot be read
    if (!('value' in parsed)) throw new RowChanged(id)
    if (expectedPrevious && !looksSame(parsed.value, expectedPrevious)) throw new RowChanged(id)
    return { row, previous: parsed.value, accounts }
  }

  async function edit(entry: Entry, expectedPrevious?: Entry, opts: { repair?: boolean } = {}): Promise<{ previous: Entry }> {
    const { row, previous, accounts } = await locate(entry.id, expectedPrevious, opts.repair)
    if (!accountMatches(entry, accounts)) throw new AccountChanged(entry.id)
    await api.valuesBatchUpdate(spreadsheetId, [{ range: rowRange(LEDGER.tab, row, 'I'), values: [ledgerRowValues(entry)] }])
    markDirty()
    return { previous: previous ?? entry }
  }

  async function remove(id: string, expectedPrevious?: Entry, opts: { repair?: boolean } = {}): Promise<{ previous: Entry }> {
    const { row, previous } = await locate(id, expectedPrevious, opts.repair)
    const gone = previous ?? expectedPrevious
    if (!gone) throw new RowChanged(id)
    await api.valuesBatchClear(spreadsheetId, [rowRange(LEDGER.tab, row, 'I')])
    markDirty()
    return { previous: gone }
  }

  // Cells with trailing blanks removed, so a row compares equal to what the earlier read returned for it.
  const trimmed = (cells: unknown[]): string => {
    const out = [...cells]
    while (out.length && (out[out.length - 1] === '' || out[out.length - 1] === undefined || out[out.length - 1] === null)) out.pop()
    return JSON.stringify(out)
  }

  // A row with no usable id can only be found by its number, which shifts (a sort, an insert). So it is re-read right
  // before the write and must still hold exactly what the person was shown; the window left is one request.
  async function rowStillHolds(row: number, expectedRaw: unknown[]): Promise<{ accounts: Reference['accounts']; ids: string[] }> {
    await checkVersion()
    const [cells, accountRows, idCells] = await read([rowRange(LEDGER.tab, row, 'I'), REFERENCE.accounts, LEDGER.ranges.ids, ...TAB_GUARD])
    if (trimmed(cells?.[0] ?? []) !== trimmed(expectedRaw)) throw new RowChanged(`row ${row}`)
    return { accounts: parseReference([], accountRows ?? [], [], []).accounts, ids: (idCells ?? []).map((r) => str(r?.[0])) }
  }

  async function repairRowAt(row: number, expectedRaw: unknown[], entry: Entry): Promise<void> {
    const { accounts, ids } = await rowStillHolds(row, expectedRaw)
    if (entry.id === '' || ids.includes(entry.id)) throw new RowChanged(entry.id) // the new id must be new
    if (!accountMatches(entry, accounts)) throw new AccountChanged(entry.id)
    await api.valuesBatchUpdate(spreadsheetId, [{ range: rowRange(LEDGER.tab, row, 'I'), values: [ledgerRowValues(entry)] }])
    markDirty()
  }

  async function clearRowAt(row: number, expectedRaw: unknown[]): Promise<void> {
    await rowStillHolds(row, expectedRaw)
    await api.valuesBatchClear(spreadsheetId, [rowRange(LEDGER.tab, row, 'I')])
    markDirty()
  }

  async function deleteSnapshot(id: string): Promise<{ previous: Snapshot }> {
    await checkVersion()
    const [idCells] = await read([SNAPSHOTS.ranges.ids, ...TAB_GUARD])
    const at = (idCells ?? []).findIndex((r) => str(r?.[0]) === id)
    if (at < 0) throw new RowGone(id)
    if ((idCells ?? []).filter((r) => str(r?.[0]) === id).length > 1) throw new RowChanged(id)
    const row = SNAPSHOTS.firstRow + at
    const [cells, accountRows] = await read([rowRange(SNAPSHOTS.tab, row, 'E'), REFERENCE.accounts])
    if (str(cells?.[0]?.[0]) !== id) throw new RowChanged(id)
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
      read([RATES.ranges.rows], 'FORMULA'),
      read([RATES.ranges.rows], 'UNFORMATTED_VALUE'),
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
    const lastUsedRow = RATES.firstRow + (formulas[0] ?? []).length - 1 // text or notes below the months count as used
    const plan = planRatesMaintenance(rows, today, data.reference.base, lastUsedRow)
    // Re-read right before writing: freeze only cells that are still formulas (a person may have typed the monthly
    // average since), append only if the month is still missing, and after the last non-empty row as it is now.
    const [fresh] = plan.freeze || plan.append ? await read([RATES.ranges.rows], 'FORMULA') : [[]]
    const stillFormula = (row: number, col: number) => typeof fresh[row - RATES.firstRow]?.[col] === 'string' && String(fresh[row - RATES.firstRow][col]).startsWith('=')
    const writes: { range: string; values: unknown[][] }[] = []
    if (plan.freeze) {
      const f = plan.freeze
      if (f.values.GBP !== undefined && stillFormula(f.row, 1)) writes.push({ range: `Rates!B${f.row}`, values: [[f.values.GBP]] })
      if (f.values.USD !== undefined && stillFormula(f.row, 2)) writes.push({ range: `Rates!C${f.row}`, values: [[f.values.USD]] })
    }
    if (plan.append) {
      const a = plan.append
      const exists = fresh.some((r) => typeof r?.[0] === 'number' && serialToDate(r[0]) === a.month)
      if (!exists) {
        const row = RATES.firstRow + fresh.length
        writes.push({ range: `Rates!A${row}:C${row}`, values: [[dateToSerial(a.month), a.formulas.GBP, a.formulas.USD]] })
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
    async overrides() { return (await load()).overrides },
    async setOverride(key, value) {
      if (!isSettingKey(key)) throw new Error('Not a shared setting key')
      await api.setMetadata(spreadsheetId, key, value)
      written.set(key, { value, n: ++writeCount })
      if (cache) cache = { ...cache, overrides: { ...(cache.overrides ?? {}), [key]: value } }
      notify()
    },
    async refresh(opts: RefreshOpts = {}) {
      const data = await load(opts.force)
      return { missingIds: (opts.expectIds ?? []).filter((id) => !data.rows.has(id) && !data.unreadableIds.has(id)) }
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    addMany,
    edit,
    delete: remove,
    repairRowAt,
    clearRowAt,
    addSnapshot,
    deleteSnapshot,
    addAccount,
    addCategory,
    undoAddItem,
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
