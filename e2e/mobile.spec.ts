import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 360, height: 640 } })

test('Year view, charts and the balance form fit a 360px screen with touch sized controls', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-month').click()
  await page.getByTestId('scope-year').click()
  await expect(page.getByTestId('year-totals')).toBeVisible()
  for (const t of ['scope-month', 'scope-year']) expect((await page.getByTestId(t).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await page.getByTestId('tab-activity').click()
  await page.getByTestId('snapshot-card').locator('summary').click()
  expect((await page.getByTestId('snapshot-card').locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect((await page.getByTestId('snapshot-sign').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.getByTestId('snapshot-balance').fill('25')
  await page.getByTestId('snapshot-sign').click()
  await expect(page.getByTestId('snapshot-balance')).toHaveValue('-25')
  await page.getByTestId('snapshot-sign').click()
  await expect(page.getByTestId('snapshot-balance')).toHaveValue('25')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

test('the By day switch and rows are touch sized and fit a 360px screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  await page.getByTestId('amount').fill('7.50') // dated today: the test must not depend on the day of the month
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.getByTestId('save').click()
  await page.getByTestId('tab-month').click()
  for (const t of ['by-category', 'by-day']) expect((await page.getByTestId(t).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.getByTestId('by-day').click()
  const row = page.getByTestId('day').first().locator('.entry').first()
  await expect(row).toBeVisible()
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})
