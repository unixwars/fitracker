# Browse entries by day (issue #4)

Branch `feat/browse-by-day`, PR into `dev`.

## Why
Finding an entry to edit means knowing its category. People remember *when* they entered it.

## Goals / non-goals
- Goals: newest-first list grouped by date; tap opens the existing `EntrySheet` (edit, delete, undo unchanged); no extra Sheets requests.
- Non-goals: search, filters, a fifth dock tab, listing unreadable rows (they stay under Needs attention).

## Approaches
- **A. "By category | By day" toggle on Month (chosen).** Reuses the month navigation; paging by month crosses month and year boundaries for free. Dock stays at four tabs.
- **B. Section on Activity.** Activity is about changes and problems, not the ledger. Rejected.
- **C. New dock tab.** Five tabs. Rejected.
- Window: **one month per page, grouped by day** (decided here, your call to change). A fixed day or "next 50 entries" window needs its own paging across months and adds state; the month page already exists and typical months are a few dozen entries.

## Design
- `src/lib/byDay.ts` (+ test): `groupByDay(entries, month, ...)` returns days newest first, entries within a day in ledger order. Includes expenses, income and transfers (transfers shown with from to account, which Month hides), all accounts regardless of `In Monthly` (it is a browser, not a total); a day total is not shown to avoid implying a figure that differs from Month.
- Row shows category icon, place or description, amount, account (as Recent changes does). Uses `app.displayed` so pending edits appear at once.
- UI: toggle in `MonthScreen`, extracted body components if the file grows; text in `messages.ts`.

## Left to the builder
Day header format, empty state, transfer row wording.

## Checks that need a person
Edit and undo from the day list on a phone; a month with a transfer.
