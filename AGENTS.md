# Repo guidelines

Svelte (or Preact) + TypeScript + Vite, installable PWA. Data lives in a Google Sheet,
read and written straight from the browser through the Sheets API v4. No backend
for data. Do not add one.

## Commands
- `pnpm dev` / `pnpm build` / `pnpm preview`; `pnpm hero` regenerates `public/hero.webp` (README picture and first-run screen) before a release
- `pnpm exec tsc --noEmit` (or `svelte-check`), `pnpm lint`, `pnpm test`, `pnpm exec playwright test`
- Before calling work finished: types, lint, unit tests, then Playwright.

## Rules
- **Pure logic in `src/lib` with a `.test.ts` beside it.** Parsing, money, sync and
  queue rules are functions; components render and do not decide. Test first.
- **Money is integer minor units.** Request `UNFORMATTED_VALUE` and never parse
  locale-formatted strings. Never overwrite formula cells, except the `Rates` month-roll (spec 3.4).
- **One column mapping, one source.** The sheet is one multi-year book (`Ledger`, `Snapshots`,
  reference tabs). Define its layout once in `src/lib/schema.ts`; nothing else hardcodes a column or tab name.
- **Rows are found by the id column (`Ledger` and `Snapshots` column A), never by row number.** Row numbers shift. The one exception is repairing an unreadable `Ledger` row that has no usable id: the row is re-read right before the write and refused unless it still holds exactly the cells the user was shown.
- **One data seam.** Screens, the outbox and prediction use the `EntryStore` interface; only the
  Sheets adapter knows about Sheets.
- **Schema is versioned.** The book carries version 3 as developer metadata (`fitracker.schemaVersion`). The
  app has no migrations. A newer version is read-only; an unrecognised layout aborts before any write; a lost
  tag is re-stamped only when the `Ledger` and `Snapshots` headers match.
- **The app writes only `Ledger` columns A-I, `Snapshots`, the `Rates` maintenance rows and its own `fitracker.*`
  developer-metadata entries** (schema version, shared settings: icon choices and account include toggles, one entry
  per name); never `J`, a view, another reference tab or a cell of `Accounts`. A shared setting overrides the sheet
  inside the app only and is never written to a cell.
- **Offline-first.** Writes (append, edit, delete) go to an IndexedDB outbox and are
  replayed in order. A replay on a missing row is dropped and flagged, not retried.
  Last write wins per row; keep the overwritten values so the user can undo.
- **Fast by default.** Render cached data first, refresh in the background, use one
  `values:batchGet` per screen, respect the ~60 reads/min quota. Watch the bundle
  size; a new dependency needs a reason.
- **Auth.** Google Identity Services, `drive.file` scope with the Picker. The access token may be kept on the
  device so a reload or relaunch within its hour needs no new sign-in, but only in IndexedDB, together with its
  expiry time, and never in `localStorage`. Delete it on Sign out (and revoke it) and when it expires; never use
  an expired one. Stored config is the linked spreadsheet id, device settings and that one token.
- **Secrets stay out of the repo.** OAuth client ID and anything else go in `.env`;
  list the names in `.env.example`.
- **Destructive actions warn first** and are undoable where possible.
- **Accept rare corner cases** a human can fix in the sheet; note them in one line in `docs/`.
- **English everywhere**, including comments and test names. User-facing text lives in
  one messages file, not inline in components.
- **Do not reformat.** No formatter; match the style of the file you are in.
- **Verify library APIs against the installed version** (`node_modules/<pkg>`), not memory.

## Git
- Feature branches only; never push to `main`. Do not add attribution lines to commits or PRs.
- Commit `pnpm-lock.yaml`. The devcontainer installs and fetches Chromium only if it exists.
- Specs and plans go in `docs/designs/`; ask before editing them.
- GitHub access is per project. A bot account is a collaborator on one repo at a time, 
  with a classic token (`repo` scope only, 30 days) kept in `~/.gh_token`, outside the repo.
  Load it per command with `export GH_TOKEN=$(cat ~/.gh_token)`. Never print it, commit it or 
  paste it in chat. If `gh auth status` fails, ask the user; do not look for other 
  credentials. Push feature branches only, and open PRs against `dev` unless told otherwise.

## Shell
- Python tooling goes in a venv (`python3 -m venv`); system pip is blocked on Debian.
- Lighthouse uses Playwright's Chromium via `CHROME_PATH`.

## Delivering work

How a branch becomes a pull request. The author of a change is a weak reviewer
of it, so the steps put an independent look and a human check between the code
and `main`.

- **Spec and plan** in `docs/designs/` (`specs/`, `plans/`), approved by the user before code. Always evaluate tradeoffs and what could be sacrificed in exchange of simplicity or robustness. Architecture reviews are recorded in `docs/designs/architecture_reviews/`, each pointing to the specs and plans it produced.
- **Implement test-first**, one commit per task.
- **One independent review of the whole branch** by a fresh reviewer on the latest available Opus model, told which failure classes to hunt (access control, races, quotas, data deletion, migrations).  .
- **Fix findings test-first.**
- **Verify what an agent cannot.** Before any PR, do a first pass yourself: list every behaviour that needs a real service or a person (a live call, a realtime sync, uploads to storage, applying a migration, a two-person session), check what can be checked from here, and then give the user a short numbered checklist: the exact commands to run, what to click, and what a pass looks like. Wait for the user to report the result. If any check could be done autonomously with tooling, tell the user if he would like to provide it.
- **Open a PR only after the user confirms the checks** Never merge, never push to `main` or `dev`. The user reads the diff for auth, migrations and anything that deletes data.
- **A PR into `main`**:
  - asks if the version will be bumped.
  - updates CHANGELOG.md
  - update translations if they exist

### Issue tracker

Issues live in GitHub Issues for this repo (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Limits and orchestration

- Minimize kv cache misses. Every tool call must have a timeout, every response to the user must be possible to react to and respond to within a minute.

- No walls of text, at most a few paragraphs, ideally one. Use Bottom Line Up Front communication style with the user.
