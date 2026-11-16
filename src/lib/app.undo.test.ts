// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { AppState, type Env } from './app.svelte'
import type { Auth } from './auth'
import { todayLocal, type Entry } from './rows'
import { createFakeSheets } from './sheets/fakeSheets'
import { seedLedger } from './sheets/fixtures'

const auth: Auth = { token: () => 'tok', signIn: async () => undefined, silentSignIn: async () => true, signOut: () => undefined, onExpired: () => undefined, onExpiring: () => undefined }
const entry: Entry = { id: 'u1', kind: 'expense', date: todayLocal(), money: { minor: 350, currency: 'EUR' }, description: 'Coffee', category: 'Groceries', account: 'Joint' }
const recent = (app: AppState) => app.ops.filter((o) => o.status === 'done' && !o.undoOf)

async function setup() {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: todayLocal() })
  const data = new Map<string, string>([['fitracker.sheet', 'S1']])
  const env: Env = { storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }, idb: new IDBFactory(), api: fake, auth, pick: async () => 'S1', copyTemplate: async () => null }
  const app = new AppState(env)
  await app.init()
  return { fake, app }
}
const settled = (app: AppState) => vi.waitFor(() => expect(app.ops.every((o) => o.status !== 'pending')).toBe(true))

describe('undo and redo', () => {
  it('toggle the original row and never add entries to Recent changes', async () => {
    const { app } = await setup()
    await app.save(entry, {})
    await settled(app)
    expect(recent(app)).toHaveLength(1)
    const original = recent(app)[0]
    await app.undoOp(original)
    await settled(app)
    expect(app.entries.map((x) => x.id)).not.toContain('u1')
    expect(recent(app)).toHaveLength(1)
    expect(recent(app)[0].undone).toBe(true)
    await app.redoOp(recent(app)[0])
    await settled(app)
    expect(app.entries.map((x) => x.id)).toContain('u1')
    expect(recent(app)).toHaveLength(1)
    expect(recent(app)[0].undone).toBe(false)
    await app.undoOp(recent(app)[0])
    await settled(app)
    expect(app.entries.map((x) => x.id)).not.toContain('u1')
    expect(recent(app)).toHaveLength(1)
  })
})
