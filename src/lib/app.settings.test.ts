// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { AppState, type Env } from './app.svelte'
import type { Auth } from './auth'
import { messages } from './messages'
import { accountKey, accountIconKey } from './overrides'
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
const joint = (app: AppState) => app.lists.accounts.find((a) => a.name === 'Joint')!

describe('shared settings in the app', () => {
  it('a toggle overrides the sheet inside the app, is written as metadata only, and shows in lists at once', async () => {
    const { fake, app } = await setup()
    const sheetValue = joint(app).inMonthly
    const cellWrites = fake.count('valuesBatchUpdate')
    await app.setAccountToggle('Joint', 'inMonthly', !sheetValue)
    expect(joint(app).inMonthly).toBe(!sheetValue)
    expect(app.sheetLists.accounts.find((a) => a.name === 'Joint')!.inMonthly).toBe(sheetValue)
    expect(await fake.getMetadata('S1', accountKey('Joint'))).toBe(JSON.stringify({ m: !sheetValue }))
    expect(fake.count('valuesBatchUpdate')).toBe(cellWrites)
  })
  it('setting it back to the sheet value clears the override', async () => {
    const { fake, app } = await setup()
    const sheetValue = joint(app).inAnnual
    await app.setAccountToggle('Joint', 'inAnnual', !sheetValue)
    await app.setAccountToggle('Joint', 'inAnnual', sheetValue)
    expect(await fake.getMetadata('S1', accountKey('Joint'))).toBe('')
    expect(joint(app).inAnnual).toBe(sheetValue)
  })
  it('another device sees the setting after a refresh and from the cache', async () => {
    const { fake, app } = await setup()
    await fake.setMetadata('S1', accountKey('Joint'), '{"m":false}')
    await app.store!.refresh({ force: true })
    await app.sync()
    expect(joint(app).inMonthly).toBe(false)
  })
  it('an icon override is validated and replaces the guessed emoji; empty resets', async () => {
    const { fake, app } = await setup()
    const guessed = app.accountEmoji('Joint')
    await app.setIcon('account', 'Joint', 'abc')
    expect(await fake.getMetadata('S1', accountIconKey('Joint'))).toBeNull()
    await app.setIcon('account', 'Joint', '🐷')
    expect(app.accountEmoji('Joint')).toBe('🐷')
    await app.setIcon('account', 'Joint', '')
    expect(app.accountEmoji('Joint')).toBe(guessed)
  })
  it('a failed write rolls back and says so', async () => {
    const { fake, app } = await setup()
    const sheetValue = joint(app).inMonthly
    fake.setMetadata = async () => { throw new Error('boom') }
    await app.setAccountToggle('Joint', 'inMonthly', !sheetValue)
    expect(joint(app).inMonthly).toBe(sheetValue)
    expect(app.message).toBe(messages.settingNotSaved)
  })
  it('needs a connection: offline it changes nothing and says why', async () => {
    const { fake, app } = await setup()
    app.online = false
    await app.setAccountToggle('Joint', 'inMonthly', !joint(app).inMonthly)
    expect(app.message).toBe(messages.settingNeedsConnection)
    expect(fake.count('setMetadata')).toBe(0)
  })
  it('ignores a toggle for an account the sheet does not have', async () => {
    const { fake, app } = await setup()
    await app.setAccountToggle('Nope', 'inMonthly', true)
    expect(fake.count('setMetadata')).toBe(0)
  })
})
