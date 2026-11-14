// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./loadScript', () => ({ loadScript: async () => undefined }))
import { createAuth } from './auth'

type Cfg = { client_id: string; scope: string; callback: (r: Record<string, unknown>) => void; error_callback?: (e: { type: string }) => void }
let configs: Cfg[]
let requests: ({ prompt?: string } | undefined)[]
let respond: (cfg: Cfg) => void

beforeEach(() => {
  configs = []
  requests = []
  respond = (cfg) => cfg.callback({ access_token: 'tok', expires_in: 3600 })
  ;(globalThis as unknown as { google: unknown }).google = {
    accounts: { oauth2: { initTokenClient: (cfg: Cfg) => { configs.push(cfg); return { requestAccessToken: (o?: { prompt?: string }) => { requests.push(o); respond(cfg) } } }, revoke: vi.fn() } },
  }
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('interactive sign-in', () => {
  it('asks with the normal prompt and rejects when Google says no', async () => {
    const auth = createAuth('cid')
    await auth.signIn()
    expect(requests).toEqual([{ prompt: '' }])
    expect(auth.token()).toBe('tok')
    respond = (cfg) => cfg.callback({ error: 'access_denied' })
    await expect(createAuth('cid').signIn()).rejects.toThrow()
  })
})

describe('silent sign-in', () => {
  it('asks with prompt none and holds the token in memory when Google answers without a screen', async () => {
    const auth = createAuth('cid')
    expect(await auth.silentSignIn()).toBe(true)
    expect(requests).toEqual([{ prompt: 'none' }])
    expect(auth.token()).toBe('tok')
  })
  it('resolves false, never rejects, when interaction is needed or the popup cannot open', async () => {
    respond = (cfg) => cfg.callback({ error: 'interaction_required' })
    expect(await createAuth('cid').silentSignIn()).toBe(false)
    respond = (cfg) => cfg.error_callback?.({ type: 'popup_failed_to_open' })
    expect(await createAuth('cid').silentSignIn()).toBe(false)
    respond = (cfg) => cfg.error_callback?.({ type: 'popup_closed' })
    expect(await createAuth('cid').silentSignIn()).toBe(false)
    expect(createAuth('cid').token()).toBeNull()
  })
  it('runs one request at a time', async () => {
    let finish: () => void = () => {}
    respond = (cfg) => { finish = () => cfg.callback({ access_token: 'tok', expires_in: 3600 }) }
    const auth = createAuth('cid')
    const a = auth.silentSignIn()
    const b = auth.silentSignIn()
    await vi.advanceTimersByTimeAsync(0) // let the request reach the token client
    finish()
    expect(await Promise.all([a, b])).toEqual([true, true])
    expect(requests).toHaveLength(1)
  })
})

describe('refresh before expiry', () => {
  it('tells listeners shortly before the token expires, and the token expires a minute early as before', async () => {
    const auth = createAuth('cid')
    const expiring = vi.fn()
    const expired = vi.fn()
    auth.onExpiring(expiring)
    auth.onExpired(expired)
    await auth.signIn() // 3600 s token
    vi.advanceTimersByTime(55 * 60_000 - 1)
    expect(expiring).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(expiring).toHaveBeenCalledTimes(1) // 5 minutes before the hour
    expect(expired).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4 * 60_000)
    expect(expired).toHaveBeenCalledTimes(1)
    expect(auth.token()).toBeNull()
  })
  it('a new token replaces the old one and restarts both timers', async () => {
    const auth = createAuth('cid')
    const expiring = vi.fn()
    auth.onExpiring(expiring)
    await auth.signIn()
    vi.advanceTimersByTime(50 * 60_000)
    await auth.silentSignIn() // refreshed at minute 50
    vi.advanceTimersByTime(54 * 60_000) // minute 104: the first token's expiry has passed, the new one is not near
    expect(expiring).toHaveBeenCalledTimes(0)
    expect(auth.token()).toBe('tok')
  })
})
