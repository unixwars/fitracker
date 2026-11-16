import { describe, expect, it } from 'vitest'
import { normaliseName, validateNewAccount, validateNewCategory } from './newItem'

const names = (n: number) => Array.from({ length: n }, (_, i) => `Acc${i}`)
const cat = (name: string, type: 'expense' | 'income', active = true) => ({ name, type, active })

describe('normaliseName', () => {
  it('trims and composes (NFC), so the stored text is what is compared', () => {
    expect(normaliseName('  Caf\u00e9 ')).toBe('Caf\u00e9')
    expect(normaliseName('Cafe\u0301')).toBe('Caf\u00e9')
  })
})

describe('validateNewAccount', () => {
  it('accepts a fresh name, including accents, emoji and CJK', () => {
    for (const n of ['Joint', 'Caf\u00e9', 'Ahorros \ud83d\udc37', '\u73fe\u91d1']) expect(validateNewAccount(n, [])).toBeNull()
  })
  it('refuses an empty name and one over 232 UTF-8 bytes', () => {
    expect(validateNewAccount('   ', [])).toBe('empty')
    expect(validateNewAccount('x'.repeat(232), [])).toBeNull()
    expect(validateNewAccount('x'.repeat(233), [])).toBe('tooLong')
    expect(validateNewAccount('\u73fe'.repeat(78), [])).toBe('tooLong') // 78 x 3 bytes = 234
  })
  it('refuses the characters SUMIFS reads as wildcards or comparisons', () => {
    for (const n of ['Car*', 'a?b', 'x~y', '>0', '<5', '=A1', '+1', '-1', '@x']) expect(validateNewAccount(n, [])).toBe('invalidChars')
    expect(validateNewAccount('a>b', [])).toBeNull() // only a leading comparison matters
  })
  it('matches duplicates like the sheet: ignoring case, spaces at the ends and Unicode form', () => {
    expect(validateNewAccount('cash', ['Cash'])).toBe('duplicate')
    expect(validateNewAccount(' Cash ', ['Cash'])).toBe('duplicate')
    expect(validateNewAccount('Cafe\u0301', ['Caf\u00e9'])).toBe('duplicate')
    expect(validateNewAccount('Cash 2', ['Cash'])).toBeNull()
  })
  it('counts every non-empty name in the column toward the cap of 40, whatever the row holds', () => {
    expect(validateNewAccount('New', names(39))).toBeNull()
    expect(validateNewAccount('New', names(40))).toBe('full')
    expect(validateNewAccount('New', [...names(39), '', '  ', null, undefined])).toBeNull() // blanks do not count
  })
})

describe('validateNewCategory', () => {
  it('is unique per type, so the same name may exist as expense and income', () => {
    expect(validateNewCategory('Other', 'income', [cat('Other', 'expense')])).toBeNull()
    expect(validateNewCategory('other', 'expense', [cat('Other', 'expense', false)])).toBe('duplicate') // inactive rows still clash
  })
  it('caps active rows per type at 30 expense and 15 income, leaving inactive rows out', () => {
    const many = (type: 'expense' | 'income', n: number, active = true) => Array.from({ length: n }, (_, i) => cat(`${type}${i}`, type, active))
    expect(validateNewCategory('New', 'expense', many('expense', 29))).toBeNull()
    expect(validateNewCategory('New', 'expense', many('expense', 30))).toBe('full')
    expect(validateNewCategory('New', 'expense', many('expense', 40, false))).toBeNull()
    expect(validateNewCategory('New', 'income', [...many('income', 15), ...many('expense', 3)])).toBe('full')
    expect(validateNewCategory('New', 'expense', many('income', 15))).toBeNull() // a full income list does not block expenses
  })
  it('applies the same name rules', () => {
    expect(validateNewCategory('', 'expense', [])).toBe('empty')
    expect(validateNewCategory('Car*', 'expense', [])).toBe('invalidChars')
  })
})
