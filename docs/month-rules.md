# Month view rules

Derived from the template's `Monthly Summary` formulas, so the app and the sheet agree.

- **Planned** per category is the `Setup` budget for that month (`Setup!C46:N68` expenses,
  `Setup!C16:N35` income), in the base currency.
- **Actual** per category is the sum of that tab's entries whose category matches and whose date is
  on or after the first of the month and before the first of the next month. The sheet sums
  column C (base-currency value); the app converts each entry's own currency through the rates.
- **Business** is the expense category named `Business`; **Regular** is total expenses minus it.
- **Transfers** are not part of the month view.
- **Savings rate** is (income actual - expenses actual) / income actual. The sheet shows 0 with no
  income; the app shows no rate instead.
- **Uncategorised**: entries whose category is empty or no longer in Setup are grouped under
  "Uncategorised" so totals still add up.
- **Rollover** (`Setup` column P/Q, "Use Rollover") is not shown in v1; the sheet's own tab still
  shows it. Combined amounts are approximate when entries use more than one currency.
