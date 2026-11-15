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
  // ?hero seeds the data of the README picture (scripts/make-hero.mjs): UK shops and GBP accounts.
  const hero = window.location.search.includes('hero')
  const hist = (id: string, place: string, category: string, account: string, minor: number, days: number, description = '', currency: 'EUR' | 'GBP' = 'EUR'): Entry => ({
    id, kind: 'expense', date: new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10),
    money: { minor, currency }, description, place, category, account,
  })
  const entries = hero
    ? [hist('h1', 'Waitrose', 'Groceries', 'Joint', 1250, 2, 'Sourdough', 'GBP'), hist('h2', 'Tesco', 'Groceries', 'Revolut', 3480, 4, 'Weekly shop', 'GBP'), hist('h3', 'TfL', 'Bills', 'Monzo', 280, 1, '', 'GBP'), hist('h4', 'Pret', 'Recreation', 'Monzo', 540, 6, 'Lunch', 'GBP')]
    : [hist('h1', 'Mercadona', 'Groceries', 'Joint', 4210, 3, 'Weekly shop'), hist('h2', 'Mercadona', 'Groceries', 'Joint', 3890, 9, 'Weekly shop'), hist('h3', 'Metro', 'Bills', 'M-Cash', 250, 5)]
  const account = (name: string) => ({ name, currency: 'GBP' as const, active: true, inMonthly: true, inAnnual: true })
  const year = Number(today.slice(0, 4))
  const previous = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)
  const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-01`
  seedLedger(fake, FAKE_ID, {
    entries,
    today,
    rates: [{ month: previousMonth, GBP: 1.15, USD: 0.9 }],
    reference: { ...DEFAULT_REFERENCE, ...(hero ? { accounts: [account('Joint'), account('Revolut'), account('Monzo')] } : {}), budgets: DEFAULT_REFERENCE.budgets.map((b) => ({ ...b, year })) },
  })
  fake.book(FAKE_ID).title = 'Fitracker (demo)'
  const auth: Auth = { token: () => 'fake', signIn: async () => undefined, silentSignIn: async () => true, signOut: () => undefined, onExpired: () => undefined, onExpiring: () => undefined }
  // ?unlinked starts on the first-run screen; otherwise the fake sheet is linked unless the device already stored a link.
  const linkedByDefault = !window.location.search.includes('unlinked')
  const storage = {
    getItem: (k: string) => window.localStorage.getItem(k) ?? (k === 'fitracker.sheet' && linkedByDefault ? FAKE_ID : null),
    setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
  }
  ;(window as unknown as { __fake: unknown }).__fake = fake
  return { storage, idb: indexedDB, api: fake, auth, account: async () => 'demo@example.test', pick: async () => FAKE_ID, copyTemplate: async () => FAKE_ID, fake: true, ttlMs: 0 }
}
