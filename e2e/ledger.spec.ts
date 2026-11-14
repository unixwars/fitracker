import { expect, test } from '@playwright/test'
import { cell, refresh, setCell, todaySerial } from './helpers'

test('a foreign amount warns, converts after confirming and stores the converted amount', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  await page.getByTestId('categories').getByRole('button', { name: 'Bills' }).click()
  await page.getByTestId('accounts').getByRole('button', { name: 'Joint' }).click() // EUR account
  await page.getByTestId('currency').selectOption('GBP')
  await page.getByTestId('amount').fill('10')
  await page.getByTestId('description').fill('Taxi')
  await expect(page.getByTestId('currency-warning')).toBeVisible()

  await page.getByTestId('save').click() // refused until the conversion is confirmed
  expect(await cell(page, 'Ledger!A5')).toBeNull()
  await page.getByTestId('convert-confirm').click()
  await page.getByTestId('save').click()

  await expect.poll(() => cell(page, 'Ledger!A5')).not.toBeNull()
  expect(await cell(page, 'Ledger!D5')).toBe(11.7) // GBP 10 at the seeded current rate 1.17
  expect(await cell(page, 'Ledger!F5')).toBe('Taxi')
  expect(await cell(page, 'Ledger!H5')).toBe('Joint')
})

test('unticking an account in Accounts removes its entries from the Month totals', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  const serial = await todaySerial(page)
  for (const [col, v] of [['A', 'tick1'], ['B', serial], ['C', 'expense'], ['D', 7], ['F', 'Tick test'], ['G', 'Bills'], ['H', 'M-Cash']] as const) {
    await setCell(page, `Ledger!${col}5`, v)
  }
  await refresh(page)
  await page.getByTestId('tab-month').click()
  await expect(page.getByTestId('accounts-included')).toHaveText('3 of 3 accounts included')
  const before = await page.getByTestId('expenses-actual').textContent()

  await setCell(page, 'Accounts!D3', false) // M-Cash: In Monthly
  await refresh(page)
  await expect(page.getByTestId('accounts-included')).toHaveText('2 of 3 accounts included')
  await expect(page.getByTestId('expenses-actual')).not.toHaveText(before!)
})

test('a hand-typed row that is not understood shows under Needs attention', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  await page.getByTestId('tab-month').click()
  const before = await page.getByTestId('expenses-actual').textContent()
  for (const [col, v] of [['A', 'bad1'], ['B', 'not a date'], ['C', 'expense'], ['D', 5], ['G', 'Bills'], ['H', 'Joint']] as const) {
    await setCell(page, `Ledger!${col}5`, v)
  }
  await refresh(page)
  await expect(page.getByTestId('badge')).toHaveText('1')
  await page.getByTestId('tab-activity').click()
  await expect(page.getByTestId('unreadable')).toContainText('Row 5')
  await page.getByTestId('tab-month').click()
  await expect(page.getByTestId('expenses-actual')).toHaveText(before!)
})

test('first run creates the sheet from the template', async ({ page }) => {
  await page.goto('/?unlinked')
  await expect(page.getByTestId('first-run')).toBeVisible()
  await page.getByTestId('create-from-template').click() // one tap links the copy
  await expect(page.getByTestId('categories')).toBeVisible()
})
