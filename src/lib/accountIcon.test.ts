import { describe, expect, it } from 'vitest'
import { ACCOUNT_ICON_PATHS, accountEmoji, accountIcon, BROKERS } from './accountIcon'

describe('accountEmoji', () => {
  it('picks an emoji from keywords in the account name', () => {
    expect(accountEmoji('M-Cash EUR')).toBe('💵')
    expect(accountEmoji('T-Cash GBP')).toBe('💵')
    expect(accountEmoji('Joint')).toBe('👥')
    expect(accountEmoji('Visa Credit Card')).toBe('💳')
    expect(accountEmoji('Savings')).toBe('🐷')
    expect(accountEmoji('Current account')).toBe('🏦')
    expect(accountEmoji('Brokerage')).toBe('📈')
  })
  it('matches words from their start, so "Discard" is not a card', () => {
    expect(accountEmoji('Discard')).toBe('🏦')
  })
  it('falls back to a bank for anything else', () => {
    expect(accountEmoji('Zorp')).toBe('🏦')
  })
  it('there is no purse: wallets and neobanks are banks', () => {
    for (const n of ['Revolut', 'Wise', 'PayPal', 'Chase', 'Monzo']) expect(accountEmoji(n)).toBe('🏦')
  })
  it('knows 40 EU, 30 US and 30 UK brokers by name', () => {
    expect([BROKERS.eu.length, BROKERS.us.length, BROKERS.uk.length]).toEqual([40, 30, 30])
    for (const n of ['DEGIRO', 'Trading 212 ISA', 'Scalable Capital', 'Trade Republic', 'XTB', 'Interactive Brokers', 'Fidelity', 'Charles Schwab', 'Robinhood', 'Hargreaves Lansdown', 'HL', 'AJ Bell', 'Freetrade', 'Vanguard']) expect(accountEmoji(n)).toBe('📈')
  })
  it('short broker names only match as whole words', () => {
    for (const n of ['Stakeholder', 'Light', 'Igloo', 'Chmc']) expect(accountEmoji(n)).toBe('🏦')
  })
  it('every kind has an emoji and a monochrome path, and names map to the same kind', () => {
    expect(accountIcon('Joint')).toBe('joint')
    expect(accountIcon('DEGIRO')).toBe('invest')
    expect(accountIcon('Zorp')).toBe('bank')
    for (const k of ['cash', 'card', 'savings', 'invest', 'joint', 'bank'] as const) expect(ACCOUNT_ICON_PATHS[k].startsWith('M')).toBe(true)
  })
})
