// The version from package.json and the commit the build was made from (see vite.config.ts), for Settings.
export const versionLabel = (version: string, sha: string) => {
  const short = sha && sha !== 'unknown' ? sha.slice(0, 7) : ''
  return short ? `${version} (${short})` : version
}

export const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__

export const APP_VERSION_LABEL = versionLabel(
  typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__,
  typeof __APP_SHA__ === 'undefined' ? '' : __APP_SHA__,
)
