import { describe, expect, it } from 'vitest'
import { accountEmoji, accountLabel } from './accountIcon'

describe('accountEmoji', () => {
  it('picks an emoji from keywords in the account name', () => {
    expect(accountEmoji('M-Cash EUR')).toBe('💵')
    expect(accountEmoji('T-Cash GBP')).toBe('💵')
    expect(accountEmoji('Joint')).toBe('👥')
    expect(accountEmoji('Visa Credit Card')).toBe('💳')
    expect(accountEmoji('Savings')).toBe('🐷')
    expect(accountEmoji('Current account')).toBe('🏦')
    expect(accountEmoji('Revolut')).toBe('👛')
    expect(accountEmoji('Brokerage')).toBe('📈')
  })
  it('matches words from their start, so "Discard" is not a card', () => {
    expect(accountEmoji('Discard')).toBe('🏦')
  })
  it('falls back to a bank for anything else', () => {
    expect(accountEmoji('Zorp')).toBe('🏦')
  })
  it('labels with the emoji first', () => {
    expect(accountLabel('Joint')).toBe('👥 Joint')
  })
})
