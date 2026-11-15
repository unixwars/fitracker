/** What the browser hands us when the app can be installed (Chrome and Edge; not Safari or Firefox). */
export interface InstallPrompt { prompt(): Promise<unknown> }

export interface InstallState { prompt: InstallPrompt | null; installed: boolean; ios: boolean; standalone: boolean }

/** A button while the browser has a prompt ready, a Share hint on iOS, otherwise nothing (also once installed). */
export function installUi(s: InstallState): 'button' | 'ios-hint' | 'none' {
  if (s.installed || s.standalone) return 'none'
  if (s.prompt) return 'button'
  return s.ios ? 'ios-hint' : 'none'
}

/** iPadOS 13+ reports itself as a Mac, so a Mac with a touch screen is an iPad. */
export function isIos(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
}
