# Month view rules

Derived from the ledger views, so the app and the sheet agree.

- **Planned** per category is the `Budgets` amount for the category in the month's year (monthly amount, base currency).
- **Accounts:** only entries of accounts ticked `In Monthly` in `Accounts` count; the screen says how many accounts are included.
- **Actual** per category is the sum of that category's entries dated in the month. Each entry converts at the `Rates` row of its own month (the latest row on or before it).
- **Missing rate:** an entry whose currency has no rate for the month is left out of the combined totals and the currency is named; its native amount is still listed.
- **Business** is the expense category named `Business`; **Regular** is total expenses minus it.
- **Transfers** are not part of the month view.
- **Savings rate** is (income actual - expenses actual) / income actual; none is shown without income.
- **Uncategorised:** entries whose category is empty or not in `Categories` are grouped under "Uncategorised" so totals still add up. An inactive category is listed only when it has entries.
- **No rollover:** unspent budget is not carried to the next month. Combined amounts are approximate when entries use more than one currency.
