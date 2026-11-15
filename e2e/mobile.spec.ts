import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 360, height: 640 } })

// Touch targets on the Settings controls must be at least 44px, and nothing may overflow the 360px width.
test('Settings shared controls are touch sized and fit a 360px screen', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  const row = page.getByTestId('account-row').first()
  for (const id of ['toggle-monthly', 'toggle-annual']) {
    const label = row.getByTestId(id).locator('xpath=..')
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect((await row.getByTestId(id).boundingBox())!.width).toBeLessThan(40) // not stretched by the global input rule
  }
  const btn = row.getByRole('button', { name: /^Icon:/ })
  const b = (await btn.boundingBox())!
  expect(b.height).toBeGreaterThanOrEqual(44)
  expect(b.width).toBeGreaterThanOrEqual(44)
  await btn.click()
  const menu = (await page.locator('.iconmenu').first().boundingBox())!
  expect(menu.x).toBeGreaterThanOrEqual(0)
  expect(menu.x + menu.width).toBeLessThanOrEqual(360)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})
