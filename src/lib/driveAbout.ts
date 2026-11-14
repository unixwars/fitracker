/** The Google account a token belongs to (Drive v3 about.get, allowed by drive.file). Display only; never stored. null on any failure. */
export async function fetchAccountEmail(token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const body = (await res.json()) as { user?: { emailAddress?: string } }
    return body.user?.emailAddress ?? null
  } catch {
    return null
  }
}
