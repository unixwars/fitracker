import { describe, expect, it } from 'vitest'
import { ApiError, NewerThanApp, UnrecognisedLayout } from '../errors'
import { META_KEY } from '../schema'
import { createFakeSheets } from './fakeSheets'
import { seedLedger, seedLegacy } from './fixtures'
import { ensureVersion } from './version'

const fresh = () => {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1')
  return fake
}

describe('ensureVersion', () => {
  it('accepts tag 3 and writes nothing', async () => {
    const fake = fresh()
    await expect(ensureVersion(fake, 'S1')).resolves.toBeUndefined()
    expect(fake.count('setMetadata')).toBe(0)
    expect(fake.count('valuesBatchUpdate')).toBe(0)
  })
  it('a newer tag is NewerThanApp', async () => {
    const fake = fresh()
    fake.book('S1').metadata.set(META_KEY, '4')
    await expect(ensureVersion(fake, 'S1')).rejects.toEqual(new NewerThanApp(4))
  })
  it('an older or non-integer tag is an unrecognised layout', async () => {
    for (const tag of ['2', 'abc', '3.5']) {
      const fake = fresh()
      fake.book('S1').metadata.set(META_KEY, tag)
      await expect(ensureVersion(fake, 'S1')).rejects.toBeInstanceOf(UnrecognisedLayout)
    }
  })
  it('a lost tag with matching headers is stamped once', async () => {
    const fake = createFakeSheets()
    seedLedger(fake, 'S1', { metadata: false })
    await ensureVersion(fake, 'S1')
    expect(fake.count('setMetadata')).toBe(1)
    expect(fake.calls.find((c) => c.method === 'setMetadata')?.args).toEqual(['S1', 'fitracker.schemaVersion', '3'])
  })
  it('a lost tag on a legacy yearly sheet is unrecognised and aborts before any write', async () => {
    const fake = createFakeSheets()
    seedLegacy(fake, 'S1')
    await expect(ensureVersion(fake, 'S1')).rejects.toBeInstanceOf(UnrecognisedLayout)
    expect(fake.count('setMetadata')).toBe(0)
    expect(fake.count('valuesBatchUpdate')).toBe(0)
  })
  it('the real API answers 400 for a missing tab: that is also an unrecognised layout', async () => {
    const fake = createFakeSheets()
    seedLegacy(fake, 'S1')
    fake.strictTabs = true
    await expect(ensureVersion(fake, 'S1')).rejects.toBeInstanceOf(UnrecognisedLayout)
    expect(fake.count('setMetadata')).toBe(0)
  })
  it('other API errors are not hidden', async () => {
    const fake = createFakeSheets()
    seedLedger(fake, 'S1', { metadata: false })
    fake.failNext(403)
    await expect(ensureVersion(fake, 'S1')).rejects.toBeInstanceOf(ApiError)
  })
  it('header comparison trims spaces and is case-sensitive', async () => {
    const trimmed = createFakeSheets()
    seedLedger(trimmed, 'S1', { metadata: false })
    trimmed.book('S1').set('Ledger!B1', ' date ')
    await expect(ensureVersion(trimmed, 'S1')).resolves.toBeUndefined()
    const cased = createFakeSheets()
    seedLedger(cased, 'S1', { metadata: false })
    cased.book('S1').set('Ledger!B1', 'Date')
    await expect(ensureVersion(cased, 'S1')).rejects.toBeInstanceOf(UnrecognisedLayout)
  })
})
