# Fitracker: mobile PWA front end for the yearly FIRE sheet

Status: draft, awaiting user approval. Date: 2026-11-10.

## 1. Purpose and success criteria

Two people (the user and their partner) record personal finances in a yearly Google Sheet
(template: `assets/FIRE-TEMPLATE.xlsx`). Entering data on a phone in Sheets is clunky.
Fitracker is a fast, installable, offline-capable front end. The sheet remains the only
backend and stays fully usable in Sheets.

Success criteria:
- Recording a repeat purchase takes at most 3 interactions, a new one at most 5
  (enforced by a Playwright test).
- The app opens instantly from cache and works offline; writes are never lost.
- No server of ours. Sheets API v4 is called from the browser.
- Any year from 2019 onward can be linked; past sheets are migrated retroactively.

## 2. Scope

In v1:
- Add, edit and delete Expenses, Income and Transfers.
- Month view: budget vs actual per category, income, savings rate, combined base-currency figure.
- Activity screen: needs-attention items and recent changes with Undo.
- Settings: year switcher, link a sheet (Picker), migrate sheet, default currency, sign-out.

Currencies: EUR, GBP and USD only (a Currency dropdown on every entry tab).

Out of v1 (later): annual summary, account balances / net worth by currency, editing Setup
lists, creating the next year's sheet, reverse-geocoding places, a server-side auth broker
(longer sessions; would add token custody and ops, and each fork would need its own).

## 3. Findings about the template

- Entry tabs `Expenses`, `Income`, `Transfers` start at row 10 (headers at row 9, column B).
  Column order differs per tab (Expenses has Location; Income swaps Account and Category).
- `C` (EUR) holds a GOOGLEFINANCE formula in every row converting `D` (GBP); users type EUR
  over it, so rows mix formulas and literals. Column A is an empty margin. There is no id column.
- Dropdown lists live in `Setup`: income categories B16:B35, expense categories B46:B68,
  accounts B76:B102. Budgets are per month in C:N next to the categories. The year is `Setup!C8`.
- The per-row `C` formulas stop at row 1000 (Expenses), 986 (Income), 1004 (Transfers), and the
  date validation runs to about row 1035, so `values:append` cannot be used.
- Monthly and Annual Summary add up whole columns `Expenses!C`, `Income!C`, `Transfers!C` and
  filter on the date column (a date serial, not text): column C must hold numbers on every filled row.
- Template quirks (documented, not fixed): Expenses H14 has a category dropdown instead of an
  account one; Transfers E10:G10 have date validation and no account dropdown on row 10.
- The Monthly Summary tab is driven by a shared selector cell (K7); the app does not read it.
- Setup balances have EUR/GBP/USD columns (E/F/G): basis for a later net-worth view.

## 4. Architecture

Svelte 5 + TypeScript + Vite, static hosting, installable PWA. No data backend.

- `src/lib/schema.ts`: the only place with tab names, column letters, header checks.
- `src/lib/*.ts` + `*.test.ts`: pure logic (money, row mapping, free-row search, outbox
  rules, month aggregation, prediction, tap-count helpers). Components render only.
- `src/lib/messages.ts`: all user-facing text.
- `EntryStore` seam: screens, the outbox and prediction depend only on a small interface
  (`list`, `add`, `edit`, `delete`, `refresh`, `subscribe`, plus `lists()` for categories,
  accounts and budgets). The Sheets adapter (schema, migrations, row-finding, read-back) is
  its only v1 implementation and the only code that knows about Sheets. A different backend
  (e.g. Postgres) could be added later as another adapter without touching the screens.
  The outbox treats ops as idempotent by entry id so it works with either kind of adapter.
- Auth: Google Identity Services, `drive.file` scope with the Picker, token in memory only.
  Stored config is the year to spreadsheet-id list (plus device-local settings below).
  OAuth client id comes from `.env` (name listed in `.env.example`).
- Branding: `assets/logo.svg` (1300x1300, transparent, single cyan fill) is the source for the
  web app manifest icons and the README header. The plan includes generating 192/512 PNG icons
  plus a maskable variant on a solid background (a transparent logo is clipped badly by Android
  masks), and replacing the Vite boilerplate favicon and README.
- Because of `drive.file`, each person must pick each year's sheet once on their own account.

## 5. Data layer

- Money: integer minor units plus an ISO currency code. Read with `UNFORMATTED_VALUE`; never
  parse formatted strings. Currencies are EUR, GBP, USD (2 minor digits each); each entry keeps
  the currency it was paid in. Dates are written as serial numbers, never strings.
- Layout v2 (after migration): `D` = Amount as entered, a new last column on each entry tab =
  Currency (dropdown EUR/GBP/USD), and `C` = **one `ARRAYFORMULA` in `C10`** (the column below it
  stays empty) giving `amount * rate(currency)` in the base currency. Rates come from three cells
  in Setup (`GOOGLEFINANCE`, 1 for the base); an unknown currency or rate error shows as an error,
  not 0 (a blank Currency typed in Sheets counts as the base currency, so one stray row cannot turn column sums into errors). The sheet's own summary tabs keep summing `C` unchanged, at the live rate. **The app
  never writes `C` or Setup.** The base currency is set per sheet (your sheets: EUR).
- The month view is computed client-side per currency from raw entry tabs plus Setup budgets
  (pure, fixture-tested against the template's formulas), with a combined base-currency figure
  labelled approximate, using the Setup rates table. It does not read the Monthly Summary tab.
- One `values:batchGet` per screen (entry tabs for the year plus Setup lists). Minimum
  interval between refreshes to respect the ~60 reads/min quota.
- Rows are identified by a hidden id in column A. Rows typed directly in Sheets get an id
  from the app on refresh (writing column A only).

### Versioned schema and migrations

- The schema version is stored as spreadsheet developer metadata with DOCUMENT visibility
  (invisible in Sheets). A sheet without it is classified by its headers: raw template headers =
  version 0; v2 headers (`Amount`, `Currency`) = version 2 (the app stamps the metadata). Anything
  else is an unrecognised layout. The shipped template is already v2.
- `src/lib/migrations/`: one module per step, applied in order. Each is a pure function from
  the sheet's current state to `batchUpdate` requests, idempotent, fixture-tested, and preceded
  by backup copies of the affected tabs named per step (`Expenses (backup v0)` etc.). Each
  step is applied as one all-or-nothing `spreadsheets.batchUpdate` that includes the version
  metadata change; the state is re-read immediately before writing.
  - `0->1`: write ids into column A for non-empty rows, hide column A.
  - `1->2`: layout v2. Every row is classified explicitly: a literal C (base amount actually
    paid) becomes Amount=C, Currency=base and wins over D; else a D value becomes Amount=D,
    Currency=GBP; the template's own conversion formula with empty D is an empty row; any other
    formula or unparseable value is flagged and left untouched, never guessed. Then column C is
    cleared below the header and the single array formula is written in `C10`; the Setup rate
    cells and base currency are added; headers relabelled; D's number format reset.
- On linking a sheet: older version means the app offers to migrate through all missing steps;
  equal opens normally; **newer than the app knows means read-only with an "update the app"
  notice**, so a stale client never corrupts a newer layout. Unrecognised layouts abort
  before any write.
- Future layout changes are one more migration, so past years, copies of the template and
  forks converge on the same version.

### Rules

- No exception to "never overwrite formula cells" is needed: the app writes only the date, `D`,
  the text/category/account fields, the Currency column and the id. Never `C`, never Setup.

## 5b. Open source and forks

MIT license. Anyone can fork and deploy their own static copy with their own Google Cloud
OAuth client; `.env.example` lists the client id, API key and project number (needed by the
Picker). Nothing is shared between deployments, and nobody's data passes through a server of
ours. Everyone with access to a sheet becomes a user on their own deployment and picks the
sheet themselves. Docs include a "deploy your own" guide. Before the repo goes public, the
template in `assets/` is replaced with a sanitized generic one already at layout v2 (the current file contains real
account names, income/expense figures for past years and crypto holdings). Layout is fixed per
schema version; forks changing it add a migration.

## 6. Sync, offline and undo

- Every add/edit/delete is an IndexedDB outbox record written before any network call.
  The UI shows cached rows plus pending ops. A replayer sends ops in order when online and
  signed in, with backoff on 429.
- Add: the row is chosen at send time. Read column A and B:last, take the first row with no id,
  date, amount or description (a tab is full at its last row). Write id and fields in one call,
  read back, and retry on the next row if the id is not ours. Before re-sending an unacknowledged
  add, look up its id to avoid duplicates. Pending adds are batched: one read, one
  `values:batchUpdate`, one read-back. Replay is guarded across tabs with `navigator.locks`.
  On every refresh the app checks that each saved id is still present and flags missing ones.
- Edit/delete: find the row by id on every replay. A missing row means the op is dropped and
  flagged in Needs attention, never retried. Last write wins per row. Before overwriting,
  read the row's current values, keep them for Undo (taken from the sheet, not the cache), and
  flag the op if they are a different entry than the one edited (e.g. rows sorted in Sheets).
- Delete clears A, B and D through the last column; it never touches `C` and does not remove the
  row (that would shift ranges and validations).
- Auth: the token lasts about an hour; when it expires the replayer pauses with ops intact and
  the UI shows a "tap to reconnect" banner. Linking a sheet checks `Setup!C8` against the year.
- Two offline adds never conflict. The risk is edit vs edit (later sync wins, overwritten
  values undoable by the overwriter) and edit vs delete (edit dropped and flagged, or the
  delete removes the edit and is undoable).
- Corner cases a human can fix in the sheet are noted in one line in `docs/`.

## 7. Screens

Bottom tab bar, large touch targets.
1. **Add** (home). Amount field focused on open; currency defaults to last used; kind
   (expense/income/transfer) remembered; date defaults to today, with a chip opening the native
   date picker; place (Expenses only) and description with predictive typing from the user's own
   history (local, frequency and recency); category and account chips; picking a suggestion
   pre-fills the category and account last used with it. One Save works offline; the form resets.
   A "use my location" button (permission asked on tap) suggests the nearest known place from
   coordinates stored only on the device, never in the sheet.
2. **Month**: per-category planned vs actual bars, income, savings rate, approximate combined
   base currency; drill into a category, tap an entry to edit or delete.
3. **Activity**: Needs attention on top (discard or re-add), then Recent changes with Undo.
   The nav shows a badge only when something needs attention.
4. **Settings**: year switcher (2019+), link a sheet, migrate sheet, default currency, sync
   status, sign-out.

Destructive actions warn first and are undoable.

## 8. Tradeoffs accepted

- Client-side month aggregation can drift from the sheet's own summary; mitigated by fixture tests.
- Same-second saves by two people may race for a row; read-back catches it, residual cases are documented.
- No conflict-merge UI; last write wins with undo.
- The `EntryStore` seam is an interface only; no second adapter is built or tested in v1 (YAGNI).
- Prediction and place coordinates are per device and not shared between partners.
- Place suggestions by GPS improve only after places have been saved with GPS on.
- Sheet's own summaries convert at the live rate, so past totals move with exchange rates (accepted).
- Hourly token renewal may need a tap, especially in an iOS standalone PWA.
- Layout v2 rewrites historical data once per year; mitigated by backup tabs and fixture-tested migrations.

## 9. Testing

Test first, one commit per task. Unit tests for every function in section 4; fixture tests of
month aggregation against values computed from the template; outbox replay tests (ordering,
missing row, duplicate add, collisions) with a fake Sheets API; Playwright tests for the
tap-count goals and offline add/replay. Live-service behaviours (real Sheets calls, Picker,
GIS sign-in, two-person session, applying migrations to a real year) are verified by the
user from a numbered checklist before any PR.

## 10. Decisions

- Rates: three cells in Setup written by the template/migration; Setup range fixed in the plan.
- Hosting: any static host; GitHub Pages is the documented default.
- v1 expects the next year's sheet to be a copy of the template.
- The Google API key is restricted by referrer and API in the deploy guide.
- Uploading .xlsx to Drive must be converted to a Google Sheet, or the Sheets API refuses it.
