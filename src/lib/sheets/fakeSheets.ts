// In-memory Sheets API used by unit tests and the offline end-to-end mode. It models just what
// the app relies on: values (literal or formula with a computed value), trimmed reads, atomic ops.
import { ApiError, AuthExpired, RateLimited } from '../errors'
import { numToCol, parseRange } from './a1'
import type { RenderOption, SheetOp, SheetsApi } from './types'

export type Cell = { v: unknown; f?: string }

export class Book {
  sheets = new Map<string, Map<string, Cell>>()
  hidden = new Set<string>() // "Tab!A"
  validations: { range: string; values: string[] }[] = []
  formats: Record<string, string> = {}
  metadata = new Map<string, string>()

  clone(): Book {
    const b = new Book()
    for (const [name, cells] of this.sheets) b.sheets.set(name, new Map([...cells].map(([k, c]) => [k, { ...c }])))
    b.hidden = new Set(this.hidden)
    b.validations = this.validations.map((x) => ({ ...x }))
    b.formats = { ...this.formats }
    b.metadata = new Map(this.metadata)
    return b
  }

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
    for (let row = r.r1; row <= r.r2; row++) {
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
    for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) t.delete(`${row},${col}`)
  }
}

export type FakeSheets = SheetsApi & {
  book(id: string): Book
  calls: { method: string; args: unknown[] }[]
  count(method: string): number
  failNext(status: number): void
  failApplyAfter(opsApplied: number): void
  afterNextWrite(fn: () => void): void
  injectWrite(id: string, range: string, values: unknown[][]): void
}

export function createFakeSheets(): FakeSheets {
  const books = new Map<string, Book>()
  const calls: FakeSheets['calls'] = []
  let failStatus: number | null = null
  let failApply: number | null = null
  let afterWrite: (() => void) | null = null

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
  const fireAfterWrite = () => {
    const fn = afterWrite
    afterWrite = null
    fn?.()
  }

  return {
    book,
    calls,
    count: (m) => calls.filter((c) => c.method === m).length,
    failNext: (s) => { failStatus = s },
    failApplyAfter: (n) => { failApply = n },
    afterNextWrite: (fn) => { afterWrite = fn },
    injectWrite: (id, range, values) => book(id).write(range, values),

    async batchGet(id, ranges, render = 'UNFORMATTED_VALUE') {
      enter('batchGet', id, ranges, render)
      return ranges.map((r) => book(id).read(r, render))
    },
    async valuesBatchUpdate(id, data) {
      enter('valuesBatchUpdate', id, data)
      for (const d of data) book(id).write(d.range, d.values)
      fireAfterWrite()
    },
    async valuesBatchClear(id, ranges) {
      enter('valuesBatchClear', id, ranges)
      for (const r of ranges) book(id).clear(r)
      fireAfterWrite()
    },
    async applyOps(id, ops: SheetOp[]) {
      enter('applyOps', id, ops)
      const next = book(id).clone()
      const limit = failApply
      failApply = null
      ops.forEach((op, i) => {
        if (limit !== null && i >= limit) throw new ApiError(500, 'injected mid-batch failure')
        applyOp(next, op)
      })
      books.set(id, next)
    },
    async getMetadata(id, key) {
      enter('getMetadata', id, key)
      return book(id).metadata.get(key) ?? null
    },
  }
}

function applyOp(b: Book, op: SheetOp): void {
  switch (op.t) {
    case 'copyTab': {
      if (b.sheets.has(op.to)) throw new ApiError(400, `Tab ${op.to} already exists`)
      const src = b.sheets.get(op.from)
      if (!src) throw new ApiError(400, `No tab ${op.from}`)
      b.sheets.set(op.to, new Map([...src].map(([k, c]) => [k, { ...c }])))
      break
    }
    case 'set': {
      const r = parseRange(op.range)
      op.values.forEach((vals, i) => vals.forEach((v, j) => {
        const ref = `${r.sheet}!${numToCol(r.c1 + j)}${r.r1 + i}`
        if (typeof v === 'string' && v.startsWith('=')) b.set(ref, { f: v, v: '' })
        else b.set(ref, v)
      }))
      break
    }
    case 'clear': b.clear(op.range); break
    case 'hideColumn': b.hidden.add(`${op.tab}!${op.column}`); break
    case 'listValidation': b.validations.push({ range: op.range, values: op.values }); break
    case 'numberFormat': b.formats[op.range] = op.pattern; break
    case 'metadata': b.metadata.set(op.key, op.value); break
  }
}
