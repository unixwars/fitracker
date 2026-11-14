// Links into Google Sheets itself (browser, or the Sheets app when it is installed).
const BASE = 'https://docs.google.com/spreadsheets/d/'

export function sheetUrl(spreadsheetId: string, gid?: number, range?: string): string {
  const base = `${BASE}${encodeURIComponent(spreadsheetId)}/edit`
  if (gid === undefined) return base
  return `${base}#gid=${gid}${range ? `&range=${range}` : ''}`
}

const LAST_COL = { Ledger: 'I', Snapshots: 'E' } as const

/** The whole row of an unreadable entry; without the tab's numeric id (not fetched yet) it opens the file. */
export function rowUrl(spreadsheetId: string, gids: Record<string, number>, at: { tab: 'Ledger' | 'Snapshots'; row: number }): string {
  const gid = gids[at.tab]
  return gid === undefined ? sheetUrl(spreadsheetId) : sheetUrl(spreadsheetId, gid, `A${at.row}:${LAST_COL[at.tab]}${at.row}`)
}
