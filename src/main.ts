import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { AppState, type Env } from './lib/app.svelte'
import { createAuth } from './lib/auth'
import { pickSheet } from './lib/picker'
import { createSheetsApi } from './lib/sheets/api'

async function makeEnv(): Promise<Env> {
  if (import.meta.env.VITE_FAKE_SHEETS === '1') {
    const { createFakeEnv } = await import('./lib/devFake')
    return createFakeEnv()
  }
  const auth = createAuth(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '')
  return {
    storage: localStorage,
    idb: indexedDB,
    api: createSheetsApi(() => auth.token()),
    auth,
    pick: () => {
      const token = auth.token()
      return token ? pickSheet(token, import.meta.env.VITE_GOOGLE_API_KEY ?? '', import.meta.env.VITE_GOOGLE_PROJECT_NUMBER ?? '') : Promise.resolve(null)
    },
  }
}

const app = mount(App, { target: document.getElementById('app')!, props: { app: new AppState(await makeEnv()) } })

export default app
