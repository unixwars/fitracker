export default {
  logLevel: 'warn',
  build: {
    outDir: 'dist', emptyOutDir: true, minify: false,
    lib: { entry: 'live-check.ts', formats: ['iife'], name: 'LiveCheck', fileName: () => 'live-check.js' },
  },
}
