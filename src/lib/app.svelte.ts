// Application state. Components render this; the rules live in the modules it composes.
import type { Auth } from './auth'
import { createConfig, type DeviceSettings } from './config'
import { AuthExpired, FlaggedRows, NewerThanApp, SchemaMismatch, UnrecognisedLayout, WrongYear } from './errors'
import { createKv, type Kv } from './kv'
import { verifyYear } from './link'
import { detectVersion, pendingMigrations, runMigrations } from './migrations'
import { applyPending, makeOp, undo, type Op } from './outbox'
import { createOutboxDb, type OutboxDb } from './outboxDb'
import { createReplayer } from './replayer'
import type { Entry } from './rows'
import { createSheetsStore } from './sheets/sheetsStore'
import type { SheetsApi } from './sheets/types'
import type { EntryStore } from './store'
import { messages } from './messages'
import type { Currency, Lists } from './types'

export type Tab = 'add' | 'month' | 'activity' | 'settings'
export type Status = 'loading' | 'ok' | 'unlinked' | 'needs-migration' | 'newer' | 'error'
export type Env = {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  idb: IDBFactory
  api: SheetsApi
  auth: Auth
  pick: () => Promise<string | null>
  fake?: boolean
}
type Rates = { base: Currency; rates: Record<Currency, number> }
type Snapshot = { entries: Entry[]; lists: Lists; rates: Rates }

const EMPTY_LISTS: Lists = { expenseCategories: [], incomeCategories: [], accounts: [], expenseBudgets: {}, incomeBudgets: {} }
const EMPTY_RATES: Rates = { base: 'EUR', rates: { EUR: 1, GBP: 1, USD: 1 } }
const BLOCKED: Status[] = ['unlinked', 'needs-migration', 'newer']
const currentYear = (): number => new Date().getFullYear()
const currentMonth = (): string => new Date().toISOString().slice(0, 7)

export class AppState {
  env: Env
  config
  db: OutboxDb
  kv: Kv
  store!: EntryStore
  replayer!: ReturnType<typeof createReplayer>

  tab = $state<Tab>('add')
  year = $state(currentYear())
  month = $state(currentMonth())
  sheets = $state<Record<number, string>>({})
  entries = $state<Entry[]>([])
  lists = $state<Lists>(EMPTY_LISTS)
  rates = $state<Rates>(EMPTY_RATES)
  ops = $state<Op[]>([])
  status = $state<Status>('loading')
  online = $state(true)
  authExpired = $state(false)
  device = $state<DeviceSettings>({ currency: 'EUR', kind: 'expense', places: [], lastCategory: {} })
  message = $state('')
  sheetVersion = $state<number | null>(null)
  flaggedRows = $state<{ kind: string; row: number; reason: string }[]>([])
  syncing = $state(false)
  private again = false // a change arrived while a sync was running

  displayed = $derived(applyPending(this.entries, this.ops.filter((o) => o.year === this.year)))
  attention = $derived(this.ops.filter((o) => o.status === 'flagged'))
  pendingCount = $derived(this.ops.filter((o) => o.status === 'pending').length)
  canWrite = $derived(!BLOCKED.includes(this.status))
  migrationSteps = $derived(this.sheetVersion === null ? [] : pendingMigrations(this.sheetVersion))

  constructor(env: Env) {
    this.env = env
    this.config = createConfig(env.storage)
    this.db = createOutboxDb(env.idb)
    this.kv = createKv(env.idb)
    this.sheets = this.config.getSheets()
    this.device = this.config.getDevice()
    const linked = Object.keys(this.sheets).map(Number)
    if (linked.length && !this.sheets[this.year]) this.year = Math.max(...linked)
    if (!this.month.startsWith(String(this.year))) this.month = `${this.year}-01`
    this.build()
  }

  private build() {
    this.store = createSheetsStore(this.env.api, this.sheets)
    this.replayer = createReplayer(this.store, this.db)
    this.replayer.onAuthExpired(() => (this.authExpired = true))
  }

  async init() {
    this.online = typeof navigator === 'undefined' ? true : navigator.onLine
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.online = true; void this.sync() })
      window.addEventListener('offline', () => { this.online = false })
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.sync() })
    }
    this.env.auth.onExpired(() => (this.authExpired = true))
    this.ops = await this.db.all()
    await this.loadCache()
    await this.sync()
  }

  private async loadCache() {
    const snap = await this.kv.get<Snapshot>(`year-${this.year}`)
    if (snap) {
      this.entries = snap.entries
      this.lists = snap.lists
      this.rates = snap.rates
      this.status = 'ok'
    } else {
      this.entries = []
      this.lists = EMPTY_LISTS
      this.status = this.sheets[this.year] ? 'loading' : 'unlinked'
    }
  }

  async sync() {
    if (this.syncing) {
      this.again = true
      return
    }
    if (!this.sheets[this.year]) {
      this.status = 'unlinked'
      return
    }
    if (!this.online) return
    if (!this.env.auth.token() && !this.env.fake) {
      this.authExpired = true
      return
    }
    this.syncing = true
    this.authExpired = false
    try {
      await this.replayer.run()
      this.entries = await this.store.list(this.year)
      this.lists = await this.store.lists(this.year)
      this.rates = await this.store.rates(this.year)
      this.status = 'ok'
      this.message = ''
      await this.kv.set(`year-${this.year}`, { entries: $state.snapshot(this.entries), lists: $state.snapshot(this.lists), rates: $state.snapshot(this.rates) })
      await this.replayer.verify(this.year)
    } catch (err) {
      await this.handleSyncError(err)
    } finally {
      this.ops = await this.db.all()
      this.syncing = false
      if (this.again) {
        this.again = false
        void this.sync()
      }
    }
  }

  private async handleSyncError(err: unknown) {
    if (err instanceof AuthExpired) this.authExpired = true
    else if (err instanceof NewerThanApp) this.status = 'newer'
    else if (err instanceof SchemaMismatch) {
      try {
        this.sheetVersion = await detectVersion(this.env.api, this.sheets[this.year])
        this.status = this.sheetVersion === 2 ? 'loading' : 'needs-migration'
        if (this.sheetVersion === 2) {
          this.build()
          this.again = true
        }
      } catch (e) {
        this.status = 'error'
        this.message = e instanceof UnrecognisedLayout ? e.message : String(e)
      }
    } else {
      this.status = 'error'
      this.message = err instanceof Error ? err.message : String(err)
    }
  }

  private async enqueue(op: Op) {
    await this.db.put($state.snapshot(op) as Op)
    this.ops = await this.db.all()
    void this.sync()
  }

  setDevice(patch: Partial<DeviceSettings>) {
    this.config.setDevice(patch)
    this.device = this.config.getDevice()
  }

  async save(entry: Entry, remember: Partial<DeviceSettings>) {
    this.setDevice(remember)
    await this.enqueue(makeOp('add', this.year, entry))
  }
  async edit(entry: Entry, previous: Entry) { await this.enqueue(makeOp('edit', this.year, entry, previous)) }
  async remove(entry: Entry) { await this.enqueue(makeOp('delete', this.year, entry, entry)) }
  async undoOp(op: Op) {
    await this.db.update(op.opId, { undone: true })
    await this.enqueue(undo(op))
  }
  async discard(op: Op) {
    await this.db.remove(op.opId)
    this.ops = await this.db.all()
  }
  async readd(op: Op) {
    if (op.entry && op.type !== 'delete') await this.db.put($state.snapshot(makeOp('add', op.year, op.entry)) as Op)
    await this.db.remove(op.opId)
    this.ops = await this.db.all()
    void this.sync()
  }

  async reconnect() {
    await this.env.auth.signIn()
    this.authExpired = false
    await this.sync()
  }
  signOut() {
    this.env.auth.signOut()
    this.authExpired = true
  }

  async setYear(year: number) {
    this.year = year
    this.month = `${year}-${this.month.slice(5, 7)}`
    this.sheetVersion = null
    await this.loadCache()
    await this.sync()
  }

  async link(year: number) {
    this.message = ''
    try {
      if (!this.env.auth.token() && !this.env.fake) await this.env.auth.signIn()
      const id = await this.env.pick()
      if (!id) return
      await verifyYear(this.env.api, id, year)
      this.config.linkSheet(year, id)
      this.sheets = this.config.getSheets()
      this.build()
      this.year = year
      await this.loadCache()
      await this.sync()
    } catch (err) {
      this.message = err instanceof WrongYear ? messages.wrongYear(String(err.found)) : messages.linkFailed
    }
  }

  async migrate(baseCurrency: Currency) {
    this.message = ''
    this.flaggedRows = []
    try {
      await runMigrations(this.env.api, this.sheets[this.year], { baseCurrency })
      this.build()
      this.status = 'loading'
      await this.sync()
    } catch (err) {
      if (err instanceof FlaggedRows) this.flaggedRows = err.rows
      else this.message = messages.migrateFailed
    }
  }
}
