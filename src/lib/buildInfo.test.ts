import { describe, expect, it } from 'vitest'
import { versionLabel } from './buildInfo'

describe('versionLabel', () => {
  it('shows the version and the short commit', () => {
    expect(versionLabel('0.2.0', 'abc1234def')).toBe('0.2.0 (abc1234)')
  })
  it('leaves the commit out when it is unknown', () => {
    expect(versionLabel('0.2.0', '')).toBe('0.2.0')
    expect(versionLabel('0.2.0', 'unknown')).toBe('0.2.0')
  })
})
