# Ledger v2 spike runbook (S1 to S4)

Spec: `docs/designs/specs/2026-11-12-fitracker-ledger-v2-design.md` (rev 2), sections 3.2, 3.4, 3.5, 3.6 and 8.

Run these by hand in a **scratch Google Sheet** (never your real one). All data below is synthetic. Each spike ends in a `**Result:**` line: fill in PASS or FAIL and a short note. S2 and S4 results feed Task 13 (the template build). A failed spike returns to the spec.

Common setup (used by S1 to S3):

1. Create a new spreadsheet, name it `Ledger v2 spikes (scratch)`. Note its ID (the long string in the URL between `/d/` and `/edit`).
2. Rename the first tab `Ledger`. Add tabs `Accounts` and `Rates`.
3. `Accounts`, row 1: `name | currency | active | In Monthly`. Rows 2 to 4:
   - `Account A (EUR)` | `EUR` | TRUE | TRUE
   - `Account B (GBP)` | `GBP` | TRUE | TRUE
   - `Account C (USD)` | `USD` | TRUE | FALSE

   Format `C2:D4` as checkboxes (Insert > Checkbox).
4. `Rates`, row 1: `month | GBP | USD`. Rows 2 to 4 (type the month as a real date, format Plain text off):
   - `2026-09-01` | `1.15` | `0.92`
   - `2026-10-01` | `1.16` | `0.93`
   - `2026-11-01` | `1.17` | `0.94`
5. `Ledger`, row 1: `id | date | type | amount | place | description | category | account | to-account | base amount`.
6. In `Ledger!J2` enter this single array formula (do not fill down):

```
=ARRAYFORMULA(IF(H2:H="","",D2:D*IF(VLOOKUP(H2:H,Accounts!A2:B,2,FALSE)="EUR",1,IF(VLOOKUP(H2:H,Accounts!A2:B,2,FALSE)="GBP",VLOOKUP(EOMONTH(B2:B,-1)+1,Rates!A2:C,2,TRUE),VLOOKUP(EOMONTH(B2:B,-1)+1,Rates!A2:C,3,TRUE)))))
```

Using the API Explorer (S1 and S2): open <https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append>, click "Try it" (right-hand panel), switch on "Google OAuth 2.0" with the Sheets scope `https://www.googleapis.com/auth/spreadsheets`, and authorise with your Google account. Paste your spreadsheet ID into `spreadsheetId`.

---

## S1: append with INSERT_ROWS

**Question.** Does `values.append` on `Ledger!A:I` with `INSERT_ROWS` land new rows after the last non-empty row (past a cleared gap and a hand-typed row), without overwriting anything or breaking the `J` array formula, and does `updatedRange` identify each write, including for two simultaneous calls? (Spec 3.2, Writing.)

**Steps.**

1. Fill `Ledger` rows 2 to 21 (20 rows) with synthetic data. Column A is an id `r01` to `r20`; B a date in 2026-10 or 2026-11 (as real dates); C `expense`; D an amount such as `10` to `29`; E `Shop X`; F `Item n`; G `Food`; H alternate `Account A (EUR)` and `Account B (GBP)`; leave I empty.
2. Confirm `J2:J21` shows numbers (EUR rows equal D, GBP rows equal D times 1.16 or 1.17).
3. Select `A12:I12` and press Delete (clear only that row, leaving the row in place). `J12` should now be empty.
4. In row 22 type by hand: `hand1 | 2026-11-03 | expense | 5 | Shop Y | Typed | Food | Account A (EUR)`. Confirm `J22` computes.
5. API Explorer, `spreadsheets.values.append`, parameters:
   - `range`: `Ledger!A:I`
   - `valueInputOption`: `USER_ENTERED`
   - `insertDataOption`: `INSERT_ROWS`
   - `includeValuesInResponse`: leave unchecked
   - Request body:
```
{"values":[["api01","2026-11-05","expense",12.5,"Shop Z","Append one","Food","Account B (GBP)",""]]}
```
   Execute. Record the returned `updates.updatedRange` (expect `Ledger!A23:I23`).
6. **Three rows.** Same parameters, body:
```
{"values":[
 ["api02","2026-11-06","expense",1,"Shop Z","Batch a","Food","Account A (EUR)",""],
 ["api03","2026-11-06","income",2,"","Batch b","Salary","Account B (GBP)",""],
 ["api04","2026-11-07","transfer",3,"","Batch c","","Account A (EUR)","Account B (GBP)"]
]}
```
   Execute. Record `updatedRange` (expect `Ledger!A24:I26`).
7. **Two simultaneous calls.** Prepare two browser tabs of the same Explorer page, each with the same parameters. Tab 1 body: `{"values":[["tabA1","2026-11-08","expense",7,"Shop Z","Tab one","Food","Account A (EUR)",""]]}`. Tab 2 body: `{"values":[["tabB1","2026-11-08","expense",8,"Shop Z","Tab two","Food","Account A (EUR)",""]]}`. Click Execute in both tabs as close together as you can (repeat the pair 3 times with new ids `tabA2`/`tabB2`, `tabA3`/`tabB3`). Record every `updatedRange`.
8. Inspect the sheet.

**Pass.**
- Every API row sits after the last non-empty row (below `hand1`); the cleared row 12 stays empty and nothing above it moved.
- No existing cell was overwritten (compare rows 2 to 22 with what you typed).
- `J` still computes for every non-empty row, including the appended ones (check `J23` onward), and `J2` is still the only formula in column J.
- Each call's `updatedRange` points to the rows that hold its own data, and no two calls share a row. Note if either simultaneous call lost a row or overwrote the other.

**Result:** _(PASS / FAIL, the `updatedRange` values seen, any overwritten or missing rows)_

---

## S2: rates through the Sheets API

**Question.** Can the API read a live `GOOGLEFINANCE("CURRENCY:...")` cell and the `Ledger!J` array formula as numbers with `UNFORMATTED_VALUE`, and does a history formula work? (Spec 3.4.)

**Steps.**

1. In `Rates`, put in `E1` the label `current GBPEUR` and in `E2`:
```
=GOOGLEFINANCE("CURRENCY:GBPEUR")
```
   Wait until it shows a number (about 1.1 to 1.2).
2. In `Rates!E4` put the label `history` and in `E5`:
```
=GOOGLEFINANCE("CURRENCY:GBPEUR","price",DATE(2026,9,1),DATE(2026,10,1),"DAILY")
```
   Note whether it shows a table or an error (such as `#N/A`).
3. API Explorer for `spreadsheets.values.batchGet` (<https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet>). Parameters:
   - `spreadsheetId`: your ID
   - `ranges` (add the field three times): `Rates!E2`, `Rates!E5:F8`, `Ledger!J2:J`
   - `valueRenderOption`: `UNFORMATTED_VALUE`
   - `dateTimeRenderOption`: `SERIAL_NUMBER`
   - `majorDimension`: `ROWS`
4. Execute. Record the three `valueRanges`: the type of `Rates!E2` (a JSON number, not a string), the content of `Rates!E5:F8`, and whether `Ledger!J2:J` returns JSON numbers for rows with data (and `""` for the cleared row).
5. Wait a few minutes, execute again, and note whether `Rates!E2` is still a number.

**Pass.** `Rates!E2` and the non-empty `Ledger!J` values come back as JSON numbers (not strings and not error text). Record separately whether the history formula returned data or `#N/A`; either answer passes, but write it down (it decides whether `Rates` history must be loaded as values by the converter, which the spec already assumes).

**Result:** _(PASS / FAIL; E2 numeric yes/no; history formula: data or `#N/A`; J numeric yes/no)_

---

## S3: view speed on about 10,000 rows

**Question.** Do the `SUMPRODUCT(SUMIFS(...)*ticks)` summary and the `Balances` month-end matrix recalculate fast on a ten-thousand-row ledger? (Spec 3.5, 3.6.)

**Steps.**

1. Fill `Ledger` to about 10,000 rows. Preferred: paste the converted ledger from the converter (synthetic or your own, in this scratch sheet only) three times, one below the other. If you have none yet: copy `Ledger!A2:I22` (the S1 rows) and paste it repeatedly until the sheet has about 10,000 rows (rows 23 to 10,000 will do; ids may repeat, that is fine here). Make sure `J2` still holds the single array formula.
2. Add a `Snapshots` tab, row 1: `id | date | account | balance | note`. Add 15 rows of snapshots, one per account name below (synthetic): `2026-01-31`, balance `1000`. Extend `Accounts` rows 2 to 16 to 15 accounts named `Account 1 (EUR)` to `Account 15 (EUR)` plus keep the three from the setup; tick `In Monthly` TRUE for 12 of them and FALSE for the rest. Use column D of `Accounts` for the ticks. Make sure Ledger column H uses these names for the pasted data (replace names with Find and replace if needed).
3. Add a tab `Summary`. In `A2:A16` enter 15 category names (`Cat 1` to `Cat 15`; make sure Ledger column G uses some of them). In `B1:M1` enter 12 month starts (`2026-01-01` to `2026-12-01`, as dates). In `B2` enter and fill to `B2:M16`:
```
=SUMPRODUCT(SUMIFS(Ledger!$J:$J,Ledger!$G:$G,$A2,Ledger!$C:$C,"expense",Ledger!$B:$B,">="&B$1,Ledger!$B:$B,"<"&EDATE(B$1,1),Ledger!$H:$H,Accounts!$A$2:$A$19)*Accounts!$D$2:$D$19)
```
   (adjust `19` to your last `Accounts` row).
4. Add a tab `BalancesTest`. In `A2:A16` the 15 account names. In `B1:AK1` enter 36 month-end dates (`2024-01-31` through `2026-12-31`; type the first two, then drag, or use `=EOMONTH(B1,1)` from `C1`). In `B2` enter and fill to `B2:AK16`:
```
=LET(d,MAXIFS(Snapshots!$B:$B,Snapshots!$C:$C,$A2,Snapshots!$B:$B,"<="&B$1),
 base,SUMIFS(Snapshots!$D:$D,Snapshots!$C:$C,$A2,Snapshots!$B:$B,d),
 base
 +SUMIFS(Ledger!$D:$D,Ledger!$C:$C,"income",Ledger!$H:$H,$A2,Ledger!$B:$B,">"&d,Ledger!$B:$B,"<="&B$1)
 -SUMIFS(Ledger!$D:$D,Ledger!$C:$C,"expense",Ledger!$H:$H,$A2,Ledger!$B:$B,">"&d,Ledger!$B:$B,"<="&B$1)
 -SUMIFS(Ledger!$D:$D,Ledger!$C:$C,"transfer",Ledger!$H:$H,$A2,Ledger!$B:$B,">"&d,Ledger!$B:$B,"<="&B$1)
 +SUMIFS(Ledger!$D:$D,Ledger!$C:$C,"transfer",Ledger!$I:$I,$A2,Ledger!$B:$B,">"&d,Ledger!$B:$B,"<="&B$1))
```
   (This omits the destination currency conversion; the spike only measures speed, and the conversion adds a lookup per transfer at most.)
5. Time a full recalculation: File > Settings > Calculation, set "Recalculation" to "On change and every minute". Then edit one `Ledger` amount in a row near the top (change `D2` and press Enter) and start a stopwatch; stop when both `Summary` and `BalancesTest` stop showing "Loading..." or the cells show new values. Repeat three times. Alternatively reload the sheet and time until all cells are populated.

**Pass.** Full recalculation of `Summary` and `BalancesTest` takes **under 10 seconds** in all three timings, with no `#ERROR`, "Loading..." that persists, or `Formula parse` failures. Note any `LET` or `MAXIFS` problems.

**Result:** _(PASS / FAIL; three timings in seconds; row count used; any errors)_

---

## S4: Apps Script template build

**Question.** Does the Apps Script build (formulas, validation, protections) behave as the spec says? (Spec section 3 and gate 8.4.)

**Steps.** This spike waits for Task 13 (`template/build-template.gs`) and cannot be run yet.

1. Create a new empty spreadsheet. Open Extensions > Apps Script, paste in `template/build-template.gs`, save, and run the build function. Grant the permissions it asks for.
2. Go through the checklist that Task 13 adds at the top of that file, ticking each item by hand: tabs created, `Ledger` header and the single `J2` array formula, validation (dates, numbers), hidden id column, view tabs protected with a warning, `Settings`, `Accounts`, `Categories`, `Budgets`, `Rates` layout, and developer metadata schema version 3.
3. Record the failures with the item name.

**Pass.** Every item on the Task 13 checklist is ticked.

**Result:** _(PASS / FAIL; list of failed checklist items; pending until Task 13)_
