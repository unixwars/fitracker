import { WrongYear } from './errors'
import { SETUP } from './schema'
import type { SheetsApi } from './sheets/types'

/** Linking the wrong file would write into the wrong year, so check Setup!C8 first. */
export async function verifyYear(api: SheetsApi, spreadsheetId: string, year: number): Promise<void> {
  const [[row]] = await api.batchGet(spreadsheetId, [SETUP.year])
  const found = row?.[0]
  if (Number(found) !== year) throw new WrongYear(found)
}
