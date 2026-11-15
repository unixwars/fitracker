import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE lets a fork host the app under a sub-path (e.g. GitHub Pages project sites).
const base = process.env.VITE_BASE ?? '/'

// Shown in Settings: the package version and the commit (the CI's variable, else git, else unknown).
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string
const sha = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? (() => {
  try { return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'unknown' }
})()

// https://vite.dev/config/
export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version), __APP_SHA__: JSON.stringify(sha) },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'fitracker',
        short_name: 'fitracker',
        description: 'Fast mobile entry for your budget ledger',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        background_color: '#0e1418',
        theme_color: '#0e1418',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
