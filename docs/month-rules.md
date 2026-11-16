# Month view rules

Derived from the ledger views, so the app and the sheet agree.

- **Planned** per category is the `Budgets` amount for the category in the month's year (monthly amount, base currency).
- **Accounts:** only entries of accounts ticked `In Monthly` in `Accounts` count (a shared setting in Settings overrides the tick inside the app); the screen says how many accounts are included.
- **Actual** per category is the sum of that category's entries dated in the month. Each entry converts at the `Rates` row of its own month (the latest row on or before it).
- **Missing rate:** an entry whose currency has no rate for the month is left out of the combined totals and the currency is named; its native amount is still listed.
- **Business** is the expense category named `Business`; **Regular** is total expenses minus it.
- **Transfers** are not part of the month view.
- **Savings rate** is (income actual - expenses actual) / income actual; none is shown without income, or when expenses are above income (it would be negative).
- **Uncategorised:** entries whose category is empty or not in `Categories` are grouped under "Uncategorised" so totals still add up. An inactive category is listed only when it has entries.
- **No rollover:** unspent budget is not carried to the next month. Combined amounts are approximate when entries use more than one currency.

## Annual view

The Year view is twelve Month views over the accounts ticked `In Annual`, so every Month rule above applies (own-month rates, missing rates, Uncategorised, transfers left out). Planned for a category is its monthly budget times twelve. Totals are the sums of the twelve months; the savings rate is none without income or when expenses exceed income (the sheet's `Annual Summary` would show a negative rate).

## Balances

As the `Balances` tab: a month-end balance is the latest snapshot on or before the month end (the last row wins a tie; none counts as zero) plus income, minus expenses and transfers out, plus transfers in converted at the entry month's rate, for entries dated after the snapshot day, shown in base at the month-end rate. Every account is listed, not only those ticked `In Annual`. Months after the current one are empty. Inflows and outflows are income plus transfers in, and expenses plus transfers out, in base at each entry's own month rate, for the year. Transfers in are rounded to the minor unit before the month-end conversion, so a figure can differ from the sheet by a cent.
