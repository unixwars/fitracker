import { describe, expect, it } from 'vitest'
import { createConfig, MIN_YEAR } from './config'
import { WrongYear } from './errors'
import { verifyYear } from './link'
import { createFakeSheets } from './sheets/fakeSheets'
import { seedV2 } from './sheets/fixtures'

const memory = () => {
  const data = new Map<string, string>()
  const writes: string[] = []
  return { data, writes, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(k + '=' + v); data.set(k, v) } } }
}

describe('config', () => {
  it('rejects years before 2019 and too far in the future', () => {
    const c = createConfig(memory().storage, () => new Date('2026-06-01'))
    expect(MIN_YEAR).toBe(2019)
    expect(() => c.linkSheet(2018, 'x')).toThrow()
    expect(() => c.linkSheet(2028, 'x')).toThrow()
    expect(() => c.linkSheet(2027, 'x')).not.toThrow()
  })
  it('stores the year to spreadsheet-id list and reads it back', () => {
    const m = memory()
    createConfig(m.storage).linkSheet(2024, 'abc')
    createConfig(m.storage).linkSheet(2025, 'def')
    expect(createConfig(m.storage).getSheets()).toEqual({ 2024: 'abc', 2025: 'def' })
  })
  it('unlinks a year', () => {
    const c = createConfig(memory().storage)
    c.linkSheet(2024, 'abc')
    c.unlinkSheet(2024)
    expect(c.getSheets()).toEqual({})
  })
  it('keeps device settings with sensible defaults', () => {
    const c = createConfig(memory().storage)
    expect(c.getDevice()).toMatchObject({ currency: 'EUR', kind: 'expense', places: [] })
    c.setDevice({ currency: 'GBP' })
    expect(c.getDevice().currency).toBe('GBP')
    expect(c.getDevice().kind).toBe('expense')
  })
  it('survives corrupted storage', () => {
    const m = memory()
    m.data.set('fitracker.sheets', '{not json')
    m.data.set('fitracker.device', '[]')
    const c = createConfig(m.storage)
    expect(c.getSheets()).toEqual({})
    expect(c.getDevice().currency).toBe('EUR')
  })
  it('never stores anything that looks like a token', () => {
    const m = memory()
    const c = createConfig(m.storage)
    c.linkSheet(2024, 'sheet-id')
    c.setDevice({ currency: 'USD' })
    expect(m.writes.every((w) => !/token|ya29|bearer/i.test(w))).toBe(true)
  })
})

describe('verifyYear', () => {
  it('accepts a sheet whose Setup year matches', async () => {
    const f = createFakeSheets()
    seedV2(f, 's', { year: 2024 })
    await expect(verifyYear(f, 's', 2024)).resolves.toBeUndefined()
  })
  it('rejects a sheet for another year', async () => {
    const f = createFakeSheets()
    seedV2(f, 's', { year: 2023 })
    await expect(verifyYear(f, 's', 2024)).rejects.toBeInstanceOf(WrongYear)
  })
})
