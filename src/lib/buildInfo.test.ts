import { describe, expect, it } from 'vitest'
import { shortVersion, versionLabel } from './buildInfo'

describe('versionLabel', () => {
  it('shows the version and the short commit', () => {
    expect(versionLabel('0.2.0', 'abc1234def')).toBe('0.2.0 (abc1234)')
  })
  it('leaves the commit out when it is unknown', () => {
    expect(versionLabel('0.2.0', '')).toBe('0.2.0')
    expect(versionLabel('0.2.0', 'unknown')).toBe('0.2.0')
  })
})

describe('shortVersion', () => {
  it('is v plus the version for a release build', () => expect(shortVersion('0.2.1', 'abc1234def', false)).toBe('v0.2.1'))
  it('is the short commit in parentheses for a dev build', () => expect(shortVersion('0.2.1', 'abc1234def', true)).toBe('(abc1234)'))
  it('falls back to (dev) when the commit is unknown', () => {
    expect(shortVersion('0.2.1', '', true)).toBe('(dev)')
    expect(shortVersion('0.2.1', 'unknown', true)).toBe('(dev)')
  })
})
