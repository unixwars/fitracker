/** Where the project lives. One place, so the first-run screen and Settings cannot drift apart. */
export const PROJECT_URL = 'https://github.com/unixwars/fitracker'
export const RELEASES_URL = `${PROJECT_URL}/releases`

/** A new GitHub issue with only the app version prefilled (no sheet, account or entry data). */
export const newIssueUrl = (versionLabel: string): string =>
  `${PROJECT_URL}/issues/new?body=${encodeURIComponent(`App version: ${versionLabel}\n\n`)}`
