// Tiny IndexedDB key-value store, used to cache the last snapshot of each year for instant start-up.
export type Kv = { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> }

export function createKv(idb: IDBFactory = indexedDB, name = 'fitracker-cache'): Kv {
  let opened: Promise<IDBDatabase> | undefined
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction('kv', mode).objectStore('kv'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return {
    get: <T>(key: string) => run('readonly', (s) => s.get(key)) as Promise<T | undefined>,
    set: async (key, value) => { await run('readwrite', (s) => s.put(value, key)) },
  }
}
