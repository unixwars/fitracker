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
"Loading...". Pass: under 10 seconds. Expected cost: each summary tab runs one `FILTER` over the ledger (with a
`MATCH` against the ticked names) into its helper columns, then about 60 (`Monthly Summary`) or 560
(`Annual Summary`) plain `SUMIFS` over that period's rows only; `Balances` runs about 8 full-column `SUMIFS` per
account row and per month-end cell (40 + 480 cells). If `Balances` is the slow one, that is the known cost.

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
- [ ] 4. The account ticks change the `Monthly Summary` total. Select year 2026 and month 11 and check "Actual
  expenses (total)", the `Cat 1` "Spent" cell and the "Accounts included" line in each case (`In Monthly` column):
  - both accounts ticked: `21.70`, `21.70`, "Accounts included: 2 of 2";
  - only `Account A (EUR)` ticked: `10.00`, `10.00`, "1 of 2";
  - only `Account B (GBP)` ticked: `11.70`, `11.70`, "1 of 2";
  - none ticked: `0.00`, `0.00`, "0 of 2", and no `#N/A` or other error anywhere on the tab (cell `A7` is empty).

  Repeat the "both" and "none" cases with the `In Annual` column on `Annual Summary` (year 2026): Expenses
  `21.70` and `0.00`. Tick everything again afterwards.
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
   September 2026, so `J4` must show an error (`#N/A`). The summary helper columns turn an error `J` into 0
   (`IFERROR`), so `Annual Summary` (year 2026) still shows numbers (expenses `21.70`, September `0.00`, not an
   error) and "Unresolved ledger rows" shows `1` on every view. `Balances` "Outflows (base)" of
   `Account B (GBP)` (year 2026) still shows `11.70`, not an error (that `SUMIFS` skips error rows with the
   criterion `J < 1E+300`). Change `B4` to `2026-10-15`: `J4` shows `5.80` (5 x 1.16), the count goes back to
   `0`, and the Annual expenses become `27.50`.
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
- Summaries count ledger rows whose `J` is an error (unknown account, missing rate, text date or amount) as 0
  and show the count of such rows ("Unresolved ledger rows"). The entry views show such rows with an empty
  `base_amount`.
- The summary helper columns (`Z:AD`) need one sheet row per ticked ledger row of the period: `Monthly Summary`
  keeps 5000 rows, `Annual Summary` 20000. If a period has more, the helper shows an error asking for more rows
  and cell `A7` (Monthly) or `A6` (Annual) says the totals are incomplete; insert rows at the bottom of the tab.
- `Accounts` is trimmed to 40 data rows (empty rows only); insert rows to add more accounts (formulas follow
  automatically).
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
- "Accounts included n" counts an account name listed twice in `Accounts` twice, while the totals count it once.

## Decisions made while writing this script

- "Total" in the Monthly Summary is read as total actual expenses (Regular + Business), shown next to Planned
  and Remaining.
- Savings rate = (income - expenses) / income, blank when income is 0.
- "Accounts included: n of m": n = accounts ticked for that view, m = all named accounts (active or not).
- Error rows in the summaries: the helper columns hold `IFERROR(J, 0)`, so an unresolved row adds 0 and is
  counted separately. In `Balances`, the single-criterion `SUMIFS` on `J` (inflows, outflows, transfers into a
  base-currency account) skip error rows with the criterion `J < 1E+300`, assumed to never match an error
  (verified by self-check probe 1); the month-end "Net worth" row sums with `SUMIF(..., "<1E+300")`.
- Ledger `J` returns `""` only for a truly empty row (no date, type, amount or account). Any other row that
  cannot be resolved (no or unknown account, no `Rates` row, a blank rate cell, a date or amount that is not a
  number) shows an error and counts as unresolved, instead of silently converting to 0 or "".
- The rate lookup is `VLOOKUP(date, Rates, n, TRUE)`: `Rates` rows are first-of-month dates in ascending order,
  so this returns the entry month's row without `EOMONTH`.
- No multi-cell criteria in `SUMIFS`/`COUNTIFS`. In the live Sheet, `SUMPRODUCT(SUMIFS(..., account column,
  <range of ticked names>, ...))` returned the right total with ONE ticked account but `0.00` with TWO (while
  "Accounts included" said "2 of 2"): Google Sheets does not broadcast a multi-cell criteria range there the way
  Excel does. The template deliberately avoids that shape everywhere.
- Ticked accounts: `Monthly Summary` and `Annual Summary` each compute their ticked rows ONCE in helper columns:
  `Z` lists the ticked account names (`FILTER` of `Accounts`, or `#none#` when none is ticked, which matches no
  row); `AA:AD` hold date, type, category and `IFERROR(base_amount, 0)` of the ledger rows of the selected period
  whose account is in that list (`FILTER(..., ISNUMBER(MATCH(account, names, 0)))`). Every summary cell is then
  a plain `SUMIFS` with single-cell criteria over these helper rows, which is also far cheaper than an array
  `SUMPRODUCT` per cell over the whole ledger. An account name listed twice in `Accounts` counts once (the
  ledger row's account is matched against the list; it is not summed per `Accounts` row).
- Scan for other multi-cell criteria or lookup values: none left. `Balances` uses single-cell criteria (the
  account in its row, a snapshot date, today or a month-end); array lookups (`VLOOKUP` of a column, `MATCH`,
  `ISERROR` of a column) appear only inside `ARRAYFORMULA`, `FILTER` or `SUMPRODUCT`, where they vectorise
  (`J2`, the entry-view currency columns, the transfer-in conversion, the unresolved count, the helper rows).
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

Loads your history (the converter's CSV files) into YOUR OWN COPY of the template. Never import into the public
master. The CSVs and `report.md` hold private financial data: do not email them, do not commit them, and delete
the downloaded copies after a successful import (step 10).

An import is always a FULL REPLACE, never an append. Write down the freeze date of the export. Anything typed in
the old yearly sheets after that date is not in the CSVs: re-export, re-run the converter, then repeat this whole
runbook from step 1 on a fresh copy of the template.

You need: `ledger.csv`, `sheet_accounts.csv`, `categories.csv`, `budgets.csv`, `snapshots.csv`, `rates.csv` and
`report.md` (all from the converter's `out` folder).

### A. Prepare the copy

1. Open the public template and choose File > Make a copy. Open your copy. It must have no data: `Accounts`,
   `Categories`, `Budgets`, `Ledger`, `Snapshots` and `Rates` hold only their header row (and `J2` in `Ledger`).
2. File > Settings > Locale: United Kingdom or United States, then Save settings. (Decimals, dates and formula
   separators depend on it.)
3. On `Settings`, check `B1` is `EUR`. If not, choose `EUR` from its list.

### B. Import the six files

Same method for every file. First open the tab and click the destination cell, then:

- File > Import > Upload > Browse (choose the file).
- Import location: **Replace data at selected cell**.
- **Convert text to numbers, dates and formulas**: ON. (Dates, numbers and TRUE/FALSE ticks then arrive typed.)
- Import data. Do NOT choose "Replace spreadsheet" or "Append".

Each CSV starts with a header row, so always select cell **A1** (not A2): the CSV header replaces the template's
header row. For `Accounts`, `Categories`, `Snapshots`, `Rates` and `Ledger` (A:I) the headers are identical (the
`Accounts` and `Rates` headers differ only in capitals), so nothing visible changes.

Order matters (`Ledger` rejects accounts and categories it does not know yet):

4. Tab `Accounts`, select `A1`, import `sheet_accounts.csv`. Columns: name, currency, active, in_monthly,
   in_annual. Pass: the `active`, `In Monthly` and `In Annual` columns show ticked checkboxes (TRUE) or empty
   boxes (FALSE), not the words TRUE/FALSE.
5. Tab `Categories`, `A1`, import `categories.csv` (name, type, active). Same tick check.
6. Tab `Budgets`, `A1`, import `budgets.csv` (year, type, category, monthly). The header in `D1` becomes
   `monthly`; retype it as `monthly amount` if you like (nothing reads it).
7. Tab `Rates`, `A1`, import `rates.csv` (month, gbp, usd). Then fix the LAST row: it is the current month and
   holds a partial-month average. Keep its month, and type in the two rate cells:
   `=GOOGLEFINANCE("CURRENCY:GBPEUR")` and `=GOOGLEFINANCE("CURRENCY:USDEUR")`. That row stays live and must be
   pasted as values (Edit > Paste special > Values only) at month end (the app will do this later). Past months
   are frozen Bank of England monthly averages. Pass: the month column is right-aligned (real dates).
8. Tab `Ledger`, `A1`, import `ledger.csv`. Its nine columns (id, date, type, amount, place, description,
   category, account, to_account) fill A:I; column J (`base_amount`) is not in the CSV and is left alone.
   Then check `J2` still holds the formula (click it: the formula bar shows `=ARRAYFORMULA(...)`) and that
   `J3` holds no formula. If `J2` is empty or `J3` has its own formula, restore it: clear `J2:J`, then copy the
   `J2` formula from a fresh copy of the template and paste it into `J2` only.
9. Tab `Snapshots`, `A1`, import `snapshots.csv` (id, date, account, balance, note).

Import errors such as "Input must be ..." mean a list or date check rejected a value: stop and tell the person
who ran the converter; do not clean cells by hand.

### C. Post-import checks

0. **Formats below row 1000.** The template formats and validates the first 1000 rows of `Ledger` and `Snapshots`; an import can add rows below that with no format, so a date shows as a number such as `46340`. Fix it once: in `Ledger`, copy `B2:J2`, select `B3:J` down to the last row, Edit > Paste special > **Format only**, then again > **Data validation only**. Do the same for `Snapshots` (`A2:E2` to `A3:E`). The app copies the last row's format and validation itself when it has to add rows.

In an empty cell (for example `Settings!D1`) type each formula, read the result, then delete the cell.

| Check | Type | Pass |
|---|---|---|
| Ledger rows | `=COUNTA(Ledger!A2:A)` | equals the ledger row count in `report.md` |
| Other tabs | `=COUNTA(Accounts!A2:A)`, same for `Categories`, `Budgets`, `Snapshots`, `Rates` | each equals the count in the converter's report/output |
| Dates are real dates | `=COUNTA(Ledger!B2:B)-COUNT(Ledger!B2:B)` | 0 |
| Amounts are numbers | `=COUNTA(Ledger!D2:D)-COUNT(Ledger!D2:D)` | 0 |
| Unresolved rows | `Balances!B4` | 0 |
| No errors in J | `=COUNTIF(Ledger!J2:J,"#N/A")` | 0 |
| Sample rows | pick three rows you know well in `Ledger`; compare date, amount, category, account with the old sheet | identical, and `J` is filled |

If the unresolved count is above 0, filter `Ledger` on `J` for `#N/A`: the usual causes are an account name missing
in `Accounts`, a date before the first `Rates` month, or a text date or amount. Report it; do not patch it by hand.

### D. Compare with the old sheets

For each imported year, set the year on `Monthly Summary` and `Annual Summary` and compare with the old Monthly and
Annual Summary of that year:

- `Monthly Summary`: the category totals for several months.
- `Annual Summary`: income, expenses and savings rate.
- Tolerance (from `report.md`): 2% or 10 EUR per category and year, whichever is larger.
- The report lists the categories it expects to differ and why. Typical reasons: the old sheets used one
  export-day exchange rate for foreign currency, and the old summaries omitted some rows. A difference outside
  tolerance in a category the report does not list is a failure.
- `Balances`: compare each account with the report's model-fit table. Large differences on investment and bank
  accounts are expected: the ledger holds only the movements you recorded, not market gains, interest or fees.
  The answer is to enter a snapshot (real balance) for each account regularly.

### E. Finish

10. Delete the downloaded CSVs and `report.md` from your computer (and Downloads, and the trash).
11. Optionally add the charts and delete the script as described above (Run steps).

The converter's CSVs contain no field starting with `=`, `+`, `-` or `@` (which "Convert text ..." could turn into
formulas); the converter's README warns about this. If the data changes, re-check before importing.

### Pass / fail

| Item | Pass | Fail: action |
|---|---|---|
| Locale, `Settings!B1` | UK or US, `EUR` | fix before importing |
| Row counts per tab | equal the report | redo from step 1 on a fresh copy |
| Non-numeric `B` or `D` in `Ledger` | 0 | redo with "Convert text..." ON |
| `Balances!B4` | 0 | find the `#N/A` rows (see C), report |
| `J2` formula | present, only in `J2` | restore (step 8) |
| Summaries vs old | within tolerance, or listed in the report | report to the converter's owner |
| `Balances` vs model fit | near, or explained above | enter snapshots |
| CSVs deleted | yes | delete now |
