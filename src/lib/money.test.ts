import { describe, expect, it } from 'vitest'
import { convert, formatMoney, parseAmount, toMinor, toSheetNumber } from './money'

describe('parseAmount', () => {
  it('parses plain decimals', () => {
    expect(parseAmount('12.50')).toBe(1250)
    expect(parseAmount('12,5')).toBe(1250)
    expect(parseAmount('7')).toBe(700)
  })
  it('handles thousands separators in both locales', () => {
    expect(parseAmount('1.234,56')).toBe(123456)
    expect(parseAmount('1,234.56')).toBe(123456)
    expect(parseAmount('1,234')).toBe(123400)
    expect(parseAmount('12.345')).toBe(1234500)
  })
  it('accepts zero', () => {
    expect(parseAmount('0')).toBe(0)
  })
  it('rejects empty, junk, exponents and negatives', () => {
    for (const bad of ['', '  ', 'abc', '1e9', '-3', '1.2.3,4,5', '1.234,567', '0.125', '0,125']) {
      expect(parseAmount(bad)).toBeNull()
    }
  })
})

describe('sheet number conversion', () => {
  it('rounds float noise', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30)
    expect(toSheetNumber(1250)).toBe(12.5)
  })
})

describe('convert', () => {
  const rates = { EUR: 1, GBP: 1.15, USD: 0.9 }
  it('returns same money for same currency', () => {
    const m = { minor: 999, currency: 'EUR' as const }
    expect(convert(m, 'EUR', rates)).toEqual(m)
  })
  it('converts through the base and rounds half away from zero', () => {
    expect(convert({ minor: 1000, currency: 'GBP' }, 'EUR', rates)).toEqual({ minor: 1150, currency: 'EUR' })
    expect(convert({ minor: 1, currency: 'GBP' }, 'EUR', { ...rates, GBP: 1.5 })).toEqual({ minor: 2, currency: 'EUR' })
    expect(convert({ minor: 1150, currency: 'EUR' }, 'GBP', rates)).toEqual({ minor: 1000, currency: 'GBP' })
  })
})

describe('formatMoney', () => {
  it('includes the amount and a currency marker', () => {
    const s = formatMoney({ minor: 123456, currency: 'EUR' }, 'en-GB')
    expect(s).toContain('1,234.56')
    expect(s).toContain('€')
  })
})
