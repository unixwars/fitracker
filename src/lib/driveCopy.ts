import { ApiError, AuthExpired } from './errors'

/** Copies a Drive file with drive.file access (Drive v3 files.copy) and returns the new file's id. */
export async function copyTemplate(token: string, fileId: string, name: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (res.status === 401) throw new AuthExpired()
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText))
  const body = (await res.json()) as { id?: string }
  if (!body.id) throw new ApiError(res.status, 'The copy response had no file id')
  return body.id
}
