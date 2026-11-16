# Changelog

All notable changes are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]


### Changed
- The Month tab is now called Overview, since it covers months and years. The previous and next arrows (month and year) stop at the oldest and newest months that can have records: the present, unless the ledger has entries before or after it. In Settings the version number links to the release notes, and a new "Report issues" entry opens a GitHub issue with the app version prefilled. The Settings screen separates the controls (Appearance is now a one-tap segmented control, with the install button) from the read-only facts (sync, app version, feedback, schema version), which sit below as a quiet list. "N of M accounts included" is a small centered info pill.
- Settings: Accounts and Categories are collapsible sections; only one icon picker is open at a time (it closes on Escape or a tap outside), and categories show their built-in icon instead of a dot.
- First-run screen: "Create from template" and "I already have a sheet" are equal-width with an "or" between them (hover highlights the one you would press), "How it works" and "Trouble linking?" are bold with a chevron, and the footer is one small GitHub pill (`fitracker v0.2.1`, or the commit in parentheses on a dev build) aligned right; the Releases link stays in Settings. The screen is now the same whether or not you are signed in, with both folds always shown.

### Fixed
- The header status pill is smaller, uses the info colour, and only appears while changes are waiting to sync ("Up to date" is no longer shown; Settings still lists the sync status). The first-run footer pill no longer restyles it.
- Undo no longer grows the log: an undone change shows **Redo** on its own row, and Undo and Redo toggle that row instead of adding new entries to Recent changes.
- Tapping anything on the first screen (for example "How it works") before a sheet was linked tried a silent Google sign-in, which flashed a window and vanished. It now only happens once a sheet is linked.

### Added
- A Year view on the Month screen (accounts ticked In Annual): totals, savings rate and per-category figures, with charts for income vs expenses, spending by category and month, expense proportions, net worth by account and inflows/outflows; the Month screen has budget vs actual and expense proportions charts. Charts are drawn in the app (no chart library) with a table alternative under each.
- Record an account balance (a snapshot) in Activity; it works offline and Undo removes it.
- Shared settings in Settings: choose per account whether it counts in Month and in Year, and pick an emoji for any account or category. Both are shared with everyone using the sheet, stored as the sheet's own developer metadata (`fitracker.*`), and never written to a cell. Settings marks accounts that differ from the sheet.
- Browse by day (the default view of Month, before By category): a "By day" switch on the Month screen lists the month's entries newest day first, including transfers, and opens the same edit sheet.
- Cache headers for Cloudflare Pages (`public/_headers`) and a Cloudflare Pages section in `docs/deploy-your-own.md`.

---

## [0.2.1] - 2026-11-15

### Added
- A clearer first screen for new users: what the app does (expenses, budgets, net worth, in a Google Sheet you own), what to do next, a "Trouble linking?" help for browsers that block the Google picker's third-party cookies, and links to the project and its releases.
- An "Install app" button (Settings and the first screen) where the browser can install the app, and a Share-button hint on iOS.
- Settings links to the release notes.

### Fixed
- Clearing the place that GPS filled in no longer refills it immediately.

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

[0.2.1]: https://github.com/unixwars/fitracker/releases/tag/v0.2.1
[0.2.0]: https://github.com/unixwars/fitracker/releases/tag/v0.2.0
[0.1.0]: https://github.com/unixwars/fitracker/releases/tag/v0.1.0
