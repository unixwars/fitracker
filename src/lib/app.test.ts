// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { AppState, type Env } from './app.svelte'
import type { Auth } from './auth'
import { messages } from './messages'
import { makeOp } from './outbox'
import { ApiError } from './errors'
import { ledgerRowValues, todayLocal, type Entry } from './rows'
import { META_KEY } from './schema'
import { createFakeSheets, type FakeSheets } from './sheets/fakeSheets'
import { seedLedger, seedLegacy } from './sheets/fixtures'

const today = todayLocal()
const e = (id: string, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: today, money: { minor: 350, currency: 'EUR' }, description: 'Coffee', category: 'Groceries', account: 'Joint', ...o,
})
const auth: Auth = { token: () => 'tok', signIn: async () => undefined, silentSignIn: async () => true, signOut: () => undefined, onExpired: () => undefined, onExpiring: () => undefined }

function setup(opts: { linked?: boolean; entries?: Entry[]; pick?: string | null; copy?: () => Promise<string | null>; auth?: Auth } = {}) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today, entries: opts.entries ?? [e('a')] })
  const data = new Map<string, string>(opts.linked === false ? [] : [['fitracker.sheet', 'S1']])
  const idb = new IDBFactory()
  const env: Env = { storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }, idb, api: fake, auth: opts.auth ?? auth, pick: async () => opts.pick ?? 'S1', copyTemplate: opts.copy ?? (async () => null) }
  return { fake, env, data, idb, app: new AppState(env) }
}
const writes = (fake: FakeSheets) => ['valuesBatchUpdate', 'valuesBatchClear', 'setMetadata'].reduce((n, m) => n + fake.count(m), 0)

describe('AppState', () => {
  it('shows the cached book first, then the sheet', async () => {
    const { app, fake } = setup()
    await app.kv.set('book', { entries: [e('cached')], lists: { base: 'EUR', accounts: [], categories: [], budgets: [] }, rates: [], snapshots: [], unreadable: [] })
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const real = fake.batchGet.bind(fake)
    fake.batchGet = async (...a) => { await gate; return real(...a) }
    const started = app.init()
    await vi.waitFor(() => expect(app.entries.map((x) => x.id)).toEqual(['cached']))
    release()
    await started
    expect(app.entries.map((x) => x.id)).toEqual(['a'])
    expect(app.status).toBe('ok')
  })

  it('an unlinked device is read-only', async () => {
    const { app } = setup({ linked: false })
    await app.init()
    expect(app.status).toBe('unlinked')
    expect(app.canWrite).toBe(false)
    await expect(app.save(e('z'), {})).rejects.toThrow()
  })

  it('save queues an add, the replayer writes it once, and displayed shows it without a duplicate', async () => {
    const { app, fake } = setup({ entries: [e('seed')] })
    await app.init()
    await app.save(e('n1'), {})
    expect(app.displayed.map((x) => x.id)).toEqual(['seed', 'n1'])
    await vi.waitFor(() => expect(app.pendingCount).toBe(0))
    await app.sync()
    expect(fake.book('S1').get('Ledger!A3')?.v).toBe('n1')
    expect(app.entries.map((x) => x.id)).toEqual(['seed', 'n1'])
    expect(app.displayed).toHaveLength(2)
  })

  it('a sheet tagged newer is read-only: no write reaches it', async () => {
    const { app, fake } = setup()
    fake.book('S1').metadata.set(META_KEY, '4')
    await app.init()
    expect(app.status).toBe('newer')
    expect(app.canWrite).toBe(false)
    await expect(app.save(e('z'), {})).rejects.toThrow()
    expect(writes(fake)).toBe(0)
  })

  it('a legacy yearly sheet is unrecognised and nothing is written', async () => {
    const { app, fake } = setup()
    seedLegacy(fake, 'LEGACY')
    app.sheetId = 'LEGACY'
    ;(app as unknown as { build(): void }).build()
    await app.init()
    expect(app.status).toBe('unrecognised')
    expect(app.canWrite).toBe(false)
    expect(writes(fake)).toBe(0)
  })

  it('needsAttention counts unreadable rows and flagged ops', async () => {
    const { app, fake, env } = setup()
    const bad = ledgerRowValues(e('bad'))
    bad[1] = 'not a date'
    fake.book('S1').write('Ledger!A3:I3', [bad])
    await app.db.put({ ...makeOp('edit', e('a')), status: 'flagged', reason: 'RowGone' })
    await app.init()
    expect(app.unreadable).toHaveLength(1)
    expect(app.attention).toHaveLength(1)
    expect(app.needsAttention).toBe(2)
    expect(env.api).toBe(fake)
  })

  it('link refuses a legacy sheet and leaves the current link unchanged', async () => {
    const { app, fake, data } = setup({ pick: 'LEGACY' })
    seedLegacy(fake, 'LEGACY')
    await app.init()
    await app.link()
    expect(app.message).toBe(messages.linkNotLedger)
    expect(app.sheetId).toBe('S1')
    expect(data.get('fitracker.sheet')).toBe('S1')
  })

  it('link and unlink are refused while changes are waiting', async () => {
    const { app } = setup()
    await app.init()
    await app.db.put(makeOp('add', e('p')))
    app.ops = await app.db.all()
    await app.unlink()
    expect(app.message).toBe(messages.relinkBlocked(1))
    expect(app.sheetId).toBe('S1')
    await app.link()
    expect(app.message).toBe(messages.relinkBlocked(1))
  })

  it('linking a different ledger sheet clears the old outbox and cache', async () => {
    const { app, fake } = setup({ pick: 'S2' })
    seedLedger(fake, 'S2', { today, entries: [e('other')] })
    await app.init()
    await app.db.put({ ...makeOp('add', e('old')), status: 'done' })
    await app.link()
    expect(app.sheetId).toBe('S2')
    expect(await app.db.all()).toEqual([])
    expect(app.entries.map((x) => x.id)).toEqual(['other'])
  })

  it('unlink forgets the sheet on this device only', async () => {
    const { app, fake } = setup()
    await app.init()
    const before = writes(fake)
    await app.unlink()
    expect(app.status).toBe('unlinked')
    expect(app.entries).toEqual([])
    expect(writes(fake)).toBe(before)
  })

  it('rolls the rates month when it can write, and not when read-only', async () => {
    const ok = setup()
    await ok.app.init()
    const roll = vi.spyOn(ok.app.store!, 'maintainRates')
    await ok.app.sync()
    expect(roll).toHaveBeenCalledWith(today)
    const newer = setup()
    newer.fake.book('S1').metadata.set(META_KEY, '4')
    await newer.app.init()
    expect(newer.fake.count('valuesBatchUpdate')).toBe(0)
  })
})

describe('createFromTemplate', () => {
  it('links the copy and syncs', async () => {
    const { app, fake, data } = setup({ linked: false, copy: async () => 'COPY' })
    seedLedger(fake, 'COPY', { today, entries: [e('c1')] })
    await app.init()
    await app.createFromTemplate()
    expect(app.sheetId).toBe('COPY')
    expect(data.get('fitracker.sheet')).toBe('COPY')
    expect(app.status).toBe('ok')
    expect(app.entries.map((x) => x.id)).toEqual(['c1'])
  })
  it('a cancelled Picker leaves the state untouched', async () => {
    const { app } = setup({ linked: false, copy: async () => null })
    await app.init()
    await app.createFromTemplate()
    expect(app.sheetId).toBeNull()
    expect(app.status).toBe('unlinked')
    expect(app.message).toBe('')
  })
  it('a failed copy sets copyFailed and stays unlinked', async () => {
    const { app } = setup({ linked: false, copy: async () => { throw new ApiError(403, 'File not found') } })
    await app.init()
    await app.createFromTemplate()
    expect(app.message).toBe(messages.copyFailed)
    expect(app.status).toBe('unlinked')
  })
  it('a copy that is not a ledger sheet is not linked', async () => {
    const { app, fake } = setup({ linked: false, copy: async () => 'LEGACY' })
    seedLegacy(fake, 'LEGACY')
    await app.init()
    await app.createFromTemplate()
    expect(app.message).toBe(messages.linkNotLedger)
    expect(app.sheetId).toBeNull()
  })
})

describe('review fixes', () => {
  it('create from the template is refused while changes are waiting, and nothing is lost (M1)', async () => {
    let copied = 0
    const { app, fake } = setup({ copy: async () => { copied++; return 'COPY' } })
    seedLedger(fake, 'COPY', { today })
    await app.init()
    await app.db.put(makeOp('add', e('p')))
    app.ops = await app.db.all()
    await app.createFromTemplate()
    expect(app.message).toBe(messages.relinkBlocked(1))
    expect(copied).toBe(0)
    expect(app.sheetId).toBe('S1')
    expect((await app.db.all()).map((o) => o.entryId)).toEqual(['p'])
  })

  it('Re-add on a flagged edit writes the edit, as a deliberate overwrite (M3)', async () => {
    const { app, fake } = setup()
    await app.init()
    const op = await app.db.put({ ...makeOp('edit', e('a', { money: { minor: 2100, currency: 'EUR' } }), e('a')), status: 'flagged', reason: 'RowChanged' })
    app.ops = await app.db.all()
    await app.readd(op)
    await vi.waitFor(() => expect(fake.book('S1').get('Ledger!D2')?.v).toBe(21))
    expect(fake.book('S1').get('Ledger!A3')).toBeUndefined() // no second row
  })

  it('Re-add on a flagged edit of a removed row adds the entry back (M3)', async () => {
    const { app, fake } = setup({ entries: [] })
    await app.init()
    const op = await app.db.put({ ...makeOp('edit', e('gone'), e('gone')), status: 'flagged', reason: 'RowGone' })
    app.ops = await app.db.all()
    await app.readd(op)
    await vi.waitFor(() => expect(fake.book('S1').get('Ledger!A2')?.v).toBe('gone'))
  })
})

describe('signed-in state (drives the Settings buttons)', () => {
  it('is false without a token, true after signing in, false after signing out or when the token expires', async () => {
    let tok: string | null = null
    let expire = () => {}
    const a: Auth = { token: () => tok, signIn: async () => { tok = 't' }, silentSignIn: async () => false, signOut: () => { tok = null }, onExpired: (fn) => { expire = fn }, onExpiring: () => undefined }
    const { app } = setup({ auth: a })
    expect(app.signedIn).toBe(false)
    await app.init()
    await app.reconnect()
    expect(app.signedIn).toBe(true)
    app.signOut()
    expect(app.signedIn).toBe(false)
    await app.reconnect()
    expect(app.signedIn).toBe(true)
    expire()
    expect(app.signedIn).toBe(false)
    expect(app.authExpired).toBe(true)
  })
  it('is true from the start when a token already exists', () => {
    expect(setup().app.signedIn).toBe(true)
  })
})

describe('fixing unreadable rows in the app and links to Sheets', () => {
  it('fixRow writes the corrected entry and the row leaves Needs attention; deleteRow clears a junk row', async () => {
    const { app, fake } = setup()
    fake.book('S1').set('Ledger!B2', 'not a date')
    fake.book('S1').write('Ledger!A3:I3', [['junk1', 'xx', 'expense', 'ten', '', 'junk', 'Groceries', 'Joint']])
    await app.init()
    expect(app.unreadable.map((u) => [u.row, u.id])).toEqual([[2, 'a'], [3, 'junk1']])
    await app.fixRow(e('a', { description: 'fixed' }))
    await app.deleteRow(e('junk1'))
    await vi.waitFor(() => expect(app.unreadable).toEqual([]))
    expect(fake.book('S1').get('Ledger!F2')?.v).toBe('fixed')
    expect(fake.book('S1').get('Ledger!A3')).toBeUndefined()
    expect(app.entries.map((x) => x.id)).toEqual(['a'])
  })
  it('rowUrl, the sheet link and the sheet name appear once the sheet info is loaded', async () => {
    const { app, fake } = setup()
    fake.book('S1').title = 'My ledger'
    await app.init()
    const u = { tab: 'Ledger' as const, row: 7, reason: 'date' as const, text: '' }
    expect(app.rowUrl(u)).toBe('https://docs.google.com/spreadsheets/d/S1/edit')
    await app.loadSheetInfo()
    expect(app.rowUrl(u)).toMatch(/\/edit#gid=\d+&range=A7:I7$/)
    expect(app.sheetLink).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/S1\/edit#gid=\d+/)
    expect(app.sheetName).toBe('My ledger')
  })
  it('does not fetch while signed out, fetches after signing in, and remembers the info on the device', async () => {
    let tok: string | null = null
    const a: Auth = { token: () => tok, signIn: async () => { tok = 't' }, silentSignIn: async () => false, signOut: () => { tok = null }, onExpired: () => undefined, onExpiring: () => undefined }
    const { app, fake, env } = setup({ auth: a })
    fake.book('S1').title = 'My ledger'
    await app.loadSheetInfo()
    expect(fake.count('sheetInfo')).toBe(0)
    expect(app.sheetName).toBe('')
    await app.reconnect()
    await app.loadSheetInfo()
    expect(fake.count('sheetInfo')).toBe(1)
    expect(app.sheetName).toBe('My ledger')
    await app.loadSheetInfo() // once per session
    expect(fake.count('sheetInfo')).toBe(1)
    // a new session that starts signed out still has the name and the tab ids from the device
    const again = new AppState({ ...env, auth: { ...a, token: () => null } })
    await again.loadSheetInfo()
    expect(again.sheetName).toBe('My ledger')
    expect(again.rowUrl({ tab: 'Ledger', row: 3, reason: 'date', text: '' })).toMatch(/#gid=\d+&range=A3:I3$/)
    expect(fake.count('sheetInfo')).toBe(1)
  })
})

describe('fixing a row that has no usable id', () => {
  it('fixRow and deleteRow with the row and the cells shown fix or clear that row', async () => {
    const { app, fake } = setup({ entries: [] })
    fake.book('S1').write('Ledger!A2:I3', [['', 'xx', 'expense', 'ten', '', 'junk', 'Groceries', 'Joint'], ['', 'yy', 'expense', 'nine', '', 'junk2', 'Groceries', 'Joint']])
    await app.init()
    expect(app.unreadable.map((u) => [u.row, u.id])).toEqual([[2, undefined], [3, undefined]])
    const [first, second] = app.unreadable
    await app.fixRow(e('fresh', { description: 'fixed' }), { row: first.row, raw: [...first.raw!] })
    await app.deleteRow(e('x'), { row: second.row, raw: [...second.raw!] })
    await vi.waitFor(() => expect(app.unreadable).toEqual([]))
    expect(app.entries.map((x) => x.id)).toEqual(['fresh'])
    expect(fake.book('S1').get('Ledger!A3')).toBeUndefined()
  })
})

describe('staying signed in without a Reconnect tap', () => {
  const mkAuth = (silent: () => boolean) => {
    let tok: string | null = null
    const a: Auth = {
      token: () => tok, signIn: async () => { tok = 't' },
      silentSignIn: async () => { if (silent()) { tok = 't'; return true } return false },
      signOut: () => { tok = null }, onExpired: () => undefined, onExpiring: () => undefined,
    }
    return a
  }
  it('never tries to sign in silently when the app starts or comes back to the foreground (the browser blocks that window outside a tap)', async () => {
    const a = mkAuth(() => true)
    const spy = vi.spyOn(a, 'silentSignIn')
    const { app } = setup({ auth: a })
    await app.init()
    expect(spy).not.toHaveBeenCalled()
    expect(app.signedIn).toBe(false)
    expect(app.authExpired).toBe(true)
    expect(app.reconnectNeeded).toBe(false) // nothing was tried inside a user tap yet
  })
  it('the first tap of a session tries silently; when it works the app syncs with no banner', async () => {
    const { app, fake } = setup({ auth: mkAuth(() => true) })
    await app.init()
    expect(await app.trySilent(true)).toBe(true)
    expect(app.signedIn).toBe(true)
    expect(app.reconnectNeeded).toBe(false)
    expect(app.status).toBe('ok')
    expect(fake.count('batchGet')).toBeGreaterThan(0)
  })
  it('a refused first tap shows the banner and later taps do not try again', async () => {
    const { app } = setup({ auth: mkAuth(() => false) })
    await app.init()
    await app.trySilent(true)
    expect(app.reconnectNeeded).toBe(true)
    expect(await app.trySilent(true)).toBe(false)
  })
  it('an interactive reconnect clears the banner', async () => {
    const { app } = setup({ auth: mkAuth(() => false) })
    await app.init()
    await app.trySilent(true)
    expect(app.reconnectNeeded).toBe(true)
    await app.reconnect()
    expect(app.signedIn).toBe(true)
    expect(app.reconnectNeeded).toBe(false)
  })
  it('after Sign out, a reload stays signed out: no silent attempt, the banner shows, and only an explicit sign-in clears it', async () => {
    const a = mkAuth(() => true)
    const first = setup({ auth: a })
    await first.app.init()
    await first.app.reconnect()
    first.app.signOut()
    const spy = vi.spyOn(a, 'silentSignIn')
    const again = new AppState(first.env) // a reload: same device storage
    await again.init()
    expect(await again.trySilent(true)).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    expect(again.reconnectNeeded).toBe(true)
    await again.reconnect()
    expect(first.data.get('fitracker.signedOut')).toBe('') // the flag is gone
  })
})

describe('a token for the wrong Google account', () => {
  it('the signed-in account is shown, and cleared on Sign out', async () => {
    const { app, env } = setup()
    env.account = async () => ({ email: 'who@example.test', photoUrl: 'https://p.example.test/x' })
    await app.init()
    await vi.waitFor(() => expect(app.accountEmail).toBe('who@example.test'))
    expect(app.accountPhoto).toBe('https://p.example.test/x')
    app.signOut()
    expect(app.accountEmail).toBe('')
    expect(app.accountPhoto).toBe('')
  })
  it('a 403 permission error drops the token, explains it, and asks to sign in again instead of retrying', async () => {
    let tok: string | null = 't'
    const signOut = vi.fn(() => { tok = null })
    const a: Auth = { token: () => tok, signIn: async () => { tok = 't' }, silentSignIn: async () => true, signOut, onExpired: () => undefined, onExpiring: () => undefined }
    const { app, fake, env } = setup({ auth: a })
    env.account = async () => ({ email: 'who@example.test', photoUrl: 'https://p.example.test/x' })
    fake.batchGet = async () => { throw new ApiError(403, '{"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED"}}') }
    await app.init()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(app.signedIn).toBe(false)
    expect(app.message).toBe(messages.wrongAccount('who@example.test'))
    expect(app.reconnectNeeded).toBe(true)
  })
  it('other API errors keep showing their own message and keep the token', async () => {
    const signOut = vi.fn()
    const { app, fake } = setup({ auth: { ...auth, signOut } })
    fake.batchGet = async () => { throw new ApiError(500, 'boom') }
    await app.init()
    expect(signOut).not.toHaveBeenCalled()
    expect(app.status).toBe('error')
  })
})
