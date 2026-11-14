import { describe, expect, it } from 'vitest'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const OCT = { month: '2026-10-01', GBP: 1.15, USD: 0.9 }

function setup(today: string, seed: Parameters<typeof seedLedger>[2] = {}) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today, ...seed })
  return { fake, store: createLedgerStore(fake, 'S1', { now: () => 1000 }) }
}
const cell = (fake: ReturnType<typeof createFakeSheets>, a: string) => fake.book('S1').get(a)

describe('maintainRates', () => {
  it('freezes the closed month and appends the new month with live formulas', async () => {
    const { fake, store } = setup('2026-11-02', { rates: [OCT] })
    // October was seeded as values; make it live like the app left it
    fake.book('S1').set('Rates!B2', { f: '=GOOGLEFINANCE("CURRENCY:GBPEUR")', v: 1.16 })
    fake.book('S1').set('Rates!C2', { f: '=GOOGLEFINANCE("CURRENCY:USDEUR")', v: 0.91 })
    fake.book('S1').clear('Rates!A3:C3')
    await store.maintainRates('2026-11-02')
    expect(cell(fake, 'Rates!B2')).toMatchObject({ v: 1.16 })
    expect(cell(fake, 'Rates!B2')?.f).toBeUndefined()
    expect(cell(fake, 'Rates!B3')?.f).toBe('=GOOGLEFINANCE("CURRENCY:GBPEUR")')
    expect(fake.calls.filter((c) => c.method === 'valuesBatchUpdate').every((c) => c.args[2] === 'USER_ENTERED')).toBe(true)
  })
  it('never overwrites typed values and leaves a non-numeric live cell alone', async () => {
    const { fake, store } = setup('2026-11-02', { rates: [OCT] })
    fake.book('S1').clear('Rates!A3:C3')
    fake.book('S1').set('Rates!C2', { f: '=GOOGLEFINANCE("CURRENCY:USDEUR")', v: '#N/A' })
    await store.maintainRates('2026-11-02')
    expect(cell(fake, 'Rates!B2')?.v).toBe(1.15)
    expect(cell(fake, 'Rates!C2')?.f).toBeDefined()
  })
  it('runs once per month per store', async () => {
    const { fake, store } = setup('2026-11-02', { rates: [OCT] })
    fake.book('S1').clear('Rates!A3:C3')
    await store.maintainRates('2026-11-02')
    const before = fake.calls.length
    await store.maintainRates('2026-11-05')
    expect(fake.calls.length).toBe(before)
  })
  it('a second device that appended the month first is not duplicated', async () => {
    const { fake, store } = setup('2026-11-02', { rates: [OCT] })
    fake.book('S1').clear('Rates!A3:C3')
    fake.beforeNextWrite(() => {
      fake.book('S1').set('Rates!A3', 46327)
      fake.book('S1').set('Rates!B3', { f: '=GOOGLEFINANCE("CURRENCY:GBPEUR")', v: 1.17 })
    })
    await store.maintainRates('2026-11-02')
    expect(cell(fake, 'Rates!A4')).toBeUndefined()
  })
  it('an empty Rates tab gets the current month in row 2', async () => {
    const { fake, store } = setup('2026-11-02')
    fake.book('S1').clear('Rates!A2:C2')
    await store.maintainRates('2026-11-02')
    expect(cell(fake, 'Rates!A2')?.v).toBe(46327)
    expect(cell(fake, 'Rates!C2')?.f).toBe('=GOOGLEFINANCE("CURRENCY:USDEUR")')
  })
  it('does nothing when the base currency is not EUR', async () => {
    const { fake, store } = setup('2026-11-02', { reference: { base: 'GBP', accounts: [], categories: [], budgets: [] } })
    await store.maintainRates('2026-11-02')
    expect(fake.count('valuesBatchUpdate')).toBe(0)
  })
})
