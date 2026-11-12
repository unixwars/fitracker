// 0 -> 1: hidden id column A. Every non-empty row gets an id; the column is hidden.
import { FIRST_ROW, KINDS, TABS } from '../schema'
import type { SheetOp } from '../sheets/types'
import { colIndex } from '../schema'
import type { Migration } from './types'

const blank = (v: unknown) => v === undefined || v === null || v === ''
const isFormula = (v: unknown) => typeof v === 'string' && v.startsWith('=')

export const m0to1: Migration = {
  from: 0,
  to: 1,
  plan(state, ctx) {
    const ops: SheetOp[] = []
    for (const kind of KINDS) {
      const { name, cols } = TABS[kind]
      const used = [cols.date, cols.amount, ...Object.values(cols.fields)].map(colIndex)
      const cIdx = colIndex(cols.base)
      // consecutive rows that need an id are written as one block
      let run: { start: number; ids: string[] } | null = null
      const flush = () => {
        if (run) ops.push({ t: 'set', range: `${name}!${cols.id}${run.start}:${cols.id}${run.start + run.ids.length - 1}`, values: run.ids.map((i) => [i]) })
        run = null
      }
      state.rows[kind].forEach((row, i) => {
        const nonEmpty = used.some((c) => !blank(row[c])) || (!blank(row[cIdx]) && !isFormula(row[cIdx]))
        if (nonEmpty && blank(row[colIndex(cols.id)])) {
          if (!run) run = { start: FIRST_ROW + i, ids: [] }
          run.ids.push(ctx.newId())
        } else flush()
      })
      flush()
      ops.push({ t: 'hideColumn', tab: name, column: cols.id })
    }
    return { ops, flagged: [] }
  },
}
