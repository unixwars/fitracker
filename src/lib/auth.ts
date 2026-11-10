// Google Identity Services token client. The access token lives in memory only.
import { loadScript } from './loadScript'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS = 'https://accounts.google.com/gsi/client'
const EARLY_MS = 60_000

export type Auth = {
  token(): string | null
  signIn(): Promise<void>
  signOut(): void
  onExpired(fn: () => void): void
}

export function createAuth(clientId: string, now: () => number = Date.now): Auth {
  let token: string | null = null
  let expiresAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const handlers: (() => void)[] = []
  const expire = () => {
    token = null
    handlers.forEach((h) => h())
  }

  return {
    token() {
      if (token && now() >= expiresAt) expire()
      return token
    },
    onExpired(fn) { handlers.push(fn) },
    async signIn() {
      await loadScript(GIS)
      await new Promise<void>((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (r) => {
            if (r.error || !r.access_token) return reject(new Error(r.error_description ?? r.error ?? 'Sign-in failed'))
            token = r.access_token
            expiresAt = now() + (r.expires_in ?? 3600) * 1000 - EARLY_MS
            clearTimeout(timer)
            timer = setTimeout(() => token && expire(), Math.max(0, expiresAt - now()))
            resolve()
          },
          error_callback: (e) => reject(new Error(e.type)),
        })
        client.requestAccessToken({ prompt: '' })
      })
    },
    signOut() {
      const t = token
      token = null
      clearTimeout(timer)
      if (t) google.accounts.oauth2.revoke(t)
    },
  }
}
