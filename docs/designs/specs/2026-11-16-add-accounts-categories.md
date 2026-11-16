# Add accounts and categories from Settings (issue #17, add only)

Branch `feat/add-accounts-categories`, PR into `dev`. Rename, delete and budget editing are out of scope (rename needs a history rewrite and stays a sheet task; see #17).

## Why
Adding an account or a category means leaving the app to edit the `Accounts` or `Categories` tab. The rule now allows the app to write the reference tabs (AGENTS.md).

## Goals / non-goals
- Goals: add an account (name, currency) or a category (name, type) in Settings; it appears at once in Add, Overview and the settings lists; the sheet's own formulas pick it up.
- Non-goals: rename, delete, reorder, edit currency or type, edit `Budgets`, an active toggle, offline queueing.
- Anti-goals: a duplicate or look-alike name; a row written below the template's capacity or outside its columns; touching any formula cell; a name that breaks a view's SUMIFS.

## Approaches
- **A. Direct write, needs a connection (chosen).** One read of the name column, one write, then refresh. Same model as shared settings. Trade-off: unusable offline.
- **B. Through the outbox.** Works offline, but adds a new op type, and an entry that uses a not-yet-written account would have to replay after it. More machinery for a rare, deliberate action. Rejected.
- **C. Append with `values:append`.** The live check showed it misplaces rows on the real template. Rejected; write to an explicit free row as `Ledger` does.

## Design
- `schema.ts`: `ACCOUNTS` / `CATEGORIES` descriptors (tab, first row, last column, **header row**, capacities) with a test that ties the caps and headers to `template/build-template.gs`.
- **Caps, counted as the template counts them.** Accounts: non-empty names in column A of `Accounts` rows 2..41 (the tab is trimmed to 41 rows; `Balances` warns above 40), so inactive accounts and rows `parseReference` skips still count. Categories: **active** rows of that type, at most 30 expense and 15 income (`ACTIVE_CATEGORIES`, `TOO_MANY_CATEGORIES`); the `Categories` tab is not trimmed. `validateNewName` is fed the raw column, not the parsed `Reference`.
- **Name rules** (`src/lib/newItem.ts` + test): trim and NFC-normalise, then store that text. Refuse: empty; a name over 232 UTF-8 bytes (so the `fitracker.icon.*` and `fitracker.account.*` metadata keys stay under 256 bytes; 100 characters is only the display limit); any `*`, `?` or `~` (SUMIFS wildcard characters in the views); a leading `<`, `>` or `=` (SUMIFS comparison); a leading `+`, `-` or `@` (kept as a cheap guard for CSV and USER_ENTERED paths, the write itself is RAW). **Duplicates are matched like the sheet matches them:** case-insensitive on trimmed NFC text (the sheet's VLOOKUP, MATCH and SUMIFS ignore case and take the first match, so "cash" next to "Cash" would take Cash's currency). Accounts are unique across the whole tab; categories per type.
- **Write path (Sheets adapter).** One `batchGet` of the name columns and the **header row** (`Accounts!A1:E1` or `Categories!A1:C1`) plus the tab guard; refuse with `UnrecognisedLayout` unless the headers match `schema.ts` (a person may have inserted a column or deleted the header). The free row is the first row after the last row where column A **or** B holds anything (never the checkbox columns, which read FALSE once cleared). **Accounts is never grown:** if the free row is past row 41, reuse the first fully empty row in 2..41 (A and B empty, re-read right before the write) or refuse with `Full`. Categories may grow, as `appendRows` does. Values are written RAW: `A:E` = `name, currency, true, true, true`; `A:C` = `name, type, true`. New accounts are ticked In Monthly and In Annual (a new account has no entries, so no total changes).
- **Races.** After the write, read the cell back. If it holds the same name, success. If it holds a **different** name (another device chose the same row), retry on the next row, up to 3 attempts, then report "try again"; `Duplicate` is reported only for a same-name match found before the write. A lost response after a good write is recognised by the same read-back (an exact match of what this device just tried is success).
- **Failure model.** Needs a connection and sign-in; added through the settings write queue, one at a time. Success is reported once the read-back confirms the write; the refresh that follows runs in the background and a failed refresh never says "not saved". Reasons: `empty`, `tooLong`, `invalidChars`, `duplicate`, `full`, `tryAgain`, plus the connection and layout errors.
- UI: an "Add account" row in the Accounts fold and an "Add category" row in the Categories fold (`AddItemForm`), all text in `messages.ts`.
- Docs (`docs/corner-cases.md`): reword "new `Accounts` rows start unticked" (app-added rows start ticked); two devices adding different names at once can still need a retry; no budget until set in `Budgets`; no undo, remove or fix the row in the sheet; a name re-added after being deleted in the sheet inherits the old `fitracker.account.*` and `fitracker.icon.*` entries keyed by that name.

## Decisions to confirm
- No undo (a typo cannot be renamed or deleted in the app and uses one of the 40 account slots). A session-only Undo that clears the row if it still holds exactly what was written is cheap; left out unless you want it.

## Left to the builder
Copy, field widths, where the new item scrolls into view.

## Checks that need a person
Add an account and a category on the real copy: they appear in the sheet's tabs on the next free row with checkboxes ticked, the sheet's Monthly Summary lists the category, Add offers both; adding a duplicate or a 41st account is refused with a message.
