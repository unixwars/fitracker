// The small surface of the Sheets API the app uses. The real client and the in-memory fake
// implement it; migrations describe structural changes as SheetOp values.
export type RenderOption = 'UNFORMATTED_VALUE' | 'FORMULA'

export type SheetOp =
  | { t: 'copyTab'; from: string; to: string }
  | { t: 'set'; range: string; values: unknown[][] } // strings starting with "=" are formulas
  | { t: 'clear'; range: string }
  | { t: 'hideColumn'; tab: string; column: string }
  | { t: 'listValidation'; range: string; values: string[] }
  | { t: 'numberFormat'; range: string; pattern: string }
  | { t: 'metadata'; key: string; value: string }

export interface SheetsApi {
  /** Values for each requested range, in request order. Trailing empty rows/cells are trimmed. */
  batchGet(spreadsheetId: string, ranges: string[], render?: RenderOption): Promise<unknown[][][]>
  /** Writes literal values (valueInputOption RAW). */
  valuesBatchUpdate(spreadsheetId: string, data: { range: string; values: unknown[][] }[]): Promise<void>
  valuesBatchClear(spreadsheetId: string, ranges: string[]): Promise<void>
  /** Applies all ops atomically, or none. */
  applyOps(spreadsheetId: string, ops: SheetOp[]): Promise<void>
  getMetadata(spreadsheetId: string, key: string): Promise<string | null>
}
