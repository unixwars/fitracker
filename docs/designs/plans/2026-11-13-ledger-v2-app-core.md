# Ledger v2, app core: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Models:** implementers run on Sonnet. Opus is reserved for reviews of the correctness-critical tasks, marked `Review: Opus` below (the owner's rule). Work on a feature branch `feat/ledger-v2-app` cut from `feat/ledger-v2-data`; one commit per task.

**Goal:** The app reads and writes the multi-year `Ledger` and `Snapshots`, links one spreadsheet, converts with `Rates`, honours the `In Monthly` ticks, offers "Create your sheet from the template", and drops the year flow and the migration framework.

**Architecture:** `schema.ts` maps the v3 tabs once. New pure modules (`rates.ts`, `reference.ts`, `ratesMaintenance.ts`, row parsers in `rows.ts`) feed one `EntryStore` adapter (`sheets/ledgerStore.ts`) that does one `batchGet` per refresh and writes `Ledger` A-I, `Snapshots` and the `Rates` month-roll. The outbox and replayer keep their design with the year removed and a snapshot subject added. Old and new code coexist until Task 27 deletes the old.

**Tech Stack:** Svelte 5, TypeScript, Vite, Vitest, Playwright, Sheets API v4, Google Identity Services, Picker, Drive `files.copy`. No new dependency.

**Spec:** `docs/designs/specs/2026-11-12-fitracker-ledger-v2-design.md` (rev 4, sections 2, 3, 4, 6, 7, 8). Template: `template/build-template.gs`, `template/README.md`. Previous plan: `docs/designs/plans/2026-11-12-ledger-v2-data-first.md`.

Not in this plan (later plans): the Accounts screen with snapshots, drift and performance, `balanceAt` (sub-project 3); earlier-year imports. Snapshot read and write, and the snapshot outbox operation, ARE here (Tasks 3, 13, 16, 17) but have no screen yet.

## Open spikes

Spike steps are in `docs/designs/spikes/2026-11-12-ledger-v2-spikes.md`; S5 has a harness page `docs/designs/spikes/s5-picker-copy.html`. Before each fork task read the `**Result:**` line of its spike. Every fork task names the branch it implements by default and carries the other as a marked **Alternative**.

| Spike | Question | Fork it controls |
| --- | --- | --- |
| S1 | `values:append` with `insertDataOption=INSERT_ROWS` on `Ledger!A:I` lands rows after the last non-empty row, around a cleared gap and a hand-typed row, with two concurrent appends | Task 11. **Branch A (S1 pass, implemented):** append, read back from `updatedRange`. **Alternative (S1 fail):** keep find-free-row by id (`findFreeRow`, explicit `valuesBatchUpdate` rows, `TabFull`). |
| S2 | The API reads the current-month rate cell (`GOOGLEFINANCE`) as a number and `Ledger!J` as numbers | Task 14 (no code fork: a non-numeric current cell is never frozen and `rateFor` falls back to the latest earlier numeric row, tested). Task 15. **Branch A (J readable, implemented):** read `Ledger!A2:J` and prefer the sheet's base amount. **Alternative (J unreadable):** skip Task 15; the app already computes every base amount from `Rates` (Task 2), which is the path pending (unsynced) entries use anyway. |
| S3 | Summary tabs recalculate fast on 10k rows | No app impact. The app only grows its refresh interval with the ledger (Task 9). |
| S5 | Picker with the template id preselected, then `files.copy`, with only `drive.file` | Tasks 25 and 26. **Branch A (S5 pass, implemented):** Picker preselects the template, `files.copy`, link the copy. **Alternative (S5 fail):** open the template's `/copy` URL in a new tab, then the user links their copy with the Picker; no Drive API call. |

S4 (template build) is a prerequisite of the live checklist (Task 32), not of any code task.

## Global Constraints

From the spec (verbatim) and `AGENTS.md`. Every task includes these.

- "The app writes only `Ledger` columns A-I, `Snapshots`, and the `Rates` maintenance rows. Never `J`, never a view or other reference tab."
- "Rows are found by the hidden id, never by row number."
- "No formula may pass a multi-cell range as a `SUMIFS`, `COUNTIFS`, `SUMIF` or `COUNTIF` criterion."
- "Money is integer minor units in the app, read with `UNFORMATTED_VALUE`."
- "Drift threshold is the constant 10 in base currency: below it the app accepts silently, at or above it flags the difference when a balance is set. No adjustment entry is created or stored." (used by sub-project 3, not here)
- "The Add form takes its currency from the chosen account. A different input currency triggers a warning; on override the app converts with the entry month's `Rates` row and stores the converted amount (no note added)."
- "A newer version tag than the app: read-only with an "update the app" notice. Unrecognised layout: abort before any write."
- "Version tag fallback: when the metadata is missing but the `Ledger` and `Snapshots` headers match the v3 layout, the app stamps `fitracker.schemaVersion` = 3 itself (one write)."
- "An account has exactly one currency; an entry's amount is in its account's currency."
- "Amounts are always positive; a refund is income (the `Refund` category)"; "a negative amount is a flagged error".
- "Appends use `values:append` with `insertDataOption=INSERT_ROWS` on `Ledger!A:I` and read back from the response's `updatedRange`. Before re-sending an unacknowledged add, the outbox looks the id up (as today), because append is not idempotent."
- "A delete clears A to I of the located row (the row stays; no shifting). Edits locate the row by id: read column A first, then the single row."
- "Rows typed by hand without an id get one from the app on refresh. After writing, the app reads the cell back and adopts the value the sheet holds, so two devices cannot disagree."
- "A row the app cannot parse (text date or amount, unknown account) gets no id and appears in Needs attention as "row not understood"."
- `Ledger` columns: A id (hidden), B date (serial), C type (`expense`, `income`, `transfer`), D amount, E place, F description, G category, H account (source for a transfer), I to-account, J base amount (array formula in `J2`).
- "On the first refresh in a new month the app writes the closed month's row as a value and appends the new month's row with the formula ... Concurrent devices may both try; the app re-reads and skips if the month row already exists."
- "Unchanged: a repeat purchase takes at most 3 interactions and a new one at most 5; offline-first; no server."
- Repo rules: pure logic in `src/lib` with a `.test.ts` beside it, test first; one column mapping in `schema.ts`; one data seam `EntryStore`; all user-facing text in `src/lib/messages.ts`; secrets and env names in `.env.example`; no new dependency without a reason; `drive.file` scope only; destructive actions warn first and are undoable; English everywhere; do not reformat; no attribution lines in commits.

## Review Focus

Most likely first. Each line is pinned by a test in the named task.

1. **Ids backfilled twice** (two devices, or two concurrent refreshes on one device, both writing an id into a hand-typed row): one write per device, and each adopts the id the sheet holds after reading back. Task 10.
2. **No rate for a month** (no `Rates` row on or before the entry's month, blank cell, or the live current cell unreadable): never counted as 0 silently; the month screen lists the currency, the add form refuses to convert. Tasks 2, 19, 20.
3. **An entry whose currency differs from its account's**: at entry time a warning and explicit override (Task 19); at replay time, if the sheet's account currency changed or the account was renamed, the op is flagged `AccountChanged`, never written with a wrong currency. Tasks 11, 12, 17.
4. **First refresh of a new month on two devices**: both may plan the roll; the re-read skips the append, the closed row is frozen at most once with a numeric value, a typed value is never overwritten. Tasks 5, 14.
5. **A hand-typed row the app does not understand** (text date, negative or zero amount, unknown account or destination, unknown type): listed under Needs attention as "row not understood", gets no id, is excluded from totals, never blocks the other rows. Tasks 3, 9, 23.

---

## Phase A: additive modules (the existing app keeps working and every task is green)

### Task 1: Domain types and the v3 schema

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/schema.ts` (add, keep every existing export)
- Create: `src/lib/schema.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Account = { name: string; currency: Currency; active: boolean; inMonthly: boolean; inAnnual: boolean }`; `Category = { name: string; type: 'expense' | 'income'; active: boolean }`; `Budget = { year: number; type: 'expense' | 'income'; category: string; monthly: number }` (minor units, base currency); `Reference = { base: Currency; accounts: Account[]; categories: Category[]; budgets: Budget[] }`; `RateRow = { month: string; GBP: number | null; USD: number | null }` (`month` is `YYYY-MM-01`, values are the base-currency value of one unit); `Snapshot = { id: string; date: string; account: string; balance: Money; note: string }`; `UnreadableReason = 'date' | 'amount' | 'type' | 'account' | 'toAccount'`; `Unreadable = { tab: 'Ledger' | 'Snapshots'; row: number; reason: UnreadableReason; text: string }`. The old `Lists` stays until Task 27.
- Produces (`schema.ts`): `BOOK_VERSION = 3`; `LEDGER = { tab: 'Ledger', firstRow: 2, lastRow: 1000, headers: string[10], cols: { id: 'A', date: 'B', type: 'C', amount: 'D', place: 'E', description: 'F', category: 'G', account: 'H', toAccount: 'I', base: 'J' }, ranges: { rows: 'Ledger!A2:I', rowsWithBase: 'Ledger!A2:J', ids: 'Ledger!A2:A', header: 'Ledger!A1:J1', append: 'Ledger!A:I' } }`; `SNAPSHOTS = { tab: 'Snapshots', firstRow: 2, headers: string[5], ranges: { rows: 'Snapshots!A2:E', ids: 'Snapshots!A2:A', header: 'Snapshots!A1:E1', append: 'Snapshots!A:E' } }`; `REFERENCE = { base: 'Settings!B1', accounts: 'Accounts!A2:E', categories: 'Categories!A2:C', budgets: 'Budgets!A2:D' }`; `RATES = { tab: 'Rates', ranges: { rows: 'Rates!A2:C', months: 'Rates!A2:A' } }`; `rowRange(tab: string, row: number, lastCol: string): string` (`Ledger!A7:I7`); `rateFormula(currency: 'GBP' | 'USD', base: Currency): string` (`=GOOGLEFINANCE("CURRENCY:GBPEUR")`). `META_KEY` is reused.

- [ ] **Step 1: Write the failing test** `src/lib/schema.test.ts`: `rowRange('Ledger', 7, 'I') === 'Ledger!A7:I7'`; `rateFormula('GBP','EUR') === '=GOOGLEFINANCE("CURRENCY:GBPEUR")'`; `LEDGER.headers` has 10 entries and `LEDGER.ranges.rows === 'Ledger!A2:I'`; and `test('headers equal the template script')` reads `template/build-template.gs` with `node:fs`, extracts the `HEADERS` object with a regex and asserts `LEDGER.headers`, `SNAPSHOTS.headers` equal its `LEDGER` and `SNAPSHOTS` arrays, and that its `SCHEMA_VERSION = '3'` equals `String(BOOK_VERSION)`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/schema.test.ts`. Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the types and constants above. The headers are copied from the template script's `HEADERS` (`id, date, type, amount, place, description, category, account, to_account, base_amount` and `id, date, account, balance, note`).
- [ ] **Step 4: Run** `pnpm exec vitest run && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: v3 schema constants and domain types`.

### Task 2: Rate lookup and conversion

**Files:**
- Create: `src/lib/rates.ts`, `src/lib/rates.test.ts`

**Interfaces:**
- Consumes: `RateRow`, `Money`, `Currency`; `convert(m, to, rates)` from `money.ts`.
- Produces: `rateFor(rates: RateRow[], currency: Currency, base: Currency, month: string): number | null` (`month` is `YYYY-MM`; base returns 1; otherwise the value of the latest row whose month is on or before `month` and holds a finite number for that currency, else null); `convertMoney(m: Money, to: Currency, rates: RateRow[], base: Currency, month: string): Money | null` (null when either rate is missing; rounds half away from zero via `convert`); `toBase(m: Money, rates: RateRow[], base: Currency, month: string): Money | null`.

- [ ] **Step 1: Write the failing tests** (rows `2026-09-01` GBP 1.15; `2026-10-01` GBP 1.16 USD 0.93; `2026-11-01` GBP null USD 0.94):
  - `rateFor(rows,'GBP','EUR','2026-10') === 1.16`; `'2026-12'` (no December row) returns the November row's... GBP is null there, so `1.16` (latest numeric on or before); `'2026-08'` returns `null`; `rateFor(rows,'EUR','EUR','2026-10') === 1`.
  - `toBase({minor:1000,currency:'GBP'}, rows,'EUR','2026-10')` equals `{minor:1160,currency:'EUR'}`; a GBP amount in `2026-11` uses 1.16 (blank current cell falls back, Review Focus 2); `toBase` of USD in `2026-08` is `null`.
  - `convertMoney({minor:1000,currency:'GBP'},'USD',rows,'EUR','2026-10')` equals `{minor:1247,currency:'USD'}` (1000 x 1.16 / 0.93, half away from zero).
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/rates.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three functions; `convertMoney` builds a `Record<Currency, number>` from `rateFor` and delegates to `convert`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: rate lookup and conversion`.

### Task 3: Ledger and snapshot row codecs

**Review: Opus**

**Files:**
- Modify: `src/lib/rows.ts` (add; keep old exports), `src/lib/rows.test.ts`

**Interfaces:**
- Consumes: `Account`, `Snapshot`, `UnreadableReason`, `LEDGER`, `toMinor`, `toSheetNumber`, `serialToDate`, `dateToSerial`.
- Produces: `type RowResult<T> = { value: T } | { skip: true } | { reason: UnreadableReason; text: string }`; `parseLedgerRow(row: unknown[], accounts: Account[]): RowResult<Entry>` (a fully empty A-I row is `skip`; `entry.id` is `''` when column A is empty; `money.currency` is the account's currency); `ledgerRowValues(e: Entry): unknown[]` (nine values A to I, amount via `toSheetNumber`, date as serial, `''` for unused fields); `parseSnapshotRow(row: unknown[], accounts: Account[]): RowResult<Snapshot>`; `snapshotRowValues(s: Snapshot): unknown[]` (five values). `Entry` gains no field yet.

- [ ] **Step 1: Write the failing tests** (accounts `Joint` EUR, `Cash GBP` GBP):
  - `parses an expense row`: `['id1',45292,'expense',12.5,'Shop','Milk','Groceries','Joint']` gives value `{id:'id1',kind:'expense',date:'2024-01-01',money:{minor:1250,currency:'EUR'},place:'Shop',description:'Milk',category:'Groceries',account:'Joint'}`.
  - `takes the currency from the account`: the same row with `Cash GBP` gives `currency 'GBP'`.
  - `a transfer needs a known different destination`: `...'transfer',5,'','','', 'Joint','Joint'` gives `{reason:'toAccount'}`; unknown destination gives `toAccount`.
  - Reasons (Review Focus 5): text date `date`; text amount `'ten'`, `-5`, `0` all `amount`; type `'spend'` `type`; unknown account `account`; empty row `{skip:true}`; a row with only column J content is `skip`.
  - `a missing id parses with id ''`.
  - `ledgerRowValues round-trips through parseLedgerRow` for expense, income, transfer; `'=1+1'` description stays the literal string; description with leading `'` is untouched.
  - Snapshot: `parseSnapshotRow(['s1',45292,'Cash GBP',100.25,'note'])` gives `balance {minor:10025,currency:'GBP'}`; unknown account `account`; text balance `amount` (zero and negative balances ARE valid: a snapshot may be 0 or overdrawn); round trip via `snapshotRowValues`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/rows.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the four functions. Trim text cells; match account names exactly after trim, first listed wins; `date` must be a finite number, floored; `text` in a failure is the row's description or place for display.
- [ ] **Step 4: Run** the file. Expected: PASS (old tests still pass).
- [ ] **Step 5: Commit** `feat: ledger and snapshot row codecs`.

### Task 4: Reference and rates sheet parsers

**Files:**
- Create: `src/lib/reference.ts`, `src/lib/reference.test.ts`

**Interfaces:**
- Consumes: `Reference`, `RateRow`, `toMinor`, `serialToDate`, `REFERENCE`.
- Produces: `parseReference(base: unknown[][], accounts: unknown[][], categories: unknown[][], budgets: unknown[][]): Reference`; `parseRates(rows: unknown[][]): RateRow[]` (sorted ascending by month; a month is `serialToDate(n)` forced to the first of the month).

- [ ] **Step 1: Write the failing tests:**
  - `base defaults to EUR` for an empty or invalid `Settings!B1`; `GBP` is accepted.
  - Accounts: `[['Joint','EUR',true,true,false]]` gives `{name:'Joint',currency:'EUR',active:true,inMonthly:true,inAnnual:false}`; a row without a name or with currency `JPY` is skipped; unticked boxes (a new row) parse as false; blank cells as false.
  - Categories: `['Other','income',true]`, `['Other','expense',false]` both kept (keyed by type and name); an unknown type is skipped.
  - Budgets: `[2026,'expense','Groceries',250]` gives `monthly: 25000`; a text amount is skipped.
  - `parseRates`: `[[46296,1.16,0.93],[46265,1.15,'']]` returns two rows sorted ascending with `USD: null` for the blank; a non-numeric month is skipped; a formula error string (`'#N/A'`) is `null`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/reference.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: parse reference tabs and rates`.

### Task 5: Rates month-roll plan

**Review: Opus**

**Files:**
- Create: `src/lib/ratesMaintenance.ts`, `src/lib/ratesMaintenance.test.ts`

**Interfaces:**
- Consumes: `RATES`, `rateFormula`, `Currency`.
- Produces: `type RateCell = { value: number | null; formula: string | null }`; `type RateCellRow = { row: number; month: string; GBP: RateCell; USD: RateCell }` (`row` is the sheet row); `type RatesPlan = { freeze: { row: number; values: Partial<Record<'GBP' | 'USD', number>> } | null; append: { row: number; month: string; formulas: { GBP: string; USD: string } } | null }`; `planRatesMaintenance(rows: RateCellRow[], today: string, base: Currency): RatesPlan`.

- [ ] **Step 1: Write the failing tests** (`today = '2026-11-12'`):
  - `new month: freezes the closed row and appends`: rows `2026-10-01` with formulas and values 1.16 / 0.93 at row 8 gives `freeze {row:8, values:{GBP:1.16,USD:0.93}}` and `append {row:9, month:'2026-11-01', formulas: the two rateFormula strings}`.
  - `month row already present: no append`, and a formula-free closed row gives `freeze null`.
  - `a typed (non-formula) value is never frozen or overwritten`.
  - `a formula cell without a numeric value is not frozen` (S2 fallback) but the append still happens.
  - `empty table` appends at row 2.
  - `gap of several months`: the last row (August, formulas) is frozen, only November is appended.
  - `a later-dated row than today` (clock skew) gives an empty plan.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/ratesMaintenance.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `planRatesMaintenance`: `thisMonth = today.slice(0,7)+'-01'`; the freeze target is the last row with `month < thisMonth`; append goes at `lastRow.row + 1` (or 2) unless a row with `thisMonth` exists.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: plan the rates month-roll`.

### Task 6: SheetsApi additions

**Files:**
- Modify: `src/lib/sheets/types.ts`, `src/lib/sheets/api.ts`, `src/lib/sheets/api.test.ts`

**Interfaces:**
- Produces (added to `SheetsApi`, existing methods kept): `valuesAppend(spreadsheetId: string, range: string, values: unknown[][]): Promise<{ updatedRange: string }>` (RAW, `insertDataOption=INSERT_ROWS`); `setMetadata(spreadsheetId: string, key: string, value: string): Promise<void>` (create or update the DOCUMENT developer metadata); `valuesBatchUpdate(spreadsheetId, data, input?: 'RAW' | 'USER_ENTERED')` (default `'RAW'`).

- [ ] **Step 1: Write the failing tests** with the injected `fetchImpl` used in the existing `api.test.ts`:
  - `valuesAppend` POSTs `.../values/Ledger!A%3AI:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS` with `{values}` and returns `updates.updatedRange` from the response.
  - `valuesBatchUpdate(..., 'USER_ENTERED')` sends `valueInputOption: 'USER_ENTERED'`; the default stays `RAW`.
  - `setMetadata` creates when `developerMetadata:search` finds nothing and updates when it finds one.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/sheets/api.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `api.ts`; verify the URL shape and the response field against Google's reference, not memory. Mock-only fakes get the new members in Task 7.
- [ ] **Step 4: Run** `pnpm exec vitest run src/lib/sheets/api.test.ts`. Expected: PASS. (`pnpm typecheck` fails on the fake until Task 7; run Task 7 next, they ship consecutively.)
- [ ] **Step 5: Commit** `feat: sheets api append and metadata`.

### Task 7: Fake Sheets API and fixtures on the v3 layout

**Review: Opus**

**Files:**
- Modify: `src/lib/sheets/fakeSheets.ts`, `src/lib/sheets/fixtures.ts`
- Create: `src/lib/sheets/fakeSheets.test.ts`

**Interfaces:**
- Consumes: the Task 6 `SheetsApi` members; `LEDGER`, `SNAPSHOTS`, `BOOK_VERSION`, `ledgerRowValues`, `snapshotRowValues`.
- Produces: fake `valuesAppend` (the row is last non-empty row of the range's columns plus one, minimum 2; returns `updatedRange` like `Ledger!A5:I7`); fake `valuesBatchUpdate(..., 'USER_ENTERED')` storing `=GOOGLEFINANCE("CURRENCY:XXXYYY")` as `{ f, v: liveRates[XXX] }`; `setMetadata`; `FakeSheets.liveRates: Record<string, number>` (default GBP 1.17, USD 0.94); `FakeSheets.beforeNextWrite(fn: () => void): void` (the hook that simulates a competing device before our write). Fixtures: `DEFAULT_REFERENCE: Reference` (accounts `Joint` EUR, `M-Cash` EUR, `T-Cash` GBP all ticked and active; categories Business, Groceries, Bills, Recreation (expense), Paycheck, Interest (income); budgets for the current year) and `seedLedger(fake: FakeSheets, id: string, opts?: { reference?: Reference; entries?: Entry[]; snapshots?: Snapshot[]; rates?: { month: string; GBP: number; USD: number }[]; metadata?: boolean; today?: string }): void` (writes the headers, a `J2` array-formula cell, reference tabs, `Rates` rows with the current month's row as formula cells, entries from row 2, the version tag unless `metadata: false`). `seedV2`, `seedV0` stay until Task 27.

- [ ] **Step 1: Write the failing test** `fakeSheets.test.ts` (the semantics S1 will confirm live):
  - `append lands after the last non-empty row`: 20 rows, rows 8 and 9 cleared in the middle: the next append is row 22; a cleared LAST row is reused.
  - `three rows are consecutive` and `updatedRange` is `Ledger!A22:I24`.
  - `two concurrent appends use different rows` (`Promise.all`).
  - `a hand-typed row below the table is respected`: write row 25 directly, then append: row 26.
  - `column J does not count` (the `J2` formula cell and a value in J30 do not move the table end).
  - `seedLedger writes the version tag and a current-month Rates formula whose value is liveRates.GBP`; `beforeNextWrite` runs before the write lands, `afterNextWrite` after.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/sheets/fakeSheets.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the fake members and `seedLedger`.
- [ ] **Step 4: Run** `pnpm exec vitest run && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `test: fake sheets and fixtures on the ledger layout`.

### Task 8: Version guard

**Review: Opus**

**Files:**
- Create: `src/lib/sheets/version.ts`, `src/lib/sheets/version.test.ts`

**Interfaces:**
- Consumes: `SheetsApi.getMetadata/batchGet/setMetadata`, `META_KEY`, `BOOK_VERSION`, `LEDGER.ranges.header`, `SNAPSHOTS.ranges.header`, `NewerThanApp`, `UnrecognisedLayout` from `errors.ts`.
- Produces: `ensureVersion(api: SheetsApi, spreadsheetId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests** using `seedLedger`:
  - tag 3: resolves and makes no write.
  - tag 4: throws `NewerThanApp(4)`; tag 2 or a non-integer: `UnrecognisedLayout`.
  - `lost tag, matching headers`: `seedLedger(..., { metadata: false })` resolves, calls `setMetadata` exactly once with `('fitracker.schemaVersion','3')`.
  - `lost tag, headers differ` (a legacy yearly sheet: `Expenses` tab, no `Ledger`): throws `UnrecognisedLayout` and `fake.count('setMetadata') === 0` and no value write happened (abort before any write).
  - header comparison trims and is case-sensitive on the exact template strings.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/sheets/version.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `ensureVersion`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: schema version guard with the lost-tag fallback`.

### Task 9: Ledger store, read path

**Review: Opus**

**Files:**
- Modify: `src/lib/store.ts` (add `LedgerStore`, keep `EntryStore`), `src/lib/errors.ts` (add `AccountChanged`)
- Create: `src/lib/sheets/ledgerStore.ts`, `src/lib/sheets/ledgerStore.read.test.ts`, `src/lib/refresh.ts`, `src/lib/refresh.test.ts`

**Interfaces:**
- Produces (`store.ts`): `type AddResult = { id: string; ok: boolean; reason?: 'AccountChanged' | 'TabFull' }` (the existing type gains the first reason); `interface LedgerStore { list(): Promise<Entry[]>; lists(): Promise<Reference>; rates(): Promise<RateRow[]>; snapshots(): Promise<Snapshot[]>; unreadable(): Promise<Unreadable[]>; addMany(entries: Entry[]): Promise<AddResult[]>; edit(entry: Entry, expectedPrevious?: Entry): Promise<{ previous: Entry }>; delete(id: string, expectedPrevious?: Entry): Promise<{ previous: Entry }>; addSnapshot(s: Snapshot): Promise<AddResult>; deleteSnapshot(id: string): Promise<{ previous: Snapshot }>; maintainRates(today: string): Promise<void>; refresh(opts?: RefreshOpts): Promise<{ missingIds: string[] }>; subscribe(fn: () => void): () => void }` (Task 27 renames `LedgerStore` to `EntryStore`). `errors.ts`: `class AccountChanged extends AppError` (`constructor(public id: string)`).
- Produces: `createLedgerStore(api: SheetsApi, spreadsheetId: string, options?: StoreOptions): LedgerStore & { _internals: Internals }` with `StoreOptions = { now?: () => number; newId?: () => string; ttlMs?: number }`; `refreshInterval(rowCount: number): number` in `refresh.ts` (`clamp(15_000 + 5 * rowCount, 15_000, 120_000)` ms; the grown interval is an assumption, S3 gives no app number).
- Method bodies for the write methods throw `new Error('not implemented')` here; Tasks 10 to 14 fill them.

- [ ] **Step 1: Write the failing tests** (`refresh.test.ts`: `refreshInterval(0) === 15000`, `(10000) === 65000`, `(1e6) === 120000`; read tests with `seedLedger`):
  - `one batchGet reads ledger, settings, accounts, categories, budgets, rates and snapshots`: after `list()`, `lists()`, `rates()`, `snapshots()`: `fake.count('batchGet') === 1` (plus `getMetadata` once).
  - `entries carry the account's currency` and `lists().base` is the Settings value.
  - `unreadable rows are reported, not listed` (Review Focus 5): rows with text date, `-5`, unknown account, unknown type appear in `unreadable()` with their sheet row numbers and `tab:'Ledger'`; the good rows are in `list()`.
  - `a cleared gap and a blank row are skipped silently`.
  - cache: a second `list()` within the interval does not re-read; `refresh({force:true})` does; concurrent `list()` calls share one fetch.
  - `refresh({expectIds})` reports ids absent from both tabs in `missingIds`.
  - a tag-4 sheet rejects with `NewerThanApp`; a legacy sheet with `UnrecognisedLayout` before any value read of the Ledger.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/sheets/ledgerStore.read.test.ts src/lib/refresh.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `createLedgerStore` read path: `ensureVersion` memoised for five minutes, `fetch` = one `batchGet([LEDGER.ranges.rows, REFERENCE.base, REFERENCE.accounts, REFERENCE.categories, REFERENCE.budgets, RATES.ranges.rows, SNAPSHOTS.ranges.rows], 'UNFORMATTED_VALUE')`, parse with Tasks 3 and 4, an in-flight map, a `rows: Map<string, {tab; row}>` for ids, `markDirty`, `subscribe`. The TTL is `options.ttlMs ?? refreshInterval(entries.length)`.
- [ ] **Step 4: Run** the two files, then `pnpm exec vitest run && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: ledger store read path`.

### Task 10: Id backfill with read-back

**Review: Opus**

**Files:**
- Modify: `src/lib/sheets/ledgerStore.ts`
- Create: `src/lib/sheets/ledgerStore.backfill.test.ts`

**Interfaces:**
- Consumes: Task 9 store; `newId` option.
- Produces: no new public signature; `list()` and `snapshots()` now return rows with ids that the sheet holds.

- [ ] **Step 1: Write the failing tests:**
  - `a hand-typed row without an id gets one`: after `list()`, `Ledger!A{row}` holds the generated id, written with one `valuesBatchUpdate` that touches only column A cells (assert every written range matches `/^Ledger!A\d+$/` or `Snapshots!A\d+`); the same for a snapshot row.
  - `two concurrent refreshes backfill once` (`Promise.all([store.list(), store.list()])`: one write call, Review Focus 1).
  - `two devices adopt the same id`: store 1 and store 2 (`newId` returns `'dev1'` / `'dev2'`) on one fake book; device 2's write lands between device 1's write and its read-back (`afterNextWrite`): both end with the value the sheet holds (`dev2`), and `list()` on each returns that id, never `dev1`.
  - `rows that already have ids are not rewritten`; `unreadable rows get no id` (A stays empty).
  - `never writes column J` over all calls.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/sheets/ledgerStore.backfill.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**: collect parseable id-less rows, write A cells in one `valuesBatchUpdate`, read `LEDGER.ranges.ids` and `SNAPSHOTS.ranges.ids` back and re-key entries, snapshots and the `rows` map to the sheet's values (an empty read-back cell leaves the entry without an id and unusable: drop it from the lists and keep it for the next refresh).
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: backfill ids and adopt the sheet's value`.

### Task 11: Add entries by append (S1)

**Review: Opus**

**Files:**
- Modify: `src/lib/sheets/ledgerStore.ts`
- Create: `src/lib/sheets/ledgerStore.write.test.ts`

**Interfaces:**
- Consumes: `ledgerRowValues`, `SheetsApi.valuesAppend`, `AccountChanged`-reason in `AddResult`.
- Produces: `addMany(entries: Entry[]): Promise<AddResult[]>`.

Implements **Branch A (S1 pass)**. If the S1 result is FAIL, do the **Alternative** step 3b instead of 3 and keep `findFreeRow` and `TabFull`.

- [ ] **Step 1: Write the failing tests:**
  - `appends three entries with one read and one append`: counts `batchGet` 2 (ids and accounts before, read-back of `updatedRange` after), `valuesAppend` 1, `valuesBatchUpdate` 0; ids land in consecutive rows after the last non-empty row, around a cleared gap.
  - `an id already in the sheet is not appended again` (resend after an unacknowledged add), result `ok: true`.
  - `hostile text is stored literally` (`'=HYPERLINK("x")'` in description reads back the same; RAW input).
  - `never writes J` and `writes only A-I` (ranges from `valuesAppend` args equal `Ledger!A:I`).
  - `currency mismatch is refused` (Review Focus 3): an entry with `currency 'GBP'` on account `Joint` (EUR) returns `{ok:false, reason:'AccountChanged'}` and nothing is appended; an unknown account is the same.
  - `read-back verifies ids`: if the fake overwrites the appended row between append and read-back (`afterNextWrite`), the entry is retried (at most 3 attempts) and ends `ok` on a new row, never twice.
  - `a hand-typed row below the table does not get overwritten`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/sheets/ledgerStore.write.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `addMany`: dedupe by id; one `batchGet([LEDGER.ranges.ids, REFERENCE.accounts])`; drop present ids; refuse mismatches; `valuesAppend(LEDGER.ranges.append, rows.map(ledgerRowValues))`; parse `updatedRange` with `parseRange` and read those ids back; retry the entries that did not land; `markDirty`. **Step 3b (Alternative, S1 fail):** instead place each row with `findFreeRow(ids, dates, amounts, descriptions)` (adapt the existing helper to the Ledger columns B, D, F and `LEDGER.lastRow`), write `LEDGER` rows with `valuesBatchUpdate`, read column A back to confirm, and return `reason: 'TabFull'` past `LEDGER.lastRow`.
- [ ] **Step 4: Run** the file and `pnpm exec vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add entries with values:append`.

### Task 12: Edit and delete by id

**Review: Opus**

**Files:**
- Modify: `src/lib/sheets/ledgerStore.ts`, `src/lib/sheets/ledgerStore.write.test.ts`

**Interfaces:**
- Produces: `edit(entry: Entry, expectedPrevious?: Entry): Promise<{ previous: Entry }>`; `delete(id: string, expectedPrevious?: Entry): Promise<{ previous: Entry }>`. Throws `RowGone`, `RowChanged`, `AccountChanged` (from `errors.ts`).

- [ ] **Step 1: Write the failing tests:**
  - `edit locates by column A, then reads the single row`: two sequential `batchGet` calls (ids; then `Ledger!A{r}:I{r}` with accounts), then one `valuesBatchUpdate` of exactly `Ledger!A{r}:I{r}`; the other rows are untouched; returns `previous` as the row held it.
  - `rows shifted by a sort are found by id` (swap rows 2 and 3 in the fake before the edit).
  - `a missing id throws RowGone`; `a row whose date, amount and text all differ from expectedPrevious throws RowChanged` (the existing `looksSame` rule: at least two of date, amount, text agree); `an unreadable row` throws `RowChanged`.
  - `delete clears A:I of the row in one range and keeps the row` (`Ledger!A{r}:I{r}` cleared, row count unchanged, J untouched) and returns `previous`.
  - `edit to an account of another currency` throws `AccountChanged` and writes nothing (Review Focus 3).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** a private `locate(id, expectedPrevious)` returning `{ row, previous }`; `edit` and `delete` use it; both `markDirty`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: edit and delete ledger rows by id`.

### Task 13: Snapshot writes

**Review: Opus**

**Files:**
- Modify: `src/lib/sheets/ledgerStore.ts`
- Create: `src/lib/sheets/ledgerStore.snapshots.test.ts`

**Interfaces:**
- Produces: `addSnapshot(s: Snapshot): Promise<AddResult>`; `deleteSnapshot(id: string): Promise<{ previous: Snapshot }>`.

- [ ] **Step 1: Write the failing tests:**
  - `addSnapshot appends A-E to Snapshots` (`valuesAppend` range `Snapshots!A:E`, values `[id, serial, account, balance as number, note]`), reads the id back, returns `ok`.
  - `an id already present is ok without a second append`.
  - `a balance whose currency differs from the account's` returns `{ok:false, reason:'AccountChanged'}`; zero and negative balances are accepted.
  - `deleteSnapshot clears A:E of the located row` and returns the previous snapshot; a missing id throws `RowGone`.
  - `two snapshots of one account on one date are both kept` (last row wins is a balance rule, sub-project 3); `snapshots()` returns them in sheet order.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/sheets/ledgerStore.snapshots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both methods with the same locate-by-column-A pattern on `SNAPSHOTS.ranges.ids`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: snapshot rows in the store`.

### Task 14: Rates month-roll in the store (S2)

**Review: Opus**

**Files:**
- Modify: `src/lib/sheets/ledgerStore.ts`
- Create: `src/lib/sheets/ledgerStore.rates.test.ts`

**Interfaces:**
- Consumes: `planRatesMaintenance` (Task 5), `valuesBatchUpdate(..., 'USER_ENTERED')`, `RATES`, `serialToDate`/`dateToSerial`.
- Produces: `maintainRates(today: string): Promise<void>`; the store remembers the last month it handled and does nothing the second time.

- [ ] **Step 1: Write the failing tests** (`seedLedger` with an October formula row, today in November):
  - `freezes the closed month and appends the new one`: one `valuesBatchUpdate` with `USER_ENTERED`; `Rates!B{r}`/`C{r}` become numbers equal to the values read; the new row holds the month serial and the two `GOOGLEFINANCE` formulas; after `rates()` the November row is numeric (fake evaluates the formula).
  - `a second device that finds the month row after the re-read skips the append` (`beforeNextWrite` appends the November row; Review Focus 4): no second row, no duplicate month.
  - `the freeze never overwrites a typed value` and `a formula cell that reads as non-numeric is left alone` (S2 fallback), while `rateFor` still resolves the month from the earlier numeric row.
  - `the same month is handled once per store`; `an empty Rates tab` gets the current month at row 2; only `Rates!` ranges are ever written.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/sheets/ledgerStore.rates.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `maintainRates`: read `RATES.ranges.rows` with `'FORMULA'` and with `'UNFORMATTED_VALUE'` (two calls, merged into `RateCellRow[]`), plan, re-read `RATES.ranges.months`, drop the append if the month now exists, then one `valuesBatchUpdate(..., 'USER_ENTERED')`; `markDirty`. S2 PASS means the live cell reads as a number so the freeze happens; the S2-FAIL behaviour needs no other code (see the spike table).
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: rates month-roll`.

### Task 15: Prefer the sheet's base amount (S2, `Ledger!J`)

**Files:**
- Modify: `src/lib/rows.ts`, `src/lib/rates.ts`, `src/lib/sheets/ledgerStore.ts`, `src/lib/rates.test.ts`, `src/lib/rows.test.ts`, `src/lib/sheets/ledgerStore.read.test.ts`

**Interfaces:**
- Produces: `Entry.baseMinor?: number` (base-currency minor units from column J; unset when J is not a number); `parseLedgerRow` reads index 9 when present; `baseOf(e: Entry, rates: RateRow[], base: Currency): Money | null` in `rates.ts` (`e.baseMinor` when set, else `toBase(e.money, rates, base, e.date.slice(0,7))`).

Implements **Branch A (J readable)**. **Alternative (J unreadable per S2): skip this task entirely**; Task 20 then calls `toBase` directly and nothing else changes. If skipped, replace `baseOf` in Task 20's interfaces with `toBase`.

- [ ] **Step 1: Write the failing tests:** `parseLedgerRow` with J = 11.7 gives `baseMinor 1170`; J = `'#N/A'` or `''` gives `baseMinor` undefined; `baseOf` returns `{minor:1170,currency:'EUR'}` from J even when `Rates` has no row, and computes from `Rates` for an entry without J (a pending op); the store reads `LEDGER.ranges.rowsWithBase`.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement** as above; the store's read range changes to `rowsWithBase`; writes still use A-I only.
- [ ] **Step 4: Run** `pnpm exec vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: use the sheet's base amount when readable`.

---

## Phase B: cutover (Tasks 16 to 23)

The layout swap has no compiling midpoint: `pnpm typecheck` and `pnpm exec playwright test` go red at Task 16 (outbox signatures change under `app.svelte.ts`) and are green again at Task 23. After each of Tasks 16 to 22 the gate is `pnpm exec vitest run <the touched test files>` plus `pnpm exec vitest run` for everything outside `app.svelte.ts` and the screens; Task 23's gate is the full set (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`). Do not interleave other work.

### Task 16: Outbox without the year, with a snapshot subject

**Review: Opus**

**Files:**
- Modify: `src/lib/outbox.ts`, `src/lib/outboxDb.ts`, `src/lib/outbox.test.ts`, `src/lib/outboxDb.test.ts`

**Interfaces:**
- Produces: `OpReason = 'RowGone' | 'RowChanged' | 'AccountChanged' | 'Missing' | 'Other'` (plus `'TabFull'` only on the S1 Alternative); `Op = { opId: string; seq?: number; subject: 'entry' | 'snapshot'; entryId: string; type: OpType; entry?: Entry; previous?: Entry; snapshot?: Snapshot; previousSnapshot?: Snapshot; status: 'pending' | 'done' | 'flagged'; reason?: OpReason; undone?: boolean; attempts?: number; at: number }` (`entryId` holds the snapshot id for snapshot ops; `year` and `kind` are gone); `makeOp(type: OpType, entry: Entry, previous?: Entry): Op`; `makeSnapshotOp(type: 'add' | 'delete', snapshot: Snapshot): Op`; `applyPending(entries: Entry[], ops: Op[]): Entry[]` (ignores snapshot ops); `undo(op: Op): Op` (a snapshot add undoes to a snapshot delete, which clears the row; an entry op as before); `pendingCount(ops: Op[]): number` replaces `pendingForYear`. `createOutboxDb` opens version 2 and empties the `ops` store on upgrade (v0.1 ops belong to the dropped yearly layout; v0.1 had no users).

- [ ] **Step 1: Write the failing tests:** `makeOp('add', entry)` has `subject:'entry'`, no `year`; `applyPending` overlays an edit and a delete in `seq` order and ignores snapshot ops; `undo(makeSnapshotOp('add', s))` is a snapshot delete of the same id; `undo` of a done edit uses `previous`; `pendingCount`; outboxDb: a database created at version 1 with a legacy op reopens through `createOutboxDb` with `all()` empty (fake-indexeddb), and new ops put and read back with increasing `seq`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/outbox.test.ts src/lib/outboxDb.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes; `idb.open(name, 2)`; on upgrade delete the old `ops` store if it exists and create it fresh.
- [ ] **Step 4: Run** the two files. Expected: PASS (typecheck is red until Task 23, as announced).
- [ ] **Step 5: Commit** `feat: outbox without years, with snapshot operations`.

### Task 17: Replayer on the ledger store

**Review: Opus**

**Files:**
- Modify: `src/lib/replayer.ts`, `src/lib/replayer.test.ts`

**Interfaces:**
- Consumes: `LedgerStore` (Task 9), the Task 16 `Op`.
- Produces: `createReplayer(store: LedgerStore, db: OutboxDb, opts?: ReplayerOptions)` returning `{ onAuthExpired(fn), run(): Promise<void>, verify(): Promise<void> }` (`verify` loses its year argument). Consecutive entry adds travel in one `store.addMany`; edits call `store.edit(entry, previous)`, deletes `store.delete(entryId, previous)`; snapshot adds `store.addSnapshot(snapshot)`, snapshot deletes `store.deleteSnapshot(entryId)`, one op at a time. `RowGone` flags `RowGone`, `RowChanged` flags `RowChanged`, `AccountChanged` (thrown, or `AddResult.reason`) flags `AccountChanged`.

- [ ] **Step 1: Update and add tests** (keep the existing retry, lock, auth-expiry and attempts cases against the new signatures): `groups consecutive entry adds into one addMany call`; `a snapshot op between two entry adds splits the group and keeps order`; `an add result with reason AccountChanged flags the op` (Review Focus 3); `a thrown AccountChanged on edit flags it`; `snapshot delete of a missing row flags RowGone`; `verify() flags saved ledger and snapshot ids that are gone` (ids passed through `store.refresh({force:true, expectIds})`); a snapshot undo replays as a clear.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/replayer.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes; the retry, lock and `recordFailure` logic is unchanged.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: replayer on the ledger store`.

### Task 18: One linked sheet in the config

**Files:**
- Modify: `src/lib/config.ts`, `src/lib/config.test.ts`
- Delete: `src/lib/link.ts`

**Interfaces:**
- Produces: `createConfig(storage)` returning `{ getSheetId(): string | null; linkSheet(spreadsheetId: string): void; unlinkSheet(): void; getDevice(): DeviceSettings; setDevice(patch: Partial<DeviceSettings>): void }`; storage key `fitracker.sheet`; `DeviceSettings = { kind: Kind; places: KnownPlace[]; lastCategory: Record<string, string>; theme: Theme }` (the `currency` field is gone: the account decides). `isYear`, `yearOptions`, `getSheets` are deleted. Linking verification is `ensureVersion` (Task 8); `link.ts` and `WrongYear` go.

- [ ] **Step 1: Rewrite the tests:** link then `getSheetId()` returns the id; relinking replaces; `unlinkSheet()` returns null; a stored token or the old `fitracker.sheets` key is never read or written; device settings merge defaults and ignore a stale `currency` field in storage; storing only the sheet id and device settings (the only keys written are `fitracker.sheet` and `fitracker.device`).
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/config.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the config; delete `link.ts`.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: link one spreadsheet`.

### Task 19: Add form rules (account chip sets the currency)

**Review: Opus**

**Files:**
- Modify: `src/lib/addForm.ts`, `src/lib/addForm.test.ts`, `src/lib/predict.ts`, `src/lib/predict.test.ts`

**Interfaces:**
- Consumes: `Reference`, `RateRow`, `convertMoney`, `DeviceSettings` (Task 18).
- Produces: `FormState` gains `convertConfirmed: boolean` (no other new field; `currency` stays as the input currency); `categoriesFor(kind: Kind, ref: Reference): string[]` (active categories of that type, in sheet order); `accountNames(ref: Reference): string[]` (active accounts); `accountCurrency(ref: Reference, name: string): Currency | null`; `initialForm(device: DeviceSettings, ref: Reference, now?: Date): FormState` (date today, account from `lastCategory` if still active, currency from that account, `convertConfirmed: false`); `chooseAccount(form: FormState, name: string, ref: Reference): FormState` (sets account, resets `currency` to the account's and `convertConfirmed` to false); `switchKind`; `applySuggestion(form, s, ref, field)` (no currency taken from the suggestion; the chosen account sets it); `currencyIssue(form: FormState, ref: Reference): { account: Currency; input: Currency } | null`; `convertedAmount(form: FormState, ref: Reference, rates: RateRow[]): Money | null` (the amount in the account's currency at the date's month); `validate(form: FormState, ref: Reference, rates: RateRow[]): Errors` (`Errors` keys `amount | category | account | toAccount | currency | rate`; `currency` when the currencies differ and `!convertConfirmed`; `rate` when they differ and `convertedAmount` is null; the year rule is gone); `toEntry(form: FormState, id: string, ref: Reference, rates: RateRow[]): Entry` (an overridden amount is stored converted, in the account's currency, no note added); `rememberChoices(device, form)` (no currency); `entryToForm(e: Entry): FormState`; `Suggestion` loses `currency`.

- [ ] **Step 1: Write the failing tests** (Joint EUR, T-Cash GBP, rates GBP 1.16 for the entry month):
  - `chooseAccount sets the currency from the account` and resets `convertConfirmed`.
  - `currencyIssue is null when the input currency is the account's` and set for GBP typed on Joint.
  - `validate asks for confirmation` (`errors.currency`) until `convertConfirmed`; with it, no error.
  - `toEntry stores the converted amount in the account's currency`: `'10,00'` GBP on Joint (EUR) with GBP 1.16 gives `money {minor:1160,currency:'EUR'}`, `description` unchanged (no note); uses the ENTRY MONTH's rate, not the latest (add a later month with another rate).
  - `no rate for the entry month: validate returns 'rate' and convertedAmount is null` (Review Focus 2); when the account IS the input currency no rate is needed even if `Rates` is empty.
  - `inactive accounts and categories are not offered`; transfers need source and a different destination; the three-interaction suggestion flow (`applySuggestion` fills category and account and the currency follows the account); existing amount parsing tests keep passing.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/addForm.test.ts src/lib/predict.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes; `predict.ts` only drops `Suggestion.currency` (the ranking logic and `usualAmounts` stay as they are).
- [ ] **Step 4: Run** the two files. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add form currency rules`.

### Task 20: Month view with ticks and per-entry rates

**Review: Opus**

**Files:**
- Modify: `src/lib/month.ts`, `src/lib/month.test.ts`, `src/lib/ui/format.ts`, `src/lib/ui/monthNav.test.ts`

**Interfaces:**
- Consumes: `Reference`, `RateRow`, `baseOf` (Task 15; if Task 15 was skipped use `toBase(e.money, rates, base, e.date.slice(0,7))`).
- Produces: `monthView(input: { entries: Entry[]; lists: Reference; rates: RateRow[]; month: string }): MonthView`; `MonthView` gains `accounts: { included: number; total: number }`, keeps `month, expenses, income, savingsRate, approx, missingRates`; `CategoryRow`, `Section`, `UNCATEGORISED`, `BUSINESS` unchanged. `shiftMonth(month: string, delta: number): string` (no year clamp; carries across years).

- [ ] **Step 1: Write the failing tests:**
  - `counts only entries of accounts ticked In Monthly`: untick `M-Cash`, its entry disappears from totals, `accounts` is `{included:2,total:3}`; with all ticked it is back; transfers never count.
  - `converts each entry with its own month's rate`: a GBP entry in October uses the October row while a November one uses November's; `approx` is true when two currencies are combined.
  - `a currency with no rate for the month is excluded and reported` (Review Focus 2): the entry is left out of the base totals, `missingRates` is `['GBP']`, native `byCurrency` still lists it.
  - `planned comes from the budget of the month's year`: a 2025 budget row is ignored in a 2026 month; `Business` regular vs business split; categories not in `Categories` group under `Uncategorised`; an inactive category with entries is still listed; savings rate null without income.
  - `shiftMonth('2026-12', 1) === '2027-01'` and `shiftMonth('2026-01', -1) === '2025-12'`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/month.test.ts src/lib/ui/monthNav.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the new `monthView` and `shiftMonth`; sums are integer minor units with half-away rounding per entry.
- [ ] **Step 4: Run** the two files. Expected: PASS.
- [ ] **Step 5: Commit** `feat: month view with account ticks and entry-month rates`.

### Task 21: AppState on the ledger store

**Review: Opus**

**Files:**
- Modify: `src/lib/app.svelte.ts`, `src/lib/kv.ts` (no change expected), `src/lib/messages.ts` (add keys)
- Create: `src/lib/app.test.ts` (AppState is a Svelte rune class; test it with the fake env and `fake-indexeddb`, no component)

**Interfaces:**
- Consumes: `createLedgerStore`, `createReplayer`, `createConfig`, `ensureVersion`, `planRatesMaintenance` via `store.maintainRates`, Task 16 outbox.
- Produces: `Status = 'loading' | 'ok' | 'unlinked' | 'newer' | 'unrecognised' | 'error'`; `Env = { storage; idb; api: SheetsApi; auth: Auth; pick: () => Promise<string | null>; fake?: boolean }` (Task 25 adds `copyTemplate`); `AppState` fields `tab`, `month`, `sheetId: string | null`, `entries: Entry[]`, `lists: Reference`, `rates: RateRow[]`, `snapshots: Snapshot[]`, `unreadable: Unreadable[]`, `ops`, `status`, `online`, `authExpired`, `device`, `message`, `syncing`, `displayed` (entries with pending ops laid over), `attention` (flagged ops), `needsAttention` (flagged ops plus unreadable rows, the Activity badge count), `pendingCount`, `canWrite` (false for `unlinked`, `newer`, `unrecognised`); methods `init()`, `sync()`, `save(entry, remember)`, `edit(entry, previous)`, `remove(entry)`, `undoOp(op)`, `discard(op)`, `readd(op)`, `reconnect()`, `signOut()`, `link()`, `unlink()`, `setDevice(patch)`. `year`, `sheets`, `setYear`, `sheetVersion`, `migrate`, `migrationSteps`, `needs-migration` are removed. The cache key in `kv` is `'book'` holding `{ entries, lists, rates, snapshots, unreadable }`. `sync()` order: `replayer.run()`, then `store.list/lists/rates/snapshots/unreadable`, set state and cache, then `store.maintainRates(todayLocal())` once per session and month when `canWrite`, then `replayer.verify()`. `NewerThanApp` sets `newer`, `UnrecognisedLayout` sets `unrecognised` with the message.
- New messages: `unrecognisedBanner`, `rowNotUnderstood: (row: number, reason: string) => string` (reasons read as "The date is not a date", "The amount must be a positive number", and so on, five variants under `messages.unreadableReasons`), `linkNotLedger`.

- [ ] **Step 1: Write the failing tests** (fake env, `seedLedger`):
  - `init loads the cache first, then the sheet`; an unlinked env gives `status 'unlinked'` and `canWrite` false.
  - `save queues an add, the replayer writes it once, displayed shows it pending then synced` (no duplicate row in the fake).
  - `a tag-4 sheet sets 'newer' and refuses save`; `a legacy sheet sets 'unrecognised'`, and no write call reached the fake.
  - `needsAttention counts unreadable rows and flagged ops`.
  - `link() verifies the picked sheet with ensureVersion: a legacy sheet leaves the link unchanged and sets messages.linkNotLedger`; relink and unlink are refused while ops are pending (`messages.relinkBlocked(n)` text kept).
  - `maintainRates runs once per month per session`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/app.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the rewrite keeping the existing structure (single-flight `sync` with `again`, `loadCache`, `applyTheme`, event listeners, `enqueue`).
- [ ] **Step 4: Run** `pnpm exec vitest run src/lib/app.test.ts`. Expected: PASS (screens still reference the old fields until Tasks 22 and 23).
- [ ] **Step 5: Commit** `feat: app state on the ledger store`.

### Task 22: Add and edit screens

**Files:**
- Modify: `src/lib/ui/EntryForm.svelte`, `src/lib/ui/AddScreen.svelte`, `src/lib/ui/EntrySheet.svelte`, `src/lib/messages.ts`

**Interfaces:**
- Consumes: Task 19 (`chooseAccount`, `currencyIssue`, `convertedAmount`, `validate`, `toEntry`, `entryToForm`), Task 21 `AppState`.
- Produces: `EntryForm` props `{ form (bindable), lists: Reference, rates: RateRow[], history: Entry[], device, submitLabel, onsubmit, lockKind? }` (no `year`); the account chips list active accounts only and call `chooseAccount`; the currency `<select data-testid="currency">` stays and is untouched in the normal case; when `currencyIssue` is set a panel `data-testid="currency-warning"` shows `messages.currencyWarning(input, account, convertedText)` and a button `data-testid="convert-confirm"` (`messages.convertAndKeep`) that sets `convertConfirmed`; if no rate exists the panel shows `messages.noRateForMonth(currency)` and Save stays refused. New messages: `currencyWarning`, `convertAndKeep`, `noRateForMonth`, `errors.currency`, `errors.rate`; delete `errors.date`.

- [ ] **Step 1: Make the edits** to the three components; `AddScreen` seeds the form with `initialForm(app.device, app.lists)` once the lists arrive and no longer reacts to a year; `EntrySheet` passes `app.rates`.
- [ ] **Step 2: Run** `pnpm typecheck` for these files only (`pnpm exec svelte-check --tsconfig ./tsconfig.app.json` reports the remaining errors in Month, Activity, Settings and `App.svelte`; none may be in the three files).
- [ ] **Step 3: Run** `pnpm exec vitest run`. Expected: PASS.
- [ ] **Step 4: Commit** `feat: add and edit screens on account currencies`.

### Task 23: Month, Activity, Settings and shell

**Files:**
- Modify: `src/lib/ui/MonthScreen.svelte`, `src/lib/ui/ActivityScreen.svelte`, `src/lib/ui/SettingsScreen.svelte`, `src/App.svelte`, `src/lib/messages.ts`

**Interfaces:**
- Consumes: Tasks 20 and 21.
- Produces: `MonthScreen` calls `monthView({ entries: app.displayed, lists: app.lists, rates: app.rates, month: app.month })`, shows `messages.accountsIncluded(included, total)` under the title and `messages.approx` reworded to say amounts convert at each entry month's rate; `ActivityScreen` lists `app.unreadable` under Needs attention with `messages.rowNotUnderstood(row, reason)` and no discard button (the fix is in the sheet; a refresh clears it), and the tab badge shows `app.needsAttention`; `SettingsScreen` loses the year select, other-year field and migration block, shows linked or not linked, `Link a different sheet` and `Unlink` (warns first, `data-testid` `link`, `unlink`, `unlink-confirm`, `unlink-yes` kept), theme, sync status, and `messages.version` showing `BOOK_VERSION`; `App.svelte` drops the `needs-migration` banner, adds the `unrecognised` banner, replaces the `year-pill` with `data-testid="status-pill"` showing pending count or `messages.syncIdle`; the `unlinked` banner stays until Task 26 replaces it. Delete from `messages.ts` nothing yet (Task 27).

- [ ] **Step 1: Make the edits** to the four files.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Expected: all PASS (this closes the red block).
- [ ] **Step 3: Run** `VITE_FAKE_SHEETS=1 pnpm dev` is not needed; the e2e specs and `devFake.ts` still target the old layout and are ported in Task 28. Confirm only the Playwright suite fails.
- [ ] **Step 4: Commit** `feat: month, activity, settings and shell on the new state`.

---

## Phase C: first run, cleanup, end-to-end, docs

### Task 24: Template copy helpers

**Review: Opus**

**Files:**
- Create: `src/lib/templateCopy.ts`, `src/lib/templateCopy.test.ts`, `src/lib/driveCopy.ts`, `src/lib/driveCopy.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `templateFileId(copyUrl: string): string | null` (the id between `/spreadsheets/d/` and the next `/`); `TEMPLATE_COPY_URL: string` (`import.meta.env.VITE_TEMPLATE_COPY_URL ?? ''`); `copyTemplate(token: string, fileId: string, name: string, fetchImpl?: typeof fetch): Promise<string>` (POST `https://www.googleapis.com/drive/v3/files/{fileId}/copy` with body `{ name }`, returns the new file id; 401 throws `AuthExpired`, other failures `ApiError`). `.env.example` gains `VITE_TEMPLATE_COPY_URL=https://docs.google.com/spreadsheets/d/1ISaC0GTqkYlwsnrUd9IU2wrFjmWYx-jUfcqgaTLp8yY/copy` with the comment "Public template copy link; override in a fork".

- [ ] **Step 1: Write the failing tests:** `templateFileId` on the real copy URL returns `1ISaC0GTqkYlwsnrUd9IU2wrFjmWYx-jUfcqgaTLp8yY`, on `''` or a non-sheets URL returns null; `copyTemplate` sends the bearer header and JSON body, returns `id`, maps 401 and 403 correctly (403 message text kept in `ApiError` for the first-run screen).
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement** both modules; no SDK, plain `fetch`.
- [ ] **Step 4: Run** the files. Expected: PASS.
- [ ] **Step 5: Commit** `feat: template copy helpers`.

### Task 25: Create from the template (S5)

**Review: Opus**

**Files:**
- Modify: `src/lib/picker.ts`, `src/lib/app.svelte.ts`, `src/lib/app.test.ts`, `src/main.ts`, `src/lib/devFake.ts` (only the Env member)

**Interfaces:**
- Consumes: `templateFileId`, `copyTemplate`, `TEMPLATE_COPY_URL`.
- Produces: `pickSheet(token: string, apiKey: string, projectNumber: string, opts?: { fileIds?: string[] }): Promise<string | null>` (with `fileIds`, the view is `DocsView.setFileIds(fileIds.join(','))`); `Env.copyTemplate: () => Promise<string | null>` (null on cancel); `AppState.createFromTemplate(): Promise<void>` (sets `message` on failure, never links on failure, signs in first if needed, then links and syncs like `link()`); `AppState.templateCopyUrl: string`.

Implements **Branch A (S5 pass)**. **Alternative (S5 fail), replacing steps 3 and 4's Drive call:** `createFromTemplate()` does `window.open(templateCopyUrl, '_blank', 'noopener')` and sets `copyStep = 'waiting'` (a new `$state<'idle' | 'waiting'>`); `Env.copyTemplate` is not added; a second method `AppState.linkCopy()` is the existing `link()` (Picker, no preselection). No Drive request is made and `driveCopy.ts` is not used (delete it and its test in that case).

- [ ] **Step 1: Write the failing tests** (fake env whose `copyTemplate` returns a seeded second book id): `createFromTemplate links the copy and syncs`; `a cancelled Picker leaves the state untouched`; `a copy failure (ApiError 403) sets messages.copyFailed and leaves status unlinked`; `a copy that fails version verification (not a v3 sheet) is not linked`; `a pending outbox blocks it` is not needed when unlinked.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/app.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the Picker option, `Env.copyTemplate` in `main.ts` (token check, `pickSheet(token, key, project, { fileIds: [id] })`, then `copyTemplate(token, id, messages.templateCopyName)`; return the new id), and `createFromTemplate`. `templateCopyName` is the new message `'Fitracker'`.
- [ ] **Step 4: Run** `pnpm exec vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: create the sheet from the template`.

### Task 26: First-run screen

**Files:**
- Create: `src/lib/ui/FirstRunScreen.svelte`
- Modify: `src/App.svelte`, `src/lib/messages.ts`, `docs/deploy-your-own.md`

**Interfaces:**
- Consumes: `AppState.createFromTemplate`, `AppState.link`, `AppState.templateCopyUrl`, `AppState.message`.
- Produces: when `app.status === 'unlinked'` `App.svelte` renders `FirstRunScreen` in place of the tabs and the old banner; primary button `data-testid="create-from-template"` (`messages.createFromTemplate` = "Create your sheet from the template"), secondary `data-testid="link-existing"` (`messages.linkExisting` = "I already have a sheet: link it"), the error line under them; the primary button is hidden when `templateCopyUrl` is empty (a fork without the variable). Messages: `firstRunTitle`, `firstRunBody`, `createFromTemplate`, `linkExisting`, `copyFailed`, `templateCopyName`.
- **Alternative (S5 fail):** the primary button label is `messages.openTemplateCopy` ("Open the template and make a copy") and, once `copyStep === 'waiting'`, the screen shows `messages.copyThenLink` and the button `link-existing` renamed "I made my copy: link it".

- [ ] **Step 1: Make the edits** to the screen, `App.svelte` and `messages.ts`; `docs/deploy-your-own.md` section 2 lists `VITE_TEMPLATE_COPY_URL` and section 4 step 1 to 4 are rewritten for the first-run flow (no yearly sheets, no one-time update).
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint && pnpm test`. Expected: PASS.
- [ ] **Step 3: Commit** `feat: first-run screen`.

### Task 27: Retire the legacy code

**Files:**
- Delete: `src/lib/migrations/` (all files), `src/lib/sheets/sheetsStore.ts`, `src/lib/sheets/sheetsStore.read.test.ts`, `src/lib/sheets/sheetsStore.write.test.ts`
- Modify: `src/lib/schema.ts`, `src/lib/types.ts`, `src/lib/rows.ts`, `src/lib/rows.test.ts`, `src/lib/store.ts`, `src/lib/errors.ts`, `src/lib/messages.ts`, `src/lib/sheets/types.ts`, `src/lib/sheets/api.ts`, `src/lib/sheets/api.test.ts`, `src/lib/sheets/fakeSheets.ts`, `src/lib/sheets/fixtures.ts`, `src/lib/kv.ts` (no change), `src/lib/devFake.ts`

**Interfaces:**
- Produces: `store.ts` exports only `EntryStore` (the Task 9 `LedgerStore` renamed, the old interface deleted); `SheetsApi` loses `applyOps` and `SheetOp` (the migration language; `compileOps` and its tests go, `setMetadata` stays); `schema.ts` loses `SCHEMA_VERSION`, `HEADER_ROW`, `FIRST_ROW`, `TABS`, `KINDS`, `SETUP`, `colIndex`, `lastColumn`, `dataRange`, `columnRange`, `headerRange` and keeps `Kind`, `Field` if still used, the v3 constants and `META_KEY`; `types.ts` loses `Lists`; `rows.ts` loses `rowToEntry`, `entryToWrites`, `clearWrites`, `Write`, `findFreeRow` (kept only on the S1 Alternative); `errors.ts` loses `SchemaMismatch`, `WrongYear`, `FlaggedRows`, `TabFull` (S1 Alternative keeps `TabFull`); `fixtures.ts` loses `seedV2`, `seedV0`, `V0_CONVERSION`; `messages.ts` loses every migration, year, unlink-by-year and link-by-year string.

- [ ] **Step 1: Delete and trim** the files above; `git grep -nE "migrat|TABS|SETUP|WrongYear|SchemaMismatch|seedV2|seedV0|pendingForYear|sheetVersion|app\.year|applyOps|SheetOp"` over `src` and `e2e` must return only `e2e` hits (ported in Task 28) and none in `src`.
- [ ] **Step 2: Rename** `LedgerStore` to `EntryStore` everywhere (`git grep -l LedgerStore | xargs sed -i 's/\bLedgerStore\b/EntryStore/g'`).
- [ ] **Step 3: Run** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Expected: PASS.
- [ ] **Step 4: Check the bundle:** `pnpm build` output size is not larger than before this plan (the build prints chunk sizes; record both in the commit body). Expected: smaller or equal.
- [ ] **Step 5: Commit** `refactor: remove the migration framework and the yearly layout`.

### Task 28: Port the end-to-end suite to the new layout

**Review: Opus**

**Files:**
- Modify: `src/lib/devFake.ts`, `e2e/helpers.ts`, `e2e/add.spec.ts`, `e2e/offline.spec.ts`, `e2e/ui.spec.ts`

**Interfaces:**
- Produces: the offline end-to-end mode seeds `seedLedger(fake, FAKE_ID, { entries, rates })` with three expense rows at sheet rows 2 to 4 (`h1`, `h2` Mercadona on Joint, `h3` Metro on M-Cash), Rates rows for the previous and the current month, and storage defaulting `fitracker.sheet` to `fake-sheet` unless the URL has `?unlinked` (first-run). `helpers.ts` keeps `cell(page, ref)` and `clearRange`.

- [ ] **Step 1: Port the specs** (ranges and ids change, goals do not):
  - `a repeat purchase takes 3 interactions`: amount, the Mercadona suggestion, Save; then `Ledger!A5` set, `D5 === 12.5`, `E5 === 'Mercadona'`, `G5 === 'Groceries'`, `H5 === 'Joint'`, `C5 === 'expense'`; no currency tap (the account chip sets it).
  - `a new purchase takes at most 5 interactions`: unchanged taps, `Ledger!E5 === 'Kebab House'`, `G5 === 'Recreation'`.
  - `the form resets after saving but keeps category and account` (no currency expectation; the currency select shows the account's).
  - `invalid input is rejected`: `Ledger!A5` stays null.
  - Offline: waits on `status-pill` text `2 waiting to sync`; replays to `Ledger!E5` and `E6`, `A7` null (exactly once).
  - Row removed in the sheet: `clearRange(page, 'Ledger!A2:I4')`, then the badge `1`.
  - Delete then Undo: `Ledger!A4` null after delete; after Undo `Ledger!E4 === 'Metro'` (the append reuses the cleared last row).
  - `ui.spec.ts`: logo and theme tests unchanged; replace the year-outside test with `an entry dated in an earlier year is saved` (date input `2020-06-01` writes serial `Ledger!B5`); replace the year switcher test with `unlink warns first and relinking works` (link/unlink testids).
- [ ] **Step 2: Run** `pnpm exec playwright test`. Expected: PASS (all tap-count goals green).
- [ ] **Step 3: Commit** `test: end-to-end suite on the ledger layout`.

### Task 29: New end-to-end behaviour

**Files:**
- Create: `e2e/ledger.spec.ts`
- Modify: `e2e/helpers.ts` (add `setCell(page, ref, value)` using the fake's `Book.set`)

**Interfaces:**
- Consumes: Tasks 22, 23, 26, 28.
- Produces: end-to-end coverage of the new rules.

- [ ] **Step 1: Write the specs:**
  - `a foreign amount warns, converts after confirming and stores the converted amount`: Joint (EUR) chosen, currency `GBP`, amount `10`, the panel `currency-warning` is visible and Save is refused until `convert-confirm` is tapped; saved `Ledger!D5` equals `11.7` for GBP 1.17 (the seeded current rate) and the description is unchanged.
  - `unticking an account in Accounts removes its entries from the Month totals`: `setCell(page, 'Accounts!D3', false)` (M-Cash `In Monthly`), reload, open Month: the Metro entry's category row and the `Accounts included: 2 of 3` text change as expected.
  - `a hand-typed row that is not understood shows under Needs attention`: `setCell` a row with a text date; reload; badge `1`, Activity shows `row 5`; the Month totals are unchanged.
  - `first run creates the sheet from the template` (`/?unlinked`): `create-from-template` is the first action, one tap links the copy, the Add form is visible. **Alternative (S5 fail):** the tap opens a new page (`context.waitForEvent('page')` URL contains `/copy`), then `link-existing` links.
- [ ] **Step 2: Run** `pnpm exec playwright test`. Expected: PASS.
- [ ] **Step 3: Commit** `test: end-to-end coverage for conversion, ticks, unreadable rows and first run`.

### Task 30: Amend AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: the repo rules match the spec (section 4's list of rules to amend).

- [ ] **Step 1: Edit these rules** (the user asked for this explicitly; `AGENTS.md` itself says to ask before editing designs, which this is not):
  - "Money is integer cents" becomes "Money is integer minor units" and "Never overwrite formula cells" gains "except the `Rates` month-roll (spec 3.4)".
  - "One column mapping" loses "The sheet layout is fixed across years." and reads "The sheet is one multi-year book (`Ledger`, `Snapshots`, reference tabs). Define its layout once in `src/lib/schema.ts`; nothing else hardcodes a column or tab name."
  - "Schema is versioned" becomes: "The book carries version 3 as developer metadata (`fitracker.schemaVersion`). The app has no migrations. A newer version is read-only; an unrecognised layout aborts before any write; a lost tag is re-stamped only when the `Ledger` and `Snapshots` headers match." (no `src/lib/migrations/`).
  - "The app never writes column C or Setup" becomes: "The app writes only `Ledger` columns A-I, `Snapshots` and the `Rates` maintenance rows; never `J`, a view or another reference tab."
  - Auth: "The year to spreadsheet-id list is the only stored config" becomes "The one linked spreadsheet id (plus device settings) is the only stored config."
  - "Rows are found by the hidden id column" stays; add "(`Ledger` and `Snapshots` column A)".
- [ ] **Step 2: Verify** `git grep -nE "migrations/|column C|Setup|year to spreadsheet|fixed across years" AGENTS.md` prints nothing.
- [ ] **Step 3: Commit** `docs: amend AGENTS.md for the multi-year ledger`.

### Task 31: Update the other docs

**Files:**
- Modify: `docs/corner-cases.md`, `docs/month-rules.md`, `docs/template.md` (only the "Once the app exists" step), `vite.config.ts` (manifest `description`)

**Interfaces:**
- Produces: docs and the PWA description describe the current behaviour.

- [ ] **Step 1: Edit `docs/corner-cases.md`:** delete the year line, the column-C line, the template-quirk and rollover lines and the negative-amount line; add one-liners for: a row the app cannot parse is listed as "row not understood" and ignored until fixed; new `Accounts` rows start unticked and inactive until the boxes are ticked; the month-roll freezes the closed month at the live rate read when the app first opens in the new month (not the month's average); two devices that roll the same month may both write the same row; a changed account currency flags queued entries as `AccountChanged`; an entry added the same day as a snapshot for its account is excluded until the next snapshot.
- [ ] **Step 2: Rewrite `docs/month-rules.md`** for the ledger: planned is the `Budgets` amount of the month's year; only accounts ticked `In Monthly` count; each entry converts at its own month's `Rates` row (or the sheet's `J` when readable); a currency without a rate for the month is left out and named; uncategorised grouping; no rollover.
- [ ] **Step 3: Update `docs/template.md` step 3 and `vite.config.ts` `description`** ("Fast mobile entry for your budget ledger").
- [ ] **Step 4: Run** `pnpm build`. Expected: PASS.
- [ ] **Step 5: Commit** `docs: corner cases, month rules and template guide for v3`.

### Task 32: Rewrite the verification checklist, sections B to F

**Files:**
- Modify: `docs/verification-checklist.md`

**Interfaces:**
- Produces: a numbered checklist of what only a person with real accounts can check, for the multi-year flow; section A keeps its pointer and drops the "rewritten with the app plan" sentence.

- [ ] **Step 1: Replace B to F:**
  - **B. Google Cloud and sign-in:** `docs/deploy-your-own.md` steps 1 to 3 including `VITE_TEMPLATE_COPY_URL`; consent shows only access to files the app opens or creates; Network tab shows only `sheets.googleapis.com`, `www.googleapis.com` (the `files.copy` call), `accounts.google.com`, `apis.google.com`, your host; Local Storage holds only `fitracker.sheet` and `fitracker.device`, no token.
  - **C. First run and linking:** a fresh profile shows "Create your sheet from the template" first; tap it, pick the template in the Picker, *Pass:* a copy named `Fitracker` appears in My Drive, has no attached script and the app opens on the Add form (S5 outcome; on the copy-link fallback: *Pass:* the template's Make a copy page opens and "I made my copy: link it" links it); relinking and unlinking warn first; a v0.1 yearly sheet is refused with the "not a Fitracker ledger" message; a sheet whose `fitracker.schemaVersion` is removed is re-stamped by the app (one write, check with `showSchemaVersion`).
  - **D. Live entry:** add a EUR entry (*Pass within about 15 s:* a row appears in `Ledger` below the last row, `A` holds an id, `B` is a date, `D` is the amount, `J` still computes); add against a GBP account; type GBP on a EUR account (*Pass:* warning, then converted at the entry month's `Rates` row, no note); edit changes the same row; delete clears A to I and the row stays, Undo re-adds; a description starting with `=` is stored as text; a row typed by hand in Sheets (with and without an id) is picked up with an id after a refresh, and one with a text date appears under Needs attention as "row not understood".
  - **E. Rates and months:** open the app on the first day of a new month (or set the clock): *Pass:* last month's `Rates` row now holds numbers, a new row with the formulas exists, only one row was added when two devices opened it.
  - **F. Offline, PWA and two people:** the previous D and E items kept (install, airplane mode with two entries replaying once, reconnect after an hour, location, appearance) plus: partner and you save within a second (different rows); the partner deletes a row, you edit it (flag, "Add as new row"); sorting `Ledger` in Sheets then editing lands on the right entry or flags it; `In Monthly` unticked in `Accounts` changes the Month totals after a refresh.
- [ ] **Step 2: Check** that every instruction names an exact tab, button or cell, a pass condition and no removed feature (`git grep -n "Link the …\|Update the sheet\|Setup!C8" docs/verification-checklist.md` prints nothing).
- [ ] **Step 3: Commit** `docs: verification checklist for the multi-year flow`.

### Task 33: Final gate

**Review: Opus (whole branch)**

**Files:**
- None (verification only; fixes go test-first in their own commits).

**Interfaces:**
- Produces: the evidence `AGENTS.md` asks for before any PR.

- [ ] **Step 1: Run** `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm exec playwright test`. Expected: all PASS.
- [ ] **Step 2: Grep the rules:** `git grep -nE "TABS|SETUP\b|migrations|WrongYear|fitracker\.sheets" src e2e` prints nothing; `git grep -n "Ledger!J\|!J" src | grep -v test` shows only reads, never a write range.
- [ ] **Step 3: One independent review of the whole branch** on the latest Opus, told to hunt: Review Focus items 1 to 5, quota (reads per refresh), data deletion (`delete` clears only A to I of the located row), races (append, backfill, month-roll), and any write outside `Ledger` A-I, `Snapshots` and `Rates`.
- [ ] **Step 4: Hand the owner the live checklist** (`docs/verification-checklist.md` B to F), wait for the result, and note which spike outcomes (S1, S2, S5) the run confirmed. Do not open a PR before the owner confirms.
