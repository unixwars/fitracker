// Offline end-to-end mode (VITE_FAKE_SHEETS=1): an in-memory sheet, no Google involved.
import type { Env } from './app.svelte'
import type { Auth } from './auth'
import { todayLocal, type Entry } from './rows'
import { createFakeSheets } from './sheets/fakeSheets'
import { DEFAULT_REFERENCE, seedLedger } from './sheets/fixtures'

export const FAKE_ID = 'fake-sheet'

export function createFakeEnv(): Env {
  const fake = createFakeSheets()
  const today = todayLocal()
  const hist = (id: string, place: string, category: string, account: string, minor: number, days: number): Entry => ({
    id, kind: 'expense', date: new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10),
    money: { minor, currency: 'EUR' }, description: '', place, category, account,
  })
  const entries = [hist('h1', 'Mercadona', 'Groceries', 'Joint', 4210, 3), hist('h2', 'Mercadona', 'Groceries', 'Joint', 3890, 9), hist('h3', 'Metro', 'Bills', 'M-Cash', 250, 5)]
  seedLedger(fake, FAKE_ID, { entries, today, reference: { ...DEFAULT_REFERENCE, budgets: DEFAULT_REFERENCE.budgets.map((b) => ({ ...b, year: Number(today.slice(0, 4)) })) } })
  const auth: Auth = { token: () => 'fake', signIn: async () => undefined, signOut: () => undefined, onExpired: () => undefined }
  const storage = {
    getItem: (k: string) => window.localStorage.getItem(k) ?? (k === 'fitracker.sheet' ? FAKE_ID : null),
    setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
  }
  ;(window as unknown as { __fake: unknown }).__fake = fake
  return { storage, idb: indexedDB, api: fake, auth, pick: async () => FAKE_ID, fake: true }
}
