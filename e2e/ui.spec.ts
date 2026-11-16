import { expect, test } from '@playwright/test'
import { cell } from './helpers'

test('the logo is shown in the header', async ({ page }) => {
  await page.goto('/')
  const logo = page.locator('header img.logo')
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('the appearance setting switches between system, light and dark and is remembered', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-theme', /.+/) // follows the system by default
  await page.getByTestId('theme').selectOption('dark')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await page.getByTestId('theme').selectOption('light')
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('tab-settings').click()
  await page.getByTestId('theme').selectOption('system')
  await expect(html).not.toHaveAttribute('data-theme', /.+/)
})

test('an entry dated in an earlier year is saved', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('amount').fill('5')
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.locator('input[type=date]').fill('2020-06-01')
  await page.getByTestId('save').click()
  await expect.poll(() => cell(page, 'Ledger!B5')).toBe(43983) // 2020-06-01
})

test('unlink warns first and relinking works', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('open-sheet')).toBeVisible()
  await page.getByTestId('unlink').click()
  await expect(page.getByTestId('unlink-confirm')).toBeVisible() // warns first, nothing changed yet
  await expect(page.getByTestId('open-sheet')).toBeVisible()
  await page.getByTestId('unlink-yes').click()
  await expect(page.getByTestId('first-run')).toBeVisible()
  await page.getByTestId('link-existing').click()
  await expect(page.getByTestId('tab-add')).toBeVisible() // the tab bar is back once a sheet is linked
  await expect(page.getByTestId('open-sheet')).toBeVisible()
  await page.getByTestId('tab-add').click()
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
})

test('Settings has only Sign out (no Sign in; the Reconnect banner signs in) and Unlink only while signed in', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('sign-out')).toBeVisible()
  await expect(page.getByText('demo@example.test')).toBeVisible()
  await expect(page.getByTestId('sign-in')).toHaveCount(0)
  await expect(page.getByTestId('unlink')).toBeVisible()
  await expect(page.getByText('Link a different sheet')).toHaveCount(0)
  await page.getByTestId('sign-out').click()
  await expect(page.getByTestId('sign-out')).toHaveCount(0)
  await expect(page.getByTestId('sign-in')).toHaveCount(0)
  await expect(page.getByTestId('unlink')).toHaveCount(0) // nothing to unlink while signed out
  await page.getByTestId('reconnect').getByRole('button').click()
  await expect(page.getByTestId('sign-out')).toBeVisible()
  await expect(page.getByTestId('unlink')).toBeVisible()
})

test('every dock tab shows an icon and category options carry an emoji', async ({ page }) => {
  await page.goto('/')
  for (const t of ['add', 'month', 'activity', 'settings']) await expect(page.getByTestId('tab-' + t).locator('svg')).toHaveCount(1)
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toHaveText('🧾 Bills')
  // Chromium supports customizable selects, so there the options show the monochrome SVG and hide the emoji
  const shown = await page.getByTestId('categories').locator('option', { hasText: 'Bills' }).evaluate((o) => [getComputedStyle(o.querySelector('.opt-icon')!).display, getComputedStyle(o.querySelector('.opt-emoji')!).display])
  expect(shown[0]).not.toBe('none')
  expect(shown[1]).toBe('none')
})

test('Settings shows the app version and the commit it was built from', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+ \([0-9a-f]{7}\)$/)
})

test('Settings links to the project releases page', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  const link = page.getByTestId('releases-link')
  await expect(link).toHaveAttribute('href', 'https://github.com/unixwars/fitracker/releases')
  await expect(link).toHaveAttribute('rel', /noopener/)
})

test('a first-time visitor (signed out, no sheet) sees what the app is and the first button without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 560 })
  await page.goto('/?unlinked&signedout')
  await expect(page.getByTestId('first-run')).toBeVisible()
  await expect(page.getByText('Expenses', { exact: true })).toBeVisible()
  await expect(page.getByText(/Google Sheet that you own/)).toBeVisible()
  const first = page.locator('[data-testid=first-run] button').first()
  const box = (await first.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(560)
  await expect(page.getByTestId('project-link')).toHaveAttribute('href', 'https://github.com/unixwars/fitracker')
  await expect(page.getByTestId('how-it-works')).not.toHaveAttribute('open', '')
})

test('someone already signed in with no sheet gets the short first-run screen', async ({ page }) => {
  await page.goto('/?unlinked')
  await expect(page.getByTestId('first-run')).toBeVisible()
  await expect(page.getByTestId('hero')).toHaveCount(0)
  await expect(page.getByTestId('create-from-template')).toBeVisible()
})

test('the first-run screen has cookie help for a blocked Google picker, closed until needed', async ({ page }) => {
  await page.goto('/?unlinked')
  const help = page.getByTestId('trouble-linking')
  await expect(help).not.toHaveAttribute('open', '')
  await help.getByText('Trouble linking?').click()
  await expect(page.getByText(/third-party cookies for the Google picker/)).toBeVisible()
})

test('the cookie help opens by itself after a link attempt that ends without a sheet', async ({ page }) => {
  await page.goto('/?unlinked&pickcancel')
  await expect(page.getByTestId('trouble-linking')).not.toHaveAttribute('open', '')
  await page.getByTestId('link-existing').click()
  await expect(page.getByTestId('trouble-linking')).toHaveAttribute('open', '')
})

test('a balance can be recorded in Activity and lands in Snapshots', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-activity').click()
  await page.getByTestId('snapshot-card').locator('summary').click()
  await page.getByTestId('snapshot-balance').fill('1250,40')
  await page.getByTestId('snapshot-save').click()
  await expect(page.getByTestId('snapshot-saved')).toBeVisible()
  await expect.poll(() => cell(page, 'Snapshots!D2')).toBe(1250.4)
})

test('Month has a Year view with totals and charts, and Month shows its charts', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-month').click()
  await page.getByTestId('by-category').click()
  await expect(page.getByTestId('chart').first()).toBeVisible()
  await page.getByTestId('scope-year').click()
  await expect(page.getByTestId('year-title')).toHaveText(String(new Date().getFullYear()))
  await expect(page.getByTestId('year-totals')).toBeVisible()
  expect(await page.getByTestId('chart').count()).toBe(5)
  await page.getByRole('button', { name: 'Previous year' }).click()
  await expect(page.getByTestId('year-title')).toHaveText(String(new Date().getFullYear() - 1))
})

test('the Year view warns about accounts with no balance and the button opens the balance form', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-month').click()
  await page.getByTestId('scope-year').click()
  await expect(page.getByTestId('no-snapshot')).toBeVisible()
  await page.getByTestId('record-balance').click()
  await expect(page.getByTestId('snapshot-balance')).toBeVisible()
})

test('Month can be browsed by day and an entry opens for editing', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  await page.getByTestId('amount').fill('12.34') // dated today, so the test does not depend on the day of the month
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.getByTestId('save').click()
  await page.getByTestId('tab-month').click()
  await expect(page.getByTestId('by-day')).toHaveAttribute('aria-pressed', 'true') // By day is the default and the first button
  expect(await page.getByRole('group', { name: 'View by' }).locator('button').first().getAttribute('data-testid')).toBe('by-day')
  await page.getByTestId('by-category').click()
  await expect(page.getByTestId('accounts-included')).toBeVisible()
  await page.getByTestId('by-day').click()
  await expect(page.getByTestId('accounts-included')).toHaveCount(0)
  const row = page.getByTestId('day').first().locator('.entry').filter({ hasText: '12.34' })
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('first-run choices are equal width with an "or" between them, folds have chevrons and the footer link is a compact right-aligned pill', async ({ page }) => {
  await page.goto('/?unlinked&signedout')
  const a = (await page.getByTestId('create-from-template').boundingBox())!
  const b = (await page.getByTestId('link-existing').boundingBox())!
  const or = (await page.getByTestId('or').boundingBox())!
  expect(Math.abs(a.width - b.width)).toBeLessThan(1)
  expect(or.y).toBeGreaterThan(a.y + a.height - 1)
  expect(or.y + or.height).toBeLessThanOrEqual(b.y + 1)
  const summary = page.getByTestId('how-it-works').locator('summary')
  expect(await summary.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700')
  expect(await summary.evaluate((el) => getComputedStyle(el, '::after').content)).not.toBe('none')
  const link = (await page.getByTestId('project-link').boundingBox())!
  const vw = page.viewportSize()!.width
  expect(link.x + link.width).toBeGreaterThan(vw - 40) // right-aligned
  expect(link.height).toBeLessThan(36) // compact, not button sized
  await expect(page.getByTestId('project-link')).toContainText(/^\s*fitracker (v\d+\.\d+\.\d+|\(\w+\))/)
  await expect(page.getByTestId('releases-link-short')).toHaveCount(0)
  expect(await page.getByTestId('project-link').locator('svg').count()).toBe(1)
})

test('the status pill is hidden when nothing is pending', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  await expect(page.getByTestId('status-pill')).toHaveCount(0)
})
