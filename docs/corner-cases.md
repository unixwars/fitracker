# Known corner cases

Rare situations the app accepts; each can be fixed by a person in the sheet.

- Two people saving in the same second normally get different rows; the read-back after each write confirms the row, and anything rarer shows under Needs attention.
- Editing the same entry on two devices: the later sync wins; the overwritten values are kept for Undo on the device that overwrote them.
- A row the app cannot parse (text date, amount that is not a positive number, unknown type or account) is listed under Needs attention as "row not understood" and ignored until fixed. A row that has an id can be fixed or deleted in the app (found by its id); a row without an id, or with an id that occurs twice, can only be fixed in the sheet, through the **Open in Sheets** link that selects the row. Snapshots rows are link-only for now.
- New `Accounts` rows start unticked and inactive until the boxes are ticked.
- The month-roll freezes the closed month at the live rate read when the app first opens in the new month, not the month's average.
- Two devices that roll the same month at the same moment may both write the same `Rates` row; the values are identical in practice.
- A changed account currency flags queued entries for that account as `AccountChanged`.
- An entry added the same day as a snapshot for its account is excluded from that snapshot's balance until the next snapshot.
- Place and description suggestions and GPS place memory are per device, not shared between people.
- The access token lasts about an hour; after it expires a "Reconnect" tap may be needed, especially in an installed iOS app.
- Rows sorted in Sheets keep their ids in column A; if an id ends up on a different entry the app refuses to edit it and flags it.
- Ids for rows typed directly in Sheets are written to the row numbers of the read that found them; sorting the sheet in the few milliseconds in between could attach an id to the wrong row, which the wrong-row check then flags on the next edit.
- Two devices adding an entry in the same ~100 ms can pick the same free row; the later write overwrites the earlier. The read-back after each write retries the loser, and the 7-day check flags a row that vanished as "no longer in the sheet".
- If the browser blocks third-party cookies (Safari, strict Chrome or Firefox settings, a fresh incognito window), the Google Picker fails with the misleading message "The API developer key is invalid"; allow third-party cookies for the site and retry (spike S5).
- A Ledger row copied in Sheets brings its hidden id: the first row keeps the id, the copy is listed under Needs attention as "row not understood" until its id (column A) is cleared or the row deleted.
- Sorting or inserting rows in Sheets in the fraction of a second between the app's last read and its write can still land an edit on the wrong row; edits and deletes re-check the id and the entry's content just before writing, which narrows the window to one request.
- An edit rewrites columns A to I of its row as plain values, so a formula typed by hand in one of those cells becomes its value when that entry is edited in the app.
- Id backfill for a hand-typed row writes the id by row number, so a sort in Sheets in the same fraction of a second can overwrite another entry's id. The app adopts the new id only if the row still holds the entry it was written for; the entry that lost its id gets a new one on the next refresh, and its queued changes (if any) are flagged "row removed".
