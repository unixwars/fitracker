import { expect, test } from '@playwright/test'

test('the manifest makes the app installable: standalone, 192 and 512 icons, a maskable icon', async ({ page }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const m = await (await page.request.get(new URL(href!, page.url()).href)).json()
  expect(m.display).toBe('standalone')
  expect(m.start_url).toBeTruthy()
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  for (const i of m.icons) expect((await page.request.get(new URL(i.src, new URL(href!, page.url())).href)).ok()).toBe(true)
})

test('after one visit the app opens with no network at all', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload() // now controlled by the service worker
  await expect(page.getByTestId('tab-add')).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('tab-add')).toBeVisible()
  await expect(page.getByTestId('offline')).toBeVisible()
})

test('the device stores only the allowed keys and never a token in local storage', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await page.getByTestId('sign-out').click()
  const dump = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  for (const k of Object.keys(dump)) expect(['fitracker.sheet', 'fitracker.device', 'fitracker.signedOut']).toContain(k)
  expect(JSON.stringify(dump)).not.toMatch(/ya29\.|access_token|fake/)
})

test('Use my location fills the place of an earlier entry saved at the same spot', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 51.5074, longitude: -0.1278 })
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  const here = page.getByRole('button', { name: /location/i })
  await here.click()
  await expect(page.getByText('No known place nearby')).toBeVisible()
  await page.getByTestId('place').fill('Corner Cafe')
  await page.getByTestId('amount').fill('3')
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.getByTestId('save').click()
  await expect(page.getByTestId('amount')).toHaveValue('') // the form has reset
  await here.click()
  await expect(page.getByTestId('place')).toHaveValue('Corner Cafe')
})

test('a GPS-suggested place can be cleared and replaced without refilling itself', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 51.5074, longitude: -0.1278 })
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  await page.getByRole('button', { name: /location/i }).click()
  await page.getByTestId('place').fill('Corner Cafe')
  await page.getByTestId('amount').fill('3')
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.getByTestId('save').click()
  await expect(page.getByTestId('place')).toHaveValue('Corner Cafe') // the fresh blank form auto-locates once
  await page.getByTestId('place').fill('')
  await page.waitForTimeout(800) // long enough for a refill, if there were one
  await expect(page.getByTestId('place')).toHaveValue('')
  await page.getByTestId('place').fill('Bakery')
  await expect(page.getByTestId('place')).toHaveValue('Bakery')
})

test('Settings offers Install app when the browser has an install prompt, and uses it once', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('install-app')).toHaveCount(0)
  await page.evaluate(() => {
    const ev = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => { (window as unknown as { __prompted: boolean }).__prompted = true } })
    window.dispatchEvent(ev)
  })
  await page.getByTestId('install-app').click()
  expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true)
  await expect(page.getByTestId('install-app')).toHaveCount(0)
})

test('the first-run screen shows the install button too, folded with the steps', async ({ page }) => {
  await page.goto('/?unlinked&signedout')
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => undefined })))
  await page.getByTestId('how-it-works').getByText('How it works').click()
  await expect(page.getByTestId('install-app')).toBeVisible()
})
