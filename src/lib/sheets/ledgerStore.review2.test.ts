import { describe, expect, it } from 'vitest'
import { ledgerRowValues, type Entry } from '../rows'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

const e = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id, kind: 'expense', date: '2026-11-03', money: { minor: 1250, currency: 'EUR' }, description: `d-${id}`, place: 'Shop', category: 'Groceries', account: 'Joint', ...extra,
})
const OCT = { month: '2026-10-01', GBP: 1.15, USD: 0.9 }

describe('verify counts unreadable rows as present (review m3b)', () => {
  it('an id on a row that no longer parses is not reported missing', async () => {
    const fake = createFakeSheets()
    seedLedger(fake, 'S1', { today: '2026-11-12', entries: [e('a')] })
    fake.book('S1').set('Ledger!B2', 'not a date') // the row exists but is unreadable now
    const store = createLedgerStore(fake, 'S1', { now: () => 1000 })
    expect((await store.refresh({ expectIds: ['a', 'gone'] })).missingIds).toEqual(['gone'])
  })
})

describe('id backfill checks the row it wrote to (review m5)', () => {
  it('does not attach an id to an entry whose row moved before the write', async () => {
    const fake = createFakeSheets()
    seedLedger(fake, 'S1', { today: '2026-11-12', entries: [e('x', { id: '', description: 'typed by hand', money: { minor: 700, currency: 'EUR' } }), e('y')] })
    fake.book('S1').set('Ledger!A2', '') // x has no id
    const store = createLedgerStore(fake, 'S1', { now: () => 1000 })
    // a sort puts y at row 2 (and the hand-typed row at row 3) just before the id write lands
    fake.beforeNextWrite(() => fake.injectWrite('S1', 'Ledger!A2:I3', [ledgerRowValues(e('y')), ledgerRowValues(e('x', { id: '', description: 'typed by hand', money: { minor: 700, currency: 'EUR' } }))]))
    const ids = (await store.list()).map((x) => x.id)
    expect(ids).toEqual(['y']) // the hand-typed entry is not listed under an id written to someone else's row
  })
})

describe('month-roll re-checks the sheet before writing (review m4)', () => {
  const setup = () => {
    const fake = createFakeSheets()
    seedLedger(fake, 'S1', { today: '2026-11-12', rates: [OCT] })
    fake.book('S1').set('Rates!B2', { f: '=GOOGLEFINANCE("CURRENCY:GBPEUR")', v: 1.17 })
    fake.book('S1').set('Rates!C2', { f: '=GOOGLEFINANCE("CURRENCY:USDEUR")', v: 0.94 })
    fake.book('S1').clear('Rates!A3:C3')
    return { fake, store: createLedgerStore(fake, 'S1', { now: () => 1000 }) }
  }
  it('does not overwrite a value someone typed after the formulas were read', async () => {
    const { fake, store } = setup()
    const real = fake.batchGet.bind(fake)
    let seen = 0
    fake.batchGet = async (id, ranges, render) => {
      const out = await real(id, ranges, render)
      if (render === 'FORMULA' && ++seen === 1) fake.injectWrite('S1', 'Rates!B2', [[1.234]]) // the owner types the monthly average
      return out
    }
    await store.maintainRates('2026-11-02')
    expect(fake.book('S1').get('Rates!B2')?.v).toBe(1.234)
    expect(fake.book('S1').get('Rates!C2')?.v).toBe(0.94) // the untouched live cell is still frozen
    expect(fake.book('S1').get('Rates!C2')?.f).toBeUndefined()
  })
  it('appends after the last non-empty row even when its month cell is text', async () => {
    const { fake, store } = setup()
    fake.book('S1').set('Rates!A9', 'note: rates below are for 2027')
    await store.maintainRates('2026-11-02')
    expect(fake.book('S1').get('Rates!A9')?.v).toBe('note: rates below are for 2027')
    expect(fake.book('S1').get('Rates!A10')?.v).toBe(46327)
  })
})
