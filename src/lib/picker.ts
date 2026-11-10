import { loadScript } from './loadScript'

let pickerReady: Promise<void> | undefined

/** Lets the user pick one spreadsheet. With the drive.file scope this is what grants access to it. */
export async function pickSheet(token: string, apiKey: string, projectNumber: string): Promise<string | null> {
  await loadScript('https://apis.google.com/js/api.js')
  pickerReady ??= new Promise<void>((resolve) => gapi.load('picker', () => resolve()))
  await pickerReady
  return new Promise<string | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
    const picker = new google.picker.PickerBuilder()
    picker.addView(view)
    picker.setOAuthToken(token)
    picker.setDeveloperKey(apiKey)
    picker.setAppId(projectNumber)
    picker.setCallback((r) => {
      if (r.action === google.picker.Action.PICKED) resolve(r.docs?.[0]?.id ?? null)
      else if (r.action === google.picker.Action.CANCEL) resolve(null)
    })
    picker.build().setVisible(true)
  })
}
