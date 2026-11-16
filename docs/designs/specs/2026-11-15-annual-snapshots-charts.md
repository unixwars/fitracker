# Annual view, snapshot entry and charts (issue #14, parts 1-3)

Branch `feat/annual-snapshots-charts`, PR into `dev`. Part 4 (account toggles) is out: it needs a decision on who may write `In Monthly` / `In Annual` and an AGENTS.md amendment (shared with #3).

## Why
The sheet has an annual view, seven charts and balance snapshots; the app has only Month, and can show and delete `Snapshots` rows but not add them. Net worth and the year picture are half of what the sheet is for.

## Goals / non-goals
- Goals: Annual figures in the app that equal the sheet's; the seven template charts' counterparts; recording a balance offline, undoable.
- Non-goals: a chart library; snapshot bulk paste or CSV (later, as the issue says); account toggles; new Sheets requests (everything reads the cached book).
- Anti-goal: a fifth dock tab, or figures that disagree with the sheet.

## Approaches
- **A. Year as a toggle on Month (chosen).** A `Month | Year` switch at the top of the Month screen. Keeps the dock at four tabs; Annual reuses the Month navigation, with year arrows. Trade-off: Month screen grows a mode.
- **B. Fifth dock tab "Year".** Easier to find, but five tabs is tight at 360px and Settings/Activity are already thin. Rejected.
- **C. Charts as their own tab.** Splits numbers from their charts. Rejected: charts sit under the figures they plot, as in the sheet.
- Charts: **hand-written SVG** (bars, stacked bars, line, area, donut) in small components over pure series functions. A library costs bundle for seven simple shapes (AGENTS.md rule). Trade-off: no tooltips; tapping a bar shows its value in a caption line.

## Design
- **Pure logic** in `src/lib/annual.ts` (+ test), like `month.ts`: per month and category actual (each entry at its own month's rate, `In Annual` accounts, transfers excluded, same missing-rate and uncategorised rules), income, expenses, savings rate per month and for the year, planned from `Budgets`. New "Annual" section in `docs/month-rules.md`. Test against a fixture shared with the sheet's `Annual Summary` values, as for month figures.
- **Balances** in `src/lib/balances.ts` (+ test): per account, latest snapshot on or before each month end, converted at that month's rate, giving net worth by account by month; inflows and outflows per account for a chosen year (from ledger entries, as the sheet's Balances tab). Exact rules read from the template formulas in `template/build-template.gs` before coding; any divergence is listed in `docs/corner-cases.md`.
- **Charts, one per sheet chart** (series functions in `src/lib/charts.ts` + test; components render only):
  1. Budget vs actual by category (Month). 2. Expense proportions (Month, donut). 3. Income vs expenses with savings rate line (Year). 4. Spending by category by month, stacked (Year). 5. Expense proportions (Year). 6. Net worth by account, stacked area (Year). 7. Inflows and outflows by account (Year).
  Colours come from existing CSS variables; every chart has a text table fallback under a `<details>` and `aria-label`s.
- **Snapshot entry:** a form (account, date defaulting to today, balance, note) reached from Activity next to the existing snapshot list, using `makeSnapshotOp('add', ...)` and the existing `EntryStore.addSnapshot`. Balance parsed by the money module in the account's currency; id from `ids.ts`. Works offline through the outbox; the done op shows in Recent changes with Undo (the existing inverse-op path).
- All text in `messages.ts`. No new dependency, no new store method, no change to `schema.ts`.

## Left to the builder
Chart colours and sizes, empty states, exact caption wording.

## Checks that need a person
Compare the Year figures and Net worth chart against the sheet on the real book; add a snapshot offline on a phone and see it sync; charts legible at 360px.
