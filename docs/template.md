# The sheet template

`assets/FIRE-TEMPLATE.xlsx` is a generic yearly budget sheet (originally based on The Frugal Gene's
template). It is already in the layout the app expects (schema version 2). It contains no personal
data: the accounts, categories and budgets are placeholders for you to edit.

## Use it

1. Upload the file to Google Drive and open it with Google Sheets, then **File → Save as Google
   Sheets**. The Sheets API refuses `.xlsx` files, so the conversion is required.
2. In **Setup**, set the year (`C8`), your income and expense categories, budgets and accounts.
   Set the base currency in `U8` (default `EUR`); the rates table below it converts EUR, GBP and
   USD to that base.
3. In the app, link the sheet for that year (Settings → Link). The app recognises the layout by its
   headers and stamps the schema version; no migration is needed.

## Layout the app relies on

- Entry tabs `Expenses`, `Income`, `Transfers`: headers in row 9, entries from row 10.
- Column A is a hidden id column written by the app. `D` is the amount as entered, the last column
  (`I` on Expenses, `H` on the others) is the currency (EUR, GBP or USD).
- `C` is one array formula in `C10` that converts each row to the base currency. **Do not type in
  column C**; the app never writes it and the sheet's summary tabs sum it.
- `Setup` lists: income categories `B16:B35`, expense categories `B46:B68`, accounts `B76:B102`,
  monthly budgets in `C:N` next to the categories.

The array formula is stored in the file with Google's own export wrapper, the same way the other
Google-only formulas in the template are, so Sheets turns it back into `ARRAYFORMULA(...)` on import.

## Older sheets

Sheets made from the earlier two-column layout (EUR in `C`, GBP in `D`) are migrated by the app
(Settings → Sheet update), step by step, with backup tabs first. Rows it cannot classify (custom
formulas or text in `C` or `D`) stop the update before anything is written; fix them in the sheet and
run it again.
