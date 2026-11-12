import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 390, height: 844 } },
  webServer: {
    command: 'VITE_FAKE_SHEETS=1 pnpm build && VITE_FAKE_SHEETS=1 pnpm preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
