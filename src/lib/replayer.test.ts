import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimited } from './errors'
import { makeOp, makeSnapshotOp } from './outbox'
import { createOutboxDb, type OutboxDb } from './outboxDb'
import { createReplayer } from './replayer'
import type { Entry } from './rows'
import { createFakeSheets, type FakeSheets } from './sheets/fakeSheets'
import { seedLedger } from './sheets/fixtures'
import { createLedgerStore } from './sheets/ledgerStore'
import type { EntryStore } from './store'
import type { Snapshot } from './types'

const ID = 'S1'
const e = (id: string, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2026-10-05', money: { minor: 350, currency: 'EUR' },
  description: 'Coffee', place: 'Cafe', category: 'Groceries', account: 'Joint', ...o,
})

let fake: FakeSheets
let db: OutboxDb
let store: EntryStore
let sleeps: number[]
const sleep = async (ms: number) => { sleeps.push(ms) }

function spy(inner: EntryStore) {
  const calls: string[] = []
  const wrap = <K extends 'addMany' | 'edit' | 'delete'>(k: K) =>
    (async (...a: Parameters<EntryStore[K]>) => { calls.push(k); return (inner[k] as (...x: unknown[]) => unknown)(...a) }) as EntryStore[K]
  return { store: { ...inner, addMany: wrap('addMany'), edit: wrap('edit'), delete: wrap('delete') } as EntryStore, calls }
}
const statuses = async () => Object.fromEntries((await db.all()).map((o) => [o.entryId + ':' + o.type, o.status + (o.reason ? '/' + o.reason : '')]))

beforeEach(() => {
  fake = createFakeSheets()
  seedLedger(fake, ID, { today: '2026-11-12' })
  db = createOutboxDb(new IDBFactory())
  store = createLedgerStore(fake, ID, { now: () => 1000 })
  sleeps = []
})

describe('replayer', () => {
  it('replays in order and sends consecutive adds in one addMany', async () => {
    const s = spy(store)
    await db.put(makeOp('add', e('a')))
    await db.put(makeOp('add', e('b')))
    await db.put(makeOp('edit', e('a', { description: 'Tea' })))
    await db.put(makeOp('add', e('c')))
    await createReplayer(s.store, db, { sleep }).run()
    expect(s.calls).toEqual(['addMany', 'edit', 'addMany'])
    expect(fake.book(ID).get('Ledger!F2')?.v).toBe('Tea')
    expect(Object.values(await statuses()).every((x) => x === 'done')).toBe(true)
  })

  it('keeps the sheet values an edit overwrote, for undo', async () => {
    await db.put(makeOp('add', e('a')))
    await db.put(makeOp('edit', e('a', { description: 'Tea' })))
    await createReplayer(store, db, { sleep }).run()
    const edit = (await db.all()).find((o) => o.type === 'edit')!
    expect(edit.previous?.description).toBe('Coffee')
  })

  it.each([
    ['edit', 'RowGone'],
    ['delete', 'RowGone'],
  ] as const)('flags a %s of a missing row as %s and never retries it', async (type, reason) => {
    const s = spy(store)
    await db.put(makeOp(type, e('ghost')))
    const r = createReplayer(s.store, db, { sleep })
    await r.run()
    await r.run()
    expect(s.calls).toEqual([type])
    expect(await statuses()).toEqual({ [`ghost:${type}`]: `flagged/${reason}` })
  })

  it('flags an edit of a row that now holds another entry as RowChanged', async () => {
    seedLedger(fake, ID, { today: '2026-11-12', entries: [e('a', { date: '2026-03-03', description: 'Rent', money: { minor: 9900, currency: 'EUR' } })] })
    await db.put(makeOp('edit', e('a', { description: 'Tea' }), e('a')))
    await createReplayer(store, db, { sleep }).run()
    expect(await statuses()).toEqual({ 'a:edit': 'flagged/RowChanged' })
  })

  it('flags an add whose currency no longer matches the account as AccountChanged and does not retry', async () => {
    const s = spy(store)
    await db.put(makeOp('add', e('a', { money: { minor: 100, currency: 'GBP' } })))
    const r = createReplayer(s.store, db, { sleep })
    await r.run()
    await r.run()
    expect(s.calls).toEqual(['addMany'])
    expect(await statuses()).toEqual({ 'a:add': 'flagged/AccountChanged' })
  })

  it('a snapshot op between two entry adds splits the group and keeps the order', async () => {
    const s = spy(store)
    const snap: Snapshot = { id: 's1', date: '2026-10-31', account: 'Joint', balance: { minor: 5000, currency: 'EUR' }, note: '' }
    await db.put(makeOp('add', e('a')))
    await db.put(makeSnapshotOp('add', snap))
    await db.put(makeOp('add', e('b')))
    await createReplayer(s.store, db, { sleep }).run()
    expect(s.calls).toEqual(['addMany', 'addMany'])
    expect(fake.book(ID).get('Snapshots!A2')?.v).toBe('s1')
    expect(Object.values(await statuses()).every((x) => x === 'done')).toBe(true)
  })

  it('a snapshot delete of a missing row is flagged RowGone; a delete remembers what the sheet held', async () => {
    const snap: Snapshot = { id: 's1', date: '2026-10-31', account: 'Joint', balance: { minor: 5000, currency: 'EUR' }, note: '' }
    await db.put(makeSnapshotOp('delete', { ...snap, id: 'ghost' }))
    await createReplayer(store, db, { sleep }).run()
    expect(await statuses()).toEqual({ 'ghost:delete': 'flagged/RowGone' })
    await db.put(makeSnapshotOp('add', snap))
    await db.put(makeSnapshotOp('delete', snap))
    await createReplayer(store, db, { sleep }).run()
    const del = (await db.all()).find((o) => o.entryId === 's1' && o.type === 'delete')!
    expect(del).toMatchObject({ status: 'done', previousSnapshot: { id: 's1', balance: { minor: 5000 } } })
  })

  it('flags a saved entry that later disappears from the sheet as Missing', async () => {
    await db.put(makeOp('add', e('a')))
    const r = createReplayer(store, db, { sleep })
    await r.run()
    fake.book(ID).clear('Ledger!A2:I2')
    await r.verify()
    expect(await statuses()).toEqual({ 'a:add': 'flagged/Missing' })
  })

  it('does not flag an entry the user deleted afterwards', async () => {
    await db.put(makeOp('add', e('a')))
    await db.put(makeOp('delete', e('a')))
    const r = createReplayer(store, db, { sleep })
    await r.run()
    await r.verify()
    expect(Object.values(await statuses()).every((x) => x === 'done')).toBe(true)
  })

  it('pauses on an expired token, keeps the op, and sends it exactly once after reconnecting', async () => {
    await db.put(makeOp('add', e('a')))
    const expired = vi.fn()
    const r = createReplayer(store, db, { sleep })
    r.onAuthExpired(expired)
    fake.failNext(401)
    await r.run()
    expect(expired).toHaveBeenCalledTimes(1)
    expect(await statuses()).toEqual({ 'a:add': 'pending' })
    await r.run()
    await r.run()
    expect(await statuses()).toEqual({ 'a:add': 'done' })
    const rows = await fake.batchGet(ID, ['Ledger!A2:A4'])
    expect(rows[0]).toEqual([['a']])
  })

  it('backs off on 429 and then succeeds', async () => {
    await db.put(makeOp('add', e('a')))
    fake.failNext(429)
    await createReplayer(store, db, { sleep }).run()
    expect(sleeps).toHaveLength(1)
    expect(await statuses()).toEqual({ 'a:add': 'done' })
  })

  it('flags an op that keeps failing for an unknown reason so the queue is not blocked forever', async () => {
    const broken: EntryStore = { ...store, edit: async () => { throw new Error('400 tab renamed') } }
    await db.put(makeOp('edit', e('x')))
    await db.put(makeOp('add', e('z')))
    const r = createReplayer(broken, db, { sleep })
    await r.run()
    await r.run()
    expect(await statuses()).toMatchObject({ 'x:edit': 'pending', 'z:add': 'pending' })
    await r.run()
    expect(await statuses()).toEqual({ 'x:edit': 'flagged/Other', 'z:add': 'done' })
  })

  it('backs off exponentially when rate limited and does not refresh during a run', async () => {
    let n = 0
    const limited: EntryStore = { ...store, addMany: async (...a) => { if (n++ < 2) throw new RateLimited(100); return store.addMany(...a) } }
    const refresh = vi.spyOn(limited, 'refresh')
    await db.put(makeOp('add', e('a')))
    await db.put(makeOp('edit', e('a', { description: 'Tea' })))
    await createReplayer(limited, db, { sleep }).run()
    expect(sleeps).toEqual([100, 200])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('never lets two replayers send at the same time when they share a lock', async () => {
    let active = 0
    let maxActive = 0
    const inner = spy(store).store
    const slow: EntryStore = {
      ...inner,
      addMany: async (...a) => { active++; maxActive = Math.max(maxActive, active); await new Promise((r) => setTimeout(r, 5)); try { return await inner.addMany(...a) } finally { active-- } },
    }
    let tail = Promise.resolve()
    const locks = { request: (_n: string, cb: () => Promise<unknown>) => { const p = tail.then(cb); tail = p.then(() => undefined, () => undefined); return p } } as unknown as LockManager
    await db.put(makeOp('add', e('a')))
    await db.put(makeOp('add', e('b')))
    await Promise.all([createReplayer(slow, db, { sleep, locks }).run(), createReplayer(slow, db, { sleep, locks }).run()])
    expect(maxActive).toBe(1)
    const rows = (await fake.batchGet(ID, ['Ledger!A2:A4']))[0]
    expect(rows).toEqual([['a'], ['b']])
  })
})
