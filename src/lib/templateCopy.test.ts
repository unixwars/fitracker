import { describe, expect, it } from 'vitest'
import { templateFileId } from './templateCopy'

describe('templateFileId', () => {
  it('reads the id out of the public copy link', () => {
    expect(templateFileId('https://docs.google.com/spreadsheets/d/1ISaC0GTqkYlwsnrUd9IU2wrFjmWYx-jUfcqgaTLp8yY/copy')).toBe('1ISaC0GTqkYlwsnrUd9IU2wrFjmWYx-jUfcqgaTLp8yY')
    expect(templateFileId('https://docs.google.com/spreadsheets/d/abc_DEF-1')).toBe('abc_DEF-1')
  })
  it('is null for an empty or non-sheets URL', () => {
    expect(templateFileId('')).toBeNull()
    expect(templateFileId('https://example.com/spreadsheets/d/abc/copy')).toBeNull()
    expect(templateFileId('https://docs.google.com/document/d/abc/edit')).toBeNull()
  })
})
