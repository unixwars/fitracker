# Fitracker v2: one multi-year ledger

Status: draft rev 5 (rows are written to an explicit free row, not appended; live check 2026-11-14), awaiting user approval. Date: 2026-11-12.

Supersedes sections 3 (template findings), 5 (data layer, migrations) and the year switcher in section 7
of `2026-11-10-fitracker-design.md`. Everything else there (architecture, sync and undo, auth, testing
approach) still applies unless stated here. v0.1.0 had no users, so nothing is kept for compatibility.

## 1. Purpose and success criteria

Two people track spending and net worth in a Google Sheet; the app is the fast phone front end. The
sheet stays the only database and stays useful on its own in Google Sheets. People make mistakes, so
the model favours self-correction over exactness: discrepancies of a few EUR or GBP a year are expected
(under 10 is ignored, 10 or more is shown), but nothing may be silently lost or corrupted.

Success criteria:
- One spreadsheet holds every year. The app links it once.
- The sheet alone gives the Monthly, Annual, per-type entry and Balances views, with charts, and the
  ledger can be edited by hand in Sheets.
- Net worth evolution and investment performance follow from snapshots plus the ledger, with no yearly ritual.
- 2024-2026 (and later the earlier years) are ingested from the old yearly sheets by scripts, with a
  validation report, before any app code is written against the new layout.
- Unchanged: a repeat purchase takes at most 3 interactions and a new one at most 5; offline-first; no server.

## 2. Decisions

| Decision | Why |
| --- | --- |
| One multi-year book, not one file per year | One Picker consent (`drive.file` is per file), no link/unlink flow, no January copy ritual, cross-year views for free. |
| One `Ledger` tab for all entry types | One mapping, one append path, simple `SUMIFS`. Familiar `Expenses`, `Income`, `Transfers` tabs return as read-only views. |
| An account has exactly one currency; an entry's amount is in its account's currency | Catches currency typos, removes the currency dropdown and a column. Cash accounts are split per currency. |
| Amounts are always positive; a refund is income (the `Refund` category) | Matches how the sheets are used; a negative amount is a flagged error. |
| Entering another currency warns, then stores the amount converted at the entry month's rate | Keeps the invariant. The difference to the card's real rate is drift. |
| Balances come from snapshots (end-of-day) plus ledger effects since | Self-correcting; replaces the yearly "net worth at start" ritual and most of the old Setup block. |
| No received-amount column, no adjustment entries | Not needed at the accepted tolerance; a new snapshot fixes any drift. |
| Monthly rate table of values, history from the Bank of England, current month live; the app maintains the rows | `GOOGLEFINANCE` history cannot be read through the Sheets API (to confirm in spike S2), and a monthly average is accurate enough here. |
| `Business` stays an ordinary category name | It marks the partner's new business expenses. |
| No owner on accounts; per-view account ticks instead | Ownership is joint. Ticks let each summary count a chosen set of accounts. |
| Rollover dropped; one monthly budget amount per category per year | Never used; budgets never varied by month in 2024-2026. |
| No migration framework in the app | Legacy sheets are ingested by scripts (orphan branch). A schema version tag (value 3) remains so an older app opens a newer sheet read-only. |
| Names are keys (no ids on categories or accounts) | Human-editable. A rename is a find-and-replace in `Ledger` and `Budgets`. Closed accounts and retired categories keep `active` off, never deleted. |

## 3. Sheet design

### 3.1 Tabs

- Data, written by the app: `Ledger`, `Snapshots`, and one exception, `Rates` (3.4).
- Reference, edited by people, read by the app: `Settings`, `Accounts`, `Categories`, `Budgets`.
- Views, formulas only, never written by the app, protected with a warning: `Expenses`, `Income`,
  `Transfers`, `Monthly Summary`, `Annual Summary`, `Balances`.

### 3.2 `Ledger`

Header in row 1, data from row 2.

| Col | Field | Notes |
| --- | --- | --- |
| A | id | hidden |
| B | date | date serial; validation rejects non-dates |
| C | type | `expense`, `income`, `transfer` |
| D | amount | positive number, in the account's currency; validation rejects non-numbers |
| E | place | expenses only; feeds suggestions |
| F | description | |
| G | category | empty for transfers |
| H | account | for a transfer, the source |
| I | to-account | transfers only |
| J | base amount | one array formula in `J2`; the app never writes it |

`J` takes the account's currency from `Accounts` and the rate from `Rates` (latest row on or before the
entry's month), or 1 for the base currency. A row it cannot resolve shows an error; the view tabs wrap `J`
so one bad row cannot turn a whole summary into an error, and show the count of unresolved rows.

Writing:
- A new row is written with `values:batchUpdate` to an explicit free row: one below the last row that holds
  anything in `A`, `B`, `D` or the description (so a hand-typed row without an id is never overwritten), columns
  `A` to `I` only. `values:append` is not used: against a real copy of the template it landed rows one column
  to the right (`B2:J2`) over the `J2` formula, with and without rows present (live check, 2026-11-14). A write
  past the grid is a 400 "exceeds grid limits"; the app then adds rows (`appendDimension`) once and retries.
  After writing, the app reads the id column back for that row and retries if another device took the row. Before
  re-sending an unacknowledged add, the outbox looks the id up, because a write is not idempotent.
- A delete clears A to I of the located row (the row stays; no shifting). Edits locate the row by id:
  read column A first, then the single row.
- Rows typed by hand without an id get one from the app on refresh. After writing, the app reads the cell
  back and adopts the value the sheet holds, so two devices cannot disagree.
- A row the app cannot parse (text date or amount, unknown account) gets no id and appears in Needs attention
  as "row not understood".

### 3.3 Reference tabs

- `Settings`: base currency (EUR). The schema version (3) is spreadsheet developer metadata, not a cell.
- `Accounts`: name, currency (EUR, GBP or USD), active, `In Monthly`, `In Annual` (checkboxes, default on).
- `Categories`: name, type (`expense` or `income`), active. Keyed by (type, name): `Other` exists in both.
- `Budgets`: year, type, category, monthly amount (base currency).

### 3.4 `Rates`

One row per month (first day of the month, ascending): GBP and USD columns, each the value of one unit in the
base currency. Past months are values. The current month's row holds a live
`GOOGLEFINANCE("CURRENCY:...")` current-rate formula (no history), which the API can read (spike S2).
On the first refresh in a new month the app writes the closed month's row as a value and appends the new
month's row (explicit row, after the last non-empty row of `A:C`) with the formula: the one write outside `Ledger` and `Snapshots`. Concurrent devices may both try;
the app re-reads and skips if the month row already exists. History is loaded once from Bank of England
monthly averages by the converter.

### 3.5 `Snapshots` and balances

`Snapshots`: id (hidden), date, account, balance (account currency), note. A snapshot is an end-of-day close:
only entries dated after it count towards later balances. Two snapshots of one account on one date: the last
row wins, in the sheet and in the app. Undo of a snapshot clears its row. The app's "Set balance" dates it
today; an entry added later that day for the same date is excluded until the next snapshot (accepted).

Balance of an account on a date = latest snapshot on or before it (baseline 0 if none) plus ledger effects
after it. An expense subtracts, income adds. A transfer subtracts from the source; at the destination it adds
the source amount converted into the destination's currency with the `Rates` rows of the entry's month (the
same rule in the sheet, the app and the converter, with shared test fixtures).

Performance of an account over a period = end balance - start balance - net transfers in, in the account's own
currency, so exchange-rate moves do not count as performance; income credited to the account (dividends,
interest) does. `Balances` shows, per account, the latest snapshot, its age, the effect since, and the current
balance in the account's currency and in base, plus a month-end matrix for the net-worth chart.

### 3.6 Views

- `Expenses`, `Income`, `Transfers`: one `QUERY` over `Ledger` each, with a year selector (default the
  current year) and an adjacent lookup column for the currency from `Accounts` (`QUERY` cannot join).
- `Monthly Summary`: year and month selectors; planned, actual, total, Regular vs Business, per-category
  budgeted, spent and remaining; income; savings rate. Counts only accounts ticked `In Monthly` and says how
  many are included.
- `Annual Summary`: year selector; income, expenses, net savings; income and expenses by category by month;
  savings rate. Counts only accounts ticked `In Annual`.
- `Balances`: as in 3.5.
- Ticked filtering (spike S3): `SUMIFS` does not broadcast a multi-cell criteria range (a live sheet gave 0
  with two ticked accounts), so the summary tabs do not use `SUMPRODUCT(SUMIFS(..., Accounts!names) * ticks)`.
  Each summary tab lists its ticked account names once in helper column Z
  (`IFNA(FILTER(...),"#none#")`), then one `FILTER` of the period's ledger rows whose account is in that list
  fills helper columns AA:AD (date, type, category, base amount; error in `J` counted as 0 via `IFERROR`).
  Every summary cell is a plain `SUMIFS` with single-cell criteria over those helper rows.
- Consequences: the summary tabs keep 5000 (`Monthly Summary`) and 20000 (`Annual Summary`) rows; an account
  name listed twice in `Accounts` counts once in totals; the spikes time this design, not the old shape.

### 3.7 Charts (added after the data gate, not on the critical path)

- Monthly: budget vs actual by category (columns); expense proportions (doughnut).
- Annual: income vs expenses by month with a savings-rate line; stacked spending by category by month;
  expense proportions (doughnut).
- Balances: net worth by account over time (stacked area); inflows and outflows by account for a period (bars).
- Not planned: Sankey (no native Sheets chart).

The template is built by an Apps Script (`template/build-template.gs`, `@OnlyCurrentDoc`), which also creates the
tabs, validation, hidden columns, the version metadata and warning-only protections, then the script is removed
from the sheet. Charts are added by a second function after the data gate.

### 3.8 Template distribution

- The template is a public master Google Sheet built by `template/build-template.gs` and published as "Anyone
  with the link: Viewer". It is handed out as its copy link,
  `https://docs.google.com/spreadsheets/d/1ISaC0GTqkYlwsnrUd9IU2wrFjmWYx-jUfcqgaTLp8yY/copy` (the sheet URL
  ending in `/copy`: Google shows "Make a copy"). The app may do the copy itself instead (section 6); this
  link is also the fallback flow.
- The bound Apps Script project is removed before sharing; the copy dialog must show no attached script.
- Copies keep tabs, formulas, validation, protections, charts and the version tag.
- Charts are added by `addCharts()` on the master.
- The owner's own ledger is a separate copy of the master, never the master itself.
- `assets/FIRE-TEMPLATE.xlsx` is superseded for v3 and is not distributed.

## 4. Rules

- The app writes only `Ledger` columns A-I, `Snapshots`, and the `Rates` maintenance rows. Never `J`, never a
  view or other reference tab.
- Rows are found by the hidden id, never by row number.
- No formula may pass a multi-cell range as a `SUMIFS`, `COUNTIFS`, `SUMIF` or `COUNTIF` criterion.
- Money is integer minor units in the app, read with `UNFORMATTED_VALUE`.
- Drift threshold is the constant 10 in base currency: below it the app accepts silently, at or above it flags
  the difference when a balance is set. No adjustment entry is created or stored.
- The Add form takes its currency from the chosen account. A different input currency triggers a warning; on
  override the app converts with the entry month's `Rates` row and stores the converted amount (no note added).
- A newer version tag than the app: read-only with an "update the app" notice. Unrecognised layout: abort
  before any write.
- Version tag fallback: when the metadata is missing but the `Ledger` and `Snapshots` headers match the v3
  layout, the app stamps `fitracker.schemaVersion` = 3 itself (one write). A copy of the template keeps the
  tag (verified live with Make a copy); the fallback only protects against a lost tag.
- `AGENTS.md` rules to amend with the app plan: migrations in `src/lib/migrations/`, "never writes column C or
  Setup", the year to sheet-id config, and "layout fixed across years".

## 5. Ingest from the legacy sheets

A Python script (venv, tested with synthetic fixtures) in an orphan branch worktree. Inputs: the yearly
`FIRE-<year>.xlsx` exports and a Bank of England daily spot-rate CSV (sterling into euro and into US dollar,
series codes to be verified; USD to EUR is derived through sterling). Outputs: import-ready tables for `Ledger`,
`Accounts`, `Categories`, `Budgets`, `Snapshots` and `Rates`, plus a validation report. Real data and output stay
outside the repository; `private/` and `out/` are git-ignored on every branch.

Reading: ranges are anchored on labels (the account list runs from the "Account Name" header to the
"Networth year start" row), because list lengths differ per year; a missing label is a hard error. A workbook
is rejected when no formula cell has a cached value, or when a row with a value in D has a conversion formula in
C without a cached value.

Rules:
- Amount and currency per old row: a typed value in C is EUR, a value in D is GBP; when both are present the
  cell matching the account's currency wins. Arithmetic formulas become their cached numbers; other formulas
  use the cached number and are flagged. Rows without date and amount are dropped.
- Text amounts, a text or missing date, a blank account or blank transfer destination are hard errors: fix them
  at source. A negative amount is a flagged error, never stored.
- Account denominations and the cash split come from a reviewed `accounts.csv` (`name,currency,active,split`);
  a split account becomes `<name> EUR` and `<name> GBP`. Names are stripped; a case-only collision is a hard error.
- An entry whose currency differs from its account's, and a cross-currency transfer, are converted with the
  Bank of England daily rate on the entry date (previous day if missing). A missing rate is a hard error. The
  original amount is noted in the description.
- Categories are the union of each year's `Setup` lists, keyed by (type, name), stripped. An unknown category
  keeps its name and is added inactive, with a flag. A budget whose months differ stores January and is flagged.
- Snapshots are seeded from each year's `Setup` balances, dated the previous December 31. A non-split account
  with balances in two columns, or in a column that is not its currency, is a hard error.
- Ids are deterministic (a hash of year, tab and source row), so a re-run reproduces them.
- A row dated outside its sheet's year is kept and flagged, and checked against the neighbouring year's sheet
  for a duplicate.
- `Rates` history is the monthly average of the daily series.

The validation report is the gate: rows in = rows out + listed drops, per year and tab; per category, month and
native currency, new totals equal the source values exactly apart from converted rows and listed drops; the old
`Monthly Summary` and `Annual Summary` cached values as an independent reference with a tolerance of 2% or 10 EUR
per category and year, whichever is larger; and a model-fit table of each account's computed Jan-1 balance
(previous snapshot plus ledger) against the recorded one, flagged at 10 EUR or more.

Import: the user sets the spreadsheet locale first, pastes values only, at the first data row below the header,
then checks row count, sum of D per account and the count of non-numeric B and D cells. An import is always a
full replace, never an append, with a freeze date for the cutover, because FIRE-2026 keeps receiving entries.

## 6. App changes

- `schema.ts` maps the new tabs and ranges; the three entry-tab mappings, the migration framework and the
  per-year link and switcher go.
- One `batchGet` reads ledger, accounts, categories, budgets, rates and snapshots, cached in IndexedDB. The
  refresh interval grows with the ledger; edits locate by column A first.
- `EntryStore` keeps its shape; the year parameter goes, snapshots and `Rates` maintenance are added. The outbox
  gains a snapshot operation.
- Add screen: account chips set the currency; warning and override flow; transfers have source and destination.
- Month screen: per-entry conversion with the entry month's rate; honours the `In Monthly` ticks.
- New Accounts screen: balances, "last set N days ago", "Set balance" with the drift display.
- Needs attention gains "row not understood".
- Settings gains "Create your sheet from the template". Preferred flow: the app opens the Picker with the
  template's file id (the id inside the copy link in 3.8) preselected (`DocsView.setFileIds`); the user selects
  it, which grants `drive.file` access to it; the app then calls `files.copy` to create the copy in the
  signed-in user's Drive and links it. Google's docs list `drive.file` among the scopes that authorize
  `files.copy`, and `drive.file` covers files the user opens or shares with the app through the Picker. NOT
  STATED in the docs: copying a Picker-selected file the app did not create, and picking a file shared only as
  "Anyone with the link" through the Picker with its id preselected. Spike S5 checks both.
- Fallback if S5 fails: the copy-link flow of 3.8. The app opens the template's `/copy` URL in a new tab, the
  user makes the copy themselves, then the app asks them to link it with the Picker. No API call is made.
- The full `drive` scope stays ruled out by `AGENTS.md`.
  A first-run app with no linked sheet shows this action first.
- The copy-link URL is a build-time constant read from `VITE_TEMPLATE_COPY_URL` (the app plan lists the name in
  `.env.example`; it is public but configurable per fork).

## 7. Testing

Pure functions with tests beside them: `balanceAt`, conversion and rate lookup, the month view with ticks, drift,
the currency rules, the converter's rules; the Python and TypeScript balance and transfer tests share fixtures.
App fixtures are sanitized slices of the real converted data. The fake Sheets API moves to the new layout.
Playwright keeps the tap-count goals and offline replay. Live behaviour goes on a numbered checklist for the
user before any PR.

## 8. Gates and sequencing

Each sub-project gets its own plan. A failed gate returns to this spec.
1. This spec approved.
2. Spikes pass (they can run alongside the converter): S1 adding rows to a ledger with a cleared gap, a
   three-row add, two concurrent adds and a hand-typed row below, on the real template copy (an append on a
   scratch sheet passed but failed on the template: see 3.2); S2 the current-rate formula and
   `Ledger!J` read through the Sheets API, and Bank of England history loaded into `Rates`; S3 view and
   `Balances` month-end formulas fast on a ten-thousand-row ledger, timing the helper-column design of 3.6
   (ticked-account `FILTER` into AA:AD, plain `SUMIFS`), not the old `SUMPRODUCT` shape; S4 the Apps Script build (formulas,
   validation, protections) behaves as specified; S5 Picker-then-`files.copy` with only `drive.file`.
3. Converter report clean on 2024-2026 and `accounts.csv` reviewed.
4. The template passes its checklist; the user imports the converted tables and the Monthly and Annual views
   match the old sheets within the report's tolerance.
5. App core on the real data.
6. Accounts screen and performance.
7. Earlier years (any time after gate 4), imported as a full replace.

Ships as 0.2.0, a breaking layout change replacing the unused 0.1.0 deployment.

## 9. Accepted trade-offs

- The app and the sheet both compute month figures; fixture tests keep them aligned.
- Monthly average rates, not daily; the app writes one small maintenance row a month.
- A future layout change needs a new script, not an in-app migration; the version tag protects stale apps.
- Account currencies are fixed once set; changing one reinterprets its history.
- Drift between the card's rate and the monthly rate is absorbed by snapshots.
- Rollover and per-month budgets are gone until wanted.
- `In Monthly` and `In Annual` are separate ticks although they may rarely differ.
- Summary tabs use helper columns and grow to 5000 / 20000 rows.
- The current month's `Rates` row is live until the app (or the owner) freezes it.
- The template must be republished (new link) when the layout version changes.

## 10. Out of scope

Editing reference lists in the app, Sankey, notifications, per-coin crypto holdings, business accounting (the two
business accounts are tracked only as assets), a second storage backend, changing the base currency.
- The sheet is the shared database, so two devices writing in the same fraction of a second can pick the same row; the read-back after each write retries the loser and the 7-day check flags a vanished row. A hosted database would remove this but also the "your data stays in your own Sheet" premise; that is a question for a later release.
