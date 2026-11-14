import { AccountChanged, AuthExpired, NewerThanApp, RateLimited, RowChanged, RowGone, UnrecognisedLayout } from './errors'
import type { Op, OpReason } from './outbox'
import type { OutboxDb } from './outboxDb'
import type { EntryStore } from './store'

export type ReplayerOptions = { locks?: LockManager; sleep?: (ms: number) => Promise<void> }
type Patch = [opId: string, patch: Partial<Op>]

const MAX_RETRIES = 5
const MAX_ATTEMPTS = 3
const VERIFY_WINDOW_MS = 7 * 24 * 3600 * 1000

export function createReplayer(store: EntryStore, db: OutboxDb, opts: ReplayerOptions = {}) {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const locks = opts.locks ?? (typeof navigator !== 'undefined' ? navigator.locks : undefined)
  const authHandlers: (() => void)[] = []

  const withLock = <T>(fn: () => Promise<T>): Promise<T> => (locks ? (locks.request('fitracker-replay', fn) as Promise<T>) : fn())
  const flag = (op: Op, reason: OpReason): Patch => [op.opId, { status: 'flagged', reason }]

  // Consecutive entry adds travel together; everything else (edits, deletes, snapshot ops) is sent one by one.
  function groups(pending: Op[]): Op[][] {
    const out: Op[][] = []
    for (const op of pending) {
      const last = out[out.length - 1]
      if (op.subject === 'entry' && op.type === 'add' && last && last[0].subject === 'entry' && last[0].type === 'add') last.push(op)
      else out.push([op])
    }
    return out
  }

  async function attempt(group: Op[]): Promise<Patch[]> {
    const first = group[0]
    if (first.subject === 'entry' && first.type === 'add') {
      const results = await store.addMany(group.map((o) => o.entry!))
      return group.map((op, i): Patch => (results[i].ok ? [op.opId, { status: 'done' }] : flag(op, results[i].reason ?? 'Other')))
    }
    try {
      if (first.subject === 'snapshot') {
        if (first.type === 'add') {
          const r = await store.addSnapshot(first.snapshot!)
          return [r.ok ? [first.opId, { status: 'done' }] : flag(first, r.reason ?? 'Other')]
        }
        const { previous } = await store.deleteSnapshot(first.entryId)
        return [[first.opId, { status: 'done', previousSnapshot: previous }]]
      }
      const { previous } = first.type === 'edit'
        ? await store.edit(first.entry!, first.previous)
        : await store.delete(first.entryId, first.previous)
      return [[first.opId, { status: 'done', previous }]]
    } catch (err) {
      if (err instanceof RowGone) return [flag(first, 'RowGone')]
      if (err instanceof RowChanged) return [flag(first, 'RowChanged')]
      if (err instanceof AccountChanged) return [flag(first, 'AccountChanged')]
      throw err
    }
  }

  // An unknown failure keeps the ops pending and stops this run (order matters). After a few runs
  // it is flagged so one bad op cannot block the queue forever.
  async function recordFailure(group: Op[]): Promise<boolean> {
    let flagged = true
    for (const op of group) {
      const attempts = (op.attempts ?? 0) + 1
      if (attempts >= MAX_ATTEMPTS) await db.update(op.opId, { attempts, status: 'flagged', reason: 'Other' })
      else {
        await db.update(op.opId, { attempts })
        flagged = false
      }
    }
    return flagged
  }

  async function send(group: Op[]): Promise<boolean> {
    for (let tries = 0; tries <= MAX_RETRIES; tries++) {
      try {
        const patches = await attempt(group)
        for (const [id, patch] of patches) await db.update(id, patch.status === 'done' ? { ...patch, doneAt: Date.now() } : patch)
        return true
      } catch (err) {
        if (err instanceof AuthExpired) {
          authHandlers.forEach((h) => h())
          return false
        }
        // The sheet is not writable by this app version: nothing was written, so the ops wait (the screen shows why).
        if (err instanceof NewerThanApp || err instanceof UnrecognisedLayout) return false
        if (err instanceof RateLimited) {
          await sleep(err.retryAfterMs * 2 ** tries)
          continue
        }
        return recordFailure(group)
      }
    }
    return false
  }

  return {
    onAuthExpired(fn: () => void) { authHandlers.push(fn) },

    run(): Promise<void> {
      return withLock(async () => {
        const pending = (await db.all()).filter((o) => o.status === 'pending')
        for (const g of groups(pending)) if (!(await send(g))) break
      })
    },

    /** Flags saved entries that are no longer in the sheet (overwritten by a racing write, or removed). */
    async verify(): Promise<void> {
      const ops = await db.all()
      const since = Date.now() - VERIFY_WINDOW_MS
      const removedLater = (op: Op) => ops.some((o) => o.entryId === op.entryId && o.type === 'delete' && o.status !== 'flagged' && (o.seq ?? 0) > (op.seq ?? 0))
      const saved = ops.filter((o) => o.status === 'done' && o.type !== 'delete' && (o.doneAt ?? o.at) >= since && !removedLater(o))
      if (!saved.length) return
      const { missingIds } = await store.refresh({ expectIds: [...new Set(saved.map((o) => o.entryId))] })
      for (const op of saved) if (missingIds.includes(op.entryId)) await db.update(op.opId, { status: 'flagged', reason: 'Missing' })
    },
  }
}
