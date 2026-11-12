# Changelog

All notable changes are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

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
