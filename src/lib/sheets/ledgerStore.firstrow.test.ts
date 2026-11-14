import { describe, expect, it } from 'vitest'
import type { Entry } from '../rows'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const e = (id: string): Entry => ({ id, kind: 'expense', date: '2026-11-03', money: { minor: 1250, currency: 'EUR' }, description: `d-${id}`, category: 'Groceries', account: 'Joint' })
const setup = (entries: Entry[] = []) => {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12', entries })
  return { fake, store: createLedgerStore(fake, 'S1', { now: () => 1000 }) }
}
const ranges = (fake: ReturnType<typeof createFakeSheets>) => fake.calls.filter((c) => c.method === 'valuesBatchUpdate').map((c) => (c.args[1] as { range: string }[])[0].range)

// The live check showed that real values:append puts a row one column to the right of the table (and into column J,
// over the formula). Rows are therefore written to an explicit free row.
describe('rows are written to an explicit free row, never appended', () => {
  it('the first row goes to A2:I2 and J2 is untouched', async () => {
    const { fake, store } = setup()
    expect(await store.addMany([e('a')])).toEqual([{ id: 'a', ok: true }])
    expect(ranges(fake)).toEqual(['Ledger!A2:I2'])
    expect(fake.book('S1').get('Ledger!J2')?.f).toContain('ARRAYFORMULA')
  })
  it('later rows go below the last used row, several at once', async () => {
    const { fake, store } = setup([e('a')])
    await store.addMany([e('b'), e('c')])
    expect(ranges(fake)).toEqual(['Ledger!A3:I4'])
    expect(fake.book('S1').read('Ledger!A2:A4', 'UNFORMATTED_VALUE').flat()).toEqual(['a', 'b', 'c'])
  })
  it('a hand-typed row without an id is never overwritten', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!B2:H2', [[46330, 'expense', 5, 'Hand', 'typed', 'Groceries', 'Joint']])
    await store.addMany([e('a')])
    expect(fake.book('S1').get('Ledger!D2')?.v).toBe(5)
    expect(fake.book('S1').get('Ledger!A3')?.v).toBe('a')
  })
  it('never writes column J', async () => {
    const { fake, store } = setup([e('a')])
    await store.addMany([e('b')])
    expect(ranges(fake).every((r) => /!A\d+:I\d+$/.test(r))).toBe(true)
  })
  it('a full tab is grown once and the write retried', async () => {
    const { fake, store } = setup([e('a')])
    fake.maxRows = 2
    expect(await store.addMany([e('b')])).toEqual([{ id: 'b', ok: true }])
    expect(fake.count('growTab')).toBe(1)
    expect(fake.book('S1').get('Ledger!A3')?.v).toBe('b')
  })
  it('a tab that cannot be grown is an error, not a loop', async () => {
    const { fake, store } = setup([e('a')])
    fake.maxRows = 2
    fake.growTab = async () => undefined // growing does nothing
    await expect(store.addMany([e('b')])).rejects.toThrow()
    expect(fake.count('valuesBatchUpdate')).toBeLessThanOrEqual(2)
  })
})
