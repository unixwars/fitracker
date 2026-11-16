# Add accounts and categories from Settings (issue #17, add only)

Branch `feat/add-accounts-categories`, PR into `dev`. Rename, delete and budget editing are out of scope (rename needs a history rewrite and stays a sheet task; see #17).

## Why
Adding an account or a category means leaving the app to edit the `Accounts` or `Categories` tab. The rule now allows the app to write the reference tabs (AGENTS.md).

## Goals / non-goals
- Goals: add an account (name, currency) or a category (name, type) in Settings; it appears at once in Add, Overview and the settings lists; the sheet's own formulas pick it up.
- Non-goals: rename, delete, reorder, edit currency or type, edit `Budgets`, an active toggle, offline queueing.
- Anti-goals: a duplicate name; a row written below the template's capacity; touching any formula cell.

## Approaches
- **A. Direct write, needs a connection (chosen).** One read of the name column, one write, then refresh. Same model as shared settings. Trade-off: unusable offline.
- **B. Through the outbox.** Works offline, but adds a new op type, and an entry that uses a not-yet-written account would have to replay after it. More machinery for a rare, deliberate action. Rejected.
- **C. Append with `values:append`.** The live check showed it misplaces rows on the real template. Rejected; write to an explicit free row as `Ledger` does.

## Design
- `schema.ts`: `ACCOUNTS`/`CATEGORIES` descriptors (tab, first row, columns, capacities 40 accounts, 30 expense and 15 income categories, from the template script, kept in one place).
- Pure `src/lib/newItem.ts` (+ test): `validateNewName(name, existing, cap)` refuses empty, more than 100 characters, a case-insensitive duplicate (accounts across all rows; categories per type), leading `=`/`+`/`-`/`@` (spreadsheet formula injection; the write is RAW anyway), and a full list.
- `EntryStore.addAccount(a)` and `addCategory(c)`; the Sheets adapter re-reads the name column right before writing (a second device may have just added the same name), finds the first empty row, writes `A:E` or `A:C` as RAW values, and reports `Duplicate` or `Full` instead of writing. New accounts are written active and ticked In Monthly and In Annual (your call, since the person added it on purpose; the template's "new rows start unticked" is for hand-added rows). New categories are written active.
- Failure model like shared settings: needs a connection, a failure shows a message and leaves the lists unchanged.
- UI: an "Add account" row inside the Accounts fold (name, currency, Add) and an "Add category" row inside the Categories fold (name, expense/income, Add). Text in `messages.ts`.
- Docs: `docs/corner-cases.md` (two devices adding the same name at once can still leave a duplicate to fix in the sheet; an added account or category has no budget until set in `Budgets`; no undo, remove the row in the sheet).

## Left to the builder
Copy, field widths, where the new item scrolls into view.

## Checks that need a person
Add an account and a category on the real copy: they appear in the sheet's tabs on the next free row with checkboxes ticked, the sheet's Monthly Summary lists the category, Add offers both; adding a duplicate or a 41st account is refused with a message.
