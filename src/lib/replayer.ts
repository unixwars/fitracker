import { AuthExpired, RateLimited, RowChanged, RowGone } from './errors'
import type { Op, OpReason } from './outbox'
import type { OutboxDb } from './outboxDb'
import type { EntryStore } from './store'

export type ReplayerOptions = { locks?: LockManager; sleep?: (ms: number) => Promise<void> }
type Patch = [opId: string, patch: Partial<Op>]

const MAX_RETRIES = 5
const VERIFY_WINDOW_MS = 7 * 24 * 3600 * 1000

export function createReplayer(store: EntryStore, db: OutboxDb, opts: ReplayerOptions = {}) {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const locks = opts.locks ?? (typeof navigator !== 'undefined' ? navigator.locks : undefined)
  const authHandlers: (() => void)[] = []

  const withLock = <T>(fn: () => Promise<T>): Promise<T> => (locks ? (locks.request('fitracker-replay', fn) as Promise<T>) : fn())
  const flag = (op: Op, reason: OpReason): Patch => [op.opId, { status: 'flagged', reason }]

  // Consecutive adds for the same year travel together; everything else is sent one by one.
  function groups(pending: Op[]): Op[][] {
    const out: Op[][] = []
    for (const op of pending) {
      const last = out[out.length - 1]
      if (op.type === 'add' && last && last[0].type === 'add' && last[0].year === op.year) last.push(op)
      else out.push([op])
    }
    return out
  }

  async function attempt(group: Op[]): Promise<Patch[]> {
    const first = group[0]
    if (first.type === 'add') {
      const results = await store.addMany(first.year, group.map((o) => o.entry!))
      return group.map((op, i): Patch => (results[i].ok ? [op.opId, { status: 'done' }] : flag(op, results[i].reason ?? 'Other')))
    }
    try {
      const { previous } = first.type === 'edit'
        ? await store.edit(first.year, first.entry!, first.previous)
        : await store.delete(first.year, first.kind, first.entryId, first.previous)
      return [[first.opId, { status: 'done', previous }]]
    } catch (err) {
      if (err instanceof RowGone) return [flag(first, 'RowGone')]
      if (err instanceof RowChanged) return [flag(first, 'RowChanged')]
      throw err
    }
  }

  async function send(group: Op[]): Promise<boolean> {
    for (let tries = 0; tries <= MAX_RETRIES; tries++) {
      try {
        const patches = await attempt(group)
        await store.refresh(group[0].year, { force: true }).catch(() => undefined)
        for (const [id, patch] of patches) await db.update(id, patch)
        return true
      } catch (err) {
        if (err instanceof AuthExpired) {
          authHandlers.forEach((h) => h())
          return false
        }
        if (err instanceof RateLimited) {
          await sleep(err.retryAfterMs)
          continue
        }
        return false // unknown failure: leave the ops pending, keep order, try again later
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
    async verify(year: number): Promise<void> {
      const ops = await db.all()
      const since = Date.now() - VERIFY_WINDOW_MS
      const removedLater = (op: Op) => ops.some((o) => o.entryId === op.entryId && o.type === 'delete' && o.status !== 'flagged' && (o.seq ?? 0) > (op.seq ?? 0))
      const saved = ops.filter((o) => o.year === year && o.status === 'done' && o.type !== 'delete' && o.at >= since && !removedLater(o))
      if (!saved.length) return
      const { missingIds } = await store.refresh(year, { force: true, expectIds: [...new Set(saved.map((o) => o.entryId))] })
      for (const op of saved) if (missingIds.includes(op.entryId)) await db.update(op.opId, { status: 'flagged', reason: 'Missing' })
    },
  }
}
