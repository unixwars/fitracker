# Changelog

All notable changes are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.2.0] - 2026-11-15

### Changed
- One multi-year ledger sheet (`Ledger`, `Snapshots`, `Accounts`, `Categories`, `Budgets`, `Rates`, `Settings` and view tabs) replaces one sheet per year. A sheet from 0.1.0 is refused with a clear message; older yearly sheets are converted with the import tool, see `docs/template.md`.
- Each account has one currency; an entry in another currency asks you to confirm a conversion at that month's rate before saving.
- The Month screen counts only accounts ticked `In Monthly` and converts every entry with the rate of its own month.
- The app links one spreadsheet. First run creates it from the public template with the Google picker (`drive.file` only), or links an existing one.
- Settings shows the app version and the commit it was built from.
- Rows are written to an explicit free row and read back; the app never writes column `J`, a view or another reference tab.

### Added
- Amount entry is unambiguous: a comma becomes a dot as you type, there are no thousands separators, and at most two decimals are kept.
- Category and account are dropdowns with the remembered choice pre-selected; the description pre-fills from the last purchase at the chosen place.
- Rows the app cannot read can be fixed or deleted in the app; a row without a usable id is found by its row number and only changed while it still holds what you were shown. Each such row has an **Open in Sheets** link that selects it, and Settings shows the sheet's name as a link to it.
- Activity marks rows that were not applied or cannot be read in red and rows that only ask for a look in amber. It lists entries that have no valid category under "Missing a category"; tapping one opens the edit form. When the app has to add rows to a full tab, the new rows get the last row's number formats and data validation.
- The access token is kept on the device (IndexedDB, with its expiry time) so a reload or relaunch within the hour needs no sign-in; Sign out deletes and revokes it.
- When the stored token has expired, your first tap of a session asks Google for a new one silently; if the browser refuses, a Reconnect banner appears. The app never opens that window by itself at launch, because browsers block it. Sign out is remembered across reloads.
- Settings has two tiles: the linked sheet with Unlink, and the signed-in Google account email with Sign out. The account is looked up from Google each time and never stored.
- A Google account that cannot open the linked sheet (403) is dropped with a message asking you to reconnect and choose the right account.
- The dock tabs have icons, and category and account dropdown options show monochrome icons (Chrome, desktop and Android) or an emoji (other browsers) and Recent changes show the category icon. Settings has only Sign out; the Reconnect banner signs in.
- The savings rate is hidden when spending is above income, instead of showing a negative percentage.
- Recent changes show amounts, category rows show an expand icon, and Settings shows Sign in or Sign out and Unlink only while signed in.
- Month-roll of the `Rates` tab: the closed month is frozen at the live rate and the new month's row is added.
- Account balance snapshots in the data layer (no screen yet), rows the app cannot read listed under Needs attention, and duplicate-id detection.

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

[0.2.0]: https://github.com/unixwars/fitracker/releases/tag/v0.2.0
[0.1.0]: https://github.com/unixwars/fitracker/releases/tag/v0.1.0
