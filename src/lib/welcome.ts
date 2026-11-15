import type { Status } from './app.svelte'

/** The first-run intro (what the app is, what to do) is for someone signed out with no sheet; a signed-in person with no sheet only needs the two buttons. */
export function showIntro(status: Status, signedIn: boolean): boolean {
  return status === 'unlinked' && !signedIn
}
