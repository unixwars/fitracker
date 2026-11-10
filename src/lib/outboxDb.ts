import type { Op } from './outbox'

export type OutboxDb = {
  put(op: Op): Promise<Op>
  all(): Promise<Op[]>
  update(opId: string, patch: Partial<Op>): Promise<void>
  remove(opId: string): Promise<void>
}

const STORE = 'ops'

export function createOutboxDb(idb: IDBFactory = indexedDB, name = 'fitracker-outbox'): OutboxDb {
  let opened: Promise<IDBDatabase> | undefined
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'opId' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  const all = async () => ((await run('readonly', (s) => s.getAll())) as Op[]).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  return {
    all,
    async put(op) {
      const seq = op.seq ?? Math.max(0, ...(await all()).map((o) => o.seq ?? 0)) + 1
      const stored = { ...op, seq }
      await run('readwrite', (s) => s.put(stored))
      return stored
    },
    async update(opId, patch) {
      const cur = (await run('readonly', (s) => s.get(opId))) as Op | undefined
      if (cur) await run('readwrite', (s) => s.put({ ...cur, ...patch }))
    },
    async remove(opId) {
      await run('readwrite', (s) => s.delete(opId))
    },
  }
}
