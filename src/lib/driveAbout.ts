/** The Google account a token belongs to (Drive v3 about.get, allowed by drive.file). Display only; never stored. null on any failure. */
export type Account = { email: string; photoUrl?: string }

export async function fetchAccount(token: string, fetchImpl: typeof fetch = fetch): Promise<Account | null> {
  try {
    const res = await fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,photoLink)', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const user = ((await res.json()) as { user?: { emailAddress?: string; photoLink?: string } }).user
    return user?.emailAddress ? { email: user.emailAddress, photoUrl: user.photoLink } : null
  } catch {
    return null
  }
}
