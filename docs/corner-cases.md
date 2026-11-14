# Known corner cases

Rare situations the app accepts; each can be fixed by a person in the sheet.

- Two people saving in the same second append to different rows; the read-back after each append confirms where each landed, and anything rarer shows under Needs attention.
- Editing the same entry on two devices: the later sync wins; the overwritten values are kept for Undo on the device that overwrote them.
- A row the app cannot parse (text date, amount that is not a positive number, unknown type or account) is listed under Needs attention as "row not understood" and ignored until fixed in the sheet.
- New `Accounts` rows start unticked and inactive until the boxes are ticked.
- The month-roll freezes the closed month at the live rate read when the app first opens in the new month, not the month's average.
- Two devices that roll the same month at the same moment may both write the same `Rates` row; the values are identical in practice.
- A changed account currency flags queued entries for that account as `AccountChanged`.
- An entry added the same day as a snapshot for its account is excluded from that snapshot's balance until the next snapshot.
- Place and description suggestions and GPS place memory are per device, not shared between people.
- The access token lasts about an hour; after it expires a "Reconnect" tap may be needed, especially in an installed iOS app.
- Rows sorted in Sheets keep their ids in column A; if an id ends up on a different entry the app refuses to edit it and flags it.
- Ids for rows typed directly in Sheets are written to the row numbers of the read that found them; sorting the sheet in the few milliseconds in between could attach an id to the wrong row, which the wrong-row check then flags on the next edit.
- Two devices appending in the same ~100 ms can be given the same row by Sheets (spike S1); the later write overwrites the earlier. The after-append read-back retries the loser, and the 7-day check flags a row that vanished as "no longer in the sheet".
