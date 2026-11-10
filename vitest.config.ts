import { defineConfig } from 'vitest/config'

process.env.TZ = 'America/New_York'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
