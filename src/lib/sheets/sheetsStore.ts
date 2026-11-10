import { NewerThanApp, SchemaMismatch } from '../errors'
import type { AddResult, EntryStore, RefreshOpts } from '../store'
import { toMinor } from '../money'
import { rowToEntry, type Entry, type Kind } from '../rows'
import { FIRST_ROW, KINDS, META_KEY, SCHEMA_VERSION, SETUP, TABS, dataRange } from '../schema'
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
  const verified = new Set<number>()
  const inflight = new Map<number, Promise<YearData>>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((fn) => fn())

  const sheetId = (year: number): string => {
    const id = ids[year]
    if (!id) throw new Error(`No sheet linked for ${year}`)
    return id
  }

  async function ensureVersion(year: number): Promise<void> {
    if (verified.has(year)) return
    const raw = await api.getMetadata(sheetId(year), META_KEY)
    const version = raw === null ? null : Number(raw)
    if (version !== null && version > SCHEMA_VERSION) throw new NewerThanApp(version)
    if (version !== SCHEMA_VERSION) throw new SchemaMismatch(version)
    verified.add(year)
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

  const notImplemented = (): never => { throw new Error('write path not implemented') }

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
    addMany: async (): Promise<AddResult[]> => notImplemented(),
    edit: async () => notImplemented(),
    delete: async () => notImplemented(),
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
