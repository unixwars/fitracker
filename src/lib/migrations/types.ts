import type { Kind } from '../rows'
import type { SheetOp } from '../sheets/types'
import type { Currency } from '../types'

// Raw sheet content read with FORMULA rendering: formulas appear as strings starting with "=".
export type SheetState = {
  headers: Record<Kind, unknown[]> // row 9, from column B
  rows: Record<Kind, unknown[][]> // from row 10, columns A..last
}
export type MigrationCtx = { newId: () => string; baseCurrency: Currency }
export type Flagged = { kind: Kind; row: number; reason: string }
export type Migration = {
  from: number
  to: number
  plan(state: SheetState, ctx: MigrationCtx): { ops: SheetOp[]; flagged: Flagged[] }
}
