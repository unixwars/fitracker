import { installUi, isIos, type InstallPrompt } from './install'

/** Holds the browser's install prompt. `attach()` must run at the top of main.ts, before anything is awaited, or an early event is lost. */
class Installer {
  prompt = $state<InstallPrompt | null>(null)
  installed = $state(false)
  readonly ios = isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
  readonly standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  ui = $derived(installUi({ prompt: this.prompt, installed: this.installed, ios: this.ios, standalone: this.standalone }))

  attach() {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.prompt = e as unknown as InstallPrompt })
    window.addEventListener('appinstalled', () => { this.installed = true; this.prompt = null })
  }

  async install() {
    const p = this.prompt
    if (!p) return
    this.prompt = null // the event can be used once
    await p.prompt()
  }
}

export const installer = new Installer()
