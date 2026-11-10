// Offline end-to-end mode (VITE_FAKE_SHEETS=1): an in-memory sheet, no Google involved.
import type { Env } from './app.svelte'
import type { Auth } from './auth'
import { todayLocal, type Entry } from './rows'
import { createFakeSheets } from './sheets/fakeSheets'
import { seedV2 } from './sheets/fixtures'

export const FAKE_ID = 'fake-sheet'

export function createFakeEnv(): Env {
  const year = new Date().getFullYear()
  const fake = createFakeSheets()
  const today = todayLocal()
  const hist = (row: number, id: string, place: string, category: string, account: string, minor: number, days: number): { row: number; entry: Entry } => ({
    row,
    entry: {
      id, kind: 'expense', date: new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10),
      money: { minor, currency: 'EUR' }, description: '', place, category, account,
    },
  })
  const seeded = [hist(10, 'h1', 'Mercadona', 'Groceries', 'Joint', 4210, 3), hist(11, 'h2', 'Mercadona', 'Groceries', 'Joint', 3890, 9), hist(12, 'h3', 'Metro', 'Bills', 'M-Cash', 250, 5)]
  seedV2(fake, FAKE_ID, { year, entries: seeded })
  const auth: Auth = { token: () => 'fake', signIn: async () => undefined, signOut: () => undefined, onExpired: () => undefined }
  const storage = {
    getItem: (k: string) => (k === 'fitracker.sheets' ? JSON.stringify({ [year]: FAKE_ID }) : window.localStorage.getItem(k)),
    setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
  }
  ;(window as unknown as { __fake: unknown }).__fake = fake
  return { storage, idb: indexedDB, api: fake, auth, pick: async () => FAKE_ID, fake: true }
}
