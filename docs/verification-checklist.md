# Verification checklist (things only a person with real accounts can check)

Everything below needs a real Google account, a real phone, or two people. The automated suite
(`pnpm test`, `pnpm exec playwright test`) uses an in-memory sheet and cannot cover them.
Do them in order; stop and report at the first failure. Use a **copy** of any real sheet.

## A. The template in Google Sheets

Superseded: the template is a Google Sheet (see `docs/template.md`) with its own checklist in `template/README.md`.

## B. Google Cloud and sign-in

1. Follow `docs/deploy-your-own.md` steps 1 to 3, including `VITE_TEMPLATE_COPY_URL`, then run `pnpm dev` and open the printed URL.
   *Pass:* the consent screen asks only for access to files the app opens or creates.
2. Open the Network tab while you use the app. *Pass:* requests go only to `sheets.googleapis.com`, `www.googleapis.com` (the `files.copy` call and the account lookup), `accounts.google.com`, `apis.google.com` and your own host.
3. Application → Local Storage. *Pass:* it holds only `fitracker.sheet`, `fitracker.device` and (after a Sign out) `fitracker.signedOut`, and no token. IndexedDB `fitracker-auth` holds only the token with its expiry time.

## C. First run and linking

4. Open the app in a fresh browser profile. *Pass:* the first screen offers **Create your sheet from the template**.
5. Tap it and pick the template in the Picker. *Pass:* a copy named `Fitracker` appears in My Drive, has no attached script, and the app opens on the Add form.
   If the copy fails (spike S5 fallback): *Pass:* the template's Make a copy page opens, and **I made my copy: link it** links your copy.
6. Settings → **Link a different sheet** and **Unlink**. *Pass:* unlinking warns first and says the sheet is not changed; after unlinking the first-run screen shows; relinking works.
7. Link a v0.1 yearly sheet (a copy). *Pass:* the app says "That sheet is not a fitracker ledger" and the previous link is unchanged.
8. In Google Sheets delete the `fitracker.schemaVersion` metadata of your copy (Data → Named ranges and metadata, or the template's `showSchemaVersion`), then reload the app. *Pass:* the app re-stamps it with one write and keeps working.

## D. Live entry

9. Add tab: type `12,50`, pick place, category and account (EUR), Save. *Pass within about 15 s:* a row appears in `Ledger` below the last row, `A` holds an id, `B` is a date, `D` is 12.5, column `J` still computes, and the Month tab shows it.
10. Add an entry on a GBP account. *Pass:* the amount is stored as typed, in the account's currency.
11. On a EUR account choose currency GBP and type `10`. *Pass:* a warning shows the converted amount; Save is refused until **Convert and keep**; the stored amount equals the GBP amount at that entry month's `Rates` row, and the description has no added note.
12. Month tab → category → entry → change the amount → Save changes. *Pass:* the same row changes; no new row.
13. Same entry → Delete → confirm. *Pass:* `A` to `I` of that row are empty and the row stays; Activity shows it with **Undo**; Undo adds it back.
14. Type a description starting with `=` (for example `=1+1`). *Pass:* the cell shows the text `=1+1`.
15. In Sheets type a row by hand in `Ledger` (once with an id in `A`, once without). *Pass:* after a refresh both show in the app and the one without an id now has one.
16. In Sheets type a row with a text date and **no id**. *Pass:* the Activity tab badge shows 1 and the row is listed as `Ledger › row N › amount` with the cells that were read, an **Open in Sheets** link and **Fix here**; Month totals do not change. Tap **Open in Sheets**. *Pass:* Google Sheets (browser, or the app on a phone) opens on the `Ledger` tab with that row selected (if the app only opens the tab, note it).
17. Tap **Fix here** on that row. *Pass:* the form is pre-filled with what could be read; after you correct and Save, the row in the sheet is overwritten with the fixed entry and an id, and it leaves the list. Make another junk row and use **Delete** in the form: *Pass:* a warning says it cannot be undone, and the row's `A` to `I` are cleared. Then type text into the amount of an entry that already has an id and fix it the same way: *Pass:* it keeps its id. Finally make a junk row, sort the `Ledger` in Sheets, then tap **Fix here** and Save: *Pass:* the app refuses ("no longer holds what was shown") and changes nothing.

## E. Rates and months

18. Open the app on the first day of a new month (or set the clock). *Pass:* last month's `Rates` row now holds numbers instead of formulas, and one new row for the current month holds `GOOGLEFINANCE` formulas.
19. Open the app on two devices at the same moment. *Pass:* only one new `Rates` row exists.

## F. Offline, PWA and two people

20. Open the deployed HTTPS site and **Add to Home Screen / Install**. *Pass:* it launches fullscreen with the invader icon.
21. Airplane mode, add two entries. *Pass:* offline banner and "2 waiting to sync". Turn airplane mode off. *Pass:* both appear in `Ledger` exactly once.
22. Sign in once, then close and reopen the installed app (and a desktop browser tab, not private). *Pass:* it opens already signed in (Settings shows **Sign out**), with no banner and no Google window, and entries sync straight away (the stored token was reused). After **Sign out**, DevTools → Application → IndexedDB → `fitracker-auth` holds no token. Leave the app closed for over an hour, open it and tap anywhere. *Pass:* a Google window flashes and the app signs in by itself (and syncs), or the banner appears and one tap on **Reconnect** syncs. At launch no window is opened and no pop-up-blocked icon appears. Private window or blocked third-party cookies: *Pass:* the banner appears after the first tap and the app stays usable offline. After **Sign out**, reload. *Pass:* the app stays signed out until you tap **Sign in**.
23. Place field → **Use my location**. *Pass:* the first time it asks permission; after two entries saved at one spot with GPS on, a third tap suggests that place.
24. Settings → Appearance: System, Light, Dark. *Pass:* the whole app changes immediately and stays after reloading; System follows the phone.
25. Share the sheet with your partner, who links it on their phone. Both press Save within a second on different entries. *Pass:* both exist, on different rows.
26. The partner deletes a row in Sheets; before the app refreshes, you edit that entry. *Pass:* a badge on Activity says the row was removed; **Add as new row** recreates it.
27. Sort `Ledger` in Sheets (Data → Sort), then edit an entry in the app. *Pass:* the edit lands on that entry, or Activity flags "now holds a different entry"; it never overwrites another entry silently.
28. Untick `In Monthly` for one account in `Accounts`, then refresh the app. *Pass:* the Month totals drop that account's entries and the screen says "2 of 3 accounts included" (for three accounts).
29. Fresh Android Chrome profile with third-party cookies blocked: open the app, tap **I already have a sheet: link it**, close the Picker. *Pass:* **Trouble linking?** opens by itself with the per-browser steps; following the Chrome steps makes the Picker list your sheets. Then open the app signed out with no sheet at phone width. *Pass:* the title, the three tiles and the first button are visible without scrolling.
30. Two Google accounts (or two browsers) on the same sheet. Settings: untick **Month** for one account on device 1, wait a minute and reopen device 2. *Pass:* device 2 shows the same account count on Month and **Differs from the sheet** in Settings; the sheet's `Accounts` cells and `Monthly Summary` are unchanged. **Use the sheet's value** returns both to the sheet's ticks.
31. Open the sheet, **Extensions > Apps Script**, paste `function listMetadata() { SpreadsheetApp.getActive().createDeveloperMetadataFinder().find().forEach(function (m) { Logger.log(m.getKey() + ' = ' + m.getValue()); }); }`, pick `listMetadata` in the function dropdown, **Run**, and read the **Execution log** (a bare expression without a function gives "unknown error"). After setting, clearing and setting the same icon three times in Settings. *Pass:* exactly one `fitracker.icon.account.<name>` line, and `fitracker.schemaVersion = 3` untouched.
32. Pick an emoji for an account and a category in Settings. *Pass:* it shows in Add (dropdowns), Month and Activity on both devices; **Use the default icon** restores the guessed one.
33. Month, **By day**: on a phone, open an entry from the day list, edit it, then Undo from Activity; add a transfer and find it in the list. *Pass:* edit, delete and undo behave as from **By category**.
34. Open Month, switch to **Year** for the year of your real book. *Pass:* income, expenses and savings rate equal the sheet's `Annual Summary` for the same year (accounts ticked `In Annual`); the Net worth chart's table matches the sheet's `Balances` month-end matrix (within a cent).
35. Activity, **Record a balance**: save one with the phone offline. *Pass:* it appears under Pending, the Year net worth shows it at once, and after reconnecting a row `id, date, account, balance, note` is in `Snapshots`. **Undo** removes the row.
36. Overview tab: the dock label reads **Overview**. In both Month and Year, the next arrow is greyed out at the present (current month, current year) and the previous arrow at your oldest entry's month or year; each works again after moving once. In Settings, tap the version (opens the release notes) and **Report issues** (opens a new GitHub issue with `App version: ...` filled in). The appearance icon sits at the top right of every screen; tapping it lists System, Light and Dark, and with changes waiting to sync the info pill sits to its left. Sync, version, feedback and schema version are their own tile in Settings. Add an entry dated next month: the next arrow then reaches that month. *Pass:* all three. The accounts line is a small centered info pill in both views.
37. Settings, on a copy of the real sheet: open **Accounts**, add an account (name, currency). *Pass:* it appears in the list and in Add's account dropdown, the sheet's `Accounts` tab has it on the next free row with In Monthly and In Annual ticked as checkboxes, and **Undo** clears the row. Add a category of each type: the sheet's `Monthly Summary` lists the expense one after a refresh. The new row shows real checkboxes and the currency dropdown like the rows above it (on a Google Sheets Table too). Try a duplicate (different capitals), `Car*`, and a 41st account: each is refused with a message and nothing is written.

## Could be automated if you give me credentials

Items 1 to 17 and 21 to 28 could run as a Playwright test against a throwaway Google account and a copy of the template. That needs a test Google account, an OAuth client for it and the template copy link; say if you want it.
