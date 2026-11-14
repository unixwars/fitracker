// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { AppState, type Env } from './app.svelte'
import type { Auth } from './auth'
import { messages } from './messages'
import { makeOp } from './outbox'
import { ledgerRowValues, todayLocal, type Entry } from './rows'
import { META_KEY } from './schema'
import { createFakeSheets, type FakeSheets } from './sheets/fakeSheets'
import { seedLedger, seedV0 } from './sheets/fixtures'

const today = todayLocal()
const e = (id: string, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: today, money: { minor: 350, currency: 'EUR' }, description: 'Coffee', category: 'Groceries', account: 'Joint', ...o,
})
const auth: Auth = { token: () => 'tok', signIn: async () => undefined, signOut: () => undefined, onExpired: () => undefined }

function setup(opts: { linked?: boolean; entries?: Entry[]; pick?: string | null } = {}) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today, entries: opts.entries ?? [e('a')] })
  const data = new Map<string, string>(opts.linked === false ? [] : [['fitracker.sheet', 'S1']])
  const idb = new IDBFactory()
  const env: Env = { storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }, idb, api: fake, auth, pick: async () => opts.pick ?? 'S1' }
  return { fake, env, data, idb, app: new AppState(env) }
}
const writes = (fake: FakeSheets) => ['valuesBatchUpdate', 'valuesAppend', 'valuesBatchClear', 'setMetadata', 'applyOps'].reduce((n, m) => n + fake.count(m), 0)

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
    const { app, fake } = setup({ entries: [] })
    await app.init()
    await app.save(e('n1'), {})
    expect(app.displayed.map((x) => x.id)).toEqual(['n1'])
    await vi.waitFor(() => expect(app.pendingCount).toBe(0))
    await app.sync()
    expect(fake.count('valuesAppend')).toBe(1)
    expect(app.entries.map((x) => x.id)).toEqual(['n1'])
    expect(app.displayed).toHaveLength(1)
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
    seedV0(fake, 'LEGACY')
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
    seedV0(fake, 'LEGACY')
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
