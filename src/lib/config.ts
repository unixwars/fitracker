// The only data stored on the device: the year -> spreadsheet id list, plus device-local settings.
// Access tokens are never stored here.
import type { KnownPlace } from './places'
import type { Kind } from './schema'
import type { Currency } from './types'

// Any four-digit year can be linked: one sheet per year, for as many years as the user keeps.
export const isYear = (y: number): boolean => Number.isInteger(y) && y >= 1000 && y <= 9999

// Years offered in the picker: every linked year plus last, this and next year, newest first.
export function yearOptions(linked: number[], current: number, selected: number): number[] {
  return [...new Set([...linked, current - 1, current, current + 1, selected])].sort((a, b) => b - a)
}

export type Theme = 'system' | 'light' | 'dark'
export type DeviceSettings = { currency: Currency; kind: Kind; places: KnownPlace[]; lastCategory: Record<string, string>; theme: Theme }
type KV = Pick<Storage, 'getItem' | 'setItem'>

const SHEETS_KEY = 'fitracker.sheets'
const DEVICE_KEY = 'fitracker.device'
const DEFAULT_DEVICE: DeviceSettings = { currency: 'EUR', kind: 'expense', places: [], lastCategory: {}, theme: 'system' }

function readJson(storage: KV, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function createConfig(storage: KV) {
  const getSheets = (): Record<number, string> => {
    const raw = readJson(storage, SHEETS_KEY)
    const out: Record<number, string> = {}
    if (isRecord(raw)) for (const [y, id] of Object.entries(raw)) if (typeof id === 'string' && isYear(Number(y))) out[Number(y)] = id
    return out
  }
  const save = (sheets: Record<number, string>) => storage.setItem(SHEETS_KEY, JSON.stringify(sheets))

  return {
    getSheets,
    linkSheet(year: number, spreadsheetId: string): void {
      if (!isYear(year)) throw new Error(`Year ${year} is out of range`)
      save({ ...getSheets(), [year]: spreadsheetId })
    },
    unlinkSheet(year: number): void {
      const s = getSheets()
      delete s[year]
      save(s)
    },
    getDevice(): DeviceSettings {
      const raw = readJson(storage, DEVICE_KEY)
      return { ...DEFAULT_DEVICE, ...(isRecord(raw) ? (raw as Partial<DeviceSettings>) : {}) }
    },
    setDevice(patch: Partial<DeviceSettings>): void {
      storage.setItem(DEVICE_KEY, JSON.stringify({ ...this.getDevice(), ...patch }))
    },
  }
}

export type Config = ReturnType<typeof createConfig>
