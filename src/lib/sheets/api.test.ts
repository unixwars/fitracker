import { describe, expect, it } from 'vitest'
import { ApiError, AuthExpired, RateLimited } from '../errors'
import { createSheetsApi } from './api'

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init })

function stub(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return responses.shift() ?? json({})
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

describe('createSheetsApi', () => {
  it('batchGet sends all ranges, requests unformatted values and serial dates', async () => {
    const { calls, fetchImpl } = stub([json({ valueRanges: [{ values: [[1]] }, {}] })])
    const api = createSheetsApi(() => 'tok', fetchImpl)
    const out = await api.batchGet('S1', ['Expenses!A10:I1000', 'Setup!U8'])
    expect(out).toEqual([[[1]], []])
    const url = decodeURIComponent(calls[0].url)
    expect(url).toContain('/spreadsheets/S1/values:batchGet')
    expect(url).toContain('ranges=Expenses!A10:I1000&ranges=Setup!U8')
    expect(url).toContain('valueRenderOption=UNFORMATTED_VALUE')
    expect(url).toContain('dateTimeRenderOption=SERIAL_NUMBER')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('writes with RAW so text is never interpreted as a formula', async () => {
    const { calls, fetchImpl } = stub([json({})])
    await createSheetsApi(() => 'tok', fetchImpl).valuesBatchUpdate('S1', [{ range: 'Expenses!A10', values: [['=1+1']] }])
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ valueInputOption: 'RAW', data: [{ range: 'Expenses!A10', values: [['=1+1']] }] })
  })

  it('maps 401 to AuthExpired, 429 to RateLimited and others to ApiError', async () => {
    const api = (r: Response) => createSheetsApi(() => 'tok', stub([r]).fetchImpl)
    await expect(api(new Response('', { status: 401 })).getMetadata('S1', 'k')).rejects.toBeInstanceOf(AuthExpired)
    const e = await api(new Response('', { status: 429, headers: { 'Retry-After': '3' } })).getMetadata('S1', 'k').catch((x) => x)
    expect(e).toBeInstanceOf(RateLimited)
    expect(e.retryAfterMs).toBe(3000)
    await expect(api(new Response('nope', { status: 403 })).getMetadata('S1', 'k')).rejects.toBeInstanceOf(ApiError)
  })

  it('understands Retry-After as seconds, as an HTTP date, and falls back when it is unusable', async () => {
    const wait = async (h: string) => (await createSheetsApi(() => 'tok', stub([new Response('', { status: 429, headers: { 'Retry-After': h } })]).fetchImpl).getMetadata('S1', 'k').catch((x) => x)).retryAfterMs
    expect(await wait('3')).toBe(3000)
    const future = await wait(new Date(Date.now() + 5000).toUTCString())
    expect(future).toBeGreaterThan(0)
    expect(future).toBeLessThanOrEqual(5000)
    expect(await wait('garbage')).toBe(2000)
  })

  it('fails with AuthExpired without a token, before any request', async () => {
    const { calls, fetchImpl } = stub([])
    await expect(createSheetsApi(() => null, fetchImpl).getMetadata('S1', 'k')).rejects.toBeInstanceOf(AuthExpired)
    expect(calls).toHaveLength(0)
  })

  it('reads document metadata', async () => {
    const { fetchImpl } = stub([json({ matchedDeveloperMetadata: [{ developerMetadata: { metadataValue: '2' } }] })])
    expect(await createSheetsApi(() => 'tok', fetchImpl).getMetadata('S1', 'k')).toBe('2')
  })
})

describe('listMetadata', () => {
  it('searches all document metadata in one request and keeps the keys with the prefix', async () => {
    const { calls, fetchImpl } = stub([json({ matchedDeveloperMetadata: [
      { developerMetadata: { metadataKey: 'fitracker.account.Joint', metadataValue: '{"m":false}' } },
      { developerMetadata: { metadataKey: 'other.key', metadataValue: 'x' } },
    ] })])
    expect(await createSheetsApi(() => 'tok', fetchImpl).listMetadata('S1', 'fitracker.')).toEqual({ 'fitracker.account.Joint': '{"m":false}' })
    expect(calls).toHaveLength(1)
    expect(JSON.parse(calls[0].init!.body as string).dataFilters[0].developerMetadataLookup).toEqual({ visibility: 'DOCUMENT', locationType: 'SPREADSHEET' })
  })
  it('returns nothing when no metadata matches', async () => {
    expect(await createSheetsApi(() => 'tok', stub([json({})]).fetchImpl).listMetadata('S1', 'fitracker.')).toEqual({})
  })
})

describe('createSheetsApi additions', () => {
  it('sheetInfo returns the spreadsheet title and the numeric id of each tab in one request', async () => {
    const { calls, fetchImpl } = stub([json({ properties: { title: 'Fitracker (test copy)' }, sheets: [{ properties: { sheetId: 0, title: 'Ledger' } }, { properties: { sheetId: 203680765, title: 'Snapshots' } }] })])
    expect(await createSheetsApi(() => 'tok', fetchImpl).sheetInfo('S1')).toEqual({ title: 'Fitracker (test copy)', tabs: { Ledger: 0, Snapshots: 203680765 } })
    expect(calls).toHaveLength(1)
    expect(decodeURIComponent(calls[0].url)).toContain('fields=properties.title,sheets.properties(sheetId,title)')
  })

  it('growTab adds only the missing rows and gives them the format and validation of the last row', async () => {
    const meta = () => json({ sheets: [{ properties: { sheetId: 7, title: 'Ledger', gridProperties: { rowCount: 1001, columnCount: 26 } } }] })
    const grow = stub([meta(), json({})])
    await createSheetsApi(() => 'tok', grow.fetchImpl).growTab('S1', 'Ledger', 1500)
    const requests = JSON.parse(grow.calls[1].init!.body as string).requests
    expect(requests[0]).toEqual({ appendDimension: { sheetId: 7, dimension: 'ROWS', length: 499 } })
    const source = { sheetId: 7, startRowIndex: 1000, endRowIndex: 1001, startColumnIndex: 0, endColumnIndex: 26 }
    const destination = { sheetId: 7, startRowIndex: 1001, endRowIndex: 1500, startColumnIndex: 0, endColumnIndex: 26 }
    expect(requests.slice(1)).toEqual([
      { copyPaste: { source, destination, pasteType: 'PASTE_FORMAT' } },
      { copyPaste: { source, destination, pasteType: 'PASTE_DATA_VALIDATION' } },
    ])
    const same = stub([meta()])
    await createSheetsApi(() => 'tok', same.fetchImpl).growTab('S1', 'Ledger', 900)
    expect(same.calls).toHaveLength(1) // already big enough: no write
  })

  it('valuesBatchUpdate can be asked for USER_ENTERED; RAW stays the default', async () => {
    const { calls, fetchImpl } = stub([json({}), json({})])
    const api = createSheetsApi(() => 'tok', fetchImpl)
    await api.valuesBatchUpdate('S1', [{ range: 'Rates!A9', values: [['=1+1']] }], 'USER_ENTERED')
    await api.valuesBatchUpdate('S1', [{ range: 'Rates!A9', values: [['=1+1']] }])
    expect(JSON.parse(calls[0].init!.body as string).valueInputOption).toBe('USER_ENTERED')
    expect(JSON.parse(calls[1].init!.body as string).valueInputOption).toBe('RAW')
  })

  it('setMetadata creates the entry when none exists and updates it when one does', async () => {
    const create = stub([json({ matchedDeveloperMetadata: [] }), json({})])
    await createSheetsApi(() => 'tok', create.fetchImpl).setMetadata('S1', 'k', '3')
    expect(JSON.parse(create.calls[create.calls.length - 1].init!.body as string).requests[0].createDeveloperMetadata.developerMetadata)
      .toMatchObject({ metadataKey: 'k', metadataValue: '3', visibility: 'DOCUMENT' })
    const update = stub([json({ matchedDeveloperMetadata: [{ developerMetadata: { metadataValue: '2' } }] }), json({})])
    await createSheetsApi(() => 'tok', update.fetchImpl).setMetadata('S1', 'k', '3')
    expect(JSON.parse(update.calls[update.calls.length - 1].init!.body as string).requests[0].updateDeveloperMetadata.developerMetadata.metadataValue).toBe('3')
  })
})
