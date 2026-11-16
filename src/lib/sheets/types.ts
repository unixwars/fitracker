// The small surface of the Sheets API the app uses. The real client and the in-memory fake
// implement it.
export type RenderOption = 'UNFORMATTED_VALUE' | 'FORMULA'

export interface SheetsApi {
  /** Values for each requested range, in request order. Trailing empty rows/cells are trimmed. */
  batchGet(spreadsheetId: string, ranges: string[], render?: RenderOption): Promise<unknown[][][]>
  /** Writes values: RAW (default, text is never a formula) or USER_ENTERED (strings starting with "=" become formulas). */
  valuesBatchUpdate(spreadsheetId: string, data: { range: string; values: unknown[][] }[], input?: 'RAW' | 'USER_ENTERED'): Promise<void>
  /** The spreadsheet's title and the numeric id (the `gid` of Sheets links) of every tab, by tab title. One request. */
  sheetInfo(spreadsheetId: string): Promise<{ title: string; tabs: Record<string, number> }>
  /** Adds rows at the bottom of a tab so that it has at least `rows` rows (a write past the grid is a 400). */
  growTab(spreadsheetId: string, tab: string, rows: number): Promise<void>
  /** Creates or updates one DOCUMENT developer metadata entry. */
  setMetadata(spreadsheetId: string, key: string, value: string): Promise<void>
  /** Gives one row the number formats and data validation (checkboxes, dropdowns) of another row of the same tab, columns A to `columns`. Cosmetic: two requests. */
  copyRowStyle(spreadsheetId: string, tab: string, fromRow: number, toRow: number, columns: number): Promise<void>
  valuesBatchClear(spreadsheetId: string, ranges: string[]): Promise<void>
  getMetadata(spreadsheetId: string, key: string): Promise<string | null>
  /** Every DOCUMENT developer metadata entry whose key starts with `prefix`, as key to value. One request. */
  listMetadata(spreadsheetId: string, prefix: string): Promise<Record<string, string>>
}
