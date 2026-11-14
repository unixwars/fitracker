import { describe, expect, it } from 'vitest'
import { applyPending, makeOp, makeRepairOp, pendingCount, makeSnapshotOp, undo, type Op } from './outbox'
import type { Entry } from './rows'

const e = (id: string, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2024-01-05', money: { minor: 100, currency: 'EUR' }, description: 'x', category: 'Bills', account: 'Joint', ...o,
})
const withSeq = (ops: Op[]) => ops.map((o, i) => ({ ...o, seq: i + 1 }))

describe('applyPending', () => {
  it('shows pending adds and edits and hides pending deletes', () => {
    const base = [e('a'), e('b')]
    const ops = withSeq([
      makeOp('add', e('c')),
      makeOp('edit', e('a', { description: 'edited' })),
      makeOp('delete', e('b')),
    ])
    const out = applyPending(base, ops)
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'c'])
    expect(out.find((x) => x.id === 'a')!.description).toBe('edited')
  })
  it('ignores ops that are done or flagged and does not duplicate an entry already in the list', () => {
    const done = { ...makeOp('add', e('c')), status: 'done' as const }
    const flagged = { ...makeOp('delete', e('a')), status: 'flagged' as const }
    expect(applyPending([e('a')], withSeq([done, flagged])).map((x) => x.id)).toEqual(['a'])
    expect(applyPending([e('c')], withSeq([makeOp('add', e('c'))]))).toHaveLength(1)
  })
  it('applies ops in order', () => {
    const ops = withSeq([makeOp('add', e('c')), makeOp('delete', e('c'))])
    expect(applyPending([], ops)).toEqual([])
  })
})

describe('undo', () => {
  it('re-adds a deleted entry from its previous values as a fresh op', () => {
    const op = { ...makeOp('delete', e('a')), status: 'done' as const, previous: e('a', { description: 'old' }) }
    const u = undo(op)
    expect(u).toMatchObject({ type: 'add', status: 'pending', entryId: 'a', subject: 'entry' })
    expect(u.entry!.description).toBe('old')
    expect(u.opId).not.toBe(op.opId)
  })
  it('restores the previous values of an edit', () => {
    const op = { ...makeOp('edit', e('a', { description: 'new' })), status: 'done' as const, previous: e('a', { description: 'old' }) }
    expect(undo(op)).toMatchObject({ type: 'edit', entry: { description: 'old' } })
  })
  it('deletes what an add created', () => {
    expect(undo({ ...makeOp('add', e('a')), status: 'done' as const })).toMatchObject({ type: 'delete', entryId: 'a' })
  })
})

describe('snapshot ops', () => {
  const snap = { id: 's1', date: '2026-10-31', account: 'Joint', balance: { minor: 100, currency: 'EUR' as const }, note: '' }
  it('applyPending ignores them', () => {
    expect(applyPending([e('a')], withSeq([makeSnapshotOp('add', snap)])).map((x) => x.id)).toEqual(['a'])
  })
  it('a snapshot add undoes to a snapshot delete of the same id', () => {
    expect(undo({ ...makeSnapshotOp('add', snap), status: 'done' })).toMatchObject({ subject: 'snapshot', type: 'delete', entryId: 's1' })
  })
  it('a snapshot delete undoes to an add of what the sheet held', () => {
    const op = { ...makeSnapshotOp('delete', snap), status: 'done' as const, previousSnapshot: { ...snap, note: 'held' } }
    expect(undo(op)).toMatchObject({ type: 'add', snapshot: { id: 's1', note: 'held' } })
  })
})

describe('pendingCount', () => {
  it('counts only pending ops', () => {
    const mk = (status: Op['status']) => ({ ...makeOp('add', e('a')), status })
    expect(pendingCount([mk('pending'), mk('done'), mk('flagged'), mk('pending')])).toBe(2)
  })
})

describe('repair ops (fixing a row the app could not read)', () => {
  it('are edits or deletes marked repair, with no previous values', () => {
    expect(makeRepairOp('edit', e('a'))).toMatchObject({ subject: 'entry', type: 'edit', repair: true, previous: undefined, status: 'pending' })
    expect(makeRepairOp('delete', e('a'))).toMatchObject({ type: 'delete', repair: true, previous: e('a') })
  })
  it('a repair by row keeps the row and the cells that were shown', () => {
    const op = makeRepairOp('edit', e('a'), { row: 7, raw: ['', 'xx'] })
    expect(op.repairAt).toEqual({ row: 7, raw: ['', 'xx'] })
  })
  it('a pending repair edit shows the fixed entry in the optimistic view', () => {
    expect(applyPending([], withSeq([makeRepairOp('edit', e('a'))])).map((x) => x.id)).toEqual(['a'])
  })
})
