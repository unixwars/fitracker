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
