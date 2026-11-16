import { expect, test } from '@playwright/test'
import { cell } from './helpers'

test('the logo is shown in the header', async ({ page }) => {
  await page.goto('/')
  const logo = page.locator('header img.logo')
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('the appearance menu is an icon at the top right on every screen; it switches between system, light and dark and is remembered', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  const choose = async (v: string) => { await page.getByTestId('theme-menu').click(); await page.getByTestId('theme-' + v).click() }
  await expect(html).not.toHaveAttribute('data-theme', /.+/) // follows the system by default
  await choose('dark')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await choose('light')
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('theme-menu')).toBeVisible() // still there on Settings
  await choose('system')
  await expect(html).not.toHaveAttribute('data-theme', /.+/)
  await page.getByTestId('theme-menu').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('theme-dark')).toHaveCount(0)
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

test('the Settings version links to the releases page and there is a way to report a bug or request a feature', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('app-version')).toHaveAttribute('href', 'https://github.com/unixwars/fitracker/releases')
  const report = page.getByTestId('report-issue')
  await expect(report).toHaveAttribute('href', /^https:\/\/github\.com\/unixwars\/fitracker\/issues\/new\?body=App%20version/)
  await expect(report).toHaveAttribute('target', '_blank')
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

test('the first-run screen looks the same signed in or out, with both folds', async ({ page }) => {
  for (const url of ['/?unlinked&signedout', '/?unlinked']) {
    await page.goto(url)
    await expect(page.getByTestId('first-run')).toBeVisible()
    await expect(page.getByTestId('hero')).toHaveCount(1)
    await expect(page.getByTestId('create-from-template')).toBeVisible()
    await expect(page.getByTestId('how-it-works')).toBeVisible()
    await expect(page.getByTestId('trouble-linking')).toBeVisible()
  }
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
})

test('the Year view warns about accounts with no balance and the button opens the balance form', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-month').click()
  await page.getByTestId('scope-year').click()
  await expect(page.getByTestId('no-snapshot')).toBeVisible()
  await page.getByTestId('record-balance').click()
  await expect(page.getByTestId('snapshot-balance')).toBeVisible()
})

test('an account toggle in Settings changes the Month count, is stored as metadata and leaves the Accounts cells alone', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-month').click()
  await page.getByTestId('by-category').click() // Month opens By day
  const before = await page.getByTestId('accounts-included').innerText()
  await page.getByTestId('tab-settings').click()
  await page.getByTestId('accounts-fold').locator('summary').click()
  const row = page.getByTestId('account-row').first()
  const box = row.getByTestId('toggle-monthly')
  const sheetCell = await cell(page, 'Accounts!D2')
  await box.click()
  await expect(row).toContainText('Differs from the sheet')
  expect(await cell(page, 'Accounts!D2')).toBe(sheetCell)
  await expect.poll(() => page.evaluate(() => [...(window as unknown as { __fake: { book(id: string): { metadata: Map<string, string> } } }).__fake.book('fake-sheet').metadata.keys()].filter((k) => k.startsWith('fitracker.account.')).length)).toBe(1)
  await page.getByTestId('tab-month').click()
  await page.getByTestId('by-category').click() // Month opens By day
  expect(await page.getByTestId('accounts-included').innerText()).not.toBe(before)
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

test('Settings Accounts and Category icons are closed folds that open on tap', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  for (const id of ['accounts-fold', 'categories-fold']) {
    const fold = page.getByTestId(id)
    await expect(fold).not.toHaveAttribute('open', '')
    await fold.locator('summary').click()
    await expect(fold).toHaveAttribute('open', '')
  }
  await expect(page.getByTestId('account-row').first()).toBeVisible()
})

test('Settings icon pickers: one open at a time, categories show their default icon', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('categories-fold').locator('summary')).toHaveText('Categories')
  await page.getByTestId('categories-fold').locator('summary').click()
  const buttons = page.getByTestId('categories-fold').getByRole('button', { name: /^Icon:/ })
  expect(await buttons.count()).toBeGreaterThan(1)
  await expect(buttons.first().locator('svg')).toHaveCount(1) // the built-in icon, not an empty dot
  await buttons.nth(0).click()
  await expect(page.locator('.iconmenu')).toHaveCount(1)
  await buttons.nth(1).dispatchEvent('click') // the open menu covers the next row's button, so click it programmatically
  await expect(page.locator('.iconmenu')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('.iconmenu')).toHaveCount(0)
  await buttons.nth(0).click()
  await expect(page.locator('.iconmenu')).toHaveCount(1)
  await page.getByRole('heading', { name: 'Settings' }).click() // a tap outside closes it
  await expect(page.locator('.iconmenu')).toHaveCount(0)
})

test('the status pill is hidden when nothing is pending', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  await expect(page.getByTestId('status-pill')).toHaveCount(0)
})

test('Settings can add an account and a category, refuses a duplicate or invalid name, and Undo clears the last add', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  await page.getByTestId('tab-settings').click()
  await page.getByTestId('accounts-fold').locator('summary').click()
  await page.getByTestId('add-account-name').fill('Piggy bank')
  await page.getByTestId('add-account-currency').selectOption('GBP')
  expect((await page.getByTestId('add-account-submit').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.getByTestId('add-account-submit').click()
  await expect(page.getByTestId('added')).toContainText('Added Piggy bank')
  await expect(page.getByTestId('account-row').filter({ hasText: 'Piggy bank' })).toBeVisible()
  await expect.poll(() => cell(page, 'Accounts!A5')).toBe('Piggy bank') // the sheet's next free row
  await page.getByTestId('add-account-name').fill('piggy BANK')
  await page.getByTestId('add-account-submit').click()
  await expect(page.getByTestId('add-reason')).toContainText('already exists')
  await page.getByTestId('add-account-name').fill('Car*')
  await page.getByTestId('add-account-submit').click()
  await expect(page.getByTestId('add-reason')).toContainText('cannot contain')
  await page.getByTestId('categories-fold').locator('summary').click()
  await page.getByTestId('add-category-name').fill('Hobbies')
  await page.getByTestId('add-category-type').selectOption('income')
  await page.getByTestId('add-category-submit').click()
  await expect(page.getByTestId('categories-fold').getByTestId('added')).toContainText('Added Hobbies')
  await page.getByTestId('undo-add').last().click()
  const hobbies = () => page.evaluate(() => (window as unknown as { __fake: { book(id: string): { read(r: string, m: string): unknown[][] } } }).__fake.book('fake-sheet').read('Categories!A2:A', 'UNFORMATTED_VALUE').flat().includes('Hobbies'))
  await expect.poll(hobbies).toBe(false) // Undo cleared the row it wrote
  await page.getByTestId('tab-add').click()
  await page.getByTestId('accounts').selectOption('Piggy bank') // the new account is offered in Add
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

test('the Month tab is called Overview, and Month and Year stop at the first and last months that can have records', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('tab-month')).toContainText('Overview')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  await page.getByTestId('amount').fill('5')
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.locator('input[type=date]').fill('2025-03-10') // an older entry opens the past; nothing opens the future
  await page.getByTestId('save').click()
  await page.getByTestId('tab-month').click()
  await page.getByTestId('by-category').click()
  await expect(page.getByTestId('accounts-included')).toHaveClass(/pill/) // a small info pill
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(page.getByRole('button', { name: 'Next month' })).toBeEnabled()
  await page.getByTestId('scope-year').click()
  await expect(page.getByRole('button', { name: 'Next year' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Previous year' })).toBeEnabled()
  await page.getByRole('button', { name: 'Previous year' }).click()
  await expect(page.getByRole('button', { name: 'Next year' })).toBeEnabled()
  for (let y = new Date().getFullYear() - 1; y > 2025; y--) await page.getByRole('button', { name: 'Previous year' }).click()
  await expect(page.getByTestId('year-title')).toHaveText('2025')
  await expect(page.getByRole('button', { name: 'Previous year' })).toBeDisabled() // nothing before the oldest entry
})

test('Settings has the read-only facts in their own tile, and the theme icon sits in the top right corner', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  const about = page.getByTestId('about')
  await expect(about).toHaveClass(/card/)
  await expect(about).toContainText('Report issues')
  await expect(about).toContainText('Schema version')
  const theme = (await page.getByTestId('theme-menu').boundingBox())!
  expect(theme.x + theme.width).toBeGreaterThan(360 - 24) // flush with the right edge
  expect(theme.y).toBeLessThan(40) // in the header
  expect(theme.width).toBeGreaterThanOrEqual(44)
  for (const id of ['app-version', 'report-issue']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})
