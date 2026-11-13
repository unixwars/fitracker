# The sheet template

**BLUF:** Fitracker's data lives in a Google Sheet. Make your own copy of the public template, fill in
your accounts and categories, and start entering rows. Everything below uses placeholder data only.

Get it: <https://docs.google.com/spreadsheets/d/1ISaC0GTqkYlwsnrUd9IU2wrFjmWYx-jUfcqgaTLp8yY/copy>

## Start in three steps

1. Open the link above (sign in to Google if asked).
2. Click **Make a copy**. The copy is yours; the template stays untouched.
3. Once the app exists, link your copy in Settings (one Picker consent, once).

## Tabs

| Tab | Purpose | Written by |
| --- | --- | --- |
| `Ledger` | Every expense, income and transfer, all years | you or the app |
| `Snapshots` | Account balances on a date | you or the app |
| `Rates` | Monthly GBP and USD rates into the base currency | you, the app, formulas |
| `Settings` | Base currency (default EUR) | you |
| `Accounts` | Account names, currencies, ticks | you |
| `Categories` | Expense and income categories | you |
| `Budgets` | Monthly budget per category and year | you |
| `Expenses`, `Income`, `Transfers` | Filtered views of `Ledger` by year | formulas |
| `Monthly Summary`, `Annual Summary` | Budget vs actual, totals, savings rate, charts | formulas |
| `Balances` | Balance per account, net worth over time | formulas |

Never type in the formula tabs; they warn you if you try.

## Entering data by hand in `Ledger`

Columns: `id` (hidden, leave empty; the app fills it), `date`, `type` (`expense`, `income`, `transfer`),
`amount`, `place`, `description`, `category`, `account`, `to_account`, `base amount` (formula, never type).

- Amounts are always positive and in the **account's own currency**.
- A refund is income, not a negative expense.
- A transfer uses `account` as the source and `to_account` as the destination; no category.
- Dates must be real dates, amounts real numbers (validation rejects text).

## Accounts

- Tick `active`, `In Monthly` and `In Annual` for each account (new rows start unticked).
- `In Monthly` and `In Annual` decide which accounts count in the two summaries.
- Each account has one currency (EUR, GBP or USD). Set it once; changing it reinterprets its history.
- List each account name once.

## Snapshots

A snapshot is an end-of-day balance; it resets the baseline for that account. Small drift between your
snapshot and the computed balance is normal (it is only flagged at 10 in base currency or more).

## Rates

- One row per month, first day of the month; each value is one unit of GBP or USD in the base currency.
- The current month is a live `GOOGLEFINANCE` row.
- At month end paste that row as values and add next month's row with the formula, until the app does it.

## Migrating older yearly sheets

Not needed for new users. The old one-sheet-per-year files are converted by a Python tool on the orphan
branch `legacy-ingest`. The import runbook is in `template/README.md`.
