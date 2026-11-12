# Fitracker v2 template

`build-template.gs` builds the Fitracker v2 spreadsheet (spec:
`docs/designs/specs/2026-11-12-fitracker-ledger-v2-design.md`, rev 2, section 3) inside a new Google Sheet.
Everything here uses synthetic examples only (`Account A (EUR)`, `Cat 1`, ...).

## Run steps

1. Create a new empty Google Sheet (sheets.new). Set File > Settings > Locale to United Kingdom or United States.
2. Open Extensions > Apps Script. Delete the sample `myFunction` code.
3. Paste the whole of `template/build-template.gs` into the editor and press Save (the runtime is V8, the default).
4. In the function list at the top choose `buildTemplate` and press Run.
5. Authorize when asked (Review permissions, choose your account, Allow). The script only touches this one
   spreadsheet (`@OnlyCurrentDoc`).
6. Wait for "Execution completed" and the toast "Template built" in the sheet.
7. Go through the checklist below. `showSchemaVersion` (item 7) needs the script, so do the checklist first.
8. Then DELETE the bound script: at script.google.com > My Projects, open the three-dot menu of the project
   bound to this sheet and choose Remove. If Remove is not offered, delete all the code in the editor and save.
   The finished template must not keep a script.

Running `buildTemplate` again is safe: existing tabs are reused, data rows are never cleared, headers,
formulas, validation and protections are rewritten, and the view tabs are rebuilt keeping their selector values.

`addCharts` is a separate function, run later after the data gate (spec 8, gate 4): paste the script again,
run `addCharts`, then delete the script again. `addCharts` first removes ALL charts on `Monthly Summary`,
`Annual Summary` and `Balances`, including charts you made yourself, then adds the template charts.

Speed: spikes S3/S4 must time THIS template (not only the spike formulas) on a ledger of about 10,000 rows:
edit one `Ledger` amount and time until `Monthly Summary`, `Annual Summary` and `Balances` stop showing
"Loading...". Pass: under 10 seconds.

## Checklist

Synthetic test data for the checklist (type it, then delete it before any import):

Note: a new `Accounts` row starts with its `active`, `In Monthly` and `In Annual` boxes unticked (a checkbox
cannot default to ticked). Tick them by hand, here and for every real account.

- `Accounts` row 2: `Account A (EUR)` | `EUR` | ticked | ticked | ticked
- `Accounts` row 3: `Account B (GBP)` | `GBP` | ticked | ticked | ticked
- `Categories` row 2: `Cat 1` | `expense` | ticked; row 3: `Cat 2` | `income` | ticked
- `Rates` row 2: `2026-10-01` | `1.16` | `0.93`; row 3: `2026-11-01` | `1.17` | `0.94` (type the dates;
  they must right-align)
- `Ledger` row 2: `t1` | `2026-11-05` | `expense` | `10` | `Shop X` | `Test` | `Cat 1` | `Account A (EUR)`
- `Ledger` row 3: `t2` | `2026-11-06` | `expense` | `10` | `Shop X` | `Test` | `Cat 1` | `Account B (GBP)`

Tick each item:

- [ ] 1. All 13 tabs exist in this order: `Ledger`, `Snapshots`, `Settings`, `Accounts`, `Categories`, `Budgets`,
  `Rates`, `Expenses`, `Income`, `Transfers`, `Monthly Summary`, `Annual Summary`, `Balances`; `Sheet1` is gone;
  column A of `Ledger` and `Snapshots` is hidden; `Settings!B1` is `EUR` and offers only `EUR`, `GBP`, `USD`.
- [ ] 2. `J2` converts a typed row: `Ledger!J2` shows `10` and `J3` shows `11.70` (10 x 1.17). `J2` is the only
  formula in column J (click `J3`: the formula bar shows no formula).
- [ ] 3. Changing a currency in `Accounts` changes the result: set `Account A (EUR)` currency to `GBP`; `J2`
  becomes `11.70`. Set it back to `EUR`; `J2` is `10` again.
- [ ] 4. The account ticks change the `Monthly Summary` total: with year 2026 and month 11 selected, "Actual
  expenses (total)" is `21.70` and "Accounts included: 2 of 2". Untick `In Monthly` of `Account B (GBP)`: the
  total becomes `10` and the line says "1 of 2". Tick it again.
- [ ] 5. Editing a view tab shows a warning: type anything in `Expenses!C10` (and in a cell of `Monthly Summary`
  and `Balances`); Sheets shows "You are trying to edit a protected cell or object" with a warning you can
  cancel. Press Cancel. The yellow selector cells (year, month) edit without a warning. Typing in `Ledger!J5`
  also shows the warning.
- [ ] 6. A text date or amount in `Ledger` is rejected: in `Ledger!B4` type `next tuesday`, then in `Ledger!D4`
  type `ten`, then `-5`; each is refused with "Input must be ...". A type other than `expense`, `income`,
  `transfer` in `C4` is refused too.
- [ ] 7. The version metadata is present: in the Apps Script editor choose `showSchemaVersion` and Run. The
  toast in the sheet (and View > Logs / Execution log) shows `fitracker.schemaVersion = 3 (DOCUMENT)`.
  (Data > Named ranges does not show developer metadata; do not look there.)
- [ ] 8. The views show the test rows: `Expenses` (year 2026) lists both rows with currencies `EUR` and `GBP`
  and `base_amount` `10` and `11.70` (not blank: a blank there means `QUERY` typed the column as text because
  of the empty `J` cells; report it); `Balances` lists both accounts with "none" as snapshot date and balances
  `-10` and `-10` (base `-10` and `-11.70`).
- [ ] 9. A row without an account shows an error: in `Ledger` row 4 type
  `t0 | 2026-11-09 | expense | 3 | | Test | Cat 1` and leave `account` empty. `J4` shows an error (`#N/A`) and
  "Unresolved ledger rows (all dates)" on `Monthly Summary` shows `1`. Then clear `Ledger` A4:I4: `J4` is
  empty and the count is `0` again.

Keep the test data for the self-check below. When done, clear all test rows (`Ledger` A2:I, `Snapshots` A2:E,
and the test rows of `Accounts`, `Categories` and `Rates`) and delete the script (run step 8).

## Self-check you can run

Three quick probes of the riskiest formulas (do them with the checklist test data still in place):

1. One bad row does not break the summaries. In `Ledger` row 4 type
   `t3 | 2026-09-15 | expense | 5 | | Test | Cat 1 | Account B (GBP)`. There is no `Rates` row on or before
   September 2026, so `J4` must show an error (`#N/A`). `Annual Summary` (year 2026) still shows numbers
   (expenses `21.70`, not an error) and "Unresolved ledger rows" shows `1` on every view. Change `B4` to
   `2026-10-15`: `J4` shows `5.80` (5 x 1.16) and the count goes back to `0`.
2. Last snapshot wins on a tie. In `Snapshots` type two rows for `Account A (EUR)` with the same date
   `2026-11-01`: balance `100` then `200` (row below). `Balances` shows `200` as the snapshot balance, age = days
   since 2026-11-01, effect since `-10`, balance `190`.
3. Transfer into another currency. Add `Ledger` row: `t4 | 2026-11-08 | transfer | 23.40 | | Move | | Account A (EUR) | Account B (GBP)`.
   `J` shows `23.40` (EUR). In `Balances`, `Account A (EUR)` drops by `23.40` and `Account B (GBP)` rises by
   `20` (23.40 / 1.17); its base balance rises by `23.40`. The month-end matrix (November 2026) moves the same way.

If any probe fails, note the cell and the error text; do not patch formulas by hand in the real sheet, fix
the script instead.

## Known simplifications

- Per-category, per-account and month-end tables have fixed sizes: 30 active expense categories, 15 active
  income categories, 40 accounts. A warning cell appears when a list is longer. Raise the `MAX_*` constants at
  the top of the script and run it again if needed.
- Per-category tables list active categories only. Spending or income in inactive categories is shown in the
  "Other or inactive categories" row, so totals stay complete.
- Summaries skip ledger rows whose `J` is an error (unknown account, missing rate, text date or amount) and show
  the count of such rows ("Unresolved ledger rows"). The entry views show such rows with an empty `base_amount`.
- `Accounts` is trimmed to 40 data rows to keep the ticked sums fast; insert rows to add more accounts (formulas
  follow automatically).
- New `Accounts` rows get unticked checkboxes: tick `In Monthly` and `In Annual` by hand (spec says default on;
  a checkbox cannot default to ticked for rows not yet typed).
- "Planned expenses" is the sum of the year's monthly budgets of active expense categories. Budgets are not
  shown on the Annual Summary.
- `Balances` per-account table: latest snapshot on or before today (end of day), entries after it up to today.
  Future-dated entries are not counted. Account balance in base uses the current month's `Rates` row.
- The month-end matrix covers the 12 month-ends of the year selected in `Balances!B3`, for all accounts
  (active or not), converted to base with each month's `Rates` row; months that have not started are blank.
  Inflows and outflows use `base_amount` (entry month rate) for the same year.
- Data validation covers the rows that exist when the script runs (1000 on a new sheet). Rows added later by the
  app (`INSERT_ROWS`) inherit it; after a large paste below the last row, run `buildTemplate` again.
- Category names and account names used as `SUMIFS` criteria must not start with `<`, `>` or `=` and should not
  contain `*` or `?` (wildcards).
- Only `EUR`, `GBP`, `USD` are supported, with `EUR` as base. A base currency other than `EUR` is out of scope.

## Decisions made while writing this script

- "Total" in the Monthly Summary is read as total actual expenses (Regular + Business), shown next to Planned
  and Remaining.
- Savings rate = (income - expenses) / income, blank when income is 0.
- "Accounts included: n of m": n = accounts ticked for that view, m = all named accounts (active or not).
- Error rows are skipped in `SUMIFS` with the criterion `J < 1E+300`, on the assumption that an error never
  matches a numeric criterion (to be verified by self-check probe 1), instead of a helper column, because
  `Ledger` columns are fixed. The month-end "Net worth" row sums with `SUMIF(..., "<1E+300")` for the same reason.
- Ledger `J` returns `""` only for a truly empty row (no date, type, amount or account). Any other row that
  cannot be resolved (no or unknown account, no `Rates` row, a blank rate cell, a date or amount that is not a
  number) shows an error and counts as unresolved, instead of silently converting to 0 or "".
- The rate lookup is `VLOOKUP(date, Rates, n, TRUE)`: `Rates` rows are first-of-month dates in ascending order,
  so this returns the entry month's row without `EOMONTH`.
- Ticked accounts: `Monthly Summary` and `Annual Summary` each hold ONE spilled `FILTER` of the ticked account
  names in column `Z` ("Accounts counted (helper)"); every summary cell passes only that list (sized exactly with
  `INDEX`) to `SUMIFS`, so it runs one `SUMIFS` per ticked account and the `FILTER` runs once per tab. With no
  account ticked the list is `#none#`, which matches no ledger row.
- Transfers into a non-base account: `FILTER` first keeps only that account's transfer rows in the period, and
  the `Rates` lookup runs on those rows only (not on the whole ledger). Error rows count as 0 there.
- `Settings!B1` has a list validation (`EUR`, `GBP`, `USD`); only `EUR` is supported as base.
- An empty default sheet is deleted; a non-template sheet with content is kept and a toast says so.
- Lists in `Ledger` (type, category, account, to_account), `Snapshots`, `Budgets` and `Accounts` currency reject
  invalid input, like dates and amounts. Import `Accounts` and `Categories` before `Ledger`.
- `Snapshots` balance accepts any number (balances can be negative). `Budgets` amount must be 0 or more.
- The "last row wins" snapshot rule uses `CHOOSEROWS(FILTER(...), -1)`.
- A transfer into a non-base account is converted as `base_amount / destination rate of the entry month`, which
  equals "source amount converted into the destination currency with that month's Rates rows" (spec 3.5).
- View selectors (year, month) are typed values, default the current year and month, left editable without a
  warning; the rest of each view tab is warning-only protected.
- Re-running rebuilds view tabs completely (they hold formulas only) but keeps typed selector values.
- The default first sheet is removed when it is empty and not a template tab, whatever its localized name.
- Helper functions inside a tab's section (`annualCategoryBlock`, `balancesCurrent`, `balancesMatrix`,
  `balancesFlows`) are part of that tab's make function, to keep each function short.

## Import

Written in Task 14.
