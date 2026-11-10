import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeOp } from './outbox'
import { createOutboxDb, type OutboxDb } from './outboxDb'
import { createReplayer } from './replayer'
import type { Entry } from './rows'
import { createFakeSheets, type FakeSheets } from './sheets/fakeSheets'
import { seedV2 } from './sheets/fixtures'
import { createSheetsStore } from './sheets/sheetsStore'
import type { EntryStore } from './store'

const ID = 'sheet-2024'
const e = (id: string, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2024-01-05', money: { minor: 350, currency: 'EUR' },
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
  seedV2(fake, ID)
  db = createOutboxDb(new IDBFactory())
  store = createSheetsStore(fake, { 2024: ID })
  sleeps = []
})

describe('replayer', () => {
  it('replays in order and sends consecutive adds in one addMany', async () => {
    const s = spy(store)
    await db.put(makeOp('add', 2024, e('a')))
    await db.put(makeOp('add', 2024, e('b')))
    await db.put(makeOp('edit', 2024, e('a', { description: 'Tea' })))
    await db.put(makeOp('add', 2024, e('c')))
    await createReplayer(s.store, db, { sleep }).run()
    expect(s.calls).toEqual(['addMany', 'edit', 'addMany'])
    expect(fake.book(ID).get('Expenses!F10')?.v).toBe('Tea')
    expect(Object.values(await statuses()).every((x) => x === 'done')).toBe(true)
  })

  it('keeps the sheet values an edit overwrote, for undo', async () => {
    await db.put(makeOp('add', 2024, e('a')))
    await db.put(makeOp('edit', 2024, e('a', { description: 'Tea' })))
    await createReplayer(store, db, { sleep }).run()
    const edit = (await db.all()).find((o) => o.type === 'edit')!
    expect(edit.previous?.description).toBe('Coffee')
  })

  it.each([
    ['edit', 'RowGone'],
    ['delete', 'RowGone'],
  ] as const)('flags a %s of a missing row as %s and never retries it', async (type, reason) => {
    const s = spy(store)
    await db.put(makeOp(type, 2024, e('ghost')))
    const r = createReplayer(s.store, db, { sleep })
    await r.run()
    await r.run()
    expect(s.calls).toEqual([type])
    expect(await statuses()).toEqual({ [`ghost:${type}`]: `flagged/${reason}` })
  })

  it('flags an edit of a row that now holds another entry as RowChanged', async () => {
    seedV2(fake, ID, { entries: [{ row: 10, entry: e('a', { date: '2024-03-03', description: 'Rent', money: { minor: 9900, currency: 'EUR' } }) }] })
    await db.put(makeOp('edit', 2024, e('a', { description: 'Tea' }), e('a')))
    await createReplayer(store, db, { sleep }).run()
    expect(await statuses()).toEqual({ 'a:edit': 'flagged/RowChanged' })
  })

  it('flags an add to a full tab as TabFull and does not retry', async () => {
    fake.book(ID).write('Expenses!A10:A1000', Array.from({ length: 991 }, () => ['x']))
    const s = spy(store)
    await db.put(makeOp('add', 2024, e('a')))
    const r = createReplayer(s.store, db, { sleep })
    await r.run()
    await r.run()
    expect(s.calls).toEqual(['addMany'])
    expect(await statuses()).toEqual({ 'a:add': 'flagged/TabFull' })
  })

  it('flags a saved entry that later disappears from the sheet as Missing', async () => {
    await db.put(makeOp('add', 2024, e('a')))
    const r = createReplayer(store, db, { sleep })
    await r.run()
    fake.book(ID).clear('Expenses!A10:I10')
    await r.verify(2024)
    expect(await statuses()).toEqual({ 'a:add': 'flagged/Missing' })
  })

  it('does not flag an entry the user deleted afterwards', async () => {
    await db.put(makeOp('add', 2024, e('a')))
    await db.put(makeOp('delete', 2024, e('a')))
    const r = createReplayer(store, db, { sleep })
    await r.run()
    await r.verify(2024)
    expect(Object.values(await statuses()).every((x) => x === 'done')).toBe(true)
  })

  it('pauses on an expired token, keeps the op, and sends it exactly once after reconnecting', async () => {
    await db.put(makeOp('add', 2024, e('a')))
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
    const rows = await fake.batchGet(ID, ['Expenses!A10:A12'])
    expect(rows[0]).toEqual([['a']])
  })

  it('backs off on 429 and then succeeds', async () => {
    await db.put(makeOp('add', 2024, e('a')))
    fake.failNext(429)
    await createReplayer(store, db, { sleep }).run()
    expect(sleeps).toHaveLength(1)
    expect(await statuses()).toEqual({ 'a:add': 'done' })
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
    await db.put(makeOp('add', 2024, e('a')))
    await db.put(makeOp('add', 2024, e('b')))
    await Promise.all([createReplayer(slow, db, { sleep, locks }).run(), createReplayer(slow, db, { sleep, locks }).run()])
    expect(maxActive).toBe(1)
    const rows = (await fake.batchGet(ID, ['Expenses!A10:A12']))[0]
    expect(rows).toEqual([['a'], ['b']])
  })
})
