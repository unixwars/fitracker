// The small surface of the Sheets API the app uses. The real client and the in-memory fake
// implement it.
export type RenderOption = 'UNFORMATTED_VALUE' | 'FORMULA'

export interface SheetsApi {
  /** Values for each requested range, in request order. Trailing empty rows/cells are trimmed. */
  batchGet(spreadsheetId: string, ranges: string[], render?: RenderOption): Promise<unknown[][][]>
  /** Writes values: RAW (default, text is never a formula) or USER_ENTERED (strings starting with "=" become formulas). */
  valuesBatchUpdate(spreadsheetId: string, data: { range: string; values: unknown[][] }[], input?: 'RAW' | 'USER_ENTERED'): Promise<void>
  /** Appends rows after the last non-empty row of the range's table (RAW, INSERT_ROWS) and says where they landed. */
  valuesAppend(spreadsheetId: string, range: string, values: unknown[][]): Promise<{ updatedRange: string }>
  /** Creates or updates one DOCUMENT developer metadata entry. */
  setMetadata(spreadsheetId: string, key: string, value: string): Promise<void>
  valuesBatchClear(spreadsheetId: string, ranges: string[]): Promise<void>
  getMetadata(spreadsheetId: string, key: string): Promise<string | null>
}
