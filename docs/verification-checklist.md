# Verification checklist (things only a person with real accounts can check)

Everything below needs a real Google account, a real phone, or two people. The automated suite
(`pnpm test`, `pnpm exec playwright test`) uses an in-memory sheet and cannot cover them.
Do them in order; stop and report at the first failure. Use a **copy** of any real sheet.

## A. The template in Google Sheets

1. Upload `assets/FIRE-TEMPLATE.xlsx` to Google Drive, open with Google Sheets, **File → Save as Google Sheets**.
   *Pass:* the `Setup`, `Expenses`, `Income`, `Transfers`, `Monthly Summary`, `Annual Summary` tabs and the two charts are present.
2. On `Expenses`, type `10` in `D10`, `GBP` in `I10` (the cell has a dropdown with EUR, GBP, USD), a date in `B10`.
   *Pass:* `C10` shows a number (10 × the GBP→base rate), `C11` and below stay empty, typing in `D11` fills `C11`
   automatically with no formula there. Column A is hidden.
3. In `Setup`, check `U8` = `EUR` and `U16:U18` = `1` and two numbers (no `#N/A`).
   *Pass:* GBP and USD rates are numbers. If they show `#N/A`, tell me the exact text of `U17`.
4. Enter an expense with category and date this month. *Pass:* `Monthly Summary` (pick the month) shows it under that category.

## B. Google Cloud and sign-in

5. Follow `docs/deploy-your-own.md` steps 1-2, then run `pnpm dev` and open the printed URL.
   *Pass:* Settings → **Sign in with Google** opens Google's consent screen asking only for access to files the app opens.
6. Settings → pick the year of your sheet → **Link the … sheet** → choose the sheet in the Picker.
   *Pass:* it says Linked. Choosing a sheet whose `Setup!C8` year differs shows "That sheet is for …".
7. Open the app's Network tab: *Pass:* no request goes anywhere except `sheets.googleapis.com`, `accounts.google.com`, `apis.google.com`, your own host; and Application → Local Storage contains no token (only `fitracker.sheets` and `fitracker.device`).

## C. Live entry

8. Add tab: type `12,50`, pick a place/category/account, Save. *Pass within ~15 s:* the row appears in the sheet, date is a real date,
   `D` = 12.5, currency column set, `A` has an id (unhide column A to look), `C` is computed, Month tab shows it.
9. Add a GBP entry (currency dropdown). *Pass:* `I` = `GBP`, `D` is the amount as typed, `C` = converted.
10. Month tab → tap the category → tap an entry → change the amount → Save changes. *Pass:* the same row changes, no new row.
11. Same entry → Delete → confirm. *Pass:* A, B, D..I of that row are empty, `C` array formula still works for new rows, Activity shows it with **Undo**; Undo puts it back in the first free row.
12. Typed description beginning with `=` (e.g. `=1+1`). *Pass:* the cell shows the text `=1+1`, not `2`.

## D. Offline and PWA (on a phone)

13. Open the deployed HTTPS site, **Add to Home Screen / Install**. *Pass:* launches fullscreen with the invader icon.
14. Airplane mode, add two entries. *Pass:* offline banner, "2 waiting to sync". Turn airplane mode off. *Pass:* both appear in the sheet exactly once.
15. Leave the installed app closed for over an hour, open it, add an entry. *Pass:* a "Signed out … Reconnect" banner appears; tap it, sign in, the entry syncs.
16. Place field → **Use my location**: first time asks permission. After saving two entries with GPS on at the same spot, a third tap suggests that place.

17a. Settings → Appearance: switch System / Light / Dark. *Pass:* the whole app changes immediately and stays after reloading; with System, it follows the phone's dark mode. The invader logo shows in the header on both themes.

## E. Two people

17. Share the sheet with your partner; they link it on their phone (their own sign-in and Picker).
18. Both press Save within a second on different entries. *Pass:* both entries exist, on different rows.
19. Partner deletes a row in Sheets; before the app refreshes, you edit that entry in the app. *Pass:* a red badge on Activity, the item says the row was removed, **Add as new row** recreates it.
20. Sort the Expenses data range in Sheets (Data → Sort), then edit an entry in the app. *Pass:* the edit lands on that entry, or Activity flags "now holds a different entry"; it never overwrites another entry silently.

## F. Migrating an older sheet (use a COPY of a past year)

21. Link the copy. *Pass:* a banner says it needs a one-time update; Settings shows the steps.
22. Before running: note the totals on `Annual Summary` and a few entries. Run **Update the sheet** (base currency EUR).
    *Pass:* backup tabs `Expenses (backup v0)`, `(backup v1)` etc. exist; headers are `Amount` / `Currency`; every old € row has Currency EUR and its amount unchanged; old £ rows have GBP; `Annual Summary` totals match the ones noted (GBP rows differ only by the live rate); Settings shows version 2.
23. If it stops with "Fix these rows": open the listed rows, replace the custom formula or text in `C`/`D` with a plain number, run again. *Pass:* nothing in the sheet changed on the first attempt.
24. Add and edit an entry on the migrated copy. *Pass:* same as items 8-10.

## Could be automated if you give me credentials

Items 5-12, 14 and 18-22 could run as a Playwright test against a dedicated throwaway Google account and a copy of the sheet. That needs a test Google account, an OAuth client for it, and a copy of a sheet; say if you want it.
