import type { Op } from './outbox'

export type OutboxDb = {
  put(op: Op): Promise<Op>
  all(): Promise<Op[]>
  update(opId: string, patch: Partial<Op>): Promise<void>
  remove(opId: string): Promise<void>
  prune(maxAgeMs: number): Promise<void>
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

  // Read-modify-write inside one transaction so concurrent callers cannot interleave.
  const write = async <T>(work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      let result: T
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
      work(tx.objectStore(STORE), (v) => { result = v })
    })
  }

  return {
    all,
    put: (op) =>
      write<Op>((s, done) => {
        if (op.seq !== undefined) {
          s.put(op)
          return done(op)
        }
        const g = s.getAll()
        g.onsuccess = () => {
          const stored = { ...op, seq: Math.max(0, ...(g.result as Op[]).map((o) => o.seq ?? 0)) + 1 }
          s.put(stored)
          done(stored)
        }
      }),
    update: (opId, patch) =>
      write<void>((s) => {
        const g = s.get(opId)
        g.onsuccess = () => { if (g.result) s.put({ ...g.result, ...patch }) }
      }),
    remove: (opId) => write<void>((s) => { s.delete(opId) }),
    // Finished ops are only kept for Undo and verification; drop old ones.
    prune: (maxAgeMs) =>
      write<void>((s) => {
        const g = s.getAll()
        g.onsuccess = () => {
          for (const o of g.result as Op[]) if (o.status === 'done' && o.at < Date.now() - maxAgeMs) s.delete(o.opId)
        }
      }),
  }
}
