<p align="center"><img src="assets/title.svg" alt="fitracker logo" width="40%" /></p>

<p align="center"><img src="public/hero.webp" alt="The fitracker PWA on a phone, adding an expense" width="100%" /></p>

# fitracker

A fast, installable, offline-first phone app for the budget ledger you keep in Google Sheets.
Add an expense in a few taps, see budget vs actual by month and year, and keep using the sheet
itself: **the sheet is the only database**. There is no server of ours; the app talks to
the Google Sheets API straight from your browser.

- **Quick entry.** Amount, one tap on a suggested place, Save. The date defaults to today, the
  account to the last one you used, and the account decides the currency. Place, description,
  category and account suggest from your own history.
- **EUR, GBP or USD per account.** Each account has one currency and entries take it. Typing
  another currency asks you to confirm a conversion at that month's rate. Totals are in the
  sheet's base currency (EUR) using monthly rates.
- **Offline first.** Changes are queued on the device and replayed in order when you are back
  online. A change to a row that no longer exists is set aside for you, never silently retried.
- **Undo and redo.** Deletes and edits keep the previous values, so you can undo them from
  Activity and redo what you undid.
- **Overview.** Browse a month by day (newest first) or by category, with budget vs actual and
  expense charts, or switch to a Year view with income, expenses, savings rate, spending by
  category and net worth, using the same charts as the sheet. Month and year navigation stops at
  the oldest and newest months that have records.
- **Balances.** Record an account balance (a snapshot) from Activity, offline too; net worth in
  the Year view starts from your latest snapshot of each account.
- **One ledger for all years.** A single sheet holds every year, with account balances (snapshots),
  monthly rates and summary tabs. Create your own from the template on first run.
- **Settings.** Choose per account whether it counts in the Month and Year totals, pick an emoji
  for any account or category, and add accounts and categories without opening the sheet. These
  settings are stored in the sheet's own metadata or in its `Accounts` and `Categories` tabs, so
  everyone who shares the sheet sees them. Appearance (system, light, dark) is the icon at the top
  right.
- **Shared by whoever has the sheet.** Each person signs in with their own Google account.

## Run it

```bash
pnpm install
cp .env.example .env     # fill in the Google values, see docs/deploy-your-own.md
pnpm dev
```

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm preview` | develop, build, preview the production bundle |
| `pnpm typecheck` / `pnpm check` / `pnpm lint` / `pnpm test` | types (`check` adds the build config), lint, unit tests |
| `pnpm exec playwright test` | end-to-end tests against an in-memory sheet (no Google needed) |
| `pnpm hero` | regenerates `public/hero.webp` (this page's picture and the first-run screen) before a release |

## Docs

- [Deploy your own copy](docs/deploy-your-own.md): Google Cloud setup and hosting.
- [The sheet template](docs/template.md): what the app expects, and how to bring older yearly sheets in.
  The script and import runbook are in [template/](template/README.md).
- [Month, Year and Balances rules](docs/month-rules.md) and [known corner cases](docs/corner-cases.md).
- [Verification checklist](docs/verification-checklist.md): what to check by hand on a real sheet and phone before a release.
- Design: the current [ledger v2 design](docs/designs/specs/2026-11-12-fitracker-ledger-v2-design.md);
  every spec and plan since is in [docs/designs/](docs/designs/specs/README.md).

## License

MIT, see [LICENSE](LICENSE).
