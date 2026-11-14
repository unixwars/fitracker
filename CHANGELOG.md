# Changelog

All notable changes are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Changed
- One multi-year ledger sheet (`Ledger`, `Snapshots`, `Accounts`, `Categories`, `Budgets`, `Rates`, `Settings` and view tabs) replaces one sheet per year. A sheet from 0.1.0 is refused with a clear message; older yearly sheets are converted with the import tool, see `docs/template.md`.
- Each account has one currency; an entry in another currency asks you to confirm a conversion at that month's rate before saving.
- The Month screen counts only accounts ticked `In Monthly` and converts every entry with the rate of its own month.
- The app links one spreadsheet. First run creates it from the public template with the Google picker (`drive.file` only), or links an existing one.
- Rows are written to an explicit free row and read back; the app never writes column `J`, a view or another reference tab.

### Added
- Month-roll of the `Rates` tab: the closed month is frozen at the live rate and the new month's row is added.
- Account balance snapshots in the data layer (no screen yet), rows the app cannot read listed under Needs attention, and duplicate-id detection.
- Live-check and spike harness pages under `docs/designs/spikes/`.

### Removed
- Yearly sheets, the year switcher and the in-app migrations.

## [0.1.0] - 2026-11-12

First release.

### Added
- Installable, offline-first PWA that reads and writes your yearly budget Google Sheet straight from the browser through the Sheets API. There is no backend: the sheet is the only database.
- Quick entry for expenses, income and transfers: amount, a suggested place, Save. Places and descriptions are suggested from your own history, ranked by frequency, with usual amounts and the nearest known place from your location.
- Entries in EUR, GBP or USD; the sheet converts to the base currency. The date defaults to today and the currency to the last one used.
- Month screen with budget vs actual per category, Regular vs Business split, savings rate and drill-down to the entries.
- Activity screen with undo for edits and deletes, and a "Needs attention" list for changes to rows that no longer exist.
- Offline queue (IndexedDB outbox) replayed in order when the connection returns; last write wins per row.
- Link one sheet per year, open any year, and unlink a year after a warning (refused while changes are waiting to sync).
- Versioned sheet migrations with backup tabs first; a sheet newer than the app is read-only.
- Google sign-in with the `drive.file` scope and the Picker; access tokens are kept in memory only.
- Icons on category labels in the Add form and the Month screen.
- New logo, title, PWA icons and a hero image in the README.

### Notes
- The budget template is `assets/FIRE-TEMPLATE.xlsx`; see `docs/deploy-your-own.md` to run your own copy.

[0.1.0]: https://github.com/unixwars/fitraker/releases/tag/v0.1.0
