# Ledger v2 spike runbook (S1 to S5)

Spec: `docs/designs/specs/2026-11-12-fitracker-ledger-v2-design.md` (rev 2), sections 3.2, 3.4, 3.5, 3.6 and 8.

Run these by hand in a **scratch Google Sheet** (never your real one). All data below is synthetic. Each spike ends in a `**Result:**` line: fill in PASS or FAIL and a short note. S2 and S4 results feed Task 13 (the template build). A failed spike returns to the spec.

Common setup (used by S1 to S3):

1. Create a new spreadsheet, name it `Ledger v2 spikes (scratch)`. Note its ID (the long string in the URL between `/d/` and `/edit`).
2. Set File > Settings > Locale to United Kingdom or United States, so that decimals such as `1.15` and the `,` argument separator in formulas behave as written here.
3. Rename the first tab `Ledger`. Add tabs `Accounts` and `Rates`.
4. `Accounts`, row 1: `name | currency | active | In Monthly`. Rows 2 to 4:
   - `Account A (EUR)` | `EUR` | TRUE | TRUE
   - `Account B (GBP)` | `GBP` | TRUE | TRUE
   - `Account C (USD)` | `USD` | TRUE | FALSE

   Format `C2:D4` as checkboxes (Insert > Checkbox).
5. `Rates`, row 1: `month | GBP | USD`. Rows 2 to 4:
   - `2026-09-01` | `1.15` | `0.92`
   - `2026-10-01` | `1.16` | `0.93`
   - `2026-11-01` | `1.17` | `0.94`

   Type each date; it should right-align (a real date), not left-align (text). Row 4 is the current month's row; S2 replaces its rates with live formulas.
6. `Ledger`, row 1: `id | date | type | amount | place | description | category | account | to-account | base amount`.
7. In `Ledger!J2` enter this single array formula (do not fill down):

```
=ARRAYFORMULA(IF(H2:H="","",D2:D*IF(VLOOKUP(H2:H,Accounts!A2:B,2,FALSE)="EUR",1,IF(VLOOKUP(H2:H,Accounts!A2:B,2,FALSE)="GBP",VLOOKUP(EOMONTH(B2:B,-1)+1,Rates!A2:C,2,TRUE),VLOOKUP(EOMONTH(B2:B,-1)+1,Rates!A2:C,3,TRUE)))))
```

This `J2` is a simplification of spec 3.2: it hardcodes `EUR` and `GBP` and picks the `Rates` column by position, where the real template reads the base currency from `Settings` and the column by currency. It is enough to test appends and API reads.

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

   The app will write dates as serial numbers (spec 3.2), so this call, with a text date under `USER_ENTERED`, is only a convenience check. Run a second single-row append with a serial instead (46331 is 2026-11-05), then format column `B` of that row as a date to read it:
```
{"values":[["api01s",46331,"expense",4,"Shop Z","Serial date","Food","Account A (EUR)",""]]}
```
   Check that `J` computes for it too and record its `updatedRange` (expect `Ledger!A24:I24`). The later steps then land one row lower than the numbers below.
6. **Three rows.** Same parameters, body:
```
{"values":[
 ["api02","2026-11-06","expense",1,"Shop Z","Batch a","Food","Account A (EUR)",""],
 ["api03","2026-11-06","income",2,"","Batch b","Salary","Account B (GBP)",""],
 ["api04","2026-11-07","transfer",3,"","Batch c","","Account A (EUR)","Account B (GBP)"]
]}
```
   Execute. Record `updatedRange` (expect the three rows right after the previous append).
7. **Two simultaneous calls.** Prepare two browser tabs of the same Explorer page, each with the same parameters. Tab 1 body: `{"values":[["tabA1","2026-11-08","expense",7,"Shop Z","Tab one","Food","Account A (EUR)",""]]}`. Tab 2 body: `{"values":[["tabB1","2026-11-08","expense",8,"Shop Z","Tab two","Food","Account A (EUR)",""]]}`. Click Execute in both tabs as close together as you can (repeat the pair 3 times with new ids). Hand-clicked calls rarely overlap, so a PASS here is weak evidence. For a stronger test, open the browser console (F12) on the Explorer page and run two `fetch` POSTs at once with `Promise.all([...])` to `https://sheets.googleapis.com/v4/spreadsheets/ID/values/Ledger!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, with header `Authorization: Bearer TOKEN` (the access token shown in the Explorer's request preview) and the JSON bodies above; if that is awkward, accept the weak result and note it. Record every `updatedRange`.
8. Inspect the sheet.

**Pass.**
- Every API row sits after the last non-empty row (below `hand1`); the cleared row 12 stays empty and nothing above it moved.
- No existing cell was overwritten (compare rows 2 to 22 with what you typed).
- `J` still computes for every non-empty row, including the appended ones (check `J23` onward), and `J2` is still the only formula in column J.
- Each call's `updatedRange` points to the rows that hold its own data, and no two calls share a row. Note if either simultaneous call lost a row or overwrote the other.

**Result:** _(PASS / FAIL, the `updatedRange` values seen, any overwritten or missing rows)_

---

## S2: rates through the Sheets API

**Question.** Can the API read the current-month `Rates` row with live `GOOGLEFINANCE("CURRENCY:...")` formulas and the `Ledger!J` array formula as numbers with `UNFORMATTED_VALUE`, does a history formula work, and does `J` resolve entries in older months from loaded history rows? (Spec 3.4 and gate 2, S2.)

**Steps.**

1. In `Rates`, replace the current month's row (row 4) rates: `B4`:
```
=GOOGLEFINANCE("CURRENCY:GBPEUR")
```
   and `C4`:
```
=GOOGLEFINANCE("CURRENCY:USDEUR")
```
   Wait about a minute for the sheet to finish loading until both show a number (about 1.1 to 1.2 for GBP and 0.8 to 1.0 for USD).
2. In `Rates!E1` put the label `history` and in `E2`:
```
=GOOGLEFINANCE("CURRENCY:GBPEUR","price",DATE(2026,9,1),DATE(2026,10,1),"DAILY")
```
   Wait about a minute for the sheet to finish loading before reading, and note whether it shows a table or an error such as `#N/A`.
3. **History rows.** Spec gate 2 also needs history loaded into `Rates`. Do not insert rows above row 2 (that would shift the range in the `J2` formula). Instead select `Rates!A2:C4`, cut it (Ctrl+X) and paste it at `A38` (Ctrl+V), so the three original rows now sit in rows 38 to 40 and any references to them move along; the `J2` range `Rates!A2:C` is larger than the moved block, so it keeps pointing at row 2. Then fill rows 2 to 37 with 36 history months, `2023-09-01` to `2026-08-01` (they end right before the row-38 month): type `2023-09-01` in `A2`, `=EDATE(A2,1)` in `A3` and fill down to `A37`, then select `A2:A37`, copy and Edit > Paste special > Values only over itself. Use obviously synthetic values: `GBP` = `2` and `USD` = `3` on every one of `B2:C37`. Then add a `Ledger` row dated `2024-03-15` for `Account B (GBP)` with amount `10` and another for `Account C (USD)` with amount `10`; check that `J` shows `20` and `30`. If `J` shows `#N/A`, re-enter the `J2` formula from the common setup.
4. API Explorer for `spreadsheets.values.batchGet` (<https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet>). Parameters:
   - `spreadsheetId`: your ID
   - `ranges` (add the field twice): `Rates!A40:C40`, `Ledger!J2:J`. The original rows 2 to 4 are now rows 38 to 40, so row 40 is the November (current-month) row; check that before reading.
   - `valueRenderOption`: `UNFORMATTED_VALUE`
   - `dateTimeRenderOption`: `SERIAL_NUMBER`
   - `majorDimension`: `ROWS`
5. Execute. Record whether `B` and `C` of the current-month row come back as JSON numbers (not strings, not error text), whether `Ledger!J2:J` returns JSON numbers for rows with data (and `""` for the cleared row), and that the 2024-03-15 rows read `20` and `30`.
6. Wait a few minutes, execute again, and note whether the current-month rates are still numbers.
7. Optionally add a third `ranges` entry `Rates!E2:F40` (the history formula stays in `E2` because only columns A to C moved) and note what the API returns for it.

**Pass.** The current-month `GBP` and `USD` cells and the non-empty `Ledger!J` values come back as JSON numbers, and `J` resolves the older-month entries from the history rows. Record separately whether the history formula returned data or `#N/A`; either answer passes, but write it down.

**Result:** _(PASS / FAIL; current-month row numeric yes/no; history formula: data or `#N/A`; J numeric yes/no; older-month J correct yes/no)_

---

## S3: view speed on about 10,000 rows

**Question.** Do the `SUMPRODUCT(SUMIFS(...)*ticks)` summary and the `Balances` month-end matrix recalculate fast on a ten-thousand-row ledger? (Spec 3.5, 3.6.)

**Steps.**

1. Do S2 first, then use File > Make a copy to get a scratch copy for S3. In the copy, select `Ledger!A2:I` and press Delete, keeping the `J2` array formula.
2. `Accounts`: rows 2 to 4 stay as they are. Fill rows 5 to 19 with `Account 1 (EUR)` to `Account 15 (EUR)` (currency `EUR`, active TRUE). Format `C5:D19` as checkboxes (Insert > Checkbox), then tick `In Monthly` (column D) on rows 5 to 16 only (12 accounts) and leave rows 17 to 19 unticked.
3. Generate the ledger so the account names cycle through the 15 accounts. In `Ledger` row 2 type the formulas below, then type `A2:H10001` into the Name box (left of the formula bar), press Enter, and press Ctrl+D to fill down:
   - `A2`: `=ROW()`
   - `B2`: `=DATE(2024,1,1)+MOD(ROW()*7,1065)`
   - `C2`: `expense`
   - `D2`: `=MOD(ROW(),50)+1`
   - `E2`: `Shop X`; `F2`: `Item`
   - `G2`: `="Cat "&(MOD(ROW(),15)+1)`
   - `H2`: `=INDEX(Accounts!$A$5:$A$19,MOD(ROW(),15)+1)`

   Then select `A2:H10001` through the Name box again, copy, and use Edit > Paste special > Values only over itself, so the sheet holds plain values like a real ledger. Confirm `J` shows numbers down to row 10001. Alternative with real converted data, in place of steps 2 and 3: in the scratch copy, replace the `Accounts` and `Rates` tabs with copies of your real ones (so the account names and rate months match the ledger), paste the converted ledger into `Ledger!A2:I` three times in a row to reach about 10,000 rows, and add one snapshot per real account in step 4. The categories and account names then differ from `Cat n` and `Account n (EUR)`, so in step 5 list your real category names in `Summary!A2:A16` and in step 6 your real account names in `BalancesTest!A2:A16`.
4. Add a `Snapshots` tab, row 1: `id | date | account | balance | note`. Add 15 rows, one per `Account 1 (EUR)` to `Account 15 (EUR)`, date `2024-01-31`, balance `1000`.
5. Add a tab `Summary`. `A2:A16`: `Cat 1` to `Cat 15`. `B1:M1`: 12 month starts (`2026-01-01` to `2026-12-01`, as dates). Enter in `B2` and fill to `B2:M16`:
```
=SUMPRODUCT(SUMIFS(Ledger!$J:$J,Ledger!$G:$G,$A2,Ledger!$C:$C,"expense",Ledger!$B:$B,">="&B$1,Ledger!$B:$B,"<"&EDATE(B$1,1),Ledger!$H:$H,Accounts!$A$2:$A$19)*Accounts!$D$2:$D$19)
```
   If the checkbox column gives an error in the product, use `(Accounts!$D$2:$D$19=TRUE)` in place of `Accounts!$D$2:$D$19`.
6. Add a tab `BalancesTest`. `A2:A16`: `Account 1 (EUR)` to `Account 15 (EUR)`. `B1`: `2024-01-31` (a date). In `C1` enter `=EOMONTH(B1,1)` and fill right to `AK1` (36 month-ends). Paste this single line into the formula bar of `B2` (pressing Enter inside a cell commits early, so keep it as one line), press Enter once, then fill to `B2:AK16`:
```
=LET(d,MAXIFS(Snapshots!$B:$B,Snapshots!$C:$C,$A2,Snapshots!$B:$B,"<="&B$1),base,SUMIFS(Snapshots!$D:$D,Snapshots!$C:$C,$A2,Snapshots!$B:$B,d),base+SUMIFS(Ledger!$D:$D,Ledger!$C:$C,"income",Ledger!$H:$H,$A2,Ledger!$B:$B,">"&d,Ledger!$B:$B,"<="&B$1)-SUMIFS(Ledger!$D:$D,Ledger!$C:$C,"expense",Ledger!$H:$H,$A2,Ledger!$B:$B,">"&d,Ledger!$B:$B,"<="&B$1)-SUMIFS(Ledger!$D:$D,Ledger!$C:$C,"transfer",Ledger!$H:$H,$A2,Ledger!$B:$B,">"&d,Ledger!$B:$B,"<="&B$1)+SUMIFS(Ledger!$D:$D,Ledger!$C:$C,"transfer",Ledger!$I:$I,$A2,Ledger!$B:$B,">"&d,Ledger!$B:$B,"<="&B$1))
```
   This omits the destination-currency conversion of transfers, so a pass measures speed only, not the conversion cost.
7. Time a full recalculation: edit `Ledger!D2` (type a new amount, Enter) and start a stopwatch; stop when `Summary` and `BalancesTest` have stopped showing "Loading..." and show new values. Repeat three times. Alternatively reload the sheet and time until all cells are populated.

**Pass.** Full recalculation of `Summary` and `BalancesTest` takes **under 10 seconds** in all three timings, and no cell shows an error.

**Result:** _(PASS / FAIL; three timings in seconds; row count used; any errors. A pass measures speed only, not the transfer currency-conversion cost, because the Balances test omits it.)_

---

## S4: Apps Script template build

**Question.** Does the Apps Script build (formulas, validation, protections) behave as the spec says? (Spec gate 2, spike S4; the template checklist and import are gate 4.)

**Steps.** This spike waits for Task 13 (`template/build-template.gs` and `template/README.md`) and cannot be run until then.

1. Create a new empty spreadsheet. Open Extensions > Apps Script, paste in `template/build-template.gs`, save, and run the build function. Grant the permissions it asks for.
2. Go through the checklist in `template/README.md` and tick every item in that checklist by hand.
3. Record any failures with the item name.

**Pass.** Every item in the checklist in `template/README.md` is ticked.

**Result:** _(PASS / FAIL; list of failed checklist items; not yet run, waits for Task 13)_

---

## S5 Picker then files.copy with drive.file

**Question.** With only the `drive.file` scope, can the app open the Picker with the template's file id preselected (or find it via Shared with me / Recent), and then copy the picked template into the user's Drive with `files.copy`? (Spec 3.8, 6, gate 2.) The Google docs do not state either copying a Picker-selected file the app did not create, or preselecting an "Anyone with the link" file in the Picker.

**Steps.**

1. In a terminal in `docs/designs/spikes/`, run `python3 -m http.server 5173` and open http://localhost:5173/s5-picker-copy.html. `http://localhost:5173` is already an authorized JavaScript origin in `docs/deploy-your-own.md`; if the owner's OAuth client lacks it, add it in the OAuth client first.
2. Fill in the page's four fields: OAuth client ID, API key, Google Cloud project number, and template file id (the id inside the copy link in spec 3.8). These come from the owner's `.env`; they are typed into the page and never stored or committed.
3. Click "Sign in" with an account that is NOT the template's owner: a different Google account, ideally a Workspace one, then repeat with a personal gmail one. Note whether the consent screen showed ONLY the `drive.file` scope.
4. Click "Pick template". Pass 1: the Picker shows the template file when its id is preselected. If it shows nothing, close it and try "Pick from Shared with me / Recent"; record which of the two worked.
5. After picking, the page calls `files.copy` and prints the HTTP status, the new file id and name. Pass 2: status 200 and a new file "S5 spike copy" in My Drive of the signed-in account. Open it and check it has no attached script and that the version tag is there (the earlier Make-a-copy test already showed the tag survives a copy).
6. Record the exact error text for any failure (for example 403 with the reason). Afterwards delete the spike copy from Drive.

**Pass.** Pass 1 and pass 2 both hold, and consent showed only `drive.file`, for both the Workspace and the personal account. If the preselected Picker fails but the Shared with me / Recent button works, record that (the flow still passes with a different Picker view). If copy fails, the spec falls back to the copy-link flow of 3.8.

**Result:** _(PASS / FAIL; which Picker button worked; HTTP status and error text; consent scopes shown; Workspace and personal results; copy has no script and keeps the version tag yes/no)_
