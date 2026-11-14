# Ledger v2, data-first phase: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the v2 sheet layout on the user's real history before any app code: spikes, a tested legacy-to-ledger converter with a validation report, a buildable template, and the import comparison.

**Architecture:** A Python package `ingest` (orphan branch `legacy-ingest`, checked out as a git worktree) reads the yearly `FIRE-<year>.xlsx` exports and a Bank of England rate CSV and writes import-ready CSV tables plus a report. The template is built by an Apps Script (`template/build-template.gs`). Spikes are user-run experiments recorded in `docs/designs/spikes/`. The app is not touched.

**Tech Stack:** Python 3 in a venv, `openpyxl`, `pytest`; Google Apps Script; Google Sheets.

**Spec:** `docs/designs/specs/2026-11-12-fitracker-ledger-v2-design.md` (rev 2)

Later plans (written after gate 4, not here): app core on the new layout (including the `AGENTS.md` amendments listed in spec 4); Accounts screen and performance; earlier-year normalizers.

## Global Constraints

- Real exports, rate CSVs and every file derived from them stay outside the repo (`private/`, `out/`; git-ignored on every branch); never commit them, never paste row-level private data into committed files. Test fixtures use obviously synthetic names and numbers.
- `Ledger` columns: A id, B date, C type (`expense`, `income`, `transfer`), D amount (positive, in the account's currency), E place, F description, G category, H account (source for transfers), I to-account, J base amount (formula, never exported).
- An account has exactly one currency (EUR, GBP or USD). Split accounts become `<name> EUR` / `<name> GBP`.
- Amounts are always positive; a negative amount is a flagged error, never stored.
- An entry whose currency differs from its account's, and a cross-currency transfer, are converted with the Bank of England daily rate on the entry date (previous day if missing; a missing rate is a hard error).
- Categories are keyed by (type, name); `Other` exists in both types.
- Snapshots are end-of-day and seeded from each year's `Setup` balances, dated the previous December 31.
- Drift threshold is 10 in base currency (EUR). Amounts are rounded to 2 decimals (`Decimal`, half-up).
- Hard errors stop the run and write nothing; everything else is reported, never guessed.
- English everywhere; Python in a venv; specs and plans live in `docs/designs/`; feature branches only, no attribution lines in commits.

## Review Focus

1. **A rate is missing** (the rate CSV has a gap or ends before the data): hard error naming the date and currency. Pinned in Task 6.
2. **Both C and D filled on a GBP account** (the old sheets allowed typing over the formula): the cell matching the account's currency wins; a EUR value on a GBP or USD account is converted, not dropped. Pinned in Task 7.
3. **Account name variants** (`Joint ` vs `Joint`, case-only collisions) and accounts seen only as a transfer destination or only in `Setup`. Pinned in Task 5.
4. **A workbook with no cached values** (never recalculated) versus a normal one whose empty-string formulas cache as empty. Pinned in Task 3.
5. **The same row in two yearly sheets** (a December 30 entry copied into the next year): flagged as a probable duplicate. Pinned in Task 7.

---

## Phase A: scaffold and spikes

### Task 1: Orphan worktree and privacy guard

**Files:**
- Modify (on `feat/ledger-v2-data`, from `main`): `.gitignore` (add `private/`, `out/`)
- Create (in the worktree `../fitracker-ingest`, orphan branch `legacy-ingest`): `.gitignore`, `README.md`, `requirements.txt`, `ingest/__init__.py`, `tests/__init__.py`, `tests/test_scaffold.py`

**Interfaces:**
- Produces: importable package `ingest`; `pytest` runs from the worktree root.

- [ ] **Step 1:** In the repo: `git worktree add --orphan -b legacy-ingest ../fitracker-ingest`. The orphan `.gitignore` lists `venv/`, `private/`, `out/`, `__pycache__/`, `.env*`, `*.xlsx`, `*.csv`, `*.zip`.
- [ ] **Step 2:** Write `tests/test_scaffold.py::test_private_files_are_ignored` creating temp `private/a.xlsx`, `out/b.csv`, `.env` and asserting `git check-ignore` exits 0 for each.
- [ ] **Step 3:** Create the venv with `requirements.txt` (`openpyxl`, `pytest`); run `venv/bin/pytest -q`; expect 1 passed. Separately add `private/` and `out/` to `main`'s `.gitignore` on `feat/ledger-v2-data` and verify with `git check-ignore private out`.
- [ ] **Step 4:** Commit in each branch: `chore: scaffold legacy-ingest`; `chore: ignore private data dirs`.

### Task 2: Spike runbook (S1 to S4)

**Files:**
- Create (on `feat/ledger-v2-data`): `docs/designs/spikes/2026-11-12-ledger-v2-spikes.md`

**Interfaces:**
- Produces: one section per spike with *question*, *exact steps*, *pass criteria*, and a *Result* line the user fills. Task 13 waits for S2 and S4 inputs.

- [ ] **Step 1:** Write the runbook (user-run, scratch Google Sheet):
  - **S1 append:** `Ledger` with header in row 1, a `J2` array formula, 20 rows, a cleared row in the middle, and a hand-typed row below. Call `values.append` on `Ledger!A:I` with `insertDataOption=INSERT_ROWS` for one row, then three rows, then two simultaneous calls. Pass: rows land after the last non-empty row, nothing is overwritten, `J` still computes, `updatedRange` identifies each.
  - **S2 rates:** a `Rates` tab with a current-rate cell `=GOOGLEFINANCE("CURRENCY:GBPEUR")`; read it and `Ledger!J2:J` with `values:batchGet` (`UNFORMATTED_VALUE`) from the API Explorer. Also try a history formula and read it the same way. Pass: the current-rate cell and `J` return numbers; record whether the history formula returns `#N/A`.
  - **S3 view speed:** paste the converted ledger three times (about 10k rows) and enter the `SUMPRODUCT(SUMIFS(...)*ticks)` summary (15 categories by 12 months) and the `Balances` month-end matrix (15 accounts by 36 months). Pass: full recalculation under 10 s.
  - **S4 build:** run `template/build-template.gs` (Task 13) and tick its checklist.
- [ ] **Step 2:** Commit `docs: ledger v2 spike runbook`.

## Phase B: converter (tests first; fixtures are built in the test files with `openpyxl`)

### Task 3: Reader

**Files:**
- Create: `ingest/model.py`, `ingest/read.py`; Test: `tests/test_read.py`, `tests/fixtures.py` (workbook builder)

**Interfaces:**
- Produces (`model.py`): `Cell(formula: str | None, value: object)`; `RawRow(year:int, tab:str, row:int, date: datetime.date | str | None, c: Cell, d: Cell, place:str, description:str, category:str, account:str, to_account:str)`; `Setup(year:int, expense_categories:list[str], income_categories:list[str], budgets:dict[tuple[str,str],list[float]], balances:dict[str,dict[str,float]])`; `RawYear(year:int, rows:list[RawRow], setup:Setup)`; `class HardError(Exception)`.
- Produces (`read.py`): `read_year(path: Path, year: int) -> RawYear`. Entry rows start at row 10; the Expenses account is column H, Income and Transfers account is column F, Transfers destination is column G. `Setup` income and expense category lists are the blocks under the "Category" headers; accounts run from the "Account Name" header row to the "Networth year start" row (missing label: `HardError`); balance columns E, F, G are EUR, GBP, USD.

- [ ] **Step 1:** Write `test_read_year_returns_typed_and_cached_cells`: a fixture with a literal C `12.5`, a D formula `=3.7*2` cached `7.4`, and a template conversion formula in C; assert `Cell("=3.7*2", 7.4)` for D and `Cell(None, 12.5)` for C.
- [ ] **Step 2:** Write `test_workbook_with_no_cached_formula_values_is_rejected` (saved by `openpyxl`, no cache; `HardError` naming the file) and `test_empty_string_formula_cache_is_accepted` (a formula returning `""` plus another formula with a cached value passes).
- [ ] **Step 3:** Write `test_row_with_d_value_and_uncached_conversion_formula_is_rejected`.
- [ ] **Step 4:** Write `test_account_list_length_varies_by_year` (two fixtures with 3 and 5 accounts; balances read for each) and `test_missing_account_header_is_a_hard_error`.
- [ ] **Step 5:** Write `test_read_year_reads_setup_lists_budgets_and_balances` asserting `Other` in both lists, a 12-value budget, balances `{"Wallet": {"EUR": 30.0, "GBP": 8.0}}`.
- [ ] **Step 6:** Run `venv/bin/pytest tests/test_read.py`; expect failures. Implement `read_year`; rerun; expect pass.
- [ ] **Step 7:** Commit `feat: read legacy yearly sheets`.

### Task 4: Amount classification

**Files:**
- Create: `ingest/amounts.py`; Test: `tests/test_amounts.py`

**Interfaces:**
- Consumes: `Cell`.
- Produces: `Amount(value: Decimal, currency: Literal["EUR","GBP"], flags: tuple[str, ...])`; `classify_amount(c: Cell, d: Cell, account_currency: str) -> Amount | None` (`None` means an empty row to drop; raises `HardError` for a text amount).

- [ ] **Step 1:** Write tests (each asserts the whole `Amount`):
  - `test_typed_c_is_eur`: c=`Cell(None, 12.5)`, d empty gives `Amount(Decimal("12.50"), "EUR", ())`.
  - `test_d_is_gbp`: d=`Cell(None, 4.0)` and c a template conversion formula (cached `4.73`) gives GBP `4.00`.
  - `test_arithmetic_formula_uses_cached_value`: d=`Cell("=3.7*2", 7.4)` gives GBP `7.40`.
  - `test_other_formula_uses_cached_value_and_is_flagged`: d=`Cell("=D5*2", 8.0)` gives flag `"formula references cells"`.
  - `test_template_conversion_with_empty_d_is_dropped`: returns `None`.
  - `test_both_present_prefers_the_account_currency`: c=`Cell(None, 5.0)`, d=`Cell(None, 4.0)`, account GBP gives GBP `4.00`; account EUR gives EUR `5.00`.
  - `test_text_amount_is_a_hard_error`: c=`Cell(None, "24,14")` raises `HardError`.
  - `test_negative_amount_is_flagged_not_stored`: c=`Cell(None, -5.0)` gives flag `"negative amount"`.
  - `test_zero_amount_is_flagged`.
- [ ] **Step 2:** Run; expect failures. Implement; a formula is arithmetic when it matches `=[0-9.+\-*/() ]+`, and the template conversion formula is recognised by `GOOGLEFINANCE(...CURRENCY:GBPEUR...)`. Rerun; expect pass.
- [ ] **Step 3:** Commit `feat: classify legacy amounts`.

### Task 5: Accounts

**Files:**
- Create: `ingest/accounts.py`; Test: `tests/test_accounts.py`

**Interfaces:**
- Produces: `AccountRow(name:str, currency:str, active:bool, split:bool)`; `normalize_account(name: str) -> str` (strip); `propose_accounts(years: list[RawYear]) -> list[AccountRow]` (majority entry currency, tie goes to the `Setup` balance column, `active` false if absent from the latest year's `Setup`, `split` true when balances or entries use two currencies); `write_accounts_csv(rows, path: Path)` and `load_accounts(path: Path) -> dict[str, AccountRow]` with header `name,currency,active,split`; `resolve(name: str, row_currency: str, accounts: dict[str, AccountRow]) -> str` returns the ledger account name (`f"{name} {row_currency}"` for split accounts).

- [ ] **Step 1:** Write tests:
  - `test_names_are_stripped_and_case_collisions_fail`: `Joint ` equals `Joint`; `joint` plus `Joint` raises `HardError`.
  - `test_unknown_account_is_a_hard_error`: `resolve` for a name missing from the accounts raises `HardError`.
  - `test_transfer_destination_only_account_is_proposed`: an account seen only in column G, or only in `Setup`, appears in `propose_accounts`.
  - `test_proposal_uses_majority_currency` and `test_tie_uses_setup_balance_column`.
  - `test_split_accounts_get_siblings`: `resolve("Wallet","GBP",{"Wallet": split=True})` is `"Wallet GBP"`.
- [ ] **Step 2:** Run, implement, rerun to pass.
- [ ] **Step 3:** Commit `feat: account denominations and split`.

### Task 6: Historic rates

**Files:**
- Create: `ingest/rates.py`; Test: `tests/test_rates.py`

**Interfaces:**
- Produces: `load_boe_csv(path: Path) -> DailyRates`; `DailyRates.rate(currency: str, on: date) -> Decimal` (value of one unit in EUR, previous day if missing; `HardError` if before the first date or currency unknown; USD to EUR derived through sterling); `monthly_rates(rates: DailyRates, first: date, last: date) -> list[MonthRate]` where `MonthRate(month: date, gbp: Decimal, usd: Decimal)` is the average of the daily values in each month.

- [ ] **Step 1:** Write tests with a synthetic CSV: `test_weekend_uses_previous_day`; `test_missing_before_first_date_is_a_hard_error`; `test_usd_is_derived_through_sterling` (EUR per GBP 1.20 and USD per GBP 1.50 give USD at `0.80`); `test_monthly_average`.
- [ ] **Step 2:** Run, implement (series columns are the sterling-to-euro and sterling-to-dollar daily spot rates; verify the codes against the downloaded file's header), rerun to pass.
- [ ] **Step 3:** Commit `feat: bank of england rates`.

### Task 7: Ledger conversion

**Files:**
- Create: `ingest/ledger.py`; Test: `tests/test_ledger.py`

**Interfaces:**
- Consumes: `classify_amount`, `resolve`, `DailyRates`, `RawYear`.
- Produces: `LedgerRow(id: str, date: date, type: str, amount: Decimal, place: str, description: str, category: str, account: str, to_account: str, source: tuple[int,str,int])`; `Flag(source: tuple[int,str,int], reason: str)`; `to_ledger(years: list[RawYear], accounts: dict[str, AccountRow], rates: DailyRates) -> tuple[list[LedgerRow], list[Flag]]`. Ids are `uuid5` of `"{year}:{tab}:{row}"`.

- [ ] **Step 1:** Write tests:
  - `test_same_currency_row_is_unchanged`.
  - `test_mismatched_currency_is_converted_at_the_dated_rate`: GBP `4.00` on a EUR account on a day with GBP at `1.18` gives `4.72` and description ending `(GBP 4.00)`.
  - `test_eur_value_on_a_gbp_account_is_converted_not_dropped` and `test_eur_value_on_a_usd_account_is_converted`.
  - `test_cross_currency_transfer_is_converted_into_the_source_currency`.
  - `test_missing_rate_is_a_hard_error`.
  - `test_text_or_missing_date_blank_account_or_destination_is_a_hard_error`.
  - `test_date_outside_sheet_year_is_kept_and_flagged`; `test_probable_duplicate_in_the_next_year_sheet_is_flagged` (same date, amount, account, category in two years' sheets).
  - `test_unknown_category_keeps_its_name_and_is_flagged`; `test_rows_without_date_and_amount_are_dropped_and_listed`.
  - `test_ids_are_deterministic`.
- [ ] **Step 2:** Run, implement, rerun to pass. Types come from the tab; `Transfers` rows have no category.
- [ ] **Step 3:** Commit `feat: convert legacy rows to ledger rows`.

### Task 8: Categories and budgets

**Files:**
- Create: `ingest/reference.py`; Test: `tests/test_reference.py`

**Interfaces:**
- Produces: `CategoryRow(name:str, type:str, active:bool)`; `BudgetRow(year:int, type:str, category:str, monthly:Decimal)`; `build_categories(years, ledger) -> list[CategoryRow]` (union keyed by (type, name), stripped; active if in the latest year; unknown ledger categories added inactive); `build_budgets(years) -> tuple[list[BudgetRow], list[Flag]]` (January's value; flag when the 12 months differ).

- [ ] **Step 1:** Tests: `test_other_exists_in_both_types`; `test_category_dropped_from_latest_year_is_inactive`; `test_unknown_category_is_added_inactive`; `test_budget_is_the_constant_monthly_amount`; `test_varying_months_store_january_and_flag`.
- [ ] **Step 2:** Run, implement, rerun to pass.
- [ ] **Step 3:** Commit `feat: categories and budgets`.

### Task 9: Snapshots and balances

**Files:**
- Create: `ingest/balances.py`; Test: `tests/test_balances.py`

**Interfaces:**
- Produces: `SnapshotRow(id: str, date: date, account: str, balance: Decimal, note: str)`; `seed_snapshots(years, accounts) -> list[SnapshotRow]` (one per account and non-empty `Setup` balance, dated the previous Dec 31, split accounts by currency column; `HardError` for a non-split account with balances in two columns or in a column that is not its currency); `balance_at(account: str, on: date, snapshots, ledger, accounts, rates: DailyRates) -> Decimal` (last snapshot row wins on a tie).

- [ ] **Step 1:** Tests with exact values: snapshot `100` on 12-31; expense `10` on 1-5, income `5` on 1-6, transfer out `20` on 1-7 gives `75` on 1-31. Also `test_entries_on_the_snapshot_date_do_not_count`; `test_no_snapshot_means_baseline_zero`; `test_two_snapshots_same_date_last_wins`; `test_cross_currency_transfer_credits_the_destination_at_the_dated_rate`; `test_non_split_account_with_two_balance_columns_is_a_hard_error`.
- [ ] **Step 2:** Run, implement, rerun to pass.
- [ ] **Step 3:** Commit `feat: snapshot seeding and balance_at`.

### Task 10: Validation report

**Files:**
- Create: `ingest/report.py`; Test: `tests/test_report.py`

**Interfaces:**
- Produces: `build_report(years, ledger, flags, drops, snapshots, accounts, rates) -> str` (Markdown) containing: rows in = rows out + listed drops per year and tab; per category, month and native currency, new vs source totals (exact apart from converted rows and drops); the old `Monthly Summary` and `Annual Summary` cached values as reference with the tolerance 2% or 10 EUR per category and year; every flag with its source; and a model-fit table (account, computed Jan-1 balance, recorded Jan-1 balance, difference, `FLAG` at 10 EUR or more).

- [ ] **Step 1:** Tests: `test_counts_balance_with_drops`; `test_exact_native_totals_for_a_clean_fixture`; `test_difference_of_10_or_more_is_marked`; `test_difference_under_10_is_not_marked`; `test_old_summary_reference_outside_tolerance_is_marked`; `test_report_contains_no_descriptions_or_places`.
- [ ] **Step 2:** Run, implement, rerun to pass.
- [ ] **Step 3:** Commit `feat: validation report`.

### Task 11: Export and CLI

**Files:**
- Create: `ingest/export.py`, `ingest/__main__.py`; Test: `tests/test_cli.py`

**Interfaces:**
- Produces: `write_tables(out: Path, ...)` writing `ledger.csv` (header `id,date,type,amount,place,description,category,account,to_account`), `sheet_accounts.csv` (`name,currency,active,in_monthly,in_annual`), `categories.csv` (`name,type,active`), `budgets.csv` (`year,type,category,monthly`), `snapshots.csv` (`id,date,account,balance,note`), `rates.csv` (`month,gbp,usd`), all with ISO dates and `.` decimals. CLI: `python -m ingest --in DIR --rates BOE.csv --accounts private/accounts.csv --out DIR`, or `--propose-accounts` to write only `private/accounts.proposed.csv` (never the reviewed file). Exit 2 on any `HardError` with nothing written.

- [ ] **Step 1:** Tests: `test_cli_writes_all_tables_for_a_fixture_dump` (header lines exact); `test_cli_exits_2_and_writes_nothing_on_hard_error`; `test_propose_accounts_never_overwrites_the_reviewed_file`; `test_rerun_reproduces_identical_ids`.
- [ ] **Step 2:** Run, implement, rerun; then the whole suite, `venv/bin/pytest -q`.
- [ ] **Step 3:** Commit `feat: export tables and CLI`.

### Task 12: Run on the real dump (gate 3)

**Files:**
- Create: none committed (inputs in `private/`, outputs in `out/`).

- [ ] **Step 1:** Unzip the user's latest zip into `private/dump/` (own empty directory; Python with `-I`). The user downloads the Bank of England daily spot series from 2019 to today into `private/boe.csv`.
- [ ] **Step 2:** Run with `--propose-accounts`; the user reviews and saves `private/accounts.csv` (denominations, closed accounts, split flags).
- [ ] **Step 3:** Run the full conversion. Expect exit 0 and a report whose rows-in = rows-out + drops, native totals exact, and model-fit differences listed.
- [ ] **Step 4:** Present the report summary and every flag to the user. Gate 3 passes when the user accepts the report.

## Phase C: template and import

### Task 13: Template build script

**Files:**
- Create (on `feat/ledger-v2-data`): `template/build-template.gs`, `template/README.md`

**Interfaces:**
- Consumes: spec 3 and the S2 result.
- Produces: `buildTemplate()` creating the tabs `Ledger`, `Snapshots`, `Settings`, `Accounts`, `Categories`, `Budgets`, `Rates`, `Expenses`, `Income`, `Transfers`, `Monthly Summary`, `Annual Summary`, `Balances`; the `Ledger!J2` array formula; validation (type, account and category lists, `B` dates only, `D` numbers only); hidden id columns; the `fitracker.schemaVersion` developer metadata set to `3`; warning-only protection on the view tabs and `Ledger!J:J`; `@OnlyCurrentDoc`. A separate `addCharts()` runs only after the data gate.

- [ ] **Step 1:** Write the script with one function per tab (`makeLedger()`, `makeRates()`, ...), the formulas from the spec and nothing outside those functions.
- [ ] **Step 2:** Write `template/README.md`: run steps (new Google Sheet, Extensions, Apps Script, paste, run `buildTemplate`, then delete the bound script) and a checklist: each tab exists; `J2` converts a typed row; changing a currency in `Accounts` changes the result; the account ticks change the `Monthly Summary` total; editing a view tab shows a warning; the version metadata is present; a text date or amount in `Ledger` is rejected.
- [ ] **Step 3:** The user runs it and ticks the checklist (S4). Commit `feat: template build script`.

### Task 14: Import and compare (gate 4)

**Files:**
- Modify: `template/README.md` (import runbook section)

- [ ] **Step 1:** Document the import: set the spreadsheet locale; paste values only from each `out/*.csv` at the first data row below its header (Ledger, Accounts, Categories, Budgets, Snapshots, Rates); set `Settings` base currency EUR; full replace, never append; record the freeze date.
- [ ] **Step 2:** Document the post-import checks: row count and sum of `D` per account against the report, and zero non-numeric `B` and `D` cells.
- [ ] **Step 3:** The user compares, for 2024, 2025 and 2026, the new Monthly and Annual Summary against the old ones within the report's tolerance, and the new `Balances` against the report's model-fit table.
- [ ] **Step 4:** Record the outcome in the spec's gate list and commit `docs: gate 4 result`. A failure returns to the spec.

---

## Self-review notes

- Spec coverage: 3.1 to 3.7 (Tasks 2, 13), 4 rules (Tasks 4 to 9), 5 ingest (Tasks 3 to 12), 8 gates 2 to 4 (Tasks 2, 12, 13, 14). Sections 6 and 7 and the `AGENTS.md` amendments belong to later plans.
- Types are used consistently: `Cell`, `Amount`, `AccountRow`, `LedgerRow`, `Flag`, `DailyRates`, `SnapshotRow` carry the same fields in every consuming task.
