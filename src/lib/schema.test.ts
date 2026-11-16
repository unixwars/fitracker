import { describe, expect, it } from 'vitest'
import gs from '../../template/build-template.gs?raw'
import { ACCOUNTS, BOOK_VERSION, CATEGORIES, LEDGER, REFERENCE, SNAPSHOTS, rateFormula, rowRange } from './schema'

// Pulls a JS array literal such as `LEDGER: ['id', 'date']` out of the template script's HEADERS object.
function templateHeaders(name: string): string[] {
  const m = new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`).exec(gs.slice(gs.indexOf('const HEADERS')))
  if (!m) throw new Error(`HEADERS.${name} not found in template/build-template.gs`)
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1])
}

describe('v3 schema', () => {
  it('builds single-row ranges', () => {
    expect(rowRange('Ledger', 7, 'I')).toBe('Ledger!A7:I7')
    expect(rowRange('Snapshots', 3, 'E')).toBe('Snapshots!A3:E3')
  })

  it('builds the live rate formula', () => {
    expect(rateFormula('GBP', 'EUR')).toBe('=GOOGLEFINANCE("CURRENCY:GBPEUR")')
    expect(rateFormula('USD', 'EUR')).toBe('=GOOGLEFINANCE("CURRENCY:USDEUR")')
  })

  it('describes the ledger columns and ranges', () => {
    expect(LEDGER.headers).toHaveLength(10)
    expect(LEDGER.ranges.rows).toBe('Ledger!A2:I')
    expect(LEDGER.ranges.rowsWithBase).toBe('Ledger!A2:J')
    expect(LEDGER.cols.account).toBe('H')
    expect(SNAPSHOTS.headers).toHaveLength(5)
    expect(REFERENCE.accounts).toBe('Accounts!A2:E')
  })

  it('headers and version equal the template script', () => {
    expect(LEDGER.headers).toEqual(templateHeaders('LEDGER'))
    expect(SNAPSHOTS.headers).toEqual(templateHeaders('SNAPSHOTS'))
    expect(/const SCHEMA_VERSION = '(\d+)'/.exec(gs)?.[1]).toBe(String(BOOK_VERSION))
  })
})

describe('reference tabs the app appends to', () => {
  const constant = (name: string): number => {
    const m = new RegExp(`const ${name} = (\\d+);`).exec(gs)
    if (!m) throw new Error(`${name} not found in template/build-template.gs`)
    return Number(m[1])
  }
  it('takes its caps from the template script', () => {
    expect(ACCOUNTS.max).toBe(constant('MAX_ACCOUNTS'))
    expect(CATEGORIES.maxExpense).toBe(constant('MAX_EXPENSE_CATEGORIES'))
    expect(CATEGORIES.maxIncome).toBe(constant('MAX_INCOME_CATEGORIES'))
  })
  it('knows Accounts is trimmed to 1 + MAX_ACCOUNTS rows', () => {
    expect(gs).toContain('trimRows(sh, MAX_ACCOUNTS + 1)')
    expect(ACCOUNTS.lastRow).toBe(ACCOUNTS.max + 1)
  })
  it('takes its headers from the template script', () => {
    expect([...ACCOUNTS.headers]).toEqual(templateHeaders('ACCOUNTS'))
    expect([...CATEGORIES.headers]).toEqual(templateHeaders('CATEGORIES'))
  })
  it('keeps REFERENCE pointing at the same ranges', () => {
    expect(REFERENCE.accounts).toBe(ACCOUNTS.ranges.rows)
    expect(REFERENCE.categories).toBe(CATEGORIES.ranges.rows)
  })
})
