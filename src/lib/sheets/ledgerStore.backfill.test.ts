import { describe, expect, it } from 'vitest'
import { backfillId } from '../ids'
import { serialToDate } from '../rows'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const DAY = serialToDate(46000)
const handTyped = (desc: string) => ['', 46000, 'expense', 5, '', desc, 'Groceries', 'Joint']
const idOf = (tab: 'Ledger' | 'Snapshots', row: number, date: string, minor: number, account = 'Joint') => backfillId(tab, row, [date, minor, account])

function setup() {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12' })
  const store = createLedgerStore(fake, 'S1', { now: () => 1000 })
  return { fake, store }
}
const writtenRanges = (fake: ReturnType<typeof createFakeSheets>) =>
  fake.calls.filter((c) => c.method === 'valuesBatchUpdate').flatMap((c) => (c.args[1] as { range: string }[]).map((d) => d.range))

describe('id backfill', () => {
  it('a hand-typed row without an id gets a deterministic one, written to column A only', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!A2:I2', [handTyped('x')])
    const list = await store.list()
    const expected = idOf('Ledger', 2, DAY, 500)
    expect(list.map((e) => e.id)).toEqual([expected])
    expect(fake.book('S1').get('Ledger!A2')?.v).toBe(expected)
    expect(fake.count('valuesBatchUpdate')).toBe(1)
    expect(writtenRanges(fake).every((r) => /^(Ledger|Snapshots)!A\d+(:A\d+)?$/.test(r))).toBe(true)
  })
  it('a snapshot row without an id gets one too', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Snapshots!A2:E2', [['', 46000, 'Joint', 100, '']])
    const snaps = await store.snapshots()
    expect(snaps.map((s) => s.id)).toEqual([idOf('Snapshots', 2, DAY, 10000)])
    expect(writtenRanges(fake)).toEqual(['Snapshots!A2'])
  })
  it('consecutive rows are written as one block', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!A2:I4', [handTyped('a'), handTyped('b'), handTyped('c')])
    await store.list()
    expect(writtenRanges(fake)).toEqual(['Ledger!A2:A4'])
  })
  it('two concurrent refreshes backfill once (Review Focus 1)', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!A2:I2', [handTyped('x')])
    await Promise.all([store.list(), store.list()])
    expect(fake.count('valuesBatchUpdate')).toBe(1)
  })
  it('two devices that both saw the row without an id write the same value and agree', async () => {
    const { fake, store: one } = setup()
    const two = createLedgerStore(fake, 'S1', { now: () => 1000 })
    fake.book('S1').write('Ledger!A2:I2', [handTyped('x')])
    const [a, b] = await Promise.all([one.list(), two.list()])
    expect(a[0].id).toBe(b[0].id)
    expect(fake.book('S1').get('Ledger!A2')?.v).toBe(a[0].id)
  })
  it('a device that arrives later finds the id and does not rewrite it', async () => {
    const { fake, store: one } = setup()
    const two = createLedgerStore(fake, 'S1', { now: () => 1000 })
    fake.book('S1').write('Ledger!A2:I2', [handTyped('x')])
    await one.list()
    const writes = fake.count('valuesBatchUpdate')
    await two.list()
    expect(fake.count('valuesBatchUpdate')).toBe(writes)
  })
  it("adopts the id the sheet holds after reading back, even when someone else's value landed first", async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!A2:I2', [handTyped('x')])
    fake.afterNextWrite(() => fake.book('S1').set('Ledger!A2', 'other-device'))
    const list = await store.list()
    expect(list.map((e) => e.id)).toEqual(['other-device'])
  })
  it('rows that already have ids are not rewritten', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!A2:I2', [['keep', 46000, 'expense', 5, '', 'x', 'Groceries', 'Joint']])
    await store.list()
    expect(fake.count('valuesBatchUpdate')).toBe(0)
  })
  it('unreadable rows get no id', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!A2:I2', [['', 'soon', 'expense', 5, '', 'x', 'Groceries', 'Joint']])
    await store.list()
    expect(fake.count('valuesBatchUpdate')).toBe(0)
    expect(fake.book('S1').get('Ledger!A2')).toBeUndefined()
  })
  it('never writes column J', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Ledger!A2:I3', [handTyped('a'), handTyped('b')])
    await store.list()
    expect(writtenRanges(fake).some((r) => /!J/.test(r))).toBe(false)
  })
})
