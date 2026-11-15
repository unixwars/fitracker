import { describe, expect, it } from 'vitest'
import { AuthExpired } from '../errors'
import { accountKey } from '../overrides'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

function setup() {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12' })
  return { fake, store: createLedgerStore(fake, 'S1', { now: () => 1000 }) }
}

describe('shared settings', () => {
  it('reads the fitracker.* entries with the book, in one request', async () => {
    const { fake, store } = setup()
    await fake.setMetadata('S1', accountKey('Joint'), '{"m":false}')
    expect(await store.overrides()).toMatchObject({ [accountKey('Joint')]: '{"m":false}' })
    await store.lists()
    expect(fake.count('listMetadata')).toBe(1)
  })
  it('setOverride writes the metadata only, never a cell, and the next read sees it without another request', async () => {
    const { fake, store } = setup()
    await store.lists()
    const before = fake.count('valuesBatchUpdate')
    await store.setOverride(accountKey('Joint'), '{"a":false}')
    expect(fake.count('valuesBatchUpdate')).toBe(before)
    expect(await fake.getMetadata('S1', accountKey('Joint'))).toBe('{"a":false}')
    expect((await store.overrides())[accountKey('Joint')]).toBe('{"a":false}')
    expect(fake.count('listMetadata')).toBe(1)
  })
  it('refuses a key outside the fitracker prefix', async () => {
    const { store } = setup()
    await expect(store.setOverride('other.key', 'x')).rejects.toThrow()
  })
  it('keeps the known settings when the metadata read fails, but lets an expired sign-in through', async () => {
    const { fake, store } = setup()
    await fake.setMetadata('S1', accountKey('Joint'), '{"m":false}')
    await store.overrides()
    const original = fake.listMetadata
    fake.listMetadata = async () => { throw new Error('boom') }
    await store.refresh({ force: true })
    expect((await store.overrides())[accountKey('Joint')]).toBe('{"m":false}')
    fake.listMetadata = async () => { throw new AuthExpired() }
    await expect(store.refresh({ force: true })).rejects.toBeInstanceOf(AuthExpired)
    fake.listMetadata = original
  })
})
