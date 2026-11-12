# Fitracker v2: one multi-year ledger

Status: draft, awaiting user approval. Date: 2026-11-12.

Supersedes sections 3 (template findings), 5 (data layer, migrations) and the year switcher in section 7
of `2026-11-10-fitracker-design.md`. Everything else there (architecture, sync and undo, auth, testing
approach) still applies unless stated here.

## 1. Purpose and success criteria

Two people track spending and net worth in a Google Sheet; the app is the fast phone front end. The
sheet stays the only database and stays useful on its own in Google Sheets. People make mistakes, so
the model favours self-correction over exactness: discrepancies of a few EUR or GBP a year are expected
(under 10 is ignored, 10 or more is shown, none is treated as implausible).

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
| One multi-year book, not one file per year | One Picker consent (`drive.file` is per file), no link/unlink flow, no January copy ritual, cross-year views for free. Size is not a concern (about 1.5k rows a year). |
| One `Ledger` tab for all entry types | One mapping, one append path, simple `SUMIFS`. Familiar `Expenses`, `Income`, `Transfers` tabs return as read-only views. |
| An account has exactly one currency; an entry's amount is in its account's currency | Catches currency typos (the old sheets had them), removes the currency dropdown and a column. Cash accounts are split per currency. |
| Entering another currency warns, then stores the amount converted at the entry date | Keeps the invariant. Small differences against the card's real rate are drift. |
| Balances come from snapshots (end-of-day) plus ledger effects since | Self-correcting; replaces the yearly "net worth at start" ritual and most of the old Setup block. |
| No received-amount column, no adjustment entries | Not needed at the accepted tolerance; a new snapshot fixes any drift. |
| Daily exchange rates from a sheet formula | Conversion at the transaction date, exactly, without freezing rituals (see spike S2). |
| `Business` stays an ordinary category name | It marks the partner's new business expenses. No attribute is needed. |
| No owner on accounts; per-view account ticks instead | Ownership is joint. Ticks let each summary count a chosen set of accounts. |
| Rollover dropped; one monthly budget amount per category per year | Never used; budgets never varied by month in 2024-2026. Month columns can be added later. |
| No migration framework in the app | Legacy sheets are ingested by scripts (orphan branch). A schema version tag remains so an older app opens a newer sheet read-only. |
| Names are keys (no ids on categories or accounts) | Human-editable, as in the template. A rename is a find-and-replace in `Ledger` and `Budgets`. Closed accounts and retired categories are kept with `active` off, never deleted. |

## 3. Sheet design

### 3.1 Tabs

- Data, written by the app: `Ledger`, `Snapshots`.
- Reference, edited by people, read by the app: `Settings`, `Accounts`, `Categories`, `Budgets`, `Rates`.
- Views, formulas only, never written by the app, protected with a warning: `Expenses`, `Income`,
  `Transfers`, `Monthly Summary`, `Annual Summary`, `Balances`.

### 3.2 `Ledger`

Header in row 1, data from row 2, no per-row formulas, so `values:append` may work (spike S1).

| Col | Field | Notes |
| --- | --- | --- |
| A | id | hidden; rows typed in Sheets get one from the app on refresh |
| B | date | date serial |
| C | type | `expense`, `income`, `transfer` |
| D | amount | positive, in the account's currency |
| E | place | expenses only; feeds suggestions |
| F | description | |
| G | category | empty for transfers |
| H | account | for a transfer, the source |
| I | to-account | transfers only |
| J | base amount | one array formula in `J2`; the app never writes it |

`J` converts `D` from the account's currency to the base currency at the rate for `B` (previous available
day when the date is missing). The base currency is in `Settings`.

### 3.3 Reference tabs

- `Settings`: base currency (EUR). The schema version is spreadsheet developer metadata, not a cell.
- `Accounts`: name, currency (EUR, GBP or USD), active, `In Monthly`, `In Annual` (checkboxes, default on).
- `Categories`: name, type (`expense` or `income`), active. Keyed by (type, name): `Other` exists in both.
- `Budgets`: year, type, category, monthly amount (base currency). One row per year and category.

### 3.4 `Rates`

One `GOOGLEFINANCE` daily-history formula per non-base currency, spilling a date and rate block (value of
one unit in the base currency). Lookups use the entry date, or the previous available day. Fallback if the
spike fails: a monthly-average table.

### 3.5 `Snapshots` and balances

`Snapshots`: id (hidden), date, account, balance (account currency), note. Append-only for the app.
A snapshot is an end-of-day close: only entries dated after it count towards later balances.

Balance of an account on a date = latest snapshot on or before that date (baseline 0 if none) plus ledger
effects after it. An expense subtracts, income adds. A transfer subtracts from the source; at the
destination it adds the source amount converted at that day's rate. Investment performance over a period =
end balance - start balance - net transfers in. The `Balances` view shows, per account, the latest snapshot,
its age, the effect since, and the current balance in the account's currency and in base, plus a month-end
matrix for the net-worth chart.

### 3.6 Views

- `Expenses`, `Income`, `Transfers`: one `QUERY` over `Ledger` each, with a year selector (default the
  current year), listing the columns of today's tabs plus the currency from `Accounts`.
- `Monthly Summary`: year and month selectors; planned, actual, total, Regular vs Business, per-category
  budgeted, spent and remaining; income; savings rate. Counts only accounts ticked `In Monthly` and
  says how many are included.
- `Annual Summary`: year selector; income, expenses, net savings; income and expenses by category by
  month; savings rate. Counts only accounts ticked `In Annual`.
- `Balances`: as in 3.5.
- Ticked filtering uses `SUMPRODUCT(SUMIFS(..., account, Accounts!names) * ticks)` (spike S3).

### 3.7 Charts (added after the data gate, not on the critical path)

- Monthly: budget vs actual by category (columns); expense proportions (doughnut).
- Annual: income vs expenses by month with a savings-rate line; stacked spending by category by month;
  expense proportions (doughnut).
- Balances: net worth by account over time (stacked area); inflows and outflows by account for a period (bars).
- Not planned: Sankey (no native Sheets chart; would need Apps Script or an app dependency).

Charts and protected ranges are applied through the Sheets API after creating the template, not by
`.xlsx` import (spike S4).

## 4. Rules

- The app writes only `Ledger` columns A-I and `Snapshots`. Never `J`, never a view or reference tab.
- Rows are found by the hidden id, never by row number.
- Money is integer minor units in the app, read with `UNFORMATTED_VALUE`.
- Drift threshold is the constant 10 in base currency: below it the app accepts silently, at or above it
  flags the difference when a balance is set. No adjustment entry is created or stored.
- The Add form takes its currency from the chosen account. A different input currency triggers a warning;
  on override the app converts at the entry-date rate and appends the original amount to the description,
  for example "(GBP 4.00)".
- The sheet's version tag newer than the app: read-only with an "update the app" notice. Unrecognised
  layout: abort before any write.

## 5. Ingest from the legacy sheets

A Python script (venv, tested with synthetic fixtures) in an orphan branch. Inputs are the yearly
`FIRE-<year>.xlsx` exports; outputs are import-ready tables for `Ledger`, `Accounts`, `Categories`,
`Budgets` and `Snapshots`, plus a validation report. The real data and the output stay outside the repo.

Rules:
- Amount and currency per old row: a typed value in C is EUR, a value in D is GBP, arithmetic formulas
  become their cached numbers, rows without date and amount are dropped.
- Account denominations come from an `accounts.csv` the script proposes and the user reviews. Cash
  accounts split into `<name> EUR` and `<name> GBP`.
- An entry whose currency differs from its account's is converted to the account's currency using the
  row's own cached conversion in the old sheet. Any case it cannot cover is reported, never guessed.
- Transfers use the same cached values.
- Categories are the union of each year's `Setup` lists, keyed by (type, name). Budgets are the
  monthly figure per year, flagged if months differ. Unknown categories are flagged.
- Snapshots are seeded from each year's `Setup` account balances, dated the previous December 31.
- Hard errors (an account with no denomination, an unparseable date) stop the run; everything else is reported.

The validation report is the gate: row counts per year and tab; category totals old vs new within a few
units; every converted or flagged row with its reason; and a model-fit table comparing each account's
computed Jan-1 balance (previous snapshot plus ledger) with the recorded one. Earlier years get their
own layout normalizer with the same output.

## 6. App changes

- `schema.ts` maps the new tabs and ranges; the three entry-tab mappings, `KINDS` triples, the migration
  framework and the per-year link and switcher go.
- One `batchGet` reads ledger, accounts, categories, budgets, rates and snapshots, cached in IndexedDB.
- `EntryStore` keeps its shape (`list`, `lists`, `rates`, `addMany`, `edit`, `delete`, `refresh`,
  `subscribe`); the year parameter goes, snapshots are added.
- Add screen: account chips set the currency; warning and override flow; transfers have source and destination.
- Month screen: per-entry conversion at the entry date; honours the `In Monthly` ticks.
- New Accounts screen: balances, "last set N days ago", "Set balance" with the drift display.
- The outbox, undo and Needs-attention behaviour are unchanged.

## 7. Testing

Pure functions with tests beside them: `balanceAt`, conversion and rate lookup, the month view with ticks,
drift, the currency rules, the converter's rules. App fixtures are sanitized slices of the real converted
data. The fake Sheets API moves to the new layout. Playwright keeps the tap-count goals and offline replay.
Live behaviour goes on a numbered checklist for the user before any PR.

## 8. Gates and sequencing

Each sub-project gets its own plan. A failed gate returns to this spec.
1. This spec approved.
2. Spikes pass: S1 append on the ledger layout; S2 rates formula (history length, reliability);
   S3 view formulas fast on a ten-thousand-row ledger; S4 import, `QUERY` and array survive, charts and
   protections through the API.
3. Converter report clean on 2024-2026 and `accounts.csv` reviewed.
4. User imports into the template and the Monthly and Annual views match the old sheets within a few units.
5. App core on the real data.
6. Accounts screen and performance.
7. Earlier years (any time after gate 4).

Ships as 0.2.0, a breaking layout change replacing the unused 0.1.0 deployment.

## 9. Accepted trade-offs

- The app and the sheet both compute month figures; fixture tests keep them aligned.
- Rates depend on `GOOGLEFINANCE` being available.
- A future layout change needs a new script, not an in-app migration. The version tag protects stale apps.
- Account currencies are fixed once set; changing one reinterprets its history.
- Drift between the card's rate and the market rate is absorbed by snapshots.
- Rollover and per-month budgets are gone until wanted.

## 10. Out of scope

Editing reference lists in the app, Sankey, notifications, per-coin crypto holdings, business accounting
(the two business accounts are tracked only as assets), a second storage backend.
