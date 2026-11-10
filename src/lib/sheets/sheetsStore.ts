import { NewerThanApp, RowChanged, RowGone, SchemaMismatch } from '../errors'
import type { AddResult, EntryStore, RefreshOpts } from '../store'
import { toMinor } from '../money'
import { clearWrites, entryToWrites, findFreeRow, rowToEntry, type Entry, type Kind } from '../rows'
import { FIRST_ROW, KINDS, META_KEY, SCHEMA_VERSION, SETUP, TABS, columnRange, dataRange } from '../schema'
import { CURRENCIES, type Currency, type Lists } from '../types'
import type { SheetsApi } from './types'

export type StoreOptions = { now?: () => number; newId?: () => string; ttlMs?: number }

type RowRef = { kind: Kind; row: number }
type YearData = {
  fetchedAt: number
  entries: Entry[]
  rows: Map<string, RowRef>
  lists: Lists
  rates: { base: Currency; rates: Record<Currency, number> }
}

const VERSION_RECHECK_MS = 5 * 60_000
const isCurrency = (v: unknown): v is Currency => (CURRENCIES as readonly unknown[]).includes(v)
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim()

function parseBudgets(rows: unknown[][]): { names: string[]; budgets: Record<string, number[]> } {
  const names: string[] = []
  const budgets: Record<string, number[]> = {}
  for (const r of rows) {
    const name = str(r?.[0])
    if (!name) continue
    names.push(name)
    budgets[name] = Array.from({ length: 12 }, (_, i) => (typeof r[i + 1] === 'number' ? toMinor(r[i + 1] as number) : 0))
  }
  return { names, budgets }
}

export function createSheetsStore(api: SheetsApi, ids: Record<number, string>, options: StoreOptions = {}): EntryStore & { _internals: Internals } {
  const now = options.now ?? Date.now
  const newId = options.newId ?? (() => crypto.randomUUID())
  const ttl = options.ttlMs ?? 15_000
  const cache = new Map<number, YearData>()
  const stale = new Set<number>()
  const verifiedAt = new Map<number, number>()
  const inflight = new Map<number, Promise<YearData>>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((fn) => fn())

  const sheetId = (year: number): string => {
    const id = ids[year]
    if (!id) throw new Error(`No sheet linked for ${year}`)
    return id
  }

  async function ensureVersion(year: number): Promise<void> {
    const last = verifiedAt.get(year)
    if (last !== undefined && now() - last < VERSION_RECHECK_MS) return
    const raw = await api.getMetadata(sheetId(year), META_KEY)
    const version = raw === null ? null : Number(raw)
    if (version !== null && version > SCHEMA_VERSION) throw new NewerThanApp(version)
    if (version !== SCHEMA_VERSION) throw new SchemaMismatch(version)
    verifiedAt.set(year, now())
  }

  async function fetchYear(year: number): Promise<YearData> {
    await ensureVersion(year)
    const id = sheetId(year)
    const ranges = [...KINDS.map(dataRange), SETUP.baseCurrency, SETUP.rateRange, SETUP.accounts, SETUP.expenseBudgets, SETUP.incomeBudgets]
    const got = await api.batchGet(id, ranges, 'UNFORMATTED_VALUE')
    const base: Currency = isCurrency(got[3]?.[0]?.[0]) ? (got[3][0][0] as Currency) : 'EUR'

    const entries: Entry[] = []
    const rows = new Map<string, RowRef>()
    const backfill: { range: string; values: unknown[][] }[] = []
    KINDS.forEach((kind, k) => {
      ;(got[k] ?? []).forEach((row, i) => {
        const e = rowToEntry(kind, row, base)
        if (!e) return
        const sheetRow = FIRST_ROW + i
        if (e.id === '') {
          e.id = newId()
          backfill.push({ range: `${TABS[kind].name}!${TABS[kind].cols.id}${sheetRow}`, values: [[e.id]] })
        }
        entries.push(e)
        rows.set(e.id, { kind, row: sheetRow })
      })
    })
    if (backfill.length) await api.valuesBatchUpdate(id, backfill)

    const rateRows = got[4] ?? []
    const rates = { EUR: NaN, GBP: NaN, USD: NaN } as Record<Currency, number>
    for (const r of rateRows) if (isCurrency(r?.[0])) rates[r[0]] = typeof r[1] === 'number' ? r[1] : NaN

    const exp = parseBudgets(got[6] ?? [])
    const inc = parseBudgets(got[7] ?? [])
    const lists: Lists = {
      expenseCategories: exp.names,
      incomeCategories: inc.names,
      accounts: (got[5] ?? []).map((r) => str(r?.[0])).filter(Boolean),
      expenseBudgets: exp.budgets,
      incomeBudgets: inc.budgets,
    }
    return { fetchedAt: now(), entries, rows, lists, rates: { base, rates } }
  }

  async function load(year: number, force = false): Promise<{ data: YearData; fetched: boolean }> {
    const hit = cache.get(year)
    if (hit && !force && !stale.has(year) && now() - hit.fetchedAt < ttl) return { data: hit, fetched: false }
    let p = inflight.get(year)
    if (!p) {
      p = fetchYear(year).finally(() => inflight.delete(year))
      inflight.set(year, p)
    }
    const data = await p
    cache.set(year, data)
    stale.delete(year)
    notify()
    return { data, fetched: true }
  }

  const MAX_PLACE_ATTEMPTS = 5
  const markDirty = (year: number) => {
    stale.add(year)
    notify()
  }

  // The same entry if at least two of date, amount and place/description agree. Text only counts
  // when both sides have some, so two blank descriptions never vouch for each other.
  const looksSame = (a: Entry, b: Entry) => {
    const text = (e: Entry) => (e.place || e.description || '').trim().toLowerCase()
    let matches = (a.date === b.date ? 1 : 0) + (a.money.minor === b.money.minor && a.money.currency === b.money.currency ? 1 : 0)
    if (text(a) && text(b) && text(a) === text(b)) matches++
    return matches >= 2
  }

  async function locate(year: number, kind: Kind, entryId: string, expectedPrevious?: Entry): Promise<{ row: number; previous: Entry }> {
    await ensureVersion(year)
    const [data, base] = await api.batchGet(sheetId(year), [dataRange(kind), SETUP.baseCurrency])
    const baseCur: Currency = isCurrency(base?.[0]?.[0]) ? (base[0][0] as Currency) : 'EUR'
    const i = data.findIndex((r) => str(r?.[0]) === entryId)
    const previous = i < 0 ? null : rowToEntry(kind, data[i], baseCur)
    if (!previous) throw new RowGone(entryId)
    if (expectedPrevious && !looksSame(previous, expectedPrevious)) throw new RowChanged(entryId)
    return { row: FIRST_ROW + i, previous: { ...previous, id: entryId } }
  }

  async function addMany(year: number, entries: Entry[]): Promise<AddResult[]> {
    await ensureVersion(year)
    const id = sheetId(year)
    const results = new Map<string, AddResult>()
    let pending = entries.filter((e, i) => entries.findIndex((x) => x.id === e.id) === i)
    for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS && pending.length; attempt++) {
      const kinds = KINDS.filter((k) => pending.some((e) => e.kind === k))
      const cols = (k: Kind) => [TABS[k].cols.id, TABS[k].cols.date, TABS[k].cols.amount, TABS[k].cols.fields.description!]
      const got = await api.batchGet(id, kinds.flatMap((k) => cols(k).map((c) => columnRange(k, c))))
      const flat = (k: Kind, n: number) => (got[kinds.indexOf(k) * 4 + n] ?? []).map((r) => r?.[0] ?? '')
      const present = new Set(kinds.flatMap((k) => flat(k, 0).map(str)))
      pending = pending.filter((e) => {
        if (!present.has(e.id)) return true
        results.set(e.id, { id: e.id, ok: true })
        return false
      })
      const placed: { entry: Entry; row: number }[] = []
      for (const k of kinds) {
        const ids = flat(k, 0)
        for (const e of pending.filter((x) => x.kind === k)) {
          const row = findFreeRow(k, ids, flat(k, 1), flat(k, 2), flat(k, 3))
          if (row === 'full') {
            results.set(e.id, { id: e.id, ok: false, reason: 'TabFull' })
            continue
          }
          ids[row - FIRST_ROW] = e.id // reserve for the next entry of this kind
          placed.push({ entry: e, row })
        }
      }
      pending = pending.filter((e) => !results.has(e.id))
      if (!placed.length) break
      await api.valuesBatchUpdate(id, placed.flatMap((p) => entryToWrites(p.entry, p.row)))
      const back = await api.batchGet(id, kinds.map((k) => columnRange(k, TABS[k].cols.id)))
      for (const p of placed) {
        const cell = back[kinds.indexOf(p.entry.kind)]?.[p.row - FIRST_ROW]?.[0]
        if (str(cell) === p.entry.id) results.set(p.entry.id, { id: p.entry.id, ok: true })
      }
      pending = pending.filter((e) => !results.has(e.id))
    }
    markDirty(year)
    if (pending.length) throw new Error('Could not place all entries; try again')
    return entries.map((e) => results.get(e.id)!)
  }

  const store: EntryStore = {
    async list(year) { return (await load(year)).data.entries },
    async lists(year) { return (await load(year)).data.lists },
    async rates(year) { return (await load(year)).data.rates },
    async refresh(year, opts: RefreshOpts = {}) {
      const { data } = await load(year, opts.force)
      return { missingIds: (opts.expectIds ?? []).filter((id) => !data.rows.has(id)) }
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    addMany,
    async edit(year, entry, expectedPrevious) {
      const { row, previous } = await locate(year, entry.kind, entry.id, expectedPrevious)
      await api.valuesBatchUpdate(sheetId(year), entryToWrites(entry, row))
      markDirty(year)
      return { previous }
    },
    async delete(year, kind, entryId, expectedPrevious) {
      const { row, previous } = await locate(year, kind, entryId, expectedPrevious)
      await api.valuesBatchClear(sheetId(year), clearWrites(kind, row).map((c) => c.range))
      markDirty(year)
      return { previous }
    },
  }
  return Object.assign(store, { _internals: { api, sheetId, stale, cache, notify, newId, now } as Internals })
}

export type Internals = {
  api: SheetsApi
  sheetId: (year: number) => string
  stale: Set<number>
  cache: Map<number, YearData>
  notify: () => void
  newId: () => string
  now: () => number
}
