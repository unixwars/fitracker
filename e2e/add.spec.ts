import { expect, test } from '@playwright/test'
import { cell } from './helpers'

// "Interactions" are counted as one per user action: a typed field, a tap, or the Save tap.

test('a repeat purchase takes 3 interactions', async ({ page }) => {
  await page.goto('/')
  const amount = page.getByTestId('amount')
  await expect(page.getByTestId('place-suggestions')).toBeVisible()

  await amount.fill('12,50') //                                                          1: amount
  await page.getByTestId('place-suggestions').getByRole('button', { name: 'Mercadona' }).click() // 2: suggestion (fills category and account)
  await expect(page.getByTestId('description')).toHaveValue('Weekly shop') // pre-filled from the last purchase there
  await page.getByTestId('save').click() //                                              3: save

  await expect.poll(() => cell(page, 'Ledger!A5')).not.toBeNull()
  expect(await cell(page, 'Ledger!C5')).toBe('expense')
  expect(await cell(page, 'Ledger!D5')).toBe(12.5)
  expect(await cell(page, 'Ledger!E5')).toBe('Mercadona')
  expect(await cell(page, 'Ledger!F5')).toBe('Weekly shop')
  expect(await cell(page, 'Ledger!G5')).toBe('Groceries')
  expect(await cell(page, 'Ledger!H5')).toBe('Joint')
})

test('a new purchase takes at most 5 interactions', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('amount').fill('8') //                                                       1
  await page.getByTestId('place').fill('Kebab House') //                                              2
  await page.getByTestId('categories').selectOption('Recreation') //         3
  await page.getByTestId('accounts').selectOption('T-Cash') //               4
  await page.getByTestId('save').click() //                                                           5

  await expect.poll(() => cell(page, 'Ledger!A5')).not.toBeNull()
  expect(await cell(page, 'Ledger!E5')).toBe('Kebab House')
  expect(await cell(page, 'Ledger!G5')).toBe('Recreation')
})

test('the form resets after saving but keeps category and account, and the currency follows the account', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('T-Cash')
  await expect(page.getByTestId('currency')).toHaveValue('GBP') // the account chip sets the currency
  await page.getByTestId('amount').fill('3')
  await page.getByTestId('save').click()
  await expect(page.getByTestId('amount')).toHaveValue('')
  await expect(page.getByTestId('currency')).toHaveValue('GBP')
  await expect(page.getByTestId('categories')).toHaveValue('Bills')
  await expect(page.getByTestId('accounts')).toHaveValue('T-Cash')
  await expect.poll(() => cell(page, 'Ledger!H5')).toBe('T-Cash')
})

test('invalid input is rejected with a message and nothing is saved', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('save').click()
  await expect(page.getByText('Enter an amount above zero')).toBeVisible()
  expect(await cell(page, 'Ledger!A5')).toBeNull()
})

test('a comma typed in the amount becomes a dot, thousands separators and extra decimals are not kept, and the saved amount is exact', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  const amount = page.getByTestId('amount')
  await amount.fill('12,5')
  await expect(amount).toHaveValue('12.5')
  await amount.fill('1,234.567')
  await expect(amount).toHaveValue('1.23') // never guessed as 1234
  await amount.fill('12,50')
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.getByTestId('save').click()
  await expect.poll(() => cell(page, 'Ledger!D5')).toBe(12.5)
})

test('Activity lists the amount of every recent change', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('amount').fill('12,5')
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint')
  await page.getByTestId('save').click()
  await expect.poll(() => cell(page, 'Ledger!A5')).not.toBeNull()
  await page.getByTestId('tab-activity').click()
  await expect(page.getByTestId('recent-amount').first()).toContainText('12.50')
})
