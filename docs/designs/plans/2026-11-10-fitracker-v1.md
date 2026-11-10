# Fitracker v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first offline PWA to add/edit/delete expenses, income and transfers in the yearly FIRE Google Sheet, with a month budget-vs-actual view.

**Architecture:** Svelte 5 + TS + Vite, no data backend. Pure logic in `src/lib` behind an `EntryStore` interface; the Sheets adapter is the only implementation and owns schema, migrations and row-finding. An IndexedDB outbox gives offline writes; screens render from cache then refresh.

**Tech Stack:** Svelte 5, TypeScript, Vite, vitest + fake-indexeddb, Playwright, vite-plugin-pwa (service worker/manifest; reason: precache + install), Google Identity Services + Picker (script tags), Sheets API v4 via `fetch`. No other runtime dependencies.

**Spec:** `docs/designs/specs/2026-11-10-fitracker-design.md`

## Global Constraints

- Currencies are EUR, GBP, USD only (2 minor digits). Money is integer minor units + currency; request `UNFORMATTED_VALUE`; never parse formatted strings; the app never writes column C or anything in Setup; dates are written as serial numbers.
- Column letters and tab names appear only in `src/lib/schema.ts`; rows are found by the hidden id in column A, never by row number.
- Writes use `valueInputOption=RAW`; token in memory only; only stored config is the year→spreadsheet-id list plus device-local settings.
- English only; all UI text in `src/lib/messages.ts`; no formatter, match file style; secrets in `.env`, names in `.env.example`.
- One `values:batchGet` per screen; refresh at most every 15 s per year (~60 reads/min quota).
- Test first, one commit per task, on branch `feat/fitracker-v1`; never push to `main`/`dev`; no attribution lines; verify library APIs in `node_modules`.
- Done = `pnpm exec tsc --noEmit` (or `svelte-check`), `pnpm lint`, `pnpm test`, `pnpm exec playwright test` all green.

## Review Focus

1. Amounts like `1,5`, `1.234,56`, `0`, negatives, `1e9`, empty → defined parse result, never NaN (Task 2).
2. Dates: Sheets returns serial numbers; "today" is the local day, not UTC, around midnight (Task 3).
3. Description/place starting with `=`, `+`, `@` is stored as text, never evaluated (Task 7).
4. Entry tab full (no free row before the tab's last row) → add flagged "tab full", not overwritten (Task 7).
5. Token expires (401) mid-replay → outbox pauses with ops intact and a reconnect banner shows; no drop, no duplicate on resume, also with two tabs open (Task 10).

---

### Task 1: Tooling, branch, repo hygiene

**Files:** Create `LICENSE` (MIT), `.env.example`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `src/lib/messages.ts`, `src/lib/smoke.test.ts`; Modify `package.json`, `.gitignore`.

- [ ] Commit the approved spec on `master`-derived branch `feat/fitracker-v1` (`git switch -c feat/fitracker-v1`).
- [ ] Add dev deps `vitest`, `fake-indexeddb`, `@playwright/test`, `eslint` + `eslint-plugin-svelte` + `typescript-eslint`; scripts `test` (`vitest run`), `lint`, `typecheck` (`svelte-check`); `.env.example` names: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_PROJECT_NUMBER`.
- [ ] Failing test `smoke.test.ts`: `messages.addSave` is a non-empty string. Run `pnpm test` → fails; create `messages.ts` exporting a `messages` const; passes.
- [ ] Run typecheck + lint + test; commit `chore: tooling, license, env example`.

### Task 2: Money

**Files:** Create `src/lib/types.ts`, `src/lib/money.ts`, `src/lib/money.test.ts`.

**Produces:**
```ts
export const CURRENCIES = ['EUR', 'GBP', 'USD'] as const; export type Currency = typeof CURRENCIES[number]
export type Money = { minor: number; currency: Currency }
parseAmount(input: string): number | null           // minor units (2 digits)
formatMoney(m: Money, locale?: string): string
toMinor(sheetNumber: number): number; toSheetNumber(minor: number): number
convert(m: Money, to: Currency, rates: Record<Currency, number>): Money  // rates = value of 1 unit in base; base=1
```
- [ ] Tests (exact values): `parseAmount('12.50')===1250`; `'12,5'→1250`; `'1.234,56'→123456`; `'1,234.56'→123456`; `'0'→0`; `''`, `'abc'`, `'1e9'`, `'-3'` → `null` (refunds are Income); `toMinor(0.1+0.2)===30`; `convert` rounds half away from zero and returns the same Money when currencies match.
- [ ] Run → fail; implement (decimal separator = the last `.`/`,` followed by 1–2 digits at the end); run → pass; commit.

### Task 3: Schema, row mapping, dates, free-row search

**Files:** Create `src/lib/schema.ts`, `src/lib/rows.ts`, `src/lib/rows.test.ts`.

**Produces:**
```ts
// schema.ts
SCHEMA_VERSION = 2; META_KEY = 'fitracker.schemaVersion'; FIRST_ROW = 10; HEADER_ROW = 9
TABS: Record<Kind, { name: string; v0: ColumnMap; v2: ColumnMap; headersV0: string[]; headersV2: string[]; lastRow: number /* 1000 | 986 | 1004 */ }>
SETUP: { year /* C8 */; baseCurrency /* U8 */; rateCells: Record<Currency, string> /* U16:U18 = EUR,GBP,USD */; expenseCategories; incomeCategories; accounts; budgets }
// rows.ts
type Kind = 'expense' | 'income' | 'transfer'
type Entry = { id; kind; date: string /* YYYY-MM-DD */; money: Money; description; place?; category?; account?; toAccount? }
serialToDate(n: number): string; dateToSerial(d: string): number; todayLocal(now?: Date): string
rowToEntry(kind, row: unknown[]): Entry | null           // null for blank rows
entryToWrites(e: Entry, row: number): { range: string; values: unknown[][] }[]   // [A], [B], [D..last]; never C
clearWrites(kind: Kind, row: number): { range: string }[]                         // [A], [B], [D..last]
findFreeRow(kind: Kind, ids: unknown[], b: unknown[], d: unknown[], desc: unknown[]): number | 'full'
```
Layout v2: `A` id, `B` date, `C` formula (never touched), `D` amount, last column Currency (Expenses `I`, Income/Transfers `H`), other columns as in the template (spec §3).
- [ ] Tests: `serialToDate(45292)==='2024-01-01'` and round-trip; `todayLocal(new Date('2024-03-10T23:30:00-05:00'))` returns the local day (fix `TZ` in vitest config); `rowToEntry` per column order for each kind (Income swaps Account/Category); blank row → `null`; `entryToWrites` writes the date as a serial **number**, never a string, and no range intersects column C; `clearWrites` leaves C; `findFreeRow` skips rows with an id or any value and returns `'full'` past `lastRow`.
- [ ] Run → fail; implement; pass; commit.

### Task 4: Month aggregation

**Files:** Create `src/lib/month.ts`, `src/lib/month.test.ts`, `docs/month-rules.md`.

**Produces:** `monthView(entries: Entry[], lists: Lists, month: string /* YYYY-MM */, rates, base): MonthView` with `{ categories: {name; planned: Money; actual: Money; byCurrency: Money[]}[]; income: …; savingsRate: number | null; combinedApprox: Money }`; `Lists = { expenseCategories; incomeCategories; accounts; budgets: Record<string /*category*/, number[12]> }`.
- [ ] Read the `Monthly Summary` formulas in `assets/FIRE-TEMPLATE.xlsx` (openpyxl in a venv under the scratchpad) and write the rules (Regular vs Business split, rollover, savings rate = (income − expenses)/income, transfers excluded) to `docs/month-rules.md`; ask the user if any rule is ambiguous.
- [ ] Tests from those rules with a hand-computed fixture: planned from budgets[month]; actual sums per category and per currency; mixed EUR/GBP converts through rates; transfers excluded; zero income → `savingsRate === null`; entry in unknown category goes to an "Uncategorised" row.
- [ ] Run → fail; implement; pass; commit.

### Task 5: Prediction and places

**Files:** Create `src/lib/predict.ts`, `src/lib/places.ts`, `src/lib/predict.test.ts`, `src/lib/places.test.ts`.

**Produces:** `suggest(field: 'place' | 'description', prefix: string, history: Entry[], now?: Date, limit = 5): Suggestion[]` where `Suggestion = { text; category?; account?; currency? }` (category/account/currency = those last used with it); `nearestPlace(pos: {lat;lng}, known: {name;lat;lng}[], maxMeters = 150): string | null` (haversine).
- [ ] Tests: ranking by frequency then recency; case-insensitive prefix; empty prefix returns most recent; suggestion carries last-used category/account; `nearestPlace` returns nearest within range else `null`, ignores far places.
- [ ] Run → fail; implement; pass; commit.

### Task 6: EntryStore interface, fake Sheets API, Sheets read path

**Files:** Create `src/lib/store.ts`, `src/lib/sheets/api.ts`, `src/lib/sheets/fakeSheets.ts`, `src/lib/sheets/sheetsStore.ts`, `src/lib/sheets/sheetsStore.read.test.ts`.

**Produces:**
```ts
interface EntryStore { list(year: number): Promise<Entry[]>; lists(year: number): Promise<Lists>; rates(year: number): Promise<{base: Currency; rates: Record<Currency, number>}>;
  addMany(year: number, e: Entry[]): Promise<void>; edit(year: number, e: Entry): Promise<{ previous: Entry }>; delete(year: number, kind: Kind, id: string): Promise<{ previous: Entry }>;
  refresh(year: number): Promise<{ missingIds: string[] }>; subscribe(fn: () => void): () => void }
createSheetsApi(getToken: () => string, fetchImpl = fetch): SheetsApi  // batchGet, batchUpdate, valuesBatchUpdate, valuesBatchClear, getMetadata
createFakeSheets(seed?): SheetsApi & { snapshot(): …; failNext(status: number): void; injectWrite(range, values): void }  // in-memory, same calls
createSheetsStore(api: SheetsApi, spreadsheetIds: Record<number, string>): EntryStore
```
- [ ] Tests (fake, v2 seed): `list` issues exactly one `batchGet` (`UNFORMATTED_VALUE`, `SERIAL_NUMBER`) and parses all 3 kinds; `lists` reads Setup categories/accounts/budgets; `rates` reads base + the three rate cells; v0 or newer-than-app sheets make `list` reject `SchemaMismatch`; `refresh` returns saved-but-missing ids (`missingIds`) and fills a missing id for a row typed in Sheets by writing column A only; refresh within 15 s of the last returns cached data without a read.
- [ ] Run → fail; implement; pass; commit.

### Task 7: Sheets write path (add, edit, delete)

**Files:** Modify `src/lib/sheets/sheetsStore.ts`; Create `src/lib/sheets/sheetsStore.write.test.ts`.

- [ ] Tests (fake): `addMany` of 3 entries does one read of A and B:last, one `valuesBatchUpdate` and one read-back, placing them on consecutive free rows and never writing C or Setup; when `injectWrite` takes a chosen row between write and read-back, that entry moves to the next free row; description `=HYPERLINK("x")` is stored as the literal string (RAW) and date is a serial number; a tab with no free row up to `lastRow` rejects `TabFull`; re-sending an add whose id already exists is a no-op; `edit` locates by id, returns `previous` read **from the sheet**, writes only B/D/text/category/account/currency cells; an edit/delete of a missing id rejects `RowGone`; an edit whose current row no longer matches `op.previous` (e.g. rows sorted in Sheets) rejects `RowChanged` and writes nothing; `delete` clears A, B and D..last and **C's formula is still present** in the fake snapshot, and a following `addMany` reuses that row.
- [ ] Run → fail; implement; pass; commit.

### Task 8: Migration framework and 0→1

**Files:** Create `src/lib/migrations/index.ts`, `src/lib/migrations/m0to1.ts`, `src/lib/migrations/migrations.test.ts`.

**Produces:** `type Migration = { from: number; to: number; plan(state: SheetState): Request[]; backupTabs: string[] }`; `detectVersion(api, id): Promise<number>` (DOCUMENT-visibility developer metadata, else header detection: raw template headers → 0, v2 headers → 2 and stamp, otherwise throw `UnrecognisedLayout`); `pendingMigrations(current: number): Migration[]`; `runMigrations(api, id): Promise<void>`.
- [ ] Tests (fake, fixture = sanitized-template values): unknown headers → `UnrecognisedLayout` with **zero** writes; `0→1` writes ids to A for every non-empty row, hides column A; backups named `<Tab> (backup v0)` are created before any change; each step is a single `batchUpdate` containing its version-metadata change; an injected failure mid-step leaves the sheet and version unchanged; a rerun is a no-op; `pendingMigrations(0)` is `[0→1, 1→2]`; version 3 → `NewerThanApp`; a v2-headed sheet without metadata is detected as 2 and stamped.
- [ ] Run → fail; implement; pass; commit.

### Task 9: Migration 1→2 (currencies)

**Files:** Create `src/lib/migrations/m1to2.ts`, `src/lib/migrations/m1to2.test.ts`; Modify `src/lib/migrations/index.ts`.

Setup: `T8` "Base currency", `U8` base (chosen at migrate time, default `EUR`); rate cells `T16:U18` (EUR, GBP, USD; the base's cell is `1`, the others `=GOOGLEFINANCE("CURRENCY:"&T17&$U$8)`). `C10` on each entry tab: `=ARRAYFORMULA(IF(D10:D="","",D10:D*IF(I10:I="GBP",Setup!$U$17,IF(I10:I="USD",Setup!$U$18,IF(I10:I="EUR",Setup!$U$16,1)))))` (Currency column letter per tab; a blank currency counts as base). Currency column gets strict dropdown validation `EUR,GBP,USD`.
- [ ] Tests (fake, formulas visible): classification table — literal C with empty D → Amount=C, `base`; literal C and D both set → C wins; D set with the template's conversion formula in C → Amount=D, `GBP`; template formula with empty D → empty row; any other formula or text in C/D → row listed in a returned `flagged` array and left untouched; afterwards C11:C(end) is empty and only `C10` holds the array formula; headers relabelled (D "Amount", last "Currency"); D's number format reset; amounts converted to base through the rate cells equal the pre-migration C values for the template's conversion rows (at a fixed rate); backups `(backup v1)` exist; mid-step failure injection leaves everything unchanged; idempotent on a v2 sheet.
- [ ] Run → fail; implement; pass; commit.

### Task 10: Outbox, replayer, activity log

**Files:** Create `src/lib/outbox.ts`, `src/lib/outboxDb.ts`, `src/lib/replayer.ts`, `src/lib/outbox.test.ts`, `src/lib/replayer.test.ts`.

**Produces:**
```ts
type Op = { opId: string; year: number; kind: Kind; entryId: string; type: 'add'|'edit'|'delete'; entry?: Entry; previous?: Entry; status: 'pending'|'done'|'flagged'; reason?: 'RowGone'|'RowChanged'|'TabFull'|'Missing'|'Other'; at: number }
applyPending(entries: Entry[], ops: Op[]): Entry[]            // optimistic view
createOutboxDb(idb?: IDBFactory): { put; all; update; remove }
createReplayer(store: EntryStore, db: OutboxDb, opts?: { locks?: LockManager }): { run(): Promise<void>; onAuthExpired(fn: () => void): void }
undo(op: Op): Op       // inverse op from op.previous (or a delete for an add)
```
- [ ] Tests (fake-indexeddb + fake store): ops replay in insertion order and consecutive pending adds go through one `addMany`; `RowGone`/`RowChanged`/`TabFull` → `flagged`, never retried; a missing saved id after refresh flags that op `Missing`; a 401 pauses the replayer, leaves the op `pending`, fires `onAuthExpired`, and resuming sends it once (no duplicate add); 429 backs off then succeeds; `applyPending` shows adds/edits and hides deletes; `undo` of a delete re-adds `previous` as a new add op; two replayers sharing a `LockManager` stub never send concurrently.
- [ ] Run → fail; implement (`navigator.locks.request('fitracker-replay', …)`); pass; commit.

### Task 11: Auth and config

**Files:** Create `src/lib/auth.ts`, `src/lib/config.ts`, `src/lib/config.test.ts`, `src/lib/picker.ts`; Modify `index.html` (GIS + Picker scripts, loaded async).

**Produces:** `createAuth(clientId): { token(): string | null; signIn(): Promise<void>; onExpired(fn) }` (token variable in memory only; scope `https://www.googleapis.com/auth/drive.file`); `pickSheet(token, apiKey, projectNumber): Promise<string /* spreadsheetId */>`; `config`: `getSheets(): Record<number, string>`, `linkSheet(year, id)` (years 2019 ≤ y ≤ current+1) and `verifyYear(api, id, year)` (reads `Setup!C8`; mismatch rejects `WrongYear`), `getDevice()/setDevice()` for default currency, last kind, place coordinates.
- [ ] Tests (jsdom or localStorage stub): `linkSheet(2018, 'x')` throws; `verifyYear` rejects when `Setup!C8` differs from the year; `linkSheet(2024,'x')` persists; nothing token-like is ever written to storage (spy on `Storage.prototype.setItem`).
- [ ] Run → fail; implement config; auth/picker are thin wrappers over the Google scripts, verified in the user checklist (Task 15); commit.

### Task 12: App shell and Add screen

**Files:** Create `src/App.svelte` (replace), `src/lib/ui/TabBar.svelte`, `src/lib/ui/AddScreen.svelte`, `src/lib/addForm.ts`, `src/lib/addForm.test.ts`; delete `src/lib/Counter.svelte`.

**Produces:** pure `addForm.ts`: `initialForm(device, now): FormState` (date today, currency = last used, kind remembered); `applySuggestion(form, s): FormState` (fills category/account/currency); `validate(form): Errors`; `toEntry(form, id): Entry`; `resetAfterSave(form): FormState` (keeps kind/currency/date, clears amount/text).
- [ ] Tests: `initialForm` uses device last currency, local today; `applySuggestion` prefills category, account, currency; `validate` rejects empty/zero amount and missing category/account; `toEntry` produces integer minor units; `resetAfterSave` focuses amount and keeps currency.
- [ ] Run → fail; implement `addForm.ts` then the screen (amount autofocus, kind toggle, currency select, date chip opening native `<input type=date>`, place/description with `<datalist>`-style suggestion list from `suggest`, category/account chips, GPS button using `nearestPlace`, Save enqueues an outbox op and resets); typecheck; commit.

### Task 13: Month screen and entry edit/delete

**Files:** Create `src/lib/ui/MonthScreen.svelte`, `src/lib/ui/EntrySheet.svelte`.

- [ ] Tests: component-free logic already covered by Task 4; add `src/lib/ui/monthNav.test.ts` for prev/next month clamping within the linked year.
- [ ] Implement: month picker, per-category bars (planned vs actual), income, savings rate, approximate combined total (labelled), category drill-down list, tap entry → edit sheet or delete with a confirmation warning and Undo toast; edits/deletes enqueue outbox ops (`previous` is filled from the sheet by the store at replay time); commit.

### Task 14: Activity and Settings

**Files:** Create `src/lib/ui/ActivityScreen.svelte`, `src/lib/ui/SettingsScreen.svelte`.

- [ ] Activity: a "Tap to reconnect" banner when the token expired; Needs attention (flagged ops: Discard / Re-add as new row) above Recent changes (done ops with Undo via `undo`); tab badge only when flagged > 0.
- [ ] Settings: year switcher 2019+, link sheet (`pickSheet`), "Migrate sheet" showing the missing steps and a confirm warning that backup tabs will be created, read-only banner on `NewerThanApp`, default currency, sync status, sign-out. Unit-test the pure `migrationSummary(current): string[]` helper.
- [ ] Typecheck + lint; commit.

### Task 15: PWA, branding, README, docs

**Files:** Create `public/icons/*`, `scripts/make-icons.mjs`, `docs/deploy-your-own.md`, `docs/corner-cases.md`, `docs/verification-checklist.md`; Modify `vite.config.ts`, `index.html`, `README.md`, `AGENTS.md` (only after approval, add the version-chain rule).

- [ ] Configure `vite-plugin-pwa` (precache, `display: standalone`, name, theme colour, icons); `scripts/make-icons.mjs` (dev dependency `sharp`) renders 192/512 PNG and a maskable 512 on a dark solid background from `assets/logo.svg`; replace Vite favicon; README rewritten with the logo, features, license, link to deploy guide.
- [ ] `deploy-your-own.md`: Cloud project, OAuth client (web), Picker API key (restrict by HTTP referrer and API), `.env`, GitHub Pages as the default static host; `corner-cases.md`: one line each for same-second add race, edit-vs-edit last write wins, live-rate drift, per-device prediction, hourly token renewal, template quirks (Expenses H14 category dropdown on an account column; Transfers E10:G10 date validation).
- [ ] Build: `pnpm build` succeeds; Lighthouse PWA check via Playwright's Chromium (`CHROME_PATH`) installable; commit.

### Task 16: Playwright, fake backend mode

**Files:** Create `e2e/add.spec.ts`, `e2e/offline.spec.ts`, `src/lib/devFake.ts`; Modify `src/main.ts` (when `VITE_FAKE_SHEETS=1`, wire `createFakeSheets` and a fake auth).

- [ ] Tests: repeat purchase (suggestion exists) reaches a saved entry in ≤ 3 interactions (taps/keystroke groups: amount, suggestion tap, Save); new purchase ≤ 5; offline: set context offline, add two entries, go online, both appear exactly once in the fake sheet; a flagged `RowGone` op appears under Needs attention with the badge.
- [ ] Run → fail; implement wiring; `pnpm exec playwright test` passes; commit.

### Task 17: Sanitized public v2 template and release hygiene

**Files:** Replace `assets/FIRE-TEMPLATE.xlsx`; Create `docs/template.md`.

- [ ] In a venv (openpyxl, `python -I`): clear account names, past-year history (`Setup!I83:M89`), crypto holdings and all entry data; convert the entry tabs to layout v2 (headers, a single `ARRAYFORMULA` in `C10`, per-row C formulas removed, Currency column with `EUR,GBP,USD` validation, `Setup!T8:U8` and `T16:U18` rate cells as in Task 9); keep other formulas, validations and layout; compare formula counts before/after.
- [ ] `docs/template.md`: import via Google Drive and **convert to a Google Sheet** (the Sheets API refuses .xlsx files); the app detects v2 by headers and stamps the version. Ask the user to open the result in Google Sheets and confirm the array formula, dropdowns and summary tabs work before committing.
- [ ] Secret scan (`git grep -nE "AIza|GOCSPX|client_secret"`) → no hits; commit.

### Task 18: Whole-branch review and user verification

- [ ] Run the full gate (types, lint, tests, Playwright). Dispatch one fresh reviewer on the latest Opus model over the whole branch, telling it to hunt: access control/token handling, races (add collision, concurrent replayers), quota use, data deletion (migrations, delete op), migration safety. Fix findings test-first.
- [ ] Write `docs/verification-checklist.md` as a numbered list of exact steps for what only a person can check: GIS sign-in and Picker on a phone, a real `0→1→2` migration on a **copy** of a past year (confirm backup tabs and totals match), live add/edit/delete reflected in Sheets, a two-person simultaneous add, PWA install and offline add on a phone, GPS permission flow. State what a pass looks like for each. Note which checks could be automated if the user provides test credentials and ask whether they want that.
- [ ] Hand the checklist to the user and wait for results. Open the PR (against `dev`) only after the user confirms.
