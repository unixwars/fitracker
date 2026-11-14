import { describe, expect, it, vi } from 'vitest'
import { fetchAccount } from './driveAbout'

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('fetchAccount', () => {
  it('asks Drive who the token belongs to, with only the fields it needs, and returns the email and photo', async () => {
    const f = reply({ user: { emailAddress: 'a@example.test', photoLink: 'https://photos.example.test/a' } })
    expect(await fetchAccount('tok', f as unknown as typeof fetch)).toEqual({ email: 'a@example.test', photoUrl: 'https://photos.example.test/a' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,photoLink)')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
  it('the photo is optional', async () => {
    expect(await fetchAccount('t', reply({ user: { emailAddress: 'a@example.test' } }) as unknown as typeof fetch)).toEqual({ email: 'a@example.test', photoUrl: undefined })
  })
  it('gives null, never an error, when Google refuses or the reply has no email', async () => {
    expect(await fetchAccount('t', reply({}, 403) as unknown as typeof fetch)).toBeNull()
    expect(await fetchAccount('t', reply({ user: {} }) as unknown as typeof fetch)).toBeNull()
    expect(await fetchAccount('t', (async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
  })
})
