import type { Entry } from './rows'
import type { Snapshot } from './types'

export type OpType = 'add' | 'edit' | 'delete'
export type OpReason = 'RowGone' | 'RowChanged' | 'AccountChanged' | 'Missing' | 'Other'
export type Op = {
  opId: string
  seq?: number // assigned by the outbox database; defines replay order
  subject: 'entry' | 'snapshot'
  entryId: string // the snapshot id for snapshot ops
  type: OpType
  entry?: Entry
  previous?: Entry // before sending: what the user saw; after sending: what the sheet held
  snapshot?: Snapshot
  previousSnapshot?: Snapshot // set once a snapshot delete has been sent: what the sheet held
  status: 'pending' | 'done' | 'flagged'
  reason?: OpReason
  undone?: boolean // true while its Undo is in effect: the row then offers Redo; Undo and Redo toggle this and never add log entries
  undoOf?: string // set on the op an Undo or Redo queued: it is hidden from Recent changes (the original row carries the state)
  repair?: boolean // fixes or removes a row the app could not read, found by its id (no undo)
  repairAt?: { row: number; raw: unknown[] } // a row without a usable id: found by row, only while it still holds `raw`
  doneAt?: number // when the sheet accepted it; the 7-day verification window counts from here
  attempts?: number // runs that failed for an unknown reason; flagged as Other after a few
  at: number
}

export function makeOp(type: OpType, entry: Entry, previous?: Entry): Op {
  return { opId: crypto.randomUUID(), subject: 'entry', entryId: entry.id, type, entry, previous, status: 'pending', at: Date.now() }
}

export function makeRepairOp(type: 'edit' | 'delete', entry: Entry, repairAt?: { row: number; raw: unknown[] }): Op {
  return { ...makeOp(type, entry, type === 'delete' ? entry : undefined), repair: true, ...(repairAt ? { repairAt } : {}) }
}

export function makeSnapshotOp(type: 'add' | 'delete', snapshot: Snapshot): Op {
  return { opId: crypto.randomUUID(), subject: 'snapshot', entryId: snapshot.id, type, snapshot, status: 'pending', at: Date.now() }
}

// Optimistic view: cached rows with the pending ops laid over them, in replay order.
export function applyPending(entries: Entry[], ops: Op[]): Entry[] {
  let out = [...entries]
  for (const op of [...ops].filter((o) => o.status === 'pending' && o.subject === 'entry').sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    const i = out.findIndex((e) => e.id === op.entryId)
    if (op.type === 'delete') {
      if (i >= 0) out.splice(i, 1)
    } else if (op.entry) {
      if (i >= 0) out[i] = op.entry
      else out = [...out, op.entry]
    }
  }
  return out
}

// Re-applies an undone op, as a fresh pending op.
export function redo(op: Op): Op {
  if (op.subject === 'snapshot') return makeSnapshotOp(op.type as 'add' | 'delete', op.snapshot!)
  return makeOp(op.type, op.entry!, op.type === 'delete' ? op.entry : undefined)
}

// The inverse of a completed op, as a fresh pending op.
export function undo(op: Op): Op {
  if (op.subject === 'snapshot') {
    if (op.type === 'add') return makeSnapshotOp('delete', op.snapshot!)
    return makeSnapshotOp('add', op.previousSnapshot ?? op.snapshot!)
  }
  if (op.type === 'add') return makeOp('delete', op.entry!)
  const before = op.previous ?? op.entry!
  return makeOp(op.type === 'delete' ? 'add' : 'edit', before)
}

// Changes still waiting to reach the sheet. Unlinking or relinking is refused meanwhile.
export const pendingCount = (ops: Op[]): number => ops.filter((o) => o.status === 'pending').length
