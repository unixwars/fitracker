import { describe, expect, it, vi } from 'vitest'
import { fetchAccountEmail } from './driveAbout'

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('fetchAccountEmail', () => {
  it('asks Drive who the token belongs to, with only the field it needs, and returns the email', async () => {
    const f = reply({ user: { emailAddress: 'a@example.test' } })
    expect(await fetchAccountEmail('tok', f as unknown as typeof fetch)).toBe('a@example.test')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
  it('gives null, never an error, when Google refuses or the reply has no email', async () => {
    expect(await fetchAccountEmail('t', reply({}, 403) as unknown as typeof fetch)).toBeNull()
    expect(await fetchAccountEmail('t', reply({ user: {} }) as unknown as typeof fetch)).toBeNull()
    expect(await fetchAccountEmail('t', (async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
  })
})
