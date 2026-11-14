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

describe('the first row of an empty tab (real Sheets appends it one column to the right)', () => {
  it('is written explicitly to A2:I2, never appended, and J2 is untouched', async () => {
    const { fake, store } = setup()
    expect(await store.addMany([e('a')])).toEqual([{ id: 'a', ok: true }])
    expect(fake.count('valuesAppend')).toBe(0)
    const write = fake.calls.find((c) => c.method === 'valuesBatchUpdate')!
    expect((write.args[1] as { range: string }[])[0].range).toBe('Ledger!A2:I2')
    expect(fake.book('S1').get('Ledger!A2')?.v).toBe('a')
    expect(fake.book('S1').get('Ledger!J2')?.f).toContain('ARRAYFORMULA')
  })
  it('later rows are appended', async () => {
    const { fake, store } = setup()
    await store.addMany([e('a')])
    await store.addMany([e('b')])
    expect(fake.count('valuesAppend')).toBe(1)
    expect(fake.book('S1').get('Ledger!A3')?.v).toBe('b')
  })
  it('an empty-looking tab that holds a hand-typed row without an id is not overwritten', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!B2:H2', [[46330, 'expense', 5, 'Hand', 'typed', 'Groceries', 'Joint']])
    await store.addMany([e('a')])
    expect(fake.book('S1').get('Ledger!D2')?.v).toBe(5) // still the hand-typed amount
    expect(fake.book('S1').get('Ledger!A2')?.v).toBeUndefined()
  })
  it('stops when an append lands outside columns A to I and does not retry', async () => {
    const { fake, store } = setup([e('a')])
    const real = fake.valuesAppend.bind(fake)
    fake.valuesAppend = async (id, range, values) => { await real(id, range, values); return { updatedRange: 'Ledger!B3:J3' } }
    await expect(store.addMany([e('b')])).rejects.toThrow(/outside/)
    expect(fake.count('valuesAppend')).toBe(1)
  })
})
