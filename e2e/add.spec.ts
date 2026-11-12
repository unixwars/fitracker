import { expect, test } from '@playwright/test'
import { cell } from './helpers'

// "Interactions" are counted as one per user action: a typed field, a tap, or the Save tap.

test('a repeat purchase takes 3 interactions', async ({ page }) => {
  await page.goto('/')
  const amount = page.getByTestId('amount')
  await expect(page.getByTestId('place-suggestions')).toBeVisible()

  await amount.fill('12,50') //                                                          1: amount
  await page.getByTestId('place-suggestions').getByRole('button', { name: 'Mercadona' }).click() // 2: suggestion (fills category and account)
  await page.getByTestId('save').click() //                                              3: save

  await expect.poll(() => cell(page, 'Expenses!A13')).not.toBeNull()
  expect(await cell(page, 'Expenses!D13')).toBe(12.5)
  expect(await cell(page, 'Expenses!E13')).toBe('Mercadona')
  expect(await cell(page, 'Expenses!G13')).toBe('Groceries')
  expect(await cell(page, 'Expenses!H13')).toBe('Joint')
  expect(await cell(page, 'Expenses!I13')).toBe('EUR')
})

test('a new purchase takes at most 5 interactions', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  await page.getByTestId('amount').fill('8') //                                                       1
  await page.getByTestId('place').fill('Kebab House') //                                              2
  await page.getByTestId('categories').getByRole('button', { name: 'Recreation' }).click() //         3
  await page.getByTestId('accounts').getByRole('button', { name: 'T-Cash' }).click() //               4
  await page.getByTestId('save').click() //                                                           5

  await expect.poll(() => cell(page, 'Expenses!A13')).not.toBeNull()
  expect(await cell(page, 'Expenses!E13')).toBe('Kebab House')
  expect(await cell(page, 'Expenses!G13')).toBe('Recreation')
})

test('the form resets after saving but keeps currency, category and account', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('currency').selectOption('GBP')
  await page.getByTestId('amount').fill('3')
  await page.getByTestId('categories').getByRole('button', { name: 'Bills' }).click()
  await page.getByTestId('accounts').getByRole('button', { name: 'Joint' }).click()
  await page.getByTestId('save').click()
  await expect(page.getByTestId('amount')).toHaveValue('')
  await expect(page.getByTestId('currency')).toHaveValue('GBP')
  await expect(page.getByTestId('categories').getByRole('button', { name: 'Bills' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => cell(page, 'Expenses!I13')).toBe('GBP')
})

test('invalid input is rejected with a message and nothing is saved', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories')).toBeVisible()
  await page.getByTestId('save').click()
  await expect(page.getByText('Enter an amount above zero')).toBeVisible()
  expect(await cell(page, 'Expenses!A13')).toBeNull()
})
