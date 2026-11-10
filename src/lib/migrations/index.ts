import { NewerThanApp, UnrecognisedLayout } from '../errors'
import { KINDS, META_KEY, SCHEMA_VERSION, TABS, dataRange, headerRange } from '../schema'
import type { SheetOp, SheetsApi } from '../sheets/types'
import type { Flagged, Migration, SheetState } from './types'
import { m0to1 } from './m0to1'
import type { Currency } from '../types'

export type { Flagged, Migration, SheetState } from './types'

export const MIGRATIONS: Migration[] = [m0to1]

export const pendingMigrations = (current: number): Migration[] => MIGRATIONS.filter((m) => m.from >= current)

const same = (row: unknown[] | undefined, expected: string[]) =>
  (row ?? []).length === expected.length && expected.every((h, i) => String(row![i]).trim() === h)

export async function detectVersion(api: SheetsApi, id: string): Promise<number> {
  const raw = await api.getMetadata(id, META_KEY)
  if (raw !== null) {
    const v = Number(raw)
    if (!Number.isInteger(v)) throw new UnrecognisedLayout(`Bad version tag: ${raw}`)
    return v
  }
  const got = await api.batchGet(id, KINDS.map(headerRange), 'FORMULA')
  const heads = got.map((g) => g[0])
  if (KINDS.every((k, i) => same(heads[i], TABS[k].headersV0))) return 0
  if (KINDS.every((k, i) => same(heads[i], TABS[k].headersV2))) {
    await api.applyOps(id, [{ t: 'metadata', key: META_KEY, value: String(SCHEMA_VERSION) }])
    return SCHEMA_VERSION
  }
  throw new UnrecognisedLayout('Entry tab headers do not match a known layout')
}

export async function readState(api: SheetsApi, id: string): Promise<SheetState> {
  const got = await api.batchGet(id, [...KINDS.map(headerRange), ...KINDS.map(dataRange)], 'FORMULA')
  const headers = {} as SheetState['headers']
  const rows = {} as SheetState['rows']
  KINDS.forEach((k, i) => {
    headers[k] = got[i][0] ?? []
    rows[k] = got[KINDS.length + i]
  })
  return { headers, rows }
}

export type RunOptions = { newId?: () => string; baseCurrency?: Currency; to?: number }

/** Applies every missing step in order. Each step is one atomic batch: backups, changes, version tag. */
export async function runMigrations(api: SheetsApi, id: string, opts: RunOptions = {}): Promise<{ applied: [number, number][]; flagged: Flagged[] }> {
  const version = await detectVersion(api, id)
  if (version > SCHEMA_VERSION) throw new NewerThanApp(version)
  const target = opts.to ?? SCHEMA_VERSION
  const ctx = { newId: opts.newId ?? (() => crypto.randomUUID()), baseCurrency: opts.baseCurrency ?? 'EUR' }
  const applied: [number, number][] = []
  const flagged: Flagged[] = []
  for (const m of pendingMigrations(version).filter((x) => x.to <= target)) {
    const state = await readState(api, id)
    const plan = m.plan(state, ctx)
    const backups: SheetOp[] = KINDS.map((k) => ({ t: 'copyTab', from: TABS[k].name, to: `${TABS[k].name} (backup v${m.from})` }))
    await api.applyOps(id, [...backups, ...plan.ops, { t: 'metadata', key: META_KEY, value: String(m.to) }])
    applied.push([m.from, m.to])
    flagged.push(...plan.flagged)
  }
  return { applied, flagged }
}
