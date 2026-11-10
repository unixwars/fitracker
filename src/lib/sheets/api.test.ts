import { describe, expect, it } from 'vitest'
import { ApiError, AuthExpired, RateLimited } from '../errors'
import { compileOps, createSheetsApi } from './api'

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

  it('fails with AuthExpired without a token, before any request', async () => {
    const { calls, fetchImpl } = stub([])
    await expect(createSheetsApi(() => null, fetchImpl).getMetadata('S1', 'k')).rejects.toBeInstanceOf(AuthExpired)
    expect(calls).toHaveLength(0)
  })

  it('reads document metadata', async () => {
    const { fetchImpl } = stub([json({ matchedDeveloperMetadata: [{ developerMetadata: { metadataValue: '2' } }] })])
    expect(await createSheetsApi(() => 'tok', fetchImpl).getMetadata('S1', 'k')).toBe('2')
  })

  it('applyOps resolves tab ids and sends one batchUpdate', async () => {
    const { calls, fetchImpl } = stub([
      json({ sheets: [{ properties: { sheetId: 7, title: 'Expenses' } }] }),
      json({ matchedDeveloperMetadata: [] }),
      json({}),
    ])
    await createSheetsApi(() => 'tok', fetchImpl).applyOps('S1', [
      { t: 'hideColumn', tab: 'Expenses', column: 'A' },
      { t: 'metadata', key: 'k', value: '2' },
    ])
    const last = calls[calls.length - 1]
    expect(last.url).toContain(':batchUpdate')
    expect(JSON.parse(last.init!.body as string).requests).toHaveLength(2)
  })
})

describe('compileOps', () => {
  const tabs = new Map([['Expenses', 7], ['Setup', 3]])
  it('compiles each op to the matching request', () => {
    const r = compileOps([
      { t: 'copyTab', from: 'Expenses', to: 'Expenses (backup v0)' },
      { t: 'set', range: 'Setup!U8:U9', values: [['EUR'], ['=1+1']] },
      { t: 'clear', range: 'Expenses!C11:C1000' },
      { t: 'hideColumn', tab: 'Expenses', column: 'A' },
      { t: 'listValidation', range: 'Expenses!I10:I1000', values: ['EUR', 'GBP'] },
      { t: 'numberFormat', range: 'Expenses!D10:D1000', pattern: '#,##0.00' },
      { t: 'metadata', key: 'k', value: '2' },
    ], tabs, new Set())
    expect(r[0]).toEqual({ duplicateSheet: { sourceSheetId: 7, newSheetName: 'Expenses (backup v0)' } })
    expect(r[1].updateCells.range).toEqual({ sheetId: 3, startRowIndex: 7, endRowIndex: 9, startColumnIndex: 20, endColumnIndex: 21 })
    expect(r[1].updateCells.rows[1].values[0].userEnteredValue).toEqual({ formulaValue: '=1+1' })
    expect(r[1].updateCells.rows[0].values[0].userEnteredValue).toEqual({ stringValue: 'EUR' })
    expect(r[2].repeatCell.fields).toBe('userEnteredValue')
    expect(r[3].updateDimensionProperties).toMatchObject({ range: { sheetId: 7, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { hiddenByUser: true } })
    expect(r[4].setDataValidation.rule.condition).toMatchObject({ type: 'ONE_OF_LIST' })
    expect(r[4].setDataValidation.rule.strict).toBe(true)
    expect(r[5].repeatCell.cell.userEnteredFormat.numberFormat.pattern).toBe('#,##0.00')
    expect(r[6].createDeveloperMetadata.developerMetadata).toMatchObject({ metadataKey: 'k', metadataValue: '2', visibility: 'DOCUMENT' })
  })
  it('updates metadata that already exists', () => {
    const r = compileOps([{ t: 'metadata', key: 'k', value: '2' }], tabs, new Set(['k']))
    expect(r[0].updateDeveloperMetadata.developerMetadata.metadataValue).toBe('2')
  })
  it('rejects unknown tabs', () => {
    expect(() => compileOps([{ t: 'hideColumn', tab: 'Nope', column: 'A' }], tabs, new Set())).toThrow()
  })
})
