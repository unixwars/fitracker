// Application state. Components render this; the rules live in the modules it composes.
import type { Auth } from './auth'
import { createConfig, type DeviceSettings, type Theme } from './config'
import { AuthExpired, NewerThanApp, UnrecognisedLayout } from './errors'
import { createKv, type Kv } from './kv'
import { applyPending, makeOp, pendingCount, undo, type Op } from './outbox'
import { createOutboxDb, type OutboxDb } from './outboxDb'
import { createReplayer } from './replayer'
import { todayLocal, type Entry } from './rows'
import { createLedgerStore } from './sheets/ledgerStore'
import type { SheetsApi } from './sheets/types'
import { ensureVersion } from './sheets/version'
import type { EntryStore } from './store'
import { TEMPLATE_COPY_URL } from './templateCopy'
import { messages } from './messages'
import type { RateRow, Reference, Snapshot, Unreadable } from './types'

export type Tab = 'add' | 'month' | 'activity' | 'settings'
export type Status = 'loading' | 'ok' | 'unlinked' | 'newer' | 'unrecognised' | 'error'
export type Env = {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  idb: IDBFactory
  api: SheetsApi
  auth: Auth
  pick: () => Promise<string | null>
  copyTemplate: () => Promise<string | null> // null when the user cancels
  fake?: boolean
}
type Book = { entries: Entry[]; lists: Reference; rates: RateRow[]; snapshots: Snapshot[]; unreadable: Unreadable[] }

const EMPTY_LISTS: Reference = { base: 'EUR', accounts: [], categories: [], budgets: [] }
const BLOCKED: Status[] = ['unlinked', 'newer', 'unrecognised']
const CACHE_KEY = 'book'
const currentMonth = (): string => todayLocal().slice(0, 7)
const PRUNE_AFTER_MS = 30 * 86_400_000
export const applyTheme = (theme: Theme): void => {
  if (typeof document === 'undefined') return
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export class AppState {
  env: Env
  config
  db: OutboxDb
  kv: Kv
  store: EntryStore | null = null
  replayer: ReturnType<typeof createReplayer> | null = null

  tab = $state<Tab>('add')
  month = $state(currentMonth())
  sheetId = $state<string | null>(null)
  entries = $state<Entry[]>([])
  lists = $state<Reference>(EMPTY_LISTS)
  rates = $state<RateRow[]>([])
  snapshots = $state<Snapshot[]>([])
  unreadable = $state<Unreadable[]>([])
  ops = $state<Op[]>([])
  status = $state<Status>('loading')
  online = $state(true)
  authExpired = $state(false)
  device = $state<DeviceSettings>({ kind: 'expense', places: [], lastCategory: {}, theme: 'system' })
  message = $state('')
  syncing = $state(false)
  templateCopyUrl = TEMPLATE_COPY_URL
  private again = false // a change arrived while a sync was running

  displayed = $derived(applyPending(this.entries, this.ops))
  attention = $derived(this.ops.filter((o) => o.status === 'flagged'))
  needsAttention = $derived(this.attention.length + this.unreadable.length)
  pendingCount = $derived(pendingCount(this.ops))
  canWrite = $derived(!BLOCKED.includes(this.status))

  constructor(env: Env) {
    this.env = env
    this.config = createConfig(env.storage)
    this.db = createOutboxDb(env.idb)
    this.kv = createKv(env.idb)
    this.sheetId = this.config.getSheetId()
    this.device = this.config.getDevice()
    applyTheme(this.device.theme)
    this.build()
  }

  private build() {
    if (!this.sheetId) {
      this.store = null
      this.replayer = null
      return
    }
    this.store = createLedgerStore(this.env.api, this.sheetId)
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
    try {
      this.ops = await this.db.all()
      await this.db.prune(PRUNE_AFTER_MS)
    } catch {
      this.status = 'error'
      this.message = messages.storageUnavailable
      return
    }
    await this.loadCache()
    await this.sync()
  }

  private async loadCache() {
    const book = this.sheetId ? await this.kv.get<Book>(CACHE_KEY) : undefined
    if (book) {
      this.entries = book.entries
      this.lists = book.lists
      this.rates = book.rates
      this.snapshots = book.snapshots ?? []
      this.unreadable = book.unreadable ?? []
      this.status = 'ok'
    } else {
      this.entries = []
      this.lists = EMPTY_LISTS
      this.rates = []
      this.snapshots = []
      this.unreadable = []
      this.status = this.sheetId ? 'loading' : 'unlinked'
    }
  }

  async sync() {
    if (this.syncing) {
      this.again = true
      return
    }
    const { store, replayer } = this
    if (!this.sheetId || !store || !replayer) {
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
      await replayer.run()
      await this.readBook(store)
      this.status = 'ok'
      this.message = ''
      if (this.canWrite) await this.rollRates(store)
      await replayer.verify()
    } catch (err) {
      this.handleSyncError(err)
    } finally {
      this.ops = await this.db.all()
      this.syncing = false
      if (this.again) {
        this.again = false
        void this.sync()
      }
    }
  }

  private async readBook(store: EntryStore) {
    const [entries, lists, rates, snapshots, unreadable] = [await store.list(), await store.lists(), await store.rates(), await store.snapshots(), await store.unreadable()]
    if (store !== this.store) return // the sheet was unlinked or replaced while this ran
    this.entries = entries
    this.lists = lists
    this.rates = rates
    this.snapshots = snapshots
    this.unreadable = unreadable
    await this.kv.set(CACHE_KEY, $state.snapshot({ entries, lists, rates, snapshots, unreadable }))
  }

  // Month-roll of the Rates tab (spec 3.4). Best effort: a failure here must not hide the data that was read.
  private async rollRates(store: EntryStore) {
    try {
      await store.maintainRates(todayLocal())
      this.rates = await store.rates()
    } catch (err) {
      if (err instanceof AuthExpired) throw err
    }
  }

  private handleSyncError(err: unknown) {
    if (err instanceof AuthExpired) this.authExpired = true
    else if (err instanceof NewerThanApp) this.status = 'newer'
    else if (err instanceof UnrecognisedLayout) {
      this.status = 'unrecognised'
      this.message = err.message
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
    applyTheme(this.device.theme)
  }

  async save(entry: Entry, remember: Partial<DeviceSettings>) {
    if (!this.canWrite) throw new Error('read-only')
    this.setDevice(remember)
    await this.enqueue(makeOp('add', entry))
  }
  async edit(entry: Entry, previous: Entry) {
    if (this.canWrite) await this.enqueue(makeOp('edit', entry, previous))
  }
  async remove(entry: Entry) {
    if (this.canWrite) await this.enqueue(makeOp('delete', entry, entry))
  }
  async undoOp(op: Op) {
    if (!this.canWrite) return
    await this.db.update(op.opId, { undone: true })
    await this.enqueue(undo(op))
  }
  async discard(op: Op) {
    await this.db.remove(op.opId)
    this.ops = await this.db.all()
  }
  async readd(op: Op) {
    if (!this.canWrite) return
    if (op.subject === 'entry' && op.entry && op.type !== 'delete') await this.db.put($state.snapshot(makeOp('add', op.entry)) as Op)
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

  // Forgets everything tied to the previously linked sheet: its finished and flagged ops and the cached book.
  private async forgetBook() {
    for (const op of await this.db.all()) await this.db.remove(op.opId)
    this.ops = []
    await this.kv.set(CACHE_KEY, undefined)
  }

  async link() {
    this.message = ''
    if (this.blockedByPending()) return
    try {
      if (!this.env.auth.token() && !this.env.fake) await this.env.auth.signIn()
      const id = await this.env.pick()
      if (id) await this.linkId(id)
    } catch {
      this.message = messages.linkFailed
    }
  }

  // Makes the user's own copy of the template (Picker with the template preselected, then Drive files.copy) and links it.
  async createFromTemplate() {
    this.message = ''
    try {
      if (!this.env.auth.token() && !this.env.fake) await this.env.auth.signIn()
      const id = await this.env.copyTemplate()
      if (id) await this.linkId(id)
    } catch {
      this.message = messages.copyFailed
    }
  }

  private blockedByPending(): boolean {
    const waiting = pendingCount(this.ops)
    if (waiting) this.message = messages.relinkBlocked(waiting)
    return waiting > 0
  }

  // Verifies the sheet is a ledger before linking it: a legacy yearly sheet leaves the current link unchanged.
  private async linkId(id: string) {
    try {
      await ensureVersion(this.env.api, id)
    } catch (err) {
      if (err instanceof UnrecognisedLayout) { this.message = messages.linkNotLedger; return }
      if (!(err instanceof NewerThanApp)) throw err // a newer sheet links read-only
    }
    if (this.sheetId !== id) await this.forgetBook()
    this.config.linkSheet(id)
    this.sheetId = id
    this.build()
    await this.loadCache()
    await this.sync()
  }

  // Forgets this device's link to the sheet. The sheet itself is never touched.
  async unlink() {
    this.message = ''
    if (this.blockedByPending()) return
    this.config.unlinkSheet()
    this.sheetId = null
    this.build()
    await this.forgetBook()
    await this.loadCache()
  }
}
