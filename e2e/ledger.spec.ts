import { expect, test } from '@playwright/test'
import { cell, refresh, setCell, todaySerial } from './helpers'

test('a foreign amount warns, converts after confirming and stores the converted amount', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('categories').selectOption('Bills')
  await page.getByTestId('accounts').selectOption('Joint') // EUR account
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
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
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
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
  await page.getByTestId('tab-month').click()
  const before = await page.getByTestId('expenses-actual').textContent()
  for (const [col, v] of [['A', 'bad1'], ['B', 'not a date'], ['C', 'expense'], ['D', 5], ['G', 'Bills'], ['H', 'Joint']] as const) {
    await setCell(page, `Ledger!${col}5`, v)
  }
  await refresh(page)
  await expect(page.getByTestId('badge')).toHaveText('1')
  await page.getByTestId('tab-activity').click()
  await expect(page.getByTestId('unreadable')).toContainText('row 5')
  await page.getByTestId('tab-month').click()
  await expect(page.getByTestId('expenses-actual')).toHaveText(before!)
})

test('first run creates the sheet from the template', async ({ page }) => {
  await page.goto('/?unlinked')
  await expect(page.getByTestId('first-run')).toBeVisible()
  await page.getByTestId('create-from-template').click() // one tap links the copy
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached() // the lists have loaded
})

test('an unreadable row with an id is fixed in the app; one without an id only offers the link to the row in Sheets', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('categories').locator('option', { hasText: 'Bills' })).toBeAttached()
  for (const [col, v] of [['A', 'bad1'], ['B', 'not a date'], ['C', 'expense'], ['D', 5], ['G', 'Bills'], ['H', 'Joint']] as const) await setCell(page, `Ledger!${col}5`, v)
  for (const [col, v] of [['B', 'xx'], ['C', 'expense'], ['D', 'ten'], ['H', 'Joint']] as const) await setCell(page, `Ledger!${col}6`, v) // no id
  await refresh(page)
  await expect(page.getByTestId('badge')).toHaveText('2')
  await page.getByTestId('tab-activity').click()
  const rows = page.getByTestId('unreadable')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByTestId('fix-row')).toBeVisible()
  await expect(rows.nth(1).getByTestId('fix-row')).toHaveCount(0) // no id: fix it in the sheet
  await expect(rows.nth(0).getByTestId('open-row')).toHaveAttribute('href', /#gid=\d+&range=A5:I5$/)
  await expect(rows.nth(1).getByTestId('open-row')).toHaveAttribute('href', /#gid=\d+&range=A6:I6$/)

  await rows.nth(0).getByTestId('fix-row').click()
  await expect(page.getByTestId('amount')).toHaveValue('5.00') // what could be read is kept
  await expect(page.getByTestId('categories')).toHaveValue('Bills')
  await page.getByTestId('save').click() // the date defaulted to today, so the row is valid now
  await expect.poll(() => cell(page, 'Ledger!B5')).toBe(await todaySerial(page))
  await expect(page.getByTestId('unreadable')).toHaveCount(1)
  await expect(page.getByTestId('badge')).toHaveText('1')
})

test('Settings links to the sheet in Google Sheets', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-settings').click()
  await expect(page.getByTestId('open-sheet')).toHaveText('Fitracker (demo)') // the sheet's name, before opening it
  await expect(page.getByTestId('open-sheet')).toHaveAttribute('href', /^https:\/\/docs\.google\.com\/spreadsheets\/d\/fake-sheet\/edit#gid=\d+/)
})
