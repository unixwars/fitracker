// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { AppState, type Env } from './app.svelte'
import type { Auth } from './auth'
import { messages } from './messages'
import { todayLocal } from './rows'
import { createFakeSheets } from './sheets/fakeSheets'
import { seedLedger } from './sheets/fixtures'

const auth: Auth = { token: () => 'tok', signIn: async () => undefined, silentSignIn: async () => true, signOut: () => undefined, onExpired: () => undefined, onExpiring: () => undefined }

async function setup() {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: todayLocal() })
  const data = new Map<string, string>([['fitracker.sheet', 'S1']])
  const env: Env = { storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }, idb: new IDBFactory(), api: fake, auth, pick: async () => 'S1', copyTemplate: async () => null }
  const app = new AppState(env)
  await app.init()
  return { fake, app }
}

describe('adding accounts and categories', () => {
  it('writes the row, shows the new account in app.lists after the background refresh, and remembers it for Undo', async () => {
    const { app } = await setup()
    expect(await app.addAccount('Savings', 'GBP')).toEqual({ ok: true })
    expect(app.lastAdded).toMatchObject({ kind: 'account', name: 'Savings' })
    await vi.waitFor(() => expect(app.lists.accounts.some((a) => a.name === 'Savings')).toBe(true))
  })
  it('adds a category', async () => {
    const { app } = await setup()
    expect(await app.addCategory('Hobbies', 'expense')).toEqual({ ok: true })
    await vi.waitFor(() => expect(app.lists.categories.some((c) => c.name === 'Hobbies' && c.type === 'expense')).toBe(true))
  })
  it('reports why a name was refused and leaves no Undo', async () => {
    const { app } = await setup()
    const existing = app.lists.accounts[0].name
    expect(await app.addAccount(existing.toLowerCase(), 'EUR')).toEqual({ ok: false, reason: 'duplicate' })
    expect(app.lastAdded).toBeNull()
  })
  it('needs a connection: offline it writes nothing and says why', async () => {
    const { fake, app } = await setup()
    app.online = false
    expect(await app.addAccount('Offline', 'EUR')).toEqual({ ok: false, reason: 'offline' })
    expect(app.message).toBe(messages.settingNeedsConnection)
    expect(fake.count('valuesBatchUpdate')).toBe(0)
  })
  it('a failing write says it was not saved; a failing refresh after a good write does not', async () => {
    const { fake, app } = await setup()
    fake.failNext(500)
    expect(await app.addAccount('Broken', 'EUR')).toEqual({ ok: false, reason: 'failed' })
    expect(app.message).toBe(messages.settingNotSaved)
    app.message = ''
    expect(await app.addAccount('Good', 'EUR')).toEqual({ ok: true })
    expect(app.message).toBe('')
  })
  it('two adds at once run one after the other and both land', async () => {
    const { app } = await setup()
    const [a, b] = await Promise.all([app.addAccount('First', 'EUR'), app.addAccount('Second', 'EUR')])
    expect([a, b]).toEqual([{ ok: true }, { ok: true }])
    await vi.waitFor(() => expect(app.lists.accounts.map((x) => x.name)).toEqual(expect.arrayContaining(['First', 'Second'])))
  })
  it('Undo clears the row of the last add, then forgets it', async () => {
    const { app } = await setup()
    await app.addCategory('Oops', 'income')
    expect(await app.undoLastAdd()).toBe('ok')
    expect(app.lastAdded).toBeNull()
    await vi.waitFor(() => expect(app.lists.categories.some((c) => c.name === 'Oops')).toBe(false))
  })
})
