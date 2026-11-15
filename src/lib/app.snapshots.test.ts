// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { AppState, type Env } from './app.svelte'
import type { Auth } from './auth'
import { todayLocal } from './rows'
import { createFakeSheets } from './sheets/fakeSheets'
import { seedLedger } from './sheets/fixtures'

const auth: Auth = { token: () => 'tok', signIn: async () => undefined, silentSignIn: async () => true, signOut: () => undefined, onExpired: () => undefined, onExpiring: () => undefined }
const snap = { id: 'snap1', date: todayLocal(), account: 'Joint', balance: { minor: 123456, currency: 'EUR' as const }, note: 'start' }

async function setup(online = true) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: todayLocal() })
  const data = new Map<string, string>([['fitracker.sheet', 'S1']])
  const env: Env = { storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }, idb: new IDBFactory(), api: fake, auth, pick: async () => 'S1', copyTemplate: async () => null }
  const app = new AppState(env)
  await app.init()
  app.online = online
  return { fake, app }
}

describe('recording a balance', () => {
  it('is written to Snapshots through the outbox and listed', async () => {
    const { fake, app } = await setup()
    await app.addSnapshot(snap)
    await vi.waitFor(() => expect(app.snapshots.map((s) => s.id)).toContain('snap1'))
    expect(fake.book('S1').get('Snapshots!A2')?.v).toBe('snap1')
  })
  it('is kept while offline and sent later', async () => {
    const { fake, app } = await setup(false)
    await app.addSnapshot(snap)
    expect(app.pendingCount).toBe(1)
    expect(fake.book('S1').get('Snapshots!A2')?.v).toBeUndefined()
    app.online = true
    await app.sync()
    expect(fake.book('S1').get('Snapshots!A2')?.v).toBe('snap1')
  })
  it('Undo removes it again', async () => {
    const { fake, app } = await setup()
    await app.addSnapshot(snap)
    await vi.waitFor(() => expect(app.ops.some((o) => o.status === 'done')).toBe(true))
    await app.undoOp(app.ops.find((o) => o.status === 'done')!)
    await vi.waitFor(() => expect(app.snapshots.map((s) => s.id)).not.toContain('snap1'))
    expect(fake.book('S1').get('Snapshots!A2')?.v ?? '').toBe('')
  })
})
