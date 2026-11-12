# Known corner cases

Rare situations the app accepts; each can be fixed by a person in the sheet.

- Two people saving in the same second can pick the same row; the read-back moves the later entry to the next free row, and anything rarer shows under Needs attention.
- Editing the same entry on two devices: the later sync wins; the overwritten values are kept for Undo on the device that overwrote them.
- A row whose date is typed as text, or whose amount is not a number, is ignored by the app until fixed in the sheet.
- The sheet's own summaries convert foreign currencies at the live rate, so past totals move with exchange rates.
- Place and description suggestions and GPS place memory are per device, not shared between people.
- The access token lasts about an hour; after it expires a "Reconnect" tap may be needed, especially in an installed iOS app.
- Rows sorted in Sheets keep their ids in column A; if an id ends up on a different entry the app refuses to edit it and flags it.
- Template quirks left as they are: Expenses `H14` has a category dropdown on an account column, and Transfers `E10:G10` have date validation instead of account dropdowns.
- Rollover budgets (Setup "Use Rollover") are shown by the sheet only, not by the app.
- Entries with a negative amount typed in the sheet are shown but cannot be edited in the app (the form only accepts positive amounts).
- Ids for rows typed directly in Sheets are written to the row numbers of the read that found them; sorting the sheet in the few milliseconds in between could attach an id to the wrong row, which the wrong-row check then flags on the next edit.
- An entry must be dated inside the selected year; to record one in another year, switch the year in Settings first.
