# Shared settings: account toggles and icon choices (issues #14 part 4, #3)

Branch `feat/shared-settings`, PR into `dev`. Amends AGENTS.md: the app may also write its own `fitracker.*` developer-metadata entries (approved).

## Why
`In Monthly` / `In Annual` can only be changed in the sheet, and icons guessed from names are sometimes wrong. Both are per-sheet preferences two people should share, without the app touching a cell of `Accounts`.

## Goals / non-goals
- Goals: choose per account whether it counts in Month and in Year (Annual), and pick one emoji per account or category; both synced between the people sharing the sheet; reset to the sheet's value.
- Non-goals: writing `Accounts` cells; offline queueing of settings (see Costs); the sheet's own summaries following the override.
- Anti-goal: silently different totals. The Settings screen marks every account whose toggle differs from the sheet.

## Approaches
- **A. Device-local.** Simplest, but two people see different totals. Rejected.
- **B. Shared developer metadata, one entry per name (chosen).** `fitracker.account.<name>` = `{"m":true,"a":false}` (either field optional), `fitracker.icon.account.<name>` and `fitracker.icon.category.<name>` = one emoji. One entry per name, so two people changing different items never overwrite each other. Read with one `developerMetadata:search` per refresh, no key filter, prefix-filtered in the app.
- **C. Amend the rule to write `Accounts` cells.** Changes a reference tab people edit by hand and the sheet's formulas read. Rejected.

## Design
- `src/lib/overrides.ts` (+ test): key builders, `parseOverrides(map)`, `applyOverrides(reference, overrides)` (replaces `inMonthly` / `inAnnual` of matching accounts; unknown names ignored), emoji validation (one grapheme, at most 16 UTF-16 units; anything else is ignored on read and refused on write), keys longer than 256 bytes are not stored.
- `SheetsApi.listMetadata(id, prefix)`; `EntryStore.overrides()` and `setOverride(key, value)`; value `''` clears the override (no delete request). The read joins `fetchBook` as one extra request per refresh; the write is one `setMetadata`. The overrides are cached in the book and merged into `app.lists`, so `month.ts` and every future view are unchanged.
- Settings: an Accounts list with two checkboxes (Month, Year) and an icon button per account, a Categories list with an icon button, a "differs from the sheet" mark, and Reset. Icon picker: a short grid of common emojis plus a one-character text field.
- Docs: corner-cases (override beats the sheet inside the app only; the sheet's own summaries ignore it; renamed accounts orphan their entry; settings need a connection), `docs/month-rules.md`.

## Costs
Settings changes need a connection (they are not queued); a failure shows a message and leaves the value unchanged. One more Sheets read per refresh (the quota allows it). Two people changing the same item: last write wins.

## Left to the builder
Emoji grid contents, copy.

## Checks that need a person
Two accounts signed in to the same sheet: toggle on one, see it on the other after refresh; the sheet's Monthly Summary is unchanged.
