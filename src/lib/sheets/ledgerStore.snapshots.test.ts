import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../types'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const snap = (id: string, extra: Partial<Snapshot> = {}): Snapshot => ({
  id, date: '2026-10-31', account: 'Joint', balance: { minor: 10025, currency: 'EUR' }, note: '', ...extra,
})

function setup(snapshots: Snapshot[] = []) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12', snapshots })
  return { fake, store: createLedgerStore(fake, 'S1', { now: () => 1000 }) }
}

describe('snapshot writes', () => {
  it('addSnapshot appends A to E to Snapshots and reads the id back', async () => {
    const { fake, store } = setup()
    expect(await store.addSnapshot(snap('s1', { note: 'start' }))).toEqual({ id: 's1', ok: true })
    const call = fake.calls.find((c) => c.method === 'valuesAppend')!
    expect(call.args[1]).toBe('Snapshots!A:E')
    expect(call.args[2]).toEqual([['s1', 46326, 'Joint', 100.25, 'start']])
    expect(fake.book('S1').get('Snapshots!A2')?.v).toBe('s1')
  })
  it('an id already present is ok without a second append', async () => {
    const { fake, store } = setup([snap('s1')])
    expect(await store.addSnapshot(snap('s1'))).toEqual({ id: 's1', ok: true })
    expect(fake.count('valuesAppend')).toBe(0)
  })
  it("a balance whose currency differs from the account's is AccountChanged; zero and negative are accepted", async () => {
    const { fake, store } = setup()
    expect(await store.addSnapshot(snap('a', { balance: { minor: 100, currency: 'GBP' } }))).toEqual({ id: 'a', ok: false, reason: 'AccountChanged' })
    expect(await store.addSnapshot(snap('b', { account: 'Nowhere' }))).toEqual({ id: 'b', ok: false, reason: 'AccountChanged' })
    expect(fake.count('valuesAppend')).toBe(0)
    expect((await store.addSnapshot(snap('z', { balance: { minor: 0, currency: 'EUR' } }))).ok).toBe(true)
    expect((await store.addSnapshot(snap('n', { balance: { minor: -2050, currency: 'EUR' } }))).ok).toBe(true)
  })
  it('deleteSnapshot clears A to E of the located row and returns the previous snapshot', async () => {
    const { fake, store } = setup([snap('s1'), snap('s2', { date: '2026-11-01' })])
    const { previous } = await store.deleteSnapshot('s2')
    expect(previous).toEqual(snap('s2', { date: '2026-11-01' }))
    expect(fake.calls.filter((c) => c.method === 'valuesBatchClear').map((c) => c.args[1])).toEqual([['Snapshots!A3:E3']])
    expect(fake.book('S1').get('Snapshots!A2')?.v).toBe('s1')
    expect(fake.book('S1').get('Snapshots!A3')).toBeUndefined()
  })
  it('a missing snapshot id is RowGone', async () => {
    const { store } = setup()
    await expect(store.deleteSnapshot('nope')).rejects.toMatchObject({ name: 'RowGone' })
  })
  it('two snapshots of one account on one date are both kept, in sheet order', async () => {
    const { store } = setup()
    await store.addSnapshot(snap('first'))
    await store.addSnapshot(snap('second', { balance: { minor: 20000, currency: 'EUR' } }))
    expect((await store.snapshots()).map((s) => s.id)).toEqual(['first', 'second'])
  })
})
