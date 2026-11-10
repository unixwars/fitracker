import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { makeOp } from './outbox'
import { createOutboxDb } from './outboxDb'
import type { Entry } from './rows'

const e = (id: string): Entry => ({ id, kind: 'expense', date: '2024-01-05', money: { minor: 1, currency: 'EUR' }, description: '' })

describe('outbox database', () => {
  it('gives every op saved at the same moment its own sequence number', async () => {
    const db = createOutboxDb(new IDBFactory())
    await Promise.all(Array.from({ length: 20 }, (_, i) => db.put(makeOp('add', 2024, e('e' + i)))))
    const seqs = (await db.all()).map((o) => o.seq)
    expect(new Set(seqs).size).toBe(20)
  })
  it('does not lose either of two concurrent updates to the same op', async () => {
    const db = createOutboxDb(new IDBFactory())
    const op = await db.put(makeOp('add', 2024, e('a')))
    await Promise.all([db.update(op.opId, { undone: true }), db.update(op.opId, { status: 'flagged', reason: 'Missing' })])
    expect((await db.all())[0]).toMatchObject({ undone: true, status: 'flagged', reason: 'Missing' })
  })
  it('prunes finished ops older than the cutoff but keeps pending and flagged ones', async () => {
    const db = createOutboxDb(new IDBFactory())
    const old = Date.now() - 40 * 86_400_000
    await db.put({ ...makeOp('add', 2024, e('old-done')), status: 'done', at: old })
    await db.put({ ...makeOp('add', 2024, e('old-flag')), status: 'flagged', at: old })
    await db.put({ ...makeOp('add', 2024, e('old-pending')), at: old })
    await db.put({ ...makeOp('add', 2024, e('new-done')), status: 'done' })
    await db.prune(30 * 86_400_000)
    expect((await db.all()).map((o) => o.entryId).sort()).toEqual(['new-done', 'old-flag', 'old-pending'])
  })
})
