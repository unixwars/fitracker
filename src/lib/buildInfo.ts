// The version from package.json and the commit the build was made from (see vite.config.ts), for Settings.
export const versionLabel = (version: string, sha: string) => {
  const short = sha && sha !== 'unknown' ? sha.slice(0, 7) : ''
  return short ? `${version} (${short})` : version
}

const VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__
const SHA = typeof __APP_SHA__ === 'undefined' ? '' : __APP_SHA__

/** The compact label: "v0.2.1" for a release build, "(abc1234)" (the commit) for a dev build, "(dev)" when that is unknown too. */
export const shortVersion = (version: string, sha: string, dev: boolean): string => {
  if (!dev) return `v${version}`
  const short = sha && sha !== 'unknown' ? sha.slice(0, 7) : ''
  return `(${short || 'dev'})`
}
export const APP_SHORT_VERSION = shortVersion(VERSION, SHA, import.meta.env.DEV)

export const APP_VERSION_LABEL = versionLabel(
  typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__,
  typeof __APP_SHA__ === 'undefined' ? '' : __APP_SHA__,
)
