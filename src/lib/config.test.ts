import { describe, expect, it } from 'vitest'
import { createConfig } from './config'

const memory = () => {
  const data = new Map<string, string>()
  const writes: string[] = []
  return { data, writes, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(k + '=' + v); data.set(k, v) } } }
}

describe('config', () => {
  it('links a sheet and reads it back; relinking replaces it', () => {
    const m = memory()
    const c = createConfig(m.storage)
    expect(c.getSheetId()).toBeNull()
    c.linkSheet('abc')
    expect(createConfig(m.storage).getSheetId()).toBe('abc')
    c.linkSheet('def')
    expect(c.getSheetId()).toBe('def')
  })
  it('unlinking returns null', () => {
    const c = createConfig(memory().storage)
    c.linkSheet('abc')
    c.unlinkSheet()
    expect(c.getSheetId()).toBeNull()
  })
  it('never reads or writes the old year list', () => {
    const m = memory()
    m.data.set('fitracker.sheets', '{"2024":"old"}')
    const c = createConfig(m.storage)
    expect(c.getSheetId()).toBeNull()
    c.linkSheet('abc')
    c.setDevice({ theme: 'dark' })
    expect(m.writes.some((w) => w.startsWith('fitracker.sheets='))).toBe(false)
  })
  it('keeps device settings with defaults and ignores a stale currency field', () => {
    const m = memory()
    m.data.set('fitracker.device', JSON.stringify({ currency: 'GBP', theme: 'dark' }))
    const c = createConfig(m.storage)
    expect(c.getDevice()).toEqual({ kind: 'expense', places: [], lastCategory: {}, theme: 'dark' })
    c.setDevice({ kind: 'income' })
    expect(c.getDevice()).toMatchObject({ kind: 'income', theme: 'dark' })
  })
  it('survives corrupted storage', () => {
    const m = memory()
    m.data.set('fitracker.device', '[]')
    expect(createConfig(m.storage).getDevice().kind).toBe('expense')
  })
  it('stores only the sheet id and device settings, never a token', () => {
    const m = memory()
    const c = createConfig(m.storage)
    c.linkSheet('sheet-id')
    c.setDevice({ theme: 'light' })
    expect(m.writes.map((w) => w.split('=')[0])).toEqual(['fitracker.sheet', 'fitracker.device'])
    expect(m.writes.every((w) => !/token|ya29|bearer/i.test(w))).toBe(true)
  })
})
