import { describe, expect, it } from 'vitest'
import { copyTemplate } from './driveCopy'
import { ApiError, AuthExpired } from './errors'

const reply = (status: number, body: unknown) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

describe('copyTemplate', () => {
  it('posts the name with the bearer token and returns the new id', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ id: 'NEW' }), { status: 200 }) }) as unknown as typeof fetch
    expect(await copyTemplate('tok', 'SRC', 'Fitracker', f)).toBe('NEW')
    expect(seen!.url).toBe('https://www.googleapis.com/drive/v3/files/SRC/copy')
    expect(seen!.init.method).toBe('POST')
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(seen!.init.body as string)).toEqual({ name: 'Fitracker' })
  })
  it('maps 401 to AuthExpired', async () => {
    await expect(copyTemplate('t', 'S', 'n', reply(401, {}) as unknown as typeof fetch)).rejects.toBeInstanceOf(AuthExpired)
  })
  it('keeps the message of a 403 in the ApiError', async () => {
    const err = await copyTemplate('t', 'S', 'n', reply(403, 'File not found: S') as unknown as typeof fetch).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 403, message: 'File not found: S' })
  })
  it('fails when the response has no id', async () => {
    await expect(copyTemplate('t', 'S', 'n', reply(200, {}) as unknown as typeof fetch)).rejects.toBeInstanceOf(ApiError)
  })
})
