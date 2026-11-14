import { describe, expect, it } from 'vitest'
import { cleanAmountInput, convert, formatMoney, parseAmount, toMinor, toSheetNumber } from './money'

describe('parseAmount', () => {
  it('reads one decimal separator, a dot or a comma, with up to two decimals', () => {
    expect(parseAmount('12.50')).toBe(1250)
    expect(parseAmount('12,5')).toBe(1250)
    expect(parseAmount('12,50')).toBe(1250)
    expect(parseAmount('7')).toBe(700)
    expect(parseAmount('12.')).toBe(1200)
    expect(parseAmount('0.05')).toBe(5)
  })
  it('accepts zero', () => {
    expect(parseAmount('0')).toBe(0)
  })
  it('has no thousands separators: anything with two separators or three decimals is rejected, never guessed', () => {
    for (const bad of ['1.234,56', '1,234.56', '1,234', '12.345', '1.2.3', '1,2,3', '0.125', '0,125']) {
      expect(parseAmount(bad)).toBeNull()
    }
  })
  it('rejects empty, junk, exponents, negatives and spaces inside', () => {
    for (const bad of ['', '  ', 'abc', '1e9', '-3', '.5', '1 234', '1234567890123']) {
      expect(parseAmount(bad)).toBeNull()
    }
  })
})

describe('cleanAmountInput (what the amount field keeps while you type)', () => {
  it('rewrites a comma to a dot and drops everything that is not a digit or the first dot', () => {
    expect(cleanAmountInput('12,5')).toBe('12.5')
    expect(cleanAmountInput('1 234')).toBe('1234')
    expect(cleanAmountInput('-5')).toBe('5')
    expect(cleanAmountInput('abc')).toBe('')
    expect(cleanAmountInput('1.2.3')).toBe('1.23')
    expect(cleanAmountInput('1,2,3')).toBe('1.23')
  })
  it('keeps at most two decimals and starts a leading separator with 0', () => {
    expect(cleanAmountInput('12.345')).toBe('12.34')
    expect(cleanAmountInput(',5')).toBe('0.5')
    expect(cleanAmountInput('.')).toBe('0.')
    expect(cleanAmountInput('12.')).toBe('12.')
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
