import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createKv } from './kv'

describe('kv', () => {
  it('returns undefined for missing keys and round-trips structured values', async () => {
    const kv = createKv(new IDBFactory())
    expect(await kv.get('nope')).toBeUndefined()
    await kv.set('year-2024', { entries: [{ id: 'a' }], n: 1 })
    expect(await kv.get('year-2024')).toEqual({ entries: [{ id: 'a' }], n: 1 })
    await kv.set('year-2024', { n: 2 })
    expect(await kv.get('year-2024')).toEqual({ n: 2 })
  })
})
