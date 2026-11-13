import { describe, expect, it } from 'vitest'
import { NewerThanApp, UnrecognisedLayout } from '../errors'
import type { Entry } from '../rows'
import { META_KEY } from '../schema'
import type { Snapshot } from '../types'
import { createFakeSheets } from './fakeSheets'
import { seedLedger, seedV2 } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const e = (id: string, account = 'Joint', extra: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2026-11-03', money: { minor: 1250, currency: account === 'T-Cash' ? 'GBP' : 'EUR' }, description: 'Milk', category: 'Groceries', account, ...extra,
})
const snap = (id: string): Snapshot => ({ id, date: '2026-10-31', account: 'Joint', balance: { minor: 10000, currency: 'EUR' }, note: '' })

function setup(opts: Parameters<typeof seedLedger>[2] = {}) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12', ...opts })
  let t = 1_000
  const store = createLedgerStore(fake, 'S1', { now: () => t, newId: () => 'new-id' })
  return { fake, store, tick: (ms: number) => { t += ms } }
}

describe('ledger store read path', () => {
  it('one batchGet reads ledger, settings, accounts, categories, budgets, rates and snapshots', async () => {
    const { fake, store } = setup({ entries: [e('a'), e('b')], snapshots: [snap('s1')] })
    await store.list()
    await store.lists()
    await store.rates()
    await store.snapshots()
    expect(fake.count('batchGet')).toBe(1)
    expect(fake.count('getMetadata')).toBe(1)
  })
  it("entries carry the account's currency and lists() has the base", async () => {
    const { store } = setup({ entries: [e('a', 'Joint'), e('b', 'T-Cash')] })
    const list = await store.list()
    expect(list.map((x) => x.money.currency)).toEqual(['EUR', 'GBP'])
    expect((await store.lists()).base).toBe('EUR')
    expect((await store.lists()).accounts.map((a) => a.name)).toEqual(['Joint', 'M-Cash', 'T-Cash'])
    expect((await store.snapshots())).toEqual([])
  })
  it('rates() returns the parsed Rates rows including the live current-month row', async () => {
    const { store } = setup({ rates: [{ month: '2026-10-01', GBP: 1.16, USD: 0.93 }] })
    expect(await store.rates()).toEqual([
      { month: '2026-10-01', GBP: 1.16, USD: 0.93 },
      { month: '2026-11-01', GBP: 1.17, USD: 0.94 },
    ])
  })
  it('unreadable rows are reported with their sheet rows, not listed (Review Focus 5)', async () => {
    const { fake, store } = setup({ entries: [e('good')] })
    const b = fake.book('S1')
    b.write('Ledger!A3:I3', [['x1', 'soon', 'expense', 5, '', 'a', 'Groceries', 'Joint']])
    b.write('Ledger!A4:I4', [['x2', 46000, 'expense', -5, '', 'b', 'Groceries', 'Joint']])
    b.write('Ledger!A5:I5', [['x3', 46000, 'expense', 5, '', 'c', 'Groceries', 'Nowhere']])
    b.write('Ledger!A6:I6', [['x4', 46000, 'spend', 5, '', 'd', 'Groceries', 'Joint']])
    expect((await store.list()).map((x) => x.id)).toEqual(['good'])
    expect(await store.unreadable()).toEqual([
      { tab: 'Ledger', row: 3, reason: 'date', text: 'a' },
      { tab: 'Ledger', row: 4, reason: 'amount', text: 'b' },
      { tab: 'Ledger', row: 5, reason: 'account', text: 'c' },
      { tab: 'Ledger', row: 6, reason: 'type', text: 'd' },
    ])
  })
  it('a cleared gap and a blank row are skipped silently', async () => {
    const { fake, store } = setup({ entries: [e('a')] })
    fake.book('S1').write('Ledger!A5:I5', [['b', 46000, 'expense', 5, '', 'x', 'Groceries', 'Joint']])
    expect((await store.list()).map((x) => x.id)).toEqual(['a', 'b'])
    expect(await store.unreadable()).toEqual([])
  })
  it('a second list() inside the interval does not re-read; refresh({force}) does; concurrent calls share one fetch', async () => {
    const { fake, store, tick } = setup({ entries: [e('a')] })
    await store.list()
    tick(1000)
    await store.list()
    expect(fake.count('batchGet')).toBe(1)
    await store.refresh({ force: true })
    expect(fake.count('batchGet')).toBe(2)
    tick(10 * 60_000)
    await Promise.all([store.list(), store.list()])
    expect(fake.count('batchGet')).toBe(3)
  })
  it('refresh({expectIds}) reports ids absent from both tabs', async () => {
    const { store } = setup({ entries: [e('a')], snapshots: [snap('s1')] })
    expect(await store.refresh({ expectIds: ['a', 's1', 'ghost'] })).toEqual({ missingIds: ['ghost'] })
  })
  it('subscribers are told when fresh data arrives', async () => {
    const { store } = setup({ entries: [e('a')] })
    let n = 0
    const off = store.subscribe(() => n++)
    await store.list()
    off()
    await store.refresh({ force: true })
    expect(n).toBe(1)
  })
  it('a newer tag rejects with NewerThanApp', async () => {
    const { fake, store } = setup()
    fake.book('S1').metadata.set(META_KEY, '4')
    await expect(store.list()).rejects.toBeInstanceOf(NewerThanApp)
  })
  it('a legacy sheet is unrecognised before any ledger value is read', async () => {
    const fake = createFakeSheets()
    seedV2(fake, 'S1', { metadata: false })
    const store = createLedgerStore(fake, 'S1')
    await expect(store.list()).rejects.toBeInstanceOf(UnrecognisedLayout)
    expect(fake.calls.some((c) => c.method === 'batchGet' && JSON.stringify(c.args).includes('Ledger!A2:I'))).toBe(false)
  })
})
