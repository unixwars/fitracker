// The only data stored on the device: the linked spreadsheet id, plus device-local settings.
// Access tokens are never stored here.
import type { KnownPlace } from './places'
import type { Kind } from './schema'

export type Theme = 'system' | 'light' | 'dark'
export type DeviceSettings = { kind: Kind; places: KnownPlace[]; lastCategory: Record<string, string>; theme: Theme }
type KV = Pick<Storage, 'getItem' | 'setItem'>

const SHEET_KEY = 'fitracker.sheet'
const DEVICE_KEY = 'fitracker.device'
const DEFAULT_DEVICE: DeviceSettings = { kind: 'expense', places: [], lastCategory: {}, theme: 'system' }

function readJson(storage: KV, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function createConfig(storage: KV) {
  return {
    getSheetId(): string | null {
      const v = storage.getItem(SHEET_KEY)
      return v && v.trim() ? v : null
    },
    linkSheet(spreadsheetId: string): void {
      storage.setItem(SHEET_KEY, spreadsheetId)
    },
    unlinkSheet(): void {
      storage.setItem(SHEET_KEY, '')
    },
    getDevice(): DeviceSettings {
      const raw = readJson(storage, DEVICE_KEY)
      const stored = isRecord(raw) ? { ...raw } : {}
      delete stored.currency // the account decides the currency now
      return { ...DEFAULT_DEVICE, ...(stored as Partial<DeviceSettings>) }
    },
    setDevice(patch: Partial<DeviceSettings>): void {
      storage.setItem(DEVICE_KEY, JSON.stringify({ ...this.getDevice(), ...patch }))
    },
  }
}

export type Config = ReturnType<typeof createConfig>
