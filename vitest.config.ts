import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

process.env.TZ = 'America/New_York'

// The svelte plugin compiles the runes in app.svelte.ts; app.test.ts opts into jsdom with a file comment.
export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
