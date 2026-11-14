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
  await expect(page.getByText('Linked', { exact: true })).toBeVisible()
  await page.getByTestId('unlink').click()
  await expect(page.getByTestId('unlink-confirm')).toBeVisible() // warns first, nothing changed yet
  await expect(page.getByText('Linked', { exact: true })).toBeVisible()
  await page.getByTestId('unlink-yes').click()
  await expect(page.getByTestId('first-run')).toBeVisible()
  await page.getByTestId('link-existing').click()
  await expect(page.getByTestId('tab-add')).toBeVisible() // the tab bar is back once a sheet is linked
  await expect(page.getByText('Linked', { exact: true })).toBeVisible()
  await page.getByTestId('tab-add').click()
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
})

test('Settings shows sign in or sign out, never both, and only Unlink (no relink) while signed in', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('sign-out')).toBeVisible()
  await expect(page.getByTestId('sign-in')).toHaveCount(0)
  await expect(page.getByTestId('unlink')).toBeVisible()
  await expect(page.getByText('Link a different sheet')).toHaveCount(0)
  await page.getByTestId('sign-out').click()
  await expect(page.getByTestId('sign-in')).toBeVisible()
  await expect(page.getByTestId('sign-out')).toHaveCount(0)
  await expect(page.getByTestId('unlink')).toHaveCount(0) // nothing to unlink-or-link while signed out
  await page.getByTestId('sign-in').click()
  await expect(page.getByTestId('sign-out')).toBeVisible()
  await expect(page.getByTestId('unlink')).toBeVisible()
})
