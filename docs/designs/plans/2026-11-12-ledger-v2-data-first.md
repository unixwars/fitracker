# Ledger v2, data-first phase: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the v2 sheet layout on the user's real history before any app code: spikes, a tested legacy-to-ledger converter with a validation report, a buildable template, and the import comparison.

**Architecture:** A Python package `ingest` (orphan branch `legacy-ingest`) reads the yearly `FIRE-<year>.xlsx` exports and writes import-ready CSV tables plus a report. The template is built by an Apps Script (`template/build-template.gs`) run in a new Google Sheet. Spikes are user-run experiments recorded in `docs/designs/spikes/`. The app is not touched.

**Tech Stack:** Python 3 in a venv, `openpyxl`, `pytest`; Google Apps Script; Google Sheets.

**Spec:** `docs/designs/specs/2026-11-12-fitracker-ledger-v2-design.md`

Later plans (written after gate 4, not here): app core on the new layout; Accounts screen and performance; earlier-year normalizers.

## Global Constraints

- Real exports and every file derived from them stay outside the repo (`private/`, `out/` are git-ignored); never commit, paste into docs, or print row-level private data into committed files.
- `Ledger` columns: A id, B date, C type (`expense`, `income`, `transfer`), D amount (positive, in the account's currency), E place, F description, G category, H account (source for transfers), I to-account, J base amount (formula, never exported or written).
- An account has exactly one currency (EUR, GBP or USD). Cash accounts split into `<name> EUR` / `<name> GBP`.
- An entry whose currency differs from its account's is converted to the account's currency using the row's own cached conversion in the old sheet; the original goes in the description as `(GBP 4.00)`.
- Categories are keyed by (type, name); `Other` exists in both types. `Business` is an ordinary expense category.
- Snapshots are end-of-day and seeded from each year's `Setup` balances, dated the previous December 31.
- Drift threshold is 10 in base currency (EUR). Amounts are rounded to 2 decimals (`Decimal`, half-up).
- Hard errors stop the run (account without denomination, unparseable date, workbook without cached values); everything else is reported, never guessed.
- English everywhere; Python in a venv; specs and plans live in `docs/designs/`; feature branches only, no attribution lines in commits.

## Review Focus

1. **Negative amounts** (a refund typed as a negative expense): the converter must flag, not store a negative `amount`. Pinned in Task 4.
2. **Account name variants** (`Joint ` vs `Joint`, differing case): normalized by strip, case collisions reported as one hard error. Pinned in Task 5.
3. **Workbook never recalculated** (cached values are `None`): hard error naming the file, not silent zeros. Pinned in Task 3.
4. **Dates that are text, missing, or outside the sheet's year:** text or missing dates are hard errors; an out-of-year date is kept and reported. Pinned in Task 6.
5. **An account present only as a transfer destination or only in `Setup`** (closed accounts): must still need a denomination in `accounts.csv`. Pinned in Task 5.

---

## Phase A: scaffold and spikes

### Task 1: Orphan branch and privacy guard

**Files:**
- Create (on branch `legacy-ingest`, orphan): `.gitignore`, `README.md`, `requirements.txt`, `ingest/__init__.py`, `tests/__init__.py`, `tests/test_scaffold.py`

**Interfaces:**
- Produces: importable package `ingest`; `pytest` runs from the branch root.

- [ ] **Step 1:** `git checkout --orphan legacy-ingest && git rm -rf .` then create `.gitignore` containing `venv/`, `private/`, `out/`, `__pycache__/`.
- [ ] **Step 2:** Write `tests/test_scaffold.py::test_private_dirs_are_ignored`, which runs `git check-ignore private out venv` and asserts exit code 0.
- [ ] **Step 3:** Create the venv and `requirements.txt` (`openpyxl`, `pytest`), run `venv/bin/pytest -q`; expect 1 passed.
- [ ] **Step 4:** Commit `chore: scaffold legacy-ingest`.

### Task 2: Spike runbook (S1 to S4)

**Files:**
- Create (on `feat/ledger-v2-data`, from `main`): `docs/designs/spikes/2026-11-12-ledger-v2-spikes.md`

**Interfaces:**
- Produces: one section per spike with *question*, *exact steps*, *pass criteria*, and a *Result* line the user fills; later tasks read the results.

- [ ] **Step 1:** Write the document with these four spikes, each user-run in a scratch Google Sheet:
  - **S1 append:** a `Ledger` tab with header in row 1, a `J2` array formula, and 20 data rows; call `values.append` (Sheets API Explorer) on `Ledger!A:I`. Pass: the new row lands directly under the last data row and `J` still computes.
  - **S2 rates:** `=GOOGLEFINANCE("CURRENCY:GBPEUR","price",DATE(2019,1,1),TODAY(),"DAILY")` and the USD equivalent; a lookup `=VLOOKUP(date, block, 2, TRUE)` inside `ARRAYFORMULA` over 5,000 dates. Pass: history reaches 2019, loads within 30 s, weekend dates resolve to the previous day, no `#N/A` or `Loading...` after refresh.
  - **S3 view speed:** paste the converted ledger three times (about 10k rows) and enter the `SUMPRODUCT(SUMIFS(...)*ticks)` summary formula for 15 categories by 12 months. Pass: recalculation under 10 s.
  - **S4 build fidelity:** run `template/build-template.gs` (Task 11) and confirm `QUERY`, `ARRAYFORMULA`, `GOOGLEFINANCE`, protections and charts appear. Pass criteria are the Task 11 checklist.
- [ ] **Step 2:** Commit `docs: ledger v2 spike runbook`. (The user runs S1 to S3 whenever convenient; Task 11 waits for S2.)

## Phase B: converter (tests first; fixtures are built in the test files with `openpyxl`)

### Task 3: Reader

**Files:**
- Create: `ingest/model.py`, `ingest/read.py`; Test: `tests/test_read.py`, `tests/fixtures.py` (workbook builder)

**Interfaces:**
- Produces (`model.py`): `Cell(formula: str | None, value: object)`; `RawRow(year:int, tab:str, row:int, date: datetime.date | str | None, c: Cell, d: Cell, place:str, description:str, category:str, account:str, to_account:str)`; `Setup(year:int, expense_categories:list[str], income_categories:list[str], budgets:dict[tuple[str,str],list[float]], balances:dict[str,dict[str,float]])`; `RawYear(year:int, rows:list[RawRow], setup:Setup)`; `class HardError(Exception)`.
- Produces (`read.py`): `read_year(path: Path, year: int) -> RawYear`. Reads each workbook twice (formulas and cached values); entry rows start at row 10; Expenses account is column H, Income and Transfers account is column F, Transfers destination is column G; `Setup` lists are B16:B35 (income), B46:B68 (expense), budgets C:N, balances E/F/G (EUR/GBP/USD) of B76:B105.

- [ ] **Step 1:** Write `test_read_year_returns_typed_and_cached_cells`: a fixture with a literal C `12.5`, a D formula `=3.7*2` cached `7.4`, and a template conversion formula in C; assert `Cell("=3.7*2", 7.4)` for D and `Cell(None, 12.5)` for C.
- [ ] **Step 2:** Write `test_read_year_raises_when_cached_values_are_missing`: a workbook saved by `openpyxl` (no cache) with a formula cell; assert `HardError` whose message contains the file name.
- [ ] **Step 3:** Write `test_read_year_reads_setup_lists_budgets_and_balances` asserting `Other` in both lists, a 12-value budget, and balances `{"M-Cash": {"EUR": 32.5, "GBP": 8.0}}`.
- [ ] **Step 4:** Run `venv/bin/pytest tests/test_read.py`; expect 3 failures. Implement `read_year`; rerun; expect 3 passed.
- [ ] **Step 5:** Commit `feat: read legacy yearly sheets`.

### Task 4: Amount classification

**Files:**
- Create: `ingest/amounts.py`; Test: `tests/test_amounts.py`

**Interfaces:**
- Consumes: `Cell`, `RawRow`.
- Produces: `Amount(value: Decimal, currency: Literal["EUR","GBP"], eur_cached: Decimal | None, flags: tuple[str, ...])`; `classify_amount(c: Cell, d: Cell) -> Amount | None` (`None` means an empty row to drop).

- [ ] **Step 1:** Write tests (each asserts the whole `Amount`):
  - `test_typed_c_is_eur`: c=`Cell(None, 12.5)`, d empty gives `Amount(Decimal("12.50"), "EUR", Decimal("12.50"), ())`.
  - `test_d_is_gbp_with_cached_euro`: c=`Cell("=IFERROR(__xludf.DUMMYFUNCTION(\"IF(NOT(ISBLANK(D10)),GOOGLEFINANCE(\"\"CURRENCY:GBPEUR\"\")*D10,\"\"\"\")\"),4.73)", 4.73)`, d=`Cell(None, 4.0)` gives GBP 4.00 with `eur_cached` 4.73.
  - `test_arithmetic_formula_uses_cached_value`: d=`Cell("=3.7*2", 7.4)` gives GBP 7.40.
  - `test_template_conversion_with_empty_d_is_dropped`: returns `None`.
  - `test_literal_c_wins_over_d`: both present gives EUR from C.
  - `test_text_amount_is_flagged`: c=`Cell(None, "24,14")` gives flag `"text amount"` and no value, or raises nothing (the caller reports the row).
  - `test_negative_amount_is_flagged`: c=`Cell(None, -5.0)` gives flag `"negative amount"`.
  - `test_formula_with_references_uses_cached_and_flags`: d=`Cell("=D5*2", 8.0)` gives flag `"formula references cells"`.
- [ ] **Step 2:** Run; expect failures. Implement `classify_amount`; a formula counts as arithmetic when it matches `=[0-9.+\-*/() ]+`. Rerun; expect pass.
- [ ] **Step 3:** Commit `feat: classify legacy amounts`.

### Task 5: Accounts

**Files:**
- Create: `ingest/accounts.py`; Test: `tests/test_accounts.py`

**Interfaces:**
- Produces: `normalize_account(name: str) -> str` (strip); `propose_accounts(years: list[RawYear]) -> list[AccountRow]` where `AccountRow(name:str, currency:str, active:bool, note:str)` (majority entry currency, tie goes to the `Setup` balance column, `active` false if absent from the latest year's `Setup`, `note` says `unknown` when no evidence); `write_accounts_csv(rows, path: Path)`; `load_accounts(path: Path) -> dict[str, str]`; `resolve(name: str, row_currency: str, accounts: dict[str,str]) -> str` returns the ledger account name (cash split: if `name` is a cash account, returns `f"{name} {row_currency}"`).

- [ ] **Step 1:** Write tests:
  - `test_names_are_stripped_and_case_collisions_fail`: `Joint ` equals `Joint`; `joint` plus `Joint` raises `HardError`.
  - `test_unknown_account_is_a_hard_error`: `load_accounts` lacking `M-Wise` makes `resolve("M-Wise","GBP",...)` raise `HardError`.
  - `test_transfer_destination_only_account_is_proposed`: an account seen only in column G still appears in `propose_accounts`.
  - `test_proposal_uses_majority_currency`: 92 EUR and 98 GBP entries gives `M-Cash` flagged cash, plus the siblings proposed.
  - `test_cash_accounts_split_by_row_currency`: `resolve("M-Cash","GBP",{...})` is `"M-Cash GBP"`.
- [ ] **Step 2:** Run, implement, rerun to pass. Cash accounts are the names listed in a `CASH = {"M-Cash","T-Cash"}` constant.
- [ ] **Step 3:** Commit `feat: account denominations and cash split`.

### Task 6: Ledger conversion

**Files:**
- Create: `ingest/ledger.py`; Test: `tests/test_ledger.py`

**Interfaces:**
- Consumes: `classify_amount`, `resolve`, `RawYear`.
- Produces: `LedgerRow(date: date, type: str, amount: Decimal, place: str, description: str, category: str, account: str, to_account: str, source: tuple[int,str,int], implied_eur: Decimal | None)`; `Flag(source: tuple[int,str,int], reason: str)`; `to_ledger(years: list[RawYear], accounts: dict[str,str]) -> tuple[list[LedgerRow], list[Flag]]`.

- [ ] **Step 1:** Write tests:
  - `test_same_currency_row_is_unchanged`: GBP row on a GBP account gives `amount == Decimal("4.00")`.
  - `test_mismatched_currency_is_converted_with_cached_value`: GBP `4.00` (cached EUR `4.73`) on a EUR account gives amount `4.73` and description ending `(GBP 4.00)`.
  - `test_cross_currency_transfer_uses_cached_source_amount`: source EUR account, D `1570.0` with cached C `1850.30`, destination a GBP account gives amount `1850.30`, `to_account` set, no flag.
  - `test_text_or_missing_date_is_a_hard_error`: raises `HardError`.
  - `test_date_outside_sheet_year_is_kept_and_flagged`: `Flag(..., "date outside sheet year")`.
  - `test_unknown_category_is_flagged_not_dropped`: category `` gives a `Flag` and `category == ""`.
  - `test_rows_without_date_and_amount_are_dropped`.
- [ ] **Step 2:** Run, implement, rerun to pass. Types come from the tab; `Transfers` rows have no category.
- [ ] **Step 3:** Commit `feat: convert legacy rows to ledger rows`.

### Task 7: Categories and budgets

**Files:**
- Create: `ingest/reference.py`; Test: `tests/test_reference.py`

**Interfaces:**
- Produces: `CategoryRow(name:str, type:str, active:bool)`; `BudgetRow(year:int, type:str, category:str, monthly:Decimal)`; `build_categories(years) -> list[CategoryRow]` (union keyed by (type, name), active if in the latest year); `build_budgets(years) -> tuple[list[BudgetRow], list[Flag]]` (flag when a category's 12 months differ).

- [ ] **Step 1:** Tests: `test_other_exists_in_both_types`; `test_category_dropped_from_latest_year_is_inactive`; `test_budget_is_the_constant_monthly_amount`; `test_varying_months_are_flagged`.
- [ ] **Step 2:** Run, implement, rerun to pass.
- [ ] **Step 3:** Commit `feat: categories and budgets`.

### Task 8: Snapshots and balances

**Files:**
- Create: `ingest/balances.py`; Test: `tests/test_balances.py`

**Interfaces:**
- Produces: `SnapshotRow(date: date, account: str, balance: Decimal, note: str)`; `seed_snapshots(years, accounts: dict[str,str]) -> list[SnapshotRow]` (one per account and non-empty `Setup` balance, dated the previous Dec 31, cash split by currency column); `balance_at(account: str, on: date, snapshots: list[SnapshotRow], ledger: list[LedgerRow], accounts: dict[str,str], fallback_gbp_eur: Decimal) -> Decimal`.

- [ ] **Step 1:** Tests with exact values: snapshot `100` on 12-31; expense `10` on 1-5, income `5` on 1-6, transfer out `20` on 1-7 gives `75` on 1-31. Also `test_entries_on_the_snapshot_date_do_not_count` (EOD); `test_no_snapshot_means_baseline_zero`; `test_cross_currency_transfer_credits_destination_at_implied_rate` (row `implied_eur` used, else `fallback_gbp_eur`).
- [ ] **Step 2:** Run, implement, rerun to pass.
- [ ] **Step 3:** Commit `feat: snapshot seeding and balance_at`.

### Task 9: Validation report

**Files:**
- Create: `ingest/report.py`; Test: `tests/test_report.py`

**Interfaces:**
- Produces: `build_report(years, ledger, flags, snapshots, accounts) -> str` (Markdown) containing: row counts in vs out per year and tab; native-currency category totals old vs new with difference; every flag with its source; and a model-fit table (account, computed Jan-1 balance, recorded Jan-1 balance, difference, `FLAG` when the absolute difference in EUR is 10 or more).

- [ ] **Step 1:** Tests: `test_counts_match_for_a_clean_fixture`; `test_difference_of_10_or_more_is_marked`; `test_difference_under_10_is_not_marked`; `test_report_contains_no_row_level_description_text` (assert descriptions and places never appear, only year, tab and row).
- [ ] **Step 2:** Run, implement, rerun to pass.
- [ ] **Step 3:** Commit `feat: validation report`.

### Task 10: Export and CLI

**Files:**
- Create: `ingest/export.py`, `ingest/__main__.py`; Test: `tests/test_cli.py`

**Interfaces:**
- Produces: `write_tables(out: Path, ledger, accounts_rows, categories, budgets, snapshots)` writing `ledger.csv` (header `id,date,type,amount,place,description,category,account,to_account`), `accounts.csv`, `categories.csv` (`name,type,active`), `budgets.csv` (`year,type,category,monthly`), `snapshots.csv` (`id,date,account,balance,note`), `expected_totals.csv` (`year,month,category,eur_total` from the old cached euro values); CLI `python -m ingest --in DIR --accounts accounts.csv --out DIR [--propose-accounts]`, exit code 2 on any `HardError`, 0 otherwise.

- [ ] **Step 1:** Tests: `test_cli_writes_all_tables_for_a_fixture_dump` (header lines exact); `test_cli_exits_2_and_writes_nothing_on_hard_error`; `test_propose_accounts_writes_only_accounts_csv`; `test_ids_are_unique_uuids`.
- [ ] **Step 2:** Run, implement, rerun to pass; then run the whole suite, `venv/bin/pytest -q`.
- [ ] **Step 3:** Commit `feat: export tables and CLI`.

### Task 11: Run on the real dump (gate 3)

**Files:**
- Create: none committed (outputs in `out/`, outside git).

- [ ] **Step 1:** Unzip the user's latest zip into `private/dump/` (own empty directory; run Python with `-I`).
- [ ] **Step 2:** `venv/bin/python -m ingest --in private/dump --accounts private/accounts.csv --out out/ --propose-accounts`; send the user the proposed `accounts.csv` for review (denominations, closed accounts, cash siblings).
- [ ] **Step 3:** After the user confirms, run without `--propose-accounts`. Expect exit 0 and a report with: row counts equal in and out, category totals within a few units, and a model-fit table listing every account's difference.
- [ ] **Step 4:** Present the report summary to the user; list every flag. Gate 3 passes when the user accepts the report.

## Phase C: template and import

### Task 12: Template build script

**Files:**
- Create (on `feat/ledger-v2-data`): `template/build-template.gs`, `template/README.md`

**Interfaces:**
- Consumes: spike S2 result (rates formula shape) and the spec sections 3.2 to 3.7.
- Produces: `buildTemplate()` creating the tabs `Ledger`, `Snapshots`, `Settings`, `Accounts`, `Categories`, `Budgets`, `Rates`, `Expenses`, `Income`, `Transfers`, `Monthly Summary`, `Annual Summary`, `Balances`; the `Ledger!J2` array formula; data validation (type, account, category lists); hidden id columns; warning-only protection on the view tabs and `Ledger!J:J`; the staged charts only after the data gate (a separate function `addCharts()`).

- [ ] **Step 1:** Write the script in functions of one tab each (`makeLedger()`, `makeAccounts()`, ...), with the formulas from the spec; no formulas outside those functions.
- [ ] **Step 2:** Write `template/README.md` with the run steps (new Google Sheet, Extensions, Apps Script, paste, run `buildTemplate`) and a checklist: each tab exists; `J2` converts a typed row; changing a currency in `Accounts` changes the result; the account ticks change the `Monthly Summary` total; editing a view tab shows a warning.
- [ ] **Step 3:** The user runs it and ticks the checklist (S4 pass). Commit `feat: template build script`.

### Task 13: Import and compare (gate 4)

**Files:**
- Modify: `template/README.md` (import runbook section)

- [ ] **Step 1:** Document the import: paste each `out/*.csv` into its tab (Ledger A2, Accounts, Categories, Budgets, Snapshots), set `Settings` base currency EUR, hide the id columns.
- [ ] **Step 2:** The user compares, for 2024, 2025 and 2026: Monthly Summary category totals against the old Monthly Summary (by month) and Annual Summary income, expenses and savings rate against the old one, using `expected_totals.csv`. Pass: every category total within a few units; differences explained by the report.
- [ ] **Step 3:** Record the outcome in the spec's gate list and commit `docs: gate 4 result`. A failure returns to the spec.

---

## Self-review notes

- Spec coverage: sections 3.1 to 3.7 (Tasks 2 and 12), 4 rules (Tasks 4 to 8), 5 ingest (Tasks 3 to 11), 8 gates 2 to 4 (Tasks 2, 11, 13). Sections 6 and 7 (app, its tests) belong to later plans. The spec gap (no task built the template) is fixed here by Task 12 and the matching spec edit.
- Types are used consistently: `LedgerRow`, `Flag`, `Cell`, `Amount` appear with the same fields in every consuming task.
