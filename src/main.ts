import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { AppState, type Env } from './lib/app.svelte'
import { createAuth, kvTokenStore } from './lib/auth'
import { fetchAccountEmail } from './lib/driveAbout'
import { createKv } from './lib/kv'
import { pickSheet } from './lib/picker'
import { copyTemplate } from './lib/driveCopy'
import { messages } from './lib/messages'
import { createSheetsApi } from './lib/sheets/api'
import { TEMPLATE_COPY_URL, templateFileId } from './lib/templateCopy'

async function makeEnv(): Promise<Env> {
  if (import.meta.env.VITE_FAKE_SHEETS === '1') {
    const { createFakeEnv } = await import('./lib/devFake')
    return createFakeEnv()
  }
  const auth = createAuth(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '', Date.now, kvTokenStore(createKv(indexedDB, 'fitracker-auth')))
  await auth.restore() // a token still valid from the last visit means no sign-in at all
  return {
    storage: localStorage,
    idb: indexedDB,
    api: createSheetsApi(() => auth.token()),
    auth,
    account: () => { const t = auth.token(); return t ? fetchAccountEmail(t) : Promise.resolve(null) },
    pick: () => {
      const token = auth.token()
      return token ? pickSheet(token, import.meta.env.VITE_GOOGLE_API_KEY ?? '', import.meta.env.VITE_GOOGLE_PROJECT_NUMBER ?? '') : Promise.resolve(null)
    },
    // Picker with the template preselected (this is what grants drive.file access to it), then Drive files.copy.
    copyTemplate: async () => {
      const token = auth.token()
      const templateId = templateFileId(TEMPLATE_COPY_URL)
      if (!token || !templateId) return null
      const picked = await pickSheet(token, import.meta.env.VITE_GOOGLE_API_KEY ?? '', import.meta.env.VITE_GOOGLE_PROJECT_NUMBER ?? '', { fileIds: [templateId] })
      return picked ? copyTemplate(token, templateId, messages.templateCopyName) : null
    },
  }
}

const app = mount(App, { target: document.getElementById('app')!, props: { app: new AppState(await makeEnv()) } })

export default app
