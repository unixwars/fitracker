import { ApiError, AuthExpired, RateLimited } from '../errors'
import { parseRange } from './a1'
import type { RenderOption, SheetOp, SheetsApi } from './types'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

// Sheets batchUpdate requests are a large open union; they are only built here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Request = any

function grid(range: string, tabs: Map<string, number>) {
  const r = parseRange(range)
  const sheetId = tabs.get(r.sheet)
  if (sheetId === undefined) throw new Error(`Unknown tab ${r.sheet}`)
  return { sheetId, startRowIndex: r.r1 - 1, endRowIndex: r.r2, startColumnIndex: r.c1 - 1, endColumnIndex: r.c2 }
}

function cellValue(v: unknown) {
  if (v === '' || v === null || v === undefined) return {}
  if (typeof v === 'number') return { numberValue: v }
  if (typeof v === 'boolean') return { boolValue: v }
  if (typeof v === 'string' && v.startsWith('=')) return { formulaValue: v }
  return { stringValue: String(v) }
}

export function compileOps(ops: SheetOp[], tabs: Map<string, number>, existingMeta: Set<string>): Request[] {
  return ops.map((op): Request => {
    switch (op.t) {
      case 'copyTab': {
        const sourceSheetId = tabs.get(op.from)
        if (sourceSheetId === undefined) throw new Error(`Unknown tab ${op.from}`)
        return { duplicateSheet: { sourceSheetId, newSheetName: op.to } }
      }
      case 'set':
        return {
          updateCells: {
            range: grid(op.range, tabs),
            rows: op.values.map((row) => ({ values: row.map((v) => ({ userEnteredValue: cellValue(v) })) })),
            fields: 'userEnteredValue',
          },
        }
      case 'clear':
        return { repeatCell: { range: grid(op.range, tabs), cell: {}, fields: 'userEnteredValue' } }
      case 'hideColumn': {
        const { sheetId, startColumnIndex, endColumnIndex } = grid(`${op.tab}!${op.column}1`, tabs)
        return {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: startColumnIndex, endIndex: endColumnIndex },
            properties: { hiddenByUser: true },
            fields: 'hiddenByUser',
          },
        }
      }
      case 'listValidation':
        return {
          setDataValidation: {
            range: grid(op.range, tabs),
            rule: { condition: { type: 'ONE_OF_LIST', values: op.values.map((v) => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
          },
        }
      case 'numberFormat':
        return {
          repeatCell: {
            range: grid(op.range, tabs),
            cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: op.pattern } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        }
      case 'metadata':
        return existingMeta.has(op.key)
          ? {
              updateDeveloperMetadata: {
                dataFilters: [{ developerMetadataLookup: { metadataKey: op.key, visibility: 'DOCUMENT', locationType: 'SPREADSHEET' } }],
                developerMetadata: { metadataValue: op.value },
                fields: 'metadataValue',
              },
            }
          : {
              createDeveloperMetadata: {
                developerMetadata: { metadataKey: op.key, metadataValue: op.value, location: { spreadsheet: true }, visibility: 'DOCUMENT' },
              },
            }
    }
  })
}

export function createSheetsApi(getToken: () => string | null, fetchImpl: typeof fetch = fetch): SheetsApi {
  async function request<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
    const token = getToken()
    if (!token) throw new AuthExpired()
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 401) throw new AuthExpired()
    if (res.status === 429) throw new RateLimited(Number(res.headers.get('Retry-After') ?? 2) * 1000)
    if (!res.ok) throw new ApiError(res.status, (await res.text()).slice(0, 300))
    return (await res.json()) as T
  }

  const lookup = (key: string) => ({ developerMetadataLookup: { metadataKey: key, visibility: 'DOCUMENT', locationType: 'SPREADSHEET' } })
  async function metadataValue(id: string, key: string): Promise<string | null> {
    const r = await request<{ matchedDeveloperMetadata?: { developerMetadata: { metadataValue: string } }[] }>(
      'POST', `${BASE}/${id}/developerMetadata:search`, { dataFilters: [lookup(key)] })
    return r.matchedDeveloperMetadata?.[0]?.developerMetadata.metadataValue ?? null
  }

  return {
    async batchGet(id, ranges, render: RenderOption = 'UNFORMATTED_VALUE') {
      const q = [...ranges.map((r) => `ranges=${encodeURIComponent(r)}`), 'majorDimension=ROWS', `valueRenderOption=${render}`, 'dateTimeRenderOption=SERIAL_NUMBER']
      const r = await request<{ valueRanges?: { values?: unknown[][] }[] }>('GET', `${BASE}/${id}/values:batchGet?${q.join('&')}`)
      return ranges.map((_, i) => r.valueRanges?.[i]?.values ?? [])
    },
    async valuesBatchUpdate(id, data) {
      await request('POST', `${BASE}/${id}/values:batchUpdate`, { valueInputOption: 'RAW', data })
    },
    async valuesBatchClear(id, ranges) {
      await request('POST', `${BASE}/${id}/values:batchClear`, { ranges })
    },
    async applyOps(id, ops) {
      const meta = await request<{ sheets: { properties: { sheetId: number; title: string } }[] }>('GET', `${BASE}/${id}?fields=sheets.properties(sheetId,title)`)
      const tabs = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]))
      const existing = new Set<string>()
      for (const op of ops) if (op.t === 'metadata' && (await metadataValue(id, op.key)) !== null) existing.add(op.key)
      await request('POST', `${BASE}/${id}:batchUpdate`, { requests: compileOps(ops, tabs, existing) })
    },
    getMetadata: metadataValue,
  }
}
