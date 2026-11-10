import type { Entry, Kind } from './rows'

export type OpType = 'add' | 'edit' | 'delete'
export type OpReason = 'RowGone' | 'RowChanged' | 'TabFull' | 'Missing' | 'Other'
export type Op = {
  opId: string
  seq?: number // assigned by the outbox database; defines replay order
  year: number
  kind: Kind
  entryId: string
  type: OpType
  entry?: Entry
  previous?: Entry // before sending: what the user saw; after sending: what the sheet held
  status: 'pending' | 'done' | 'flagged'
  reason?: OpReason
  undone?: boolean // set once an Undo op has been queued for it
  at: number
}

export function makeOp(type: OpType, year: number, entry: Entry, previous?: Entry): Op {
  return { opId: crypto.randomUUID(), year, kind: entry.kind, entryId: entry.id, type, entry, previous, status: 'pending', at: Date.now() }
}

// Optimistic view: cached rows with the pending ops laid over them, in replay order.
export function applyPending(entries: Entry[], ops: Op[]): Entry[] {
  let out = [...entries]
  for (const op of [...ops].filter((o) => o.status === 'pending').sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
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

// The inverse of a completed op, as a fresh pending op.
export function undo(op: Op): Op {
  if (op.type === 'add') return makeOp('delete', op.year, op.entry!)
  const before = op.previous ?? op.entry!
  return makeOp(op.type === 'delete' ? 'add' : 'edit', op.year, before)
}
