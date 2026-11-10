import { expect, test } from '@playwright/test'
import { cell, clearRange } from './helpers'

async function addExpense(page: import('@playwright/test').Page, amount: string, place: string) {
  await page.getByTestId('amount').fill(amount)
  await page.getByTestId('place').fill(place)
  await page.getByTestId('categories').getByRole('button', { name: 'Bills' }).click()
  await page.getByTestId('accounts').getByRole('button', { name: 'Joint' }).click()
  await page.getByTestId('save').click()
}

test('entries added offline are replayed once when the connection returns', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible()

  await addExpense(page, '5', 'Offline one')
  await addExpense(page, '6', 'Offline two')
  await expect(page.getByTestId('year-pill')).toContainText('waiting to sync')
  expect(await cell(page, 'Expenses!A13')).toBeNull()

  await context.setOffline(false)
  await expect.poll(() => cell(page, 'Expenses!E13')).toBe('Offline one')
  expect(await cell(page, 'Expenses!E14')).toBe('Offline two')
  expect(await cell(page, 'Expenses!A15')).toBeNull() // exactly once each
  await expect(page.getByTestId('year-pill')).not.toContainText('waiting')
})

test('an edit of a row that was removed in the sheet shows up under Needs attention', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  await page.getByTestId('tab-month').click()
  await page.getByRole('button', { name: /Groceries/ }).click()
  await page.getByRole('button', { name: /Mercadona/ }).first().click()

  await clearRange(page, 'Expenses!A10:I12') // a partner removed the rows in Sheets
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByTestId('badge')).toHaveText('1')
  await page.getByTestId('tab-activity').click()
  await expect(page.getByTestId('attention')).toContainText('removed in the sheet')
})

test('deleting an entry asks first and can be undone from Activity', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  await page.getByTestId('tab-month').click()
  await page.getByRole('button', { name: /Bills/ }).click()
  await page.getByRole('button', { name: /Metro/ }).first().click()
  await page.getByTestId('delete').click()
  await expect(page.getByText('Delete this entry?')).toBeVisible()
  await page.getByTestId('confirm-delete').click()
  await expect.poll(() => cell(page, 'Expenses!A12')).toBeNull()

  await page.getByTestId('tab-activity').click()
  await page.getByTestId('undo').first().click()
  await expect.poll(() => cell(page, 'Expenses!E12')).toBe('Metro')
})
