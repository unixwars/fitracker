import { ApiError, NewerThanApp, UnrecognisedLayout } from '../errors'
import { BOOK_VERSION, LEDGER, META_KEY, SNAPSHOTS } from '../schema'
import type { SheetsApi } from './types'

const matches = (row: unknown[] | undefined, expected: readonly string[]): boolean =>
  (row ?? []).length === expected.length && expected.every((h, i) => String(row![i]).trim() === h)

/**
 * Throws NewerThanApp for a newer tag and UnrecognisedLayout for anything else that is not this layout, before any
 * value write. A sheet without the tag whose Ledger and Snapshots headers match the v3 layout is stamped (one write):
 * the tag survives Make a copy, so this only repairs a lost tag (spec section 4).
 */
export async function ensureVersion(api: SheetsApi, spreadsheetId: string): Promise<void> {
  const raw = await api.getMetadata(spreadsheetId, META_KEY)
  if (raw !== null) {
    const version = Number(raw)
    if (!Number.isInteger(version)) throw new UnrecognisedLayout(`Bad version tag: ${raw}`)
    if (version > BOOK_VERSION) throw new NewerThanApp(version)
    if (version < BOOK_VERSION) throw new UnrecognisedLayout(`Version ${version} is not a ledger sheet`)
    return
  }
  let headers: unknown[][][]
  try {
    headers = await api.batchGet(spreadsheetId, [LEDGER.ranges.header, SNAPSHOTS.ranges.header], 'FORMULA')
  } catch (e) {
    // The real API answers 400 when a tab does not exist (a legacy yearly sheet has no Ledger tab).
    if (e instanceof ApiError && e.status === 400) throw new UnrecognisedLayout('No Ledger tab')
    throw e
  }
  if (!matches(headers[0]?.[0], LEDGER.headers) || !matches(headers[1]?.[0], SNAPSHOTS.headers)) {
    throw new UnrecognisedLayout('Ledger or Snapshots headers do not match the v3 layout')
  }
  await api.setMetadata(spreadsheetId, META_KEY, String(BOOK_VERSION))
}
