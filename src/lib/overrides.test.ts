import { describe, expect, it } from 'vitest'
import { accountKey, applyOverrides, categoryIconKey, accountIconKey, isEmoji, parseOverrides, toggleValue, OVERRIDE_PREFIX } from './overrides'
import type { Reference } from './types'

const ref: Reference = {
  base: 'EUR',
  accounts: [
    { name: 'Joint', currency: 'EUR', active: true, inMonthly: true, inAnnual: true },
    { name: 'Cash', currency: 'EUR', active: true, inMonthly: false, inAnnual: false },
  ],
  categories: [],
  budgets: [],
}

describe('keys', () => {
  it('builds one key per name under the fitracker prefix', () => {
    expect(accountKey('Joint')).toBe(OVERRIDE_PREFIX + 'account.Joint')
    expect(accountIconKey('Joint')).toBe(OVERRIDE_PREFIX + 'icon.account.Joint')
    expect(categoryIconKey('Rent')).toBe(OVERRIDE_PREFIX + 'icon.category.Rent')
  })
  it('refuses a key that would exceed the 256-byte limit', () => {
    expect(() => accountKey('x'.repeat(300))).toThrow()
  })
})

describe('isEmoji', () => {
  it('accepts one emoji, with or without modifiers', () => {
    expect(isEmoji('🏦')).toBe(true)
    expect(isEmoji('👨‍👩‍👧')).toBe(true)
  })
  it('rejects empty, text and several emojis', () => {
    expect(isEmoji('')).toBe(false)
    expect(isEmoji('ab')).toBe(false)
    expect(isEmoji('🏦🏦')).toBe(false)
  })
})

describe('parseOverrides', () => {
  it('reads toggles and icons by name and ignores foreign or malformed entries', () => {
    const o = parseOverrides({
      [accountKey('Joint')]: '{"m":false,"a":true}',
      [accountKey('Bad')]: 'not json',
      [accountIconKey('Joint')]: '🐷',
      [categoryIconKey('Rent')]: '🏠',
      [categoryIconKey('Rent2')]: 'text',
      'fitracker.schemaVersion': '3',
      'other.key': 'x',
    })
    expect(o.accounts.get('Joint')).toEqual({ inMonthly: false, inAnnual: true })
    expect(o.accounts.has('Bad')).toBe(false)
    expect(o.accountIcons.get('Joint')).toBe('🐷')
    expect(o.categoryIcons.get('Rent')).toBe('🏠')
    expect(o.categoryIcons.has('Rent2')).toBe(false)
  })
  it('treats an empty value as no override', () => {
    const o = parseOverrides({ [accountKey('Joint')]: '', [accountIconKey('Joint')]: '' })
    expect(o.accounts.size).toBe(0)
    expect(o.accountIcons.size).toBe(0)
  })
  it('keeps one field when the other is absent', () => {
    expect(parseOverrides({ [accountKey('Joint')]: '{"a":false}' }).accounts.get('Joint')).toEqual({ inAnnual: false })
  })
})

describe('applyOverrides', () => {
  it('replaces the ticks of matching accounts and leaves the rest', () => {
    const o = parseOverrides({ [accountKey('Cash')]: '{"m":true}', [accountKey('Gone')]: '{"m":true}' })
    const out = applyOverrides(ref, o)
    expect(out.accounts[0]).toEqual(ref.accounts[0])
    expect(out.accounts[1]).toMatchObject({ name: 'Cash', inMonthly: true, inAnnual: false })
    expect(out.accounts).toHaveLength(2)
  })
  it('does not mutate the input', () => {
    applyOverrides(ref, parseOverrides({ [accountKey('Cash')]: '{"m":true}' }))
    expect(ref.accounts[1].inMonthly).toBe(false)
  })
})

describe('toggleValue', () => {
  it('merges a change into the existing value and clears when it matches the sheet', () => {
    expect(toggleValue({ inAnnual: false }, 'inMonthly', false, true)).toBe('{"a":false,"m":false}')
    expect(toggleValue({ inMonthly: false }, 'inMonthly', true, true)).toBe('')
    expect(toggleValue(undefined, 'inAnnual', true, false)).toBe('{"a":true}')
  })
})
