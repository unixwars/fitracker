// Regenerates assets/hero.webp: the Add screen (demo data, ?hero) on an oblique phone. Run: pnpm hero
// Builds the app in the offline demo mode, screenshots it with Playwright, renders scripts/hero-mock.html, saves a webp.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const root = new URL('..', import.meta.url).pathname
const tmp = mkdtempSync(join(tmpdir(), 'hero-'))
const port = 4181
const env = { ...process.env, VITE_FAKE_SHEETS: '1' }
let preview
try {
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', join(tmp, 'app'), '--emptyOutDir'], { cwd: root, env, stdio: 'ignore' })
  preview = spawn('pnpm', ['exec', 'vite', 'preview', '--outDir', join(tmp, 'app'), '--port', String(port), '--strictPort'], { cwd: root, env, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://localhost:${port}/`).then((r) => r.ok, () => false)) break
    await new Promise((r) => setTimeout(r, 200))
  }

  const browser = await chromium.launch()
  // The Add screen: 4.99 GBP at Waitrose (the suggestion fills Groceries, Joint and "Sourdough"); Revolut and Monzo are the other accounts.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' })).newPage()
  await phone.goto(`http://localhost:${port}/?hero`)
  await phone.getByTestId('place-suggestions').waitFor()
  await phone.getByTestId('amount').fill('4.99')
  await phone.getByTestId('place-suggestions').getByRole('button', { name: 'Waitrose' }).click()
  await phone.waitForTimeout(500)
  const screen = await phone.screenshot()

  const html = readFileSync(join(root, 'scripts/hero-mock.html'), 'utf8').replace('{{SCREEN}}', `data:image/png;base64,${screen.toString('base64')}`)
  writeFileSync(join(tmp, 'mock.html'), html)
  const mock = await (await browser.newContext({ viewport: { width: 2172, height: 1086 } })).newPage()
  await mock.goto('file://' + join(tmp, 'mock.html'))
  await mock.waitForTimeout(500)
  const png = await mock.screenshot()
  await browser.close()
  const info = await sharp(png).webp({ quality: 88 }).toFile(join(root, 'assets/hero.webp'))
  console.log(`assets/hero.webp written (${info.size} bytes)`)
} finally {
  preview?.kill()
  rmSync(tmp, { recursive: true, force: true })
}
