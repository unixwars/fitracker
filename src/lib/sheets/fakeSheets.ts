// In-memory Sheets API used by unit tests and the offline end-to-end mode. It models just what
// the app relies on: values (literal or formula with a computed value), trimmed reads, atomic ops.
import { ApiError, AuthExpired, RateLimited } from '../errors'
import { numToCol, parseRange } from './a1'
import type { RenderOption, SheetsApi } from './types'

export type Cell = { v: unknown; f?: string }

export class Book {
  sheets = new Map<string, Map<string, Cell>>()
  metadata = new Map<string, string>()

  tab(name: string): Map<string, Cell> {
    let t = this.sheets.get(name)
    if (!t) this.sheets.set(name, (t = new Map()))
    return t
  }

  /** Sets one cell by A1 reference ("Expenses!B10"). A {f, v} value is a formula with its computed value. */
  set(ref: string, value: unknown): void {
    const r = parseRange(ref)
    const key = `${r.r1},${r.c1}`
    const t = this.tab(r.sheet)
    if (value === '' || value === undefined || value === null) t.delete(key)
    else if (typeof value === 'object' && value !== null && 'f' in value) t.set(key, { v: (value as Cell).v ?? '', f: (value as Cell).f })
    else t.set(key, { v: value })
  }

  get(ref: string): Cell | undefined {
    const r = parseRange(ref)
    return this.sheets.get(r.sheet)?.get(`${r.r1},${r.c1}`)
  }

  read(range: string, render: RenderOption): unknown[][] {
    const r = parseRange(range)
    const t = this.sheets.get(r.sheet) ?? new Map<string, Cell>()
    const rows: unknown[][] = []
    for (let row = r.r1; row <= Math.min(r.r2, this.lastRow(r.sheet)); row++) {
      const out: unknown[] = []
      for (let col = r.c1; col <= r.c2; col++) {
        const c = t.get(`${row},${col}`)
        out.push(c === undefined ? '' : render === 'FORMULA' && c.f !== undefined ? c.f : c.v)
      }
      while (out.length && out[out.length - 1] === '') out.pop()
      rows.push(out)
    }
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop()
    return rows
  }

  write(range: string, values: unknown[][]): void {
    const r = parseRange(range)
    values.forEach((vals, i) => vals.forEach((v, j) => this.set(`${r.sheet}!${numToCol(r.c1 + j)}${r.r1 + i}`, v)))
  }

  clear(range: string): void {
    const r = parseRange(range)
    const t = this.tab(r.sheet)
    for (let row = r.r1; row <= Math.min(r.r2, this.lastRow(r.sheet)); row++) for (let col = r.c1; col <= r.c2; col++) t.delete(`${row},${col}`)
  }

  lastRow(sheet: string): number {
    let max = 0
    for (const key of this.sheets.get(sheet)?.keys() ?? []) max = Math.max(max, Number(key.split(',')[0]))
    return max
  }
}

export type FakeSheets = SheetsApi & {
  book(id: string): Book
  calls: { method: string; args: unknown[] }[]
  count(method: string): number
  failNext(status: number): void
  afterNextWrite(fn: () => void): void
  /** Runs `fn` just before the next write lands (simulates a competing device). */
  beforeNextWrite(fn: () => void): void
  /** Values `=GOOGLEFINANCE("CURRENCY:XXXYYY")` takes when written with USER_ENTERED, by XXX. */
  liveRates: Record<string, number>
  /** When true, reading a range on a tab that does not exist is a 400, like the real API. */
  strictTabs: boolean
  injectWrite(id: string, range: string, values: unknown[][]): void
}

export function createFakeSheets(): FakeSheets {
  const books = new Map<string, Book>()
  const calls: FakeSheets['calls'] = []
  let failStatus: number | null = null
  let afterWrite: (() => void) | null = null
  let beforeWrite: (() => void) | null = null

  const book = (id: string): Book => {
    let b = books.get(id)
    if (!b) books.set(id, (b = new Book()))
    return b
  }
  const enter = (method: string, ...args: unknown[]) => {
    calls.push({ method, args })
    if (failStatus !== null) {
      const s = failStatus
      failStatus = null
      if (s === 401) throw new AuthExpired()
      if (s === 429) throw new RateLimited(0)
      throw new ApiError(s, 'injected failure')
    }
  }
  const fireBeforeWrite = () => {
    const fn = beforeWrite
    beforeWrite = null
    fn?.()
  }
  const fireAfterWrite = () => {
    const fn = afterWrite
    afterWrite = null
    fn?.()
  }

  const fake: FakeSheets = {
    book,
    calls,
    count: (m) => calls.filter((c) => c.method === m).length,
    failNext: (s) => { failStatus = s },
    afterNextWrite: (fn) => { afterWrite = fn },
    beforeNextWrite: (fn) => { beforeWrite = fn },
    liveRates: { EUR: 1, GBP: 1.17, USD: 0.94 },
    strictTabs: false,
    injectWrite: (id, range, values) => book(id).write(range, values),

    async batchGet(id, ranges, render = 'UNFORMATTED_VALUE') {
      enter('batchGet', id, ranges, render)
      if (fake.strictTabs) {
        for (const r of ranges) {
          const tab = parseRange(r).sheet
          if (!book(id).sheets.has(tab)) throw new ApiError(400, `Unable to parse range: ${r}`)
        }
      }
      return ranges.map((r) => book(id).read(r, render))
    },
    async valuesBatchUpdate(id, data, input = 'RAW') {
      enter('valuesBatchUpdate', id, data, input)
      fireBeforeWrite()
      for (const d of data) {
        const values = input === 'USER_ENTERED' ? d.values.map((row) => row.map((v) => userEntered(v, fake.liveRates))) : d.values
        book(id).write(d.range, values)
      }
      fireAfterWrite()
    },
    async valuesAppend(id, range, values) {
      enter('valuesAppend', id, range, values)
      fireBeforeWrite()
      const r = parseRange(range)
      const b = book(id)
      let last = 0
      for (const key of b.sheets.get(r.sheet)?.keys() ?? []) {
        const [row, col] = key.split(',').map(Number)
        if (col >= r.c1 && col <= r.c2) last = Math.max(last, row)
      }
      const first = Math.max(last + 1, 2)
      b.write(`${r.sheet}!${numToCol(r.c1)}${first}:${numToCol(r.c1 + Math.max(...values.map((v) => v.length)) - 1)}${first + values.length - 1}`, values)
      fireAfterWrite()
      return { updatedRange: `${r.sheet}!${numToCol(r.c1)}${first}:${numToCol(r.c2)}${first + values.length - 1}` }
    },
    async valuesBatchClear(id, ranges) {
      enter('valuesBatchClear', id, ranges)
      fireBeforeWrite()
      for (const r of ranges) book(id).clear(r)
      fireAfterWrite()
    },
    async setMetadata(id, key, value) {
      enter('setMetadata', id, key, value)
      book(id).metadata.set(key, value)
    },
    async getMetadata(id, key) {
      enter('getMetadata', id, key)
      return book(id).metadata.get(key) ?? null
    },
  }
  return fake
}

// USER_ENTERED: a GOOGLEFINANCE current-rate formula becomes a formula cell whose value is the live rate.
function userEntered(v: unknown, live: Record<string, number>): unknown {
  if (typeof v !== 'string' || !v.startsWith('=')) return v
  const m = /^=GOOGLEFINANCE\("CURRENCY:([A-Z]{3})[A-Z]{3}"\)$/.exec(v)
  return { f: v, v: m ? (live[m[1]] ?? '') : '' }
}
