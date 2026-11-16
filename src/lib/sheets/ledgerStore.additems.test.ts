import { describe, expect, it } from 'vitest'
import { UnrecognisedLayout } from '../errors'
import type { Entry } from '../rows'
import { createFakeSheets } from './fakeSheets'
import { seedLedger } from './fixtures'
import { createLedgerStore } from './ledgerStore'

function setup(opts: { entries?: Entry[] } = {}) {
  const fake = createFakeSheets()
  seedLedger(fake, 'S1', { today: '2026-11-12', ...opts })
  return { fake, store: createLedgerStore(fake, 'S1', { now: () => 1000 }) }
}
const rowOf = (fake: ReturnType<typeof createFakeSheets>, range: string) => fake.book('S1').read(range, 'UNFORMATTED_VALUE')[0] ?? []
const accountRows = (fake: ReturnType<typeof createFakeSheets>) => fake.book('S1').read('Accounts!A2:E', 'UNFORMATTED_VALUE')
const writes = (fake: ReturnType<typeof createFakeSheets>) => fake.calls.filter((c) => c.method === 'valuesBatchUpdate').flatMap((c) => c.args[1] as { range: string; values: unknown[][] }[])

describe('addAccount', () => {
  it('writes the next free row as RAW values: name, currency, active, In Monthly, In Annual', async () => {
    const { fake, store } = setup()
    const before = accountRows(fake).length
    const r = await store.addAccount({ name: '  Savings ', currency: 'GBP' })
    expect(r).toMatchObject({ ok: true, added: { kind: 'account', row: 2 + before, name: 'Savings' } })
    expect(rowOf(fake, `Accounts!A${2 + before}:E${2 + before}`)).toEqual(['Savings', 'GBP', true, true, true])
    expect(fake.calls.filter((c) => c.method === 'valuesBatchUpdate').at(-1)!.args[2]).toBe('RAW')
  })
  it('refuses a duplicate (any case), an invalid name and a full list, writing nothing', async () => {
    const { fake, store } = setup()
    const existing = String(accountRows(fake)[0][0])
    const w = writes(fake).length
    expect(await store.addAccount({ name: existing.toUpperCase(), currency: 'EUR' })).toEqual({ ok: false, reason: 'duplicate' })
    expect(await store.addAccount({ name: 'Car*', currency: 'EUR' })).toEqual({ ok: false, reason: 'invalidChars' })
    for (let i = accountRows(fake).length; i < 40; i++) expect(await store.addAccount({ name: `Fill${i}`, currency: 'EUR' })).toMatchObject({ ok: true })
    const total = writes(fake).length
    expect(await store.addAccount({ name: 'OneTooMany', currency: 'EUR' })).toEqual({ ok: false, reason: 'full' })
    expect(writes(fake).length).toBe(total)
    expect(total).toBeGreaterThan(w)
  })
  it('never grows Accounts: with the tab at 41 rows a gap row is reused, and without one it is full', async () => {
    const { fake, store } = setup()
    fake.tabMaxRows.Accounts = 41
    fake.book('S1').write('Accounts!A41:E41', [['Last', 'EUR', true, true, true]]) // row 41 used, rows between are empty gaps
    const r = await store.addAccount({ name: 'InGap', currency: 'EUR' })
    expect(r.ok && r.added.row).toBeLessThan(41)
    expect(fake.count('growTab')).toBe(0)
    for (let row = 2; row <= 41; row++) if (!rowOf(fake, `Accounts!A${row}:B${row}`)[0]) fake.book('S1').write(`Accounts!A${row}:E${row}`, [[`N${row}`, 'EUR', true, true, true]])
    const full = await store.addAccount({ name: 'NoRoom', currency: 'EUR' })
    expect(full).toEqual({ ok: false, reason: 'full' })
    expect(fake.count('growTab')).toBe(0)
  })
  it('does not treat checkbox-only rows or a half typed row as free', async () => {
    const { fake, store } = setup()
    const n = accountRows(fake).length
    fake.book('S1').write(`Accounts!C${2 + n}:E${2 + n}`, [[false, false, false]]) // validation left FALSE behind
    fake.book('S1').write(`Accounts!B${3 + n}:B${3 + n}`, [['EUR']]) // a currency with no name yet
    const r = await store.addAccount({ name: 'Fresh', currency: 'EUR' })
    expect(r.ok && r.added.row).toBe(4 + n)
    expect(rowOf(fake, `Accounts!B${3 + n}:B${3 + n}`)).toEqual(['EUR'])
  })
  it('refuses with UnrecognisedLayout, before any write, when the headers are not the layout', async () => {
    const { fake, store } = setup()
    fake.book('S1').write('Accounts!A1:E1', [['name', 'extra', 'currency', 'active', 'In Monthly']])
    await expect(store.addAccount({ name: 'X', currency: 'EUR' })).rejects.toBeInstanceOf(UnrecognisedLayout)
    fake.book('S1').clear('Accounts!A1:E1')
    await expect(store.addAccount({ name: 'X', currency: 'EUR' })).rejects.toBeInstanceOf(UnrecognisedLayout)
    expect(writes(fake)).toHaveLength(0)
  })
  it('writes only A:E of the Accounts tab, in two reads and one write, and does not grow it', async () => {
    const { fake, store } = setup()
    const calls = fake.calls.length
    await store.addAccount({ name: 'Counted', currency: 'EUR' })
    const mine = fake.calls.slice(calls)
    expect(mine.filter((c) => c.method === 'batchGet')).toHaveLength(2) // the guard read and the read-back
    expect(mine.filter((c) => c.method === 'valuesBatchUpdate')).toHaveLength(1)
    expect(mine.some((c) => c.method === 'growTab')).toBe(false)
    for (const w of writes(fake)) expect(w.range).toMatch(/^Accounts!A\d+:E\d+$/)
  })
  it('retries the next row when another device wrote a different name to the row it chose, and never reports that as a duplicate', async () => {
    const { fake, store } = setup()
    const n = accountRows(fake).length
    fake.afterNextWrite(() => fake.book('S1').write(`Accounts!A${2 + n}:E${2 + n}`, [['Rival', 'EUR', true, true, true]]))
    const r = await store.addAccount({ name: 'Mine', currency: 'EUR' })
    expect(r.ok && r.added.row).toBe(3 + n)
    expect(rowOf(fake, `Accounts!A${2 + n}:A${2 + n}`)).toEqual(['Rival'])
  })
  it('gives up with tryAgain after three lost races', async () => {
    const { fake, store } = setup()
    const n = accountRows(fake).length
    let i = 0
    const rival = () => { fake.book('S1').write(`Accounts!A${2 + n + i}:E${2 + n + i}`, [[`Rival${i}`, 'EUR', true, true, true]]); i++; if (i < 3) fake.afterNextWrite(rival) }
    fake.afterNextWrite(rival)
    expect(await store.addAccount({ name: 'Unlucky', currency: 'EUR' })).toEqual({ ok: false, reason: 'tryAgain' })
  })
  it('shows up in lists() after the next read', async () => {
    const { store } = setup()
    await store.addAccount({ name: 'Visible', currency: 'USD' })
    const a = (await store.lists()).accounts.find((x) => x.name === 'Visible')
    expect(a).toEqual({ name: 'Visible', currency: 'USD', active: true, inMonthly: true, inAnnual: true })
  })
})

describe('addCategory', () => {
  it('writes name, type, active to the next free row and appears in lists()', async () => {
    const { fake, store } = setup()
    const n = fake.book('S1').read('Categories!A2:C', 'UNFORMATTED_VALUE').length
    const r = await store.addCategory({ name: 'Hobbies', type: 'expense' })
    expect(r).toMatchObject({ ok: true, added: { kind: 'category', row: 2 + n } })
    expect(rowOf(fake, `Categories!A${2 + n}:C${2 + n}`)).toEqual(['Hobbies', 'expense', true])
    expect((await store.lists()).categories.find((c) => c.name === 'Hobbies')).toEqual({ name: 'Hobbies', type: 'expense', active: true })
  })
  it('allows the same name in the other type, refuses it in the same type', async () => {
    const { store } = setup()
    expect(await store.addCategory({ name: 'Extra', type: 'income' })).toMatchObject({ ok: true })
    expect(await store.addCategory({ name: 'extra', type: 'income' })).toEqual({ ok: false, reason: 'duplicate' })
    expect(await store.addCategory({ name: 'Extra', type: 'expense' })).toMatchObject({ ok: true })
  })
  it('grows the Categories tab once when it is full, and refuses a changed header', async () => {
    const { fake, store } = setup()
    const n = fake.book('S1').read('Categories!A2:C', 'UNFORMATTED_VALUE').length
    fake.tabMaxRows.Categories = 1 + n
    expect(await store.addCategory({ name: 'Beyond', type: 'expense' })).toMatchObject({ ok: true })
    expect(fake.count('growTab')).toBe(1)
    fake.book('S1').write('Categories!A1:C1', [['type', 'name', 'active']])
    await expect(store.addCategory({ name: 'Nope', type: 'expense' })).rejects.toBeInstanceOf(UnrecognisedLayout)
  })
  it('writes nothing to any other tab', async () => {
    const { fake, store } = setup()
    await store.addCategory({ name: 'OnlyHere', type: 'expense' })
    for (const w of writes(fake)) expect(w.range).toMatch(/^Categories!A\d+:C\d+$/)
  })
})

describe('undoAddItem', () => {
  it('clears the row it wrote, leaving the row itself', async () => {
    const { fake, store } = setup()
    const r = await store.addAccount({ name: 'Oops', currency: 'EUR' })
    if (!r.ok) throw new Error('add failed')
    expect(await store.undoAddItem(r.added)).toEqual({ ok: true })
    expect(rowOf(fake, `Accounts!A${r.added.row}:E${r.added.row}`)).toEqual([])
    expect((await store.lists()).accounts.some((a) => a.name === 'Oops')).toBe(false)
  })
  it('refuses, writing nothing, when the row was edited since', async () => {
    const { fake, store } = setup()
    const r = await store.addCategory({ name: 'Typo', type: 'expense' })
    if (!r.ok) throw new Error('add failed')
    fake.book('S1').write(`Categories!A${r.added.row}:C${r.added.row}`, [['Typo', 'expense', false]])
    expect(await store.undoAddItem(r.added)).toEqual({ ok: false, reason: 'changed' })
    expect(rowOf(fake, `Categories!A${r.added.row}:C${r.added.row}`)).toEqual(['Typo', 'expense', false])
  })
  it('refuses when an entry or snapshot already uses the name, so no history is orphaned', async () => {
    const { fake, store } = setup()
    const r = await store.addAccount({ name: 'Used', currency: 'EUR' })
    if (!r.ok) throw new Error('add failed')
    await store.addMany([{ id: 'e1', kind: 'expense', date: '2026-11-12', money: { minor: 100, currency: 'EUR' }, description: 'x', category: 'Groceries', account: 'Used' }])
    expect(await store.undoAddItem(r.added)).toEqual({ ok: false, reason: 'inUse' })
    expect(rowOf(fake, `Accounts!A${r.added.row}:A${r.added.row}`)).toEqual(['Used'])
  })
})
