import { ApiError, AuthExpired, RateLimited } from '../errors'
import type { RenderOption, SheetsApi } from './types'

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

function retryAfterMs(header: string | null): number {
  if (!header?.trim()) return 2000
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(header)
  return Number.isNaN(date) ? 2000 : Math.max(0, date - Date.now())
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
    if (res.status === 429) throw new RateLimited(retryAfterMs(res.headers.get('Retry-After')))
    if (!res.ok) throw new ApiError(res.status, (await res.text()).slice(0, 300))
    return (await res.json()) as T
  }

  const lookup = (key: string) => ({ developerMetadataLookup: { metadataKey: key, visibility: 'DOCUMENT', locationType: 'SPREADSHEET' } })
  async function metadataValue(id: string, key: string): Promise<string | null> {
    const r = await request<{ matchedDeveloperMetadata?: { developerMetadata: { metadataValue: string } }[] }>(
      'POST', `${BASE}/${id}/developerMetadata:search`, { dataFilters: [lookup(key)] })
    return r.matchedDeveloperMetadata?.[0]?.developerMetadata.metadataValue ?? null
  }

  // DOCUMENT-level developer metadata: update the entry when the key exists, otherwise create it.
  async function setMetadata(id: string, key: string, value: string): Promise<void> {
    const req = (await metadataValue(id, key)) !== null
      ? { updateDeveloperMetadata: { dataFilters: [lookup(key)], developerMetadata: { metadataValue: value }, fields: 'metadataValue' } }
      : { createDeveloperMetadata: { developerMetadata: { metadataKey: key, metadataValue: value, location: { spreadsheet: true }, visibility: 'DOCUMENT' } } }
    await request('POST', `${BASE}/${id}:batchUpdate`, { requests: [req] })
  }

  return {
    async batchGet(id, ranges, render: RenderOption = 'UNFORMATTED_VALUE') {
      const q = [...ranges.map((r) => `ranges=${encodeURIComponent(r)}`), 'majorDimension=ROWS', `valueRenderOption=${render}`, 'dateTimeRenderOption=SERIAL_NUMBER']
      const r = await request<{ valueRanges?: { values?: unknown[][] }[] }>('GET', `${BASE}/${id}/values:batchGet?${q.join('&')}`)
      return ranges.map((_, i) => r.valueRanges?.[i]?.values ?? [])
    },
    async valuesBatchUpdate(id, data, input = 'RAW') {
      await request('POST', `${BASE}/${id}/values:batchUpdate`, { valueInputOption: input, data })
    },
    async sheetInfo(id) {
      const meta = await request<{ properties: { title: string }; sheets: { properties: { sheetId: number; title: string } }[] }>(
        'GET', `${BASE}/${id}?fields=properties.title,sheets.properties(sheetId,title)`)
      return { title: meta.properties.title, tabs: Object.fromEntries(meta.sheets.map((x) => [x.properties.title, x.properties.sheetId])) }
    },
    // Grows a tab with appendDimension. (values:append is not used: on the real template it lands one column to the right.)
    async growTab(id, tab, rows) {
      const meta = await request<{ sheets: { properties: { sheetId: number; title: string; gridProperties: { rowCount: number } } }[] }>(
        'GET', `${BASE}/${id}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`)
      const sheet = meta.sheets.find((x) => x.properties.title === tab)
      if (!sheet) throw new ApiError(400, `No tab ${tab}`)
      const missing = rows - sheet.properties.gridProperties.rowCount
      if (missing > 0) await request('POST', `${BASE}/${id}:batchUpdate`, { requests: [{ appendDimension: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', length: missing } }] })
    },
    async valuesBatchClear(id, ranges) {
      await request('POST', `${BASE}/${id}/values:batchClear`, { ranges })
    },
    setMetadata,
    getMetadata: metadataValue,
  }
}
