import { describe, expect, it } from 'vitest'
import { installUi, isIos } from './install'

const ev = { prompt: async () => undefined }

describe('installUi', () => {
  it('offers the button while the browser has an install prompt ready', () => {
    expect(installUi({ prompt: ev, installed: false, ios: false, standalone: false })).toBe('button')
  })
  it('shows the Share hint on iOS, where there is no install event', () => {
    expect(installUi({ prompt: null, installed: false, ios: true, standalone: false })).toBe('ios-hint')
  })
  it('shows nothing once installed or running as the installed app', () => {
    expect(installUi({ prompt: ev, installed: true, ios: false, standalone: false })).toBe('none')
    expect(installUi({ prompt: null, installed: false, ios: true, standalone: true })).toBe('none')
  })
  it('shows nothing where the browser cannot install', () => {
    expect(installUi({ prompt: null, installed: false, ios: false, standalone: false })).toBe('none')
  })
})

describe('isIos', () => {
  it('recognises iPhone and iPad, including iPadOS that reports itself as a Mac', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true)
  })
  it('is false for a real Mac and for Android', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false)
    expect(isIos('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5)).toBe(false)
  })
})
