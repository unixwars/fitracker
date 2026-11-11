import { describe, expect, it } from 'vitest'
import { applyPending, makeOp, pendingForYear, undo, type Op } from './outbox'
import type { Entry } from './rows'

const e = (id: string, o: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2024-01-05', money: { minor: 100, currency: 'EUR' }, description: 'x', category: 'Bills', account: 'Joint', ...o,
})
const withSeq = (ops: Op[]) => ops.map((o, i) => ({ ...o, seq: i + 1 }))

describe('applyPending', () => {
  it('shows pending adds and edits and hides pending deletes', () => {
    const base = [e('a'), e('b')]
    const ops = withSeq([
      makeOp('add', 2024, e('c')),
      makeOp('edit', 2024, e('a', { description: 'edited' })),
      makeOp('delete', 2024, e('b')),
    ])
    const out = applyPending(base, ops)
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'c'])
    expect(out.find((x) => x.id === 'a')!.description).toBe('edited')
  })
  it('ignores ops that are done or flagged and does not duplicate an entry already in the list', () => {
    const done = { ...makeOp('add', 2024, e('c')), status: 'done' as const }
    const flagged = { ...makeOp('delete', 2024, e('a')), status: 'flagged' as const }
    expect(applyPending([e('a')], withSeq([done, flagged])).map((x) => x.id)).toEqual(['a'])
    expect(applyPending([e('c')], withSeq([makeOp('add', 2024, e('c'))]))).toHaveLength(1)
  })
  it('applies ops in order', () => {
    const ops = withSeq([makeOp('add', 2024, e('c')), makeOp('delete', 2024, e('c'))])
    expect(applyPending([], ops)).toEqual([])
  })
})

describe('undo', () => {
  it('re-adds a deleted entry from its previous values as a fresh op', () => {
    const op = { ...makeOp('delete', 2024, e('a')), status: 'done' as const, previous: e('a', { description: 'old' }) }
    const u = undo(op)
    expect(u).toMatchObject({ type: 'add', status: 'pending', entryId: 'a', year: 2024, kind: 'expense' })
    expect(u.entry!.description).toBe('old')
    expect(u.opId).not.toBe(op.opId)
  })
  it('restores the previous values of an edit', () => {
    const op = { ...makeOp('edit', 2024, e('a', { description: 'new' })), status: 'done' as const, previous: e('a', { description: 'old' }) }
    expect(undo(op)).toMatchObject({ type: 'edit', entry: { description: 'old' } })
  })
  it('deletes what an add created', () => {
    expect(undo({ ...makeOp('add', 2024, e('a')), status: 'done' as const })).toMatchObject({ type: 'delete', entryId: 'a' })
  })
})

describe('pendingForYear', () => {
  it('counts only pending ops of that year', () => {
    const mk = (year: number, status: Op['status']) => ({ ...makeOp('add', year, e('a')), status })
    expect(pendingForYear([mk(2024, 'pending'), mk(2024, 'done'), mk(2024, 'flagged'), mk(2023, 'pending')], 2024)).toBe(1)
  })
})
