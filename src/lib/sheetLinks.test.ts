import { describe, expect, it } from 'vitest'
import { rowUrl, sheetUrl } from './sheetLinks'

describe('sheet links', () => {
  it('opens the file, a tab, or a row of a tab in Google Sheets', () => {
    expect(sheetUrl('ABC')).toBe('https://docs.google.com/spreadsheets/d/ABC/edit')
    expect(sheetUrl('ABC', 203680765)).toBe('https://docs.google.com/spreadsheets/d/ABC/edit#gid=203680765')
    expect(sheetUrl('ABC', 0, 'A7:I7')).toBe('https://docs.google.com/spreadsheets/d/ABC/edit#gid=0&range=A7:I7')
  })
  it('rowUrl selects the whole row of the unreadable entry, and falls back to the file when the tab id is not known yet', () => {
    const gids = { Ledger: 11, Snapshots: 22 }
    expect(rowUrl('ABC', gids, { tab: 'Ledger', row: 7 })).toBe('https://docs.google.com/spreadsheets/d/ABC/edit#gid=11&range=A7:I7')
    expect(rowUrl('ABC', gids, { tab: 'Snapshots', row: 3 })).toBe('https://docs.google.com/spreadsheets/d/ABC/edit#gid=22&range=A3:E3')
    expect(rowUrl('ABC', {}, { tab: 'Ledger', row: 7 })).toBe('https://docs.google.com/spreadsheets/d/ABC/edit')
  })
  it('encodes an odd spreadsheet id', () => {
    expect(sheetUrl('a b')).toBe('https://docs.google.com/spreadsheets/d/a%20b/edit')
  })
})
