// Minimal typings for the Google scripts loaded at runtime.
type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string }
type PickerDoc = { id: string; name: string }
type PickerResponse = { action: string; docs?: PickerDoc[] }

interface PickerBuilder {
  addView(v: unknown): PickerBuilder
  setOAuthToken(t: string): PickerBuilder
  setDeveloperKey(k: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setCallback(cb: (r: PickerResponse) => void): PickerBuilder
  build(): { setVisible(v: boolean): void }
}

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string
        scope: string
        callback: (r: TokenResponse) => void
        error_callback?: (e: { type: string }) => void
      }): { requestAccessToken(o?: { prompt?: string }): void }
      revoke(token: string, done?: () => void): void
    }
  }
  picker: {
    Action: { PICKED: string; CANCEL: string }
    ViewId: { SPREADSHEETS: string }
    DocsView: new (viewId: string) => { setMode(m: unknown): unknown }
    PickerBuilder: new () => PickerBuilder
  }
}
declare const gapi: { load(lib: string, cb: () => void): void }
