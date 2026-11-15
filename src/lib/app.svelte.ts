// Application state. Components render this; the rules live in the modules it composes.
import type { Auth } from './auth'
import { createConfig, type DeviceSettings, type Theme } from './config'
import { ApiError, AuthExpired, NewerThanApp, UnrecognisedLayout } from './errors'
import { createKv, type Kv } from './kv'
import { applyPendingSnapshots, applyPending, makeOp, makeRepairOp, makeSnapshotOp, pendingCount, undo, type Op } from './outbox'
import { createOutboxDb, type OutboxDb } from './outboxDb'
import { createReplayer } from './replayer'
import { todayLocal, type Entry } from './rows'
import { rowUrl, sheetUrl } from './sheetLinks'
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
  account?: () => Promise<string | null> // the email of the signed-in Google account, for display only
  ttlMs?: number // overrides the book refresh interval (the offline end-to-end mode uses 0)
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
  gids = $state<Record<string, number>>({}) // numeric tab ids for links into Google Sheets
  sheetName = $state('') // the linked spreadsheet's name
  private infoFetched: string | null = null // the sheet whose info was fetched in this session
  ops = $state<Op[]>([])
  status = $state<Status>('loading')
  online = $state(true)
  authExpired = $state(false)
  signedIn = $state(false) // a valid token is held; Settings shows Sign in or Sign out accordingly
  accountEmail = $state('') // who is signed in (display only, never stored)
  gestureTried = $state(false) // a silent sign-in inside a tap was refused: only then is the Reconnect banner shown
  private userSignedOut = false // the person signed out on purpose (kept across reloads): never sign in silently behind their back
  private silentBusy = false
  device = $state<DeviceSettings>({ kind: 'expense', places: [], lastCategory: {}, theme: 'system' })
  message = $state('')
  pickerHelp = $state(false) // a link attempt ended with no sheet: the first-run screen opens the cookie help
  syncing = $state(false)
  templateCopyUrl = TEMPLATE_COPY_URL
  private again = false // a change arrived while a sync was running

  displayed = $derived(applyPending(this.entries, this.ops))
  displayedSnapshots = $derived(applyPendingSnapshots(this.snapshots, this.ops))
  attention = $derived(this.ops.filter((o) => o.status === 'flagged'))
  needsAttention = $derived(this.attention.length + this.unreadable.length)
  pendingCount = $derived(pendingCount(this.ops))
  canWrite = $derived(!BLOCKED.includes(this.status))
  reconnectNeeded = $derived(this.authExpired && !this.signedIn && (this.gestureTried || this.userSignedOut))
  sheetLink = $derived(this.sheetId ? sheetUrl(this.sheetId, this.gids.Ledger) : '')

  constructor(env: Env) {
    this.env = env
    this.config = createConfig(env.storage)
    this.db = createOutboxDb(env.idb)
    this.kv = createKv(env.idb)
    this.signedIn = Boolean(env.auth.token())
    this.userSignedOut = this.config.getSignedOut()
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
    this.store = createLedgerStore(this.env.api, this.sheetId, { ttlMs: this.env.ttlMs })
    this.replayer = createReplayer(this.store, this.db)
    this.replayer.onAuthExpired(() => (this.authExpired = true))
  }

  private async refreshAccount() {
    const lookup = this.env.account
    if (!lookup || !this.env.auth.token()) { this.accountEmail = ''; return }
    this.accountEmail = (await lookup().catch(() => null)) ?? ''
  }

  async init() {
    void this.refreshAccount()
    this.online = typeof navigator === 'undefined' ? true : navigator.onLine
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.online = true; void this.sync() })
      window.addEventListener('offline', () => { this.online = false })
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.sync()
      })
    }
    this.env.auth.onExpired(() => { this.authExpired = true; this.signedIn = false; this.accountEmail = '' })
    try {
      this.ops = await this.db.all()
      await this.db.prune(PRUNE_AFTER_MS)
    } catch {
      this.status = 'error'
      this.message = messages.storageUnavailable
      return
    }
    await this.loadCache()
    // No silent sign-in here: the browser blocks Google's window unless it opens inside a tap (see the first-tap listener).
    await this.sync()
  }

  /**
   * Signs in without a screen when Google allows it (the person consented before and has a Google session). `fromGesture`
   * is the first tap of a session, the one moment a browser lets the sign-in window open; if that is refused too, the
   * Reconnect banner appears. `force` refreshes a token that is still valid, shortly before it expires.
   * Returns true when it signed in and synced.
   */
  async trySilent(fromGesture = false, force = false): Promise<boolean> {
    if (this.userSignedOut || this.silentBusy || (this.signedIn && !force)) return false
    if (fromGesture && this.gestureTried) return false // refused once this session: stop trying on every tap
    this.silentBusy = true
    const ok = await this.env.auth.silentSignIn().finally(() => { this.silentBusy = false })
    if (!ok) {
      if (fromGesture && !this.signedIn) this.gestureTried = true
      return false
    }
    const wasSignedIn = this.signedIn
    this.signedIn = true
    this.authExpired = false
    this.gestureTried = false
    void this.refreshAccount()
    if (!wasSignedIn) await this.sync()
    return !wasSignedIn
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
    else if (err instanceof ApiError && err.status === 403 && err.message.includes('PERMISSION_DENIED')) {
      // Usually a token of another Google account than the one that owns the sheet: drop it and ask for a fresh choice.
      this.env.auth.signOut()
      this.setUserSignedOut(true)
      this.signedIn = false
      this.authExpired = true
      this.message = messages.wrongAccount(this.accountEmail || undefined)
      this.accountEmail = ''
    }
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
  // Records an account balance on a date: queued like an entry, so it works offline and Undo removes it.
  async addSnapshot(snapshot: Snapshot) {
    if (!this.canWrite) throw new Error('read-only')
    await this.enqueue(makeSnapshotOp('add', snapshot))
  }
  async edit(entry: Entry, previous: Entry) {
    if (this.canWrite) await this.enqueue(makeOp('edit', entry, previous))
  }
  async remove(entry: Entry) {
    if (this.canWrite) await this.enqueue(makeOp('delete', entry, entry))
  }
  // Fixing or removing a row the app could not read (found by its id, which occurs once in the book).
  // `at` is given for a row without a usable id: it is found by row number, and only while it still holds `raw`.
  async fixRow(entry: Entry, at?: { row: number; raw: unknown[] }) {
    if (this.canWrite) await this.enqueue(makeRepairOp('edit', entry, at))
  }
  async deleteRow(entry: Entry, at?: { row: number; raw: unknown[] }) {
    if (this.canWrite) await this.enqueue(makeRepairOp('delete', entry, at))
  }

  rowUrl(u: Unreadable): string {
    return this.sheetId ? rowUrl(this.sheetId, this.gids, u) : ''
  }
  // The sheet's name and tab ids: from the device first (works while signed out), then one request per session once a
  // token exists. A failed or token-less attempt is not remembered, so it is retried after signing in.
  async loadSheetInfo() {
    const id = this.sheetId
    if (!id) return
    if (!this.sheetName) {
      const saved = await this.kv.get<{ name: string; gids: Record<string, number> }>(`meta:${id}`)
      if (saved && id === this.sheetId) { this.sheetName = saved.name; this.gids = saved.gids }
    }
    if (!this.signedIn || this.infoFetched === id) return
    try {
      const info = await this.env.api.sheetInfo(id)
      if (id !== this.sheetId) return
      this.sheetName = info.title
      this.gids = info.tabs
      this.infoFetched = id
      await this.kv.set(`meta:${id}`, { name: info.title, gids: { ...info.tabs } })
    } catch { /* the links keep opening the file; the next call tries again */ }
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
  // Re-add: a flagged add or a vanished row is added again; a flagged edit whose row still exists is written again as a
  // deliberate overwrite (last write wins), because an add with an existing id would be reported as done and write nothing.
  async readd(op: Op) {
    if (!this.canWrite || op.subject !== 'entry' || !op.entry || op.type === 'delete') return
    const vanished = op.reason === 'RowGone' || op.reason === 'Missing'
    const next = op.type === 'edit' && !vanished ? makeOp('edit', op.entry) : makeOp('add', op.entry)
    await this.db.put($state.snapshot(next) as Op)
    await this.db.remove(op.opId)
    this.ops = await this.db.all()
    void this.sync()
  }

  async reconnect() {
    await this.env.auth.signIn()
    this.setUserSignedOut(false)
    this.gestureTried = false
    this.signedIn = true
    this.authExpired = false
    void this.refreshAccount()
    await this.sync()
  }
  signOut() {
    this.env.auth.signOut()
    this.setUserSignedOut(true)
    this.signedIn = false
    this.authExpired = true
    this.accountEmail = ''
  }

  private setUserSignedOut(value: boolean) {
    this.userSignedOut = value
    this.config.setSignedOut(value)
  }

  private resetSheetInfo() {
    this.gids = {}
    this.sheetName = ''
    this.infoFetched = null
  }

  // Forgets everything tied to the previously linked sheet: its finished and flagged ops and the cached book.
  private async forgetBook() {
    for (const op of await this.db.all()) await this.db.remove(op.opId)
    this.ops = []
    await this.kv.set(CACHE_KEY, undefined)
  }

  async link() {
    this.message = ''
    this.pickerHelp = false
    if (this.blockedByPending()) return
    try {
      if (!this.env.auth.token() && !this.env.fake) await this.env.auth.signIn()
      this.setUserSignedOut(false)
      this.signedIn = true
      void this.refreshAccount()
      const id = await this.env.pick()
      if (id) await this.linkId(id)
      else this.pickerHelp = true
    } catch {
      this.pickerHelp = true
      this.message = messages.linkFailed
    }
  }

  // Makes the user's own copy of the template (Picker with the template preselected, then Drive files.copy) and links it.
  async createFromTemplate() {
    this.message = ''
    this.pickerHelp = false
    if (this.blockedByPending()) return
    try {
      if (!this.env.auth.token() && !this.env.fake) await this.env.auth.signIn()
      this.setUserSignedOut(false)
      this.signedIn = true
      void this.refreshAccount()
      const id = await this.env.copyTemplate()
      if (id) await this.linkId(id)
      else this.pickerHelp = true
    } catch {
      this.pickerHelp = true
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
    if (this.sheetId !== id) { await this.forgetBook(); this.resetSheetInfo() }
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
    this.resetSheetInfo()
    await this.loadCache()
  }
}
