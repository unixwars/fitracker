import { expect, test } from '@playwright/test'
import { cell, clearRange } from './helpers'

async function addExpense(page: import('@playwright/test').Page, amount: string, place: string) {
  await page.getByTestId('amount').fill(amount)
  await page.getByTestId('place').fill(place)
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.getByTestId('save').click()
}

test('typing the next entry right after Save is never wiped by the previous save', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('amount').fill('5')
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.getByTestId('save').click()
  await page.getByTestId('amount').fill('6') // typed immediately, while the first save is still in flight
  await expect(page.getByTestId('amount')).toHaveValue('6')
  await page.waitForTimeout(300)
  await expect(page.getByTestId('amount')).toHaveValue('6')
})

test('entries added offline are replayed once when the connection returns', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible()

  await addExpense(page, '5', 'Offline one')
  await addExpense(page, '6', 'Offline two')
  await expect(page.getByTestId('status-pill')).toContainText('2 waiting to sync')
  expect(await cell(page, 'Ledger!A5')).toBeNull()

  await context.setOffline(false)
  await expect.poll(() => cell(page, 'Ledger!E5')).toBe('Offline one')
  await expect.poll(() => cell(page, 'Ledger!E6')).toBe('Offline two')
  expect(await cell(page, 'Ledger!A7')).toBeNull() // exactly once each
  await expect(page.getByTestId('status-pill')).not.toContainText('waiting')
})

test('an edit of a row that was removed in the sheet shows up under Needs attention', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('tab-month').click()
  await page.getByTestId('by-category').click() // Month opens By day
  await page.getByRole('button', { name: /Groceries/ }).click()
  await page.getByRole('button', { name: /Mercadona/ }).first().click()

  await clearRange(page, 'Ledger!A2:I4') // a partner removed the rows in Sheets
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByTestId('badge')).toHaveText('1')
  await page.getByTestId('tab-activity').click()
  await expect(page.getByTestId('attention')).toContainText('removed in the sheet')
})

test('deleting an entry asks first and can be undone from Activity', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('tab-month').click()
  await page.getByTestId('by-category').click() // Month opens By day
  await page.getByRole('button', { name: /Bills/ }).click()
  await page.getByRole('button', { name: /Metro/ }).first().click()
  await page.getByTestId('delete').click()
  await expect(page.getByText('Delete this entry?')).toBeVisible()
  await page.getByTestId('confirm-delete').click()
  await expect.poll(() => cell(page, 'Ledger!A4')).toBeNull()

  await page.getByTestId('tab-activity').click()
  await page.getByTestId('undo').first().click()
  await expect.poll(() => cell(page, 'Ledger!E4')).toBe('Metro')
  // Undo and Redo toggle the same row: no new entries pile up in Recent changes.
  const rows = await page.locator('.stat.recent').count()
  await expect(page.getByTestId('redo')).toBeVisible()
  await page.getByTestId('redo').click()
  await expect.poll(() => cell(page, 'Ledger!A4')).toBeNull()
  await expect(page.getByTestId('undo').first()).toBeVisible()
  expect(await page.locator('.stat.recent').count()).toBe(rows)
})
