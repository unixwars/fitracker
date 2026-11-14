// Google Identity Services token client. The token is also kept in IndexedDB with its expiry time (AGENTS.md, Auth rule).
import type { Kv } from './kv'
import { loadScript } from './loadScript'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS = 'https://accounts.google.com/gsi/client'
const EARLY_MS = 60_000

const REFRESH_BEFORE_MS = 4 * 60_000

export type Auth = {
  token(): string | null
  /** The normal sign-in: may show Google's account chooser or consent screen. Needs a user gesture to open its window. */
  signIn(): Promise<void>
  /** Asks Google for a token without any screen (prompt none): works when the user already consented and still has a Google session. Never throws; false when it could not. */
  silentSignIn(): Promise<boolean>
  signOut(): void
  onExpired(fn: () => void): void
  /** Called a few minutes before the token expires, so the app can refresh it while it is open. */
  onExpiring(fn: () => void): void
}

export type StoredToken = { token: string; expiresAt: number }
export type TokenStore = { load(): Promise<StoredToken | undefined>; save(t: StoredToken): Promise<void>; clear(): Promise<void> }

const STORED_KEY = 'token'
export function kvTokenStore(kv: Pick<Kv, 'get' | 'set'>): TokenStore {
  return {
    load: async () => (await kv.get<StoredToken | null>(STORED_KEY)) ?? undefined,
    save: (t) => kv.set(STORED_KEY, t),
    clear: () => kv.set(STORED_KEY, null),
  }
}

export function createAuth(clientId: string, now: () => number = Date.now, store?: TokenStore): Auth & { restore(): Promise<void> } {
  let token: string | null = null
  let expiresAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let silent: Promise<boolean> | null = null
  const expiredHandlers: (() => void)[] = []
  const expiringHandlers: (() => void)[] = []
  // Storage is best effort: a failure means one more sign-in later, never a broken one now.
  const forget = () => { void store?.clear().catch(() => undefined) }
  const expire = () => {
    token = null
    forget()
    expiredHandlers.forEach((h) => h())
  }
  const keep = (accessToken: string, expiresIn: number) => hold(accessToken, now() + expiresIn * 1000 - EARLY_MS, true)
  const hold = (accessToken: string, until: number, persist: boolean) => {
    token = accessToken
    expiresAt = until
    if (persist) void store?.save({ token: accessToken, expiresAt }).catch(() => undefined)
    clearTimeout(timer)
    clearTimeout(refreshTimer)
    timer = setTimeout(() => token && expire(), Math.max(0, expiresAt - now()))
    refreshTimer = setTimeout(() => token && expiringHandlers.forEach((h) => h()), Math.max(0, expiresAt - REFRESH_BEFORE_MS - now()))
  }

  async function request(prompt: '' | 'none'): Promise<void> {
    await loadScript(GIS)
    await new Promise<void>((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return reject(new Error(r.error_description ?? r.error ?? 'Sign-in failed'))
          keep(r.access_token, r.expires_in ?? 3600)
          resolve()
        },
        error_callback: (e) => reject(new Error(e.type)),
      })
      client.requestAccessToken({ prompt })
    })
  }

  return {
    async restore() {
      if (!store || token) return
      const saved = await store.load().catch(() => undefined)
      if (!saved) return
      if (now() >= saved.expiresAt) return forget()
      hold(saved.token, saved.expiresAt, false)
    },
    token() {
      if (token && now() >= expiresAt) expire()
      return token
    },
    onExpired(fn) { expiredHandlers.push(fn) },
    onExpiring(fn) { expiringHandlers.push(fn) },
    signIn: () => request(''),
    silentSignIn() {
      return (silent ??= request('none').then(() => true, () => false).finally(() => { silent = null }))
    },
    signOut() {
      const t = token
      token = null
      clearTimeout(timer)
      clearTimeout(refreshTimer)
      forget()
      if (t) google.accounts.oauth2.revoke(t)
    },
  }
}
