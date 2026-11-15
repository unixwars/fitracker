import { describe, expect, it } from 'vitest'
import { showIntro } from './welcome'

describe('showIntro', () => {
  it('shows the intro only to someone signed out with no linked sheet', () => {
    expect(showIntro('unlinked', false)).toBe(true)
  })
  it('keeps the screen short once signed in, or once a sheet is linked or loading', () => {
    expect(showIntro('unlinked', true)).toBe(false)
    expect(showIntro('loading', false)).toBe(false)
    expect(showIntro('ok', false)).toBe(false)
  })
})
