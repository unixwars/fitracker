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

test('an entry dated outside the selected year is refused', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  await page.getByTestId('amount').fill('5')
  await page.getByTestId('categories').getByRole('button', { name: 'Bills' }).click()
  await page.getByTestId('accounts').getByRole('button', { name: 'Joint' }).click()
  await page.locator('input[type=date]').fill('2020-06-01')
  await page.getByTestId('save').click()
  await expect(page.getByText('That date is not in the selected year')).toBeVisible()
  expect(await cell(page, 'Expenses!A13')).toBeNull()
})

test('any year can be opened, and a linked year can be unlinked after a warning', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await page.getByTestId('other-year').fill('2012')
  await page.getByTestId('other-year-go').click()
  await expect(page.getByTestId('year')).toHaveValue('2012')
  await expect(page.getByText('Not linked')).toBeVisible()
  await expect(page.getByTestId('unlink')).toHaveCount(0)

  const linkedYear = await page.locator('[data-testid=year] option', { hasText: '✓' }).first().getAttribute('value')
  await page.getByTestId('year').selectOption(linkedYear!)
  await expect(page.getByText('Linked', { exact: true })).toBeVisible()
  await page.getByTestId('unlink').click()
  await expect(page.getByTestId('unlink-confirm')).toBeVisible() // warns first, nothing changed yet
  await expect(page.getByText('Linked', { exact: true })).toBeVisible()
  await page.getByTestId('unlink-yes').click()
  await expect(page.getByText('Not linked')).toBeVisible()
  await expect(page.getByTestId('link')).toHaveText(/Link the/)
})
