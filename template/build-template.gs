/** @OnlyCurrentDoc */

/**
 * Fitracker v2 template builder (spec: docs/designs/specs/2026-11-12-fitracker-ledger-v2-design.md, rev 2).
 *
 * How to use: in a NEW EMPTY Google Sheet open Extensions > Apps Script, paste this whole file, save,
 * select `buildTemplate` and press Run. See template/README.md for the checklist.
 *
 * - buildTemplate()     creates or updates every tab, formula, validation, protection and the
 *                        schema version metadata. Safe to run twice: existing data rows are never
 *                        cleared; headers, formulas and validation are rewritten; view tabs (formulas
 *                        only) are rebuilt and keep their selector values.
 * - addCharts()          adds the charts of spec 3.7. Run it only after the data gate (spec 8, gate 4).
 *                        Not called by buildTemplate().
 * - showSchemaVersion()  logs and toasts the `fitracker.schemaVersion` developer metadata.
 *
 * Formula conventions:
 * - Every formula is a string constant at the top of this file or a literal inside one make*() function.
 * - Tab references are written as {{Tab name}} and resolved by resolveTabs(), which throws if the tab
 *   name is unknown or the tab does not exist, so a typo can never produce a silently wrong reference.
 * - Per-row and per-cell formulas use {r} (row number) and {c} (column letter); other templates use
 *   %NAME% placeholders. Any placeholder left unresolved throws before the formula is written.
 * - Formulas are always written in English with "," separators (Apps Script requires this whatever
 *   the spreadsheet locale is).
 *
 * Simplified on purpose (also listed in template/README.md, "Known simplifications"):
 * - Per-category, per-account and month-end tables have fixed sizes (MAX_* constants below); a warning
 *   cell appears when a list is longer, and an "other or inactive" row keeps the totals complete.
 * - Per-category tables list ACTIVE categories only; spending in inactive categories is in the
 *   "Other or inactive categories" row and in all totals.
 * - Summaries skip Ledger rows whose J is an error (unresolved conversion) and show how many there are.
 * - The Balances month-end matrix covers the 12 month-ends of one selected year, in base currency
 *   converted at each month-end's Rates row; future months are left blank.
 * - New rows in Accounts get unticked checkboxes; tick In Monthly and In Annual by hand.
 * - Validation covers the rows that exist when the script runs; run buildTemplate() again after a
 *   large import to extend it to the new rows.
 */

// ---------------------------------------------------------------------------------------------
// Names, headers and sizes
// ---------------------------------------------------------------------------------------------

const SCHEMA_KEY = 'fitracker.schemaVersion';
const SCHEMA_VERSION = '3';
const PROTECTION_TAG = 'fitracker: ';

const TAB = {
  LEDGER: 'Ledger',
  SNAPSHOTS: 'Snapshots',
  SETTINGS: 'Settings',
  ACCOUNTS: 'Accounts',
  CATEGORIES: 'Categories',
  BUDGETS: 'Budgets',
  RATES: 'Rates',
  EXPENSES: 'Expenses',
  INCOME: 'Income',
  TRANSFERS: 'Transfers',
  MONTHLY: 'Monthly Summary',
  ANNUAL: 'Annual Summary',
  BALANCES: 'Balances',
};
const TAB_ORDER = [
  TAB.LEDGER, TAB.SNAPSHOTS, TAB.SETTINGS, TAB.ACCOUNTS, TAB.CATEGORIES, TAB.BUDGETS, TAB.RATES,
  TAB.EXPENSES, TAB.INCOME, TAB.TRANSFERS, TAB.MONTHLY, TAB.ANNUAL, TAB.BALANCES,
];

const HEADERS = {
  LEDGER: ['id', 'date', 'type', 'amount', 'place', 'description', 'category', 'account', 'to_account', 'base_amount'],
  SNAPSHOTS: ['id', 'date', 'account', 'balance', 'note'],
  ACCOUNTS: ['name', 'currency', 'active', 'In Monthly', 'In Annual'],
  CATEGORIES: ['name', 'type', 'active'],
  BUDGETS: ['year', 'type', 'category', 'monthly amount'],
  RATES: ['month', 'GBP', 'USD'],
};

const BASE_CURRENCY_DEFAULT = 'EUR';
const CURRENCIES = ['EUR', 'GBP', 'USD'];
const ENTRY_TYPES = ['expense', 'income', 'transfer'];
const CATEGORY_TYPES = ['expense', 'income'];
const BUSINESS_CATEGORY = 'Business';

// Accounts keeps exactly 1 + MAX_ACCOUNTS rows (when they are empty), so the open ranges
// Accounts!$A$2:$A used inside SUMPRODUCT(SUMIFS(...)) stay small and fast. Insert rows to add more.
const MAX_ACCOUNTS = 40;
const MAX_EXPENSE_CATEGORIES = 30;
const MAX_INCOME_CATEGORIES = 15;

const DATE_FORMAT = 'yyyy-mm-dd';
const MONEY_FORMAT = '#,##0.00';
const RATE_FORMAT = '0.0000';
const PERCENT_FORMAT = '0.0%';
const SELECTOR_BACKGROUND = '#fff2cc';

// ---------------------------------------------------------------------------------------------
// Shared formula fragments (named constants; resolved with resolveTabs / sub)
// ---------------------------------------------------------------------------------------------

// Ledger!J2. Account currency from Accounts, rate from Rates, 1 for the base currency (Settings!B1).
// Rates rows are first-of-month dates in ascending order, so VLOOKUP(date, Rates, n, TRUE) returns the
// entry month's row (latest row on or before the date); column 2 = GBP, 3 = USD.
// Truly empty rows (no date, type, amount or account): "". Any other row that cannot be resolved
// (no or unknown account, unknown currency, no Rates row, blank rate cell, non-numeric date or
// amount): an error, counted as "Unresolved ledger rows" on the views.
// A blank rate cell becomes #DIV/0! through the division by (rate<>"") instead of a silent 0.
// INDEX does not vectorise inside ARRAYFORMULA (MATCH does), hence the nested IF + VLOOKUP shape.
const J_CURRENCY = 'VLOOKUP(H2:H,{{Accounts}}$A$2:$B,2,FALSE)';
const J_RATE_GBP = 'VLOOKUP(B2:B,{{Rates}}$A$2:$C,2,TRUE)';
const J_RATE_USD = 'VLOOKUP(B2:B,{{Rates}}$A$2:$C,3,TRUE)';
const LEDGER_J2 =
  '=ARRAYFORMULA(IF(LEN(B2:B&C2:C&D2:D&H2:H)=0,"",IF(ISNUMBER(B2:B)*ISNUMBER(D2:D)=0,NA(),D2:D*' +
  'IF(' + J_CURRENCY + '={{Settings}}$B$1,1,' +
  'IF(' + J_CURRENCY + '="GBP",' + J_RATE_GBP + '/(' + J_RATE_GBP + '<>""),' +
  'IF(' + J_CURRENCY + '="USD",' + J_RATE_USD + '/(' + J_RATE_USD + '<>""),NA()))))))';

// SUMIFS criterion pair that keeps only Ledger rows whose J is a number: an error cell never
// satisfies a numeric criterion (assumed; README self-check probe 1 verifies it), so one unresolved
// row cannot turn a summary into an error.
// 1E+300 has no decimal separator on purpose: criterion strings are parsed in the sheet's locale.
const J_IS_NUMBER = '{{Ledger}}$J:$J,"<1E+300"';

// Count of Ledger rows whose J is an error (shown on every view).
const UNRESOLVED_COUNT = '=SUMPRODUCT(--ISERROR({{Ledger}}$J$2:$J))';

// Monthly and Annual Summary: column TICKED_COL of the tab holds, from row 2, ONE spilled FILTER of the
// account names ticked for that view (TICKED_ACCOUNTS; %TICK% = Accounts column D In Monthly or
// E In Annual), or "#none#" when none is ticked. TICKED_NAMES is that list sized exactly to its length,
// so each summary cell runs one SUMIFS per ticked account and the FILTER runs once per tab.
const TICKED_COL = 'Z';
const TICKED_ACCOUNTS =
  '=IFNA(FILTER({{Accounts}}$A$2:$A,{{Accounts}}$A$2:$A<>"",{{Accounts}}$%TICK%$2:$%TICK%=TRUE),"#none#")';
const TICKED_NAMES = '$' + TICKED_COL + '$2:INDEX($' + TICKED_COL + '$2:$' + TICKED_COL +
  ',COUNTA($' + TICKED_COL + '$2:$' + TICKED_COL + '))';
// Sum of Ledger!J (base currency) over the ticked accounts. %CRITERIA% = more SUMIFS criteria pairs.
const TICKED_SUM =
  'SUMPRODUCT(SUMIFS({{Ledger}}$J:$J,{{Ledger}}$H:$H,' + TICKED_NAMES + ',' + J_IS_NUMBER + ',%CRITERIA%))';

// "Accounts included: n of m" for tick column %TICK%.
const ACCOUNTS_INCLUDED =
  '="Accounts included: "&COUNTIFS({{Accounts}}$A$2:$A,"<>",{{Accounts}}$%TICK%$2:$%TICK%,TRUE)' +
  '&" of "&COUNTA({{Accounts}}$A$2:$A)';

// Active category names of one type, at most %MAX% of them; warning when there are more.
const ACTIVE_CATEGORIES =
  '=ARRAY_CONSTRAIN(IFNA(FILTER({{Categories}}$A$2:$A,{{Categories}}$A$2:$A<>"",' +
  '{{Categories}}$B$2:$B="%TYPE%",{{Categories}}$C$2:$C=TRUE),""),%MAX%,1)';
const TOO_MANY_CATEGORIES =
  '=IF(COUNTIFS({{Categories}}$B$2:$B,"%TYPE%",{{Categories}}$C$2:$C,TRUE)>%MAX%,' +
  '"More than %MAX% active %TYPE% categories: only the first %MAX% are listed","")';

// Entry views: one QUERY over Ledger for one type and the year in B1.
const VIEW_QUERY =
  '=QUERY({{Ledger}}$A$2:$J,"select %COLUMNS% where C = \'%TYPE%\'' +
  ' and B >= date \'"&TEXT(DATE($B$1,1,1),"yyyy-mm-dd")&"\'' +
  ' and B < date \'"&TEXT(DATE($B$1+1,1,1),"yyyy-mm-dd")&"\'' +
  ' order by B %LABELS%",0)';
// Currency of the account named in column %COL% of the QUERY output (QUERY cannot join).
const VIEW_CURRENCY =
  '=ARRAYFORMULA(IF(%COL%5:%COL%="","",IFNA(VLOOKUP(%COL%5:%COL%,{{Accounts}}$A$2:$B,2,FALSE),"?")))';

// Balances: native-currency sum of one entry type for account %ACC% (matched on Ledger column
// %ACCCOL%), dated after %FROM% (the snapshot date, end of day) and on or before %TO%.
const NATIVE_SUM =
  'SUMIFS({{Ledger}}$D:$D,{{Ledger}}$%ACCCOL%:$%ACCCOL%,%ACC%,{{Ledger}}$C:$C,"%TYPE%",' +
  '{{Ledger}}$B:$B,">"&%FROM%,{{Ledger}}$B:$B,"<="&%TO%)';
// Balances: transfers INTO account %ACC% (currency %CUR%), converted into %CUR%: J holds the source
// amount in base at the entry month's rate; dividing by the destination's rate of the same month
// gives the amount in the destination currency (spec 3.5). Base-currency destinations need no rate.
// Non-base destinations: FILTER keeps only the matching transfer rows (cheap comparisons), so the
// VLOOKUP into Rates runs only for those rows, not for the whole ledger. Error rows count as 0.
const TRANSFER_IN_ROWS =
  '{{Ledger}}$I$2:$I=%ACC%,{{Ledger}}$C$2:$C="transfer",{{Ledger}}$B$2:$B>%FROM%,{{Ledger}}$B$2:$B<=%TO%';
const TRANSFER_IN =
  'IF(%CUR%={{Settings}}$B$1,' +
  'SUMIFS({{Ledger}}$J:$J,{{Ledger}}$I:$I,%ACC%,{{Ledger}}$C:$C,"transfer",' +
  '{{Ledger}}$B:$B,">"&%FROM%,{{Ledger}}$B:$B,"<="&%TO%,' + J_IS_NUMBER + '),' +
  'SUM(ARRAYFORMULA(IFERROR(FILTER({{Ledger}}$J$2:$J,' + TRANSFER_IN_ROWS + ')/' +
  'VLOOKUP(FILTER({{Ledger}}$B$2:$B,' + TRANSFER_IN_ROWS + '),{{Rates}}$A$2:$C,IF(%CUR%="GBP",2,3),TRUE),0))))';
// Balances: latest snapshot date of account %ACC% on or before %TO% (0 when none).
const SNAPSHOT_DATE =
  'MAXIFS({{Snapshots}}$B:$B,{{Snapshots}}$C:$C,%ACC%,{{Snapshots}}$B:$B,"<="&%TO%)';
// Balances: balance of the snapshot of account %ACC% dated %DATE%; the LAST row wins on ties.
const SNAPSHOT_BALANCE =
  'IF(%DATE%=0,0,IFNA(CHOOSEROWS(FILTER({{Snapshots}}$D$2:$D,{{Snapshots}}$C$2:$C=%ACC%,' +
  '{{Snapshots}}$B$2:$B=%DATE%),-1),0))';
// Rate (one unit of currency %CUR% in base) for the month containing date %DATE%.
// A blank rate cell gives #DIV/0! instead of 0.
const RATE_LOOKUP = 'VLOOKUP(%DATE%,{{Rates}}$A$2:$C,IF(%CUR%="GBP",2,3),TRUE)';
const RATE_AT =
  'IF(%CUR%={{Settings}}$B$1,1,' + RATE_LOOKUP + '/(' + RATE_LOOKUP + '<>""))';

// ---------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------

function buildTemplate() {
  const ss = SpreadsheetApp.getActive();
  const original = ss.getSheets();
  TAB_ORDER.forEach(function (name, i) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
  makeLedger();
  makeSnapshots();
  makeSettings();
  makeAccounts();
  makeCategories();
  makeBudgets();
  makeRates();
  makeExpenses();
  makeIncome();
  makeTransfers();
  makeMonthlySummary();
  makeAnnualSummary();
  makeBalances();
  setSchemaVersion();
  removeDefaultSheet(original);
  ss.setActiveSheet(ss.getSheetByName(TAB.LEDGER));
  ss.toast('Template built. Now tick the checklist in template/README.md.', 'Fitracker', 10);
}

function showSchemaVersion() {
  const ss = SpreadsheetApp.getActive();
  const found = ss.createDeveloperMetadataFinder().withKey(SCHEMA_KEY).find();
  const msg = found.length === 0
    ? SCHEMA_KEY + ' is MISSING'
    : found.map(function (m) { return SCHEMA_KEY + ' = ' + m.getValue() + ' (' + m.getVisibility() + ')'; }).join('; ');
  Logger.log(msg);
  ss.toast(msg, 'Fitracker', 15);
  return msg;
}

// ---------------------------------------------------------------------------------------------
// Data tabs
// ---------------------------------------------------------------------------------------------

function makeLedger() {
  const sh = sheet(TAB.LEDGER);
  writeHeader(sh, HEADERS.LEDGER);
  sh.getRange('J2').setFormula(resolveTabs(LEDGER_J2));
  sh.hideColumns(1);
  formatColumn(sh, 2, DATE_FORMAT);
  formatColumn(sh, 4, MONEY_FORMAT);
  formatColumn(sh, 10, MONEY_FORMAT);
  validateColumn(sh, 2, dateRule());
  validateColumn(sh, 3, listRule(ENTRY_TYPES));
  validateColumn(sh, 4, SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0)
    .setAllowInvalid(false).setHelpText('A positive number, in the account\'s currency.').build());
  validateColumn(sh, 7, rangeRule(TAB.CATEGORIES, 'A2:A'));
  validateColumn(sh, 8, rangeRule(TAB.ACCOUNTS, 'A2:A'));
  validateColumn(sh, 9, rangeRule(TAB.ACCOUNTS, 'A2:A'));
  removeOwnProtections(sh);
  sh.getRange('J:J').protect().setDescription(PROTECTION_TAG + 'Ledger!J is one formula in J2')
    .setWarningOnly(true);
}

function makeSnapshots() {
  const sh = sheet(TAB.SNAPSHOTS);
  writeHeader(sh, HEADERS.SNAPSHOTS);
  sh.hideColumns(1);
  formatColumn(sh, 2, DATE_FORMAT);
  formatColumn(sh, 4, MONEY_FORMAT);
  validateColumn(sh, 2, dateRule());
  validateColumn(sh, 3, rangeRule(TAB.ACCOUNTS, 'A2:A'));
  validateColumn(sh, 4, SpreadsheetApp.newDataValidation().requireNumberBetween(-1e12, 1e12)
    .setAllowInvalid(false).setHelpText('A number in the account\'s currency (may be negative).').build());
}

// ---------------------------------------------------------------------------------------------
// Reference tabs
// ---------------------------------------------------------------------------------------------

function makeSettings() {
  const sh = sheet(TAB.SETTINGS);
  sh.getRange('A1').setValue('Base currency');
  if (sh.getRange('B1').getValue() === '') sh.getRange('B1').setValue(BASE_CURRENCY_DEFAULT);
  sh.getRange('B1').setDataValidation(listRule(CURRENCIES));
  sh.getRange('A3').setValue('The schema version is developer metadata (run showSchemaVersion), not a cell.');
}

function makeAccounts() {
  const sh = sheet(TAB.ACCOUNTS);
  writeHeader(sh, HEADERS.ACCOUNTS);
  trimRows(sh, MAX_ACCOUNTS + 1);
  validateColumn(sh, 2, listRule(CURRENCIES));
  [3, 4, 5].forEach(function (col) {
    validateColumn(sh, col, SpreadsheetApp.newDataValidation().requireCheckbox().build());
  });
}

function makeCategories() {
  const sh = sheet(TAB.CATEGORIES);
  writeHeader(sh, HEADERS.CATEGORIES);
  validateColumn(sh, 2, listRule(CATEGORY_TYPES));
  validateColumn(sh, 3, SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

function makeBudgets() {
  const sh = sheet(TAB.BUDGETS);
  writeHeader(sh, HEADERS.BUDGETS);
  formatColumn(sh, 4, MONEY_FORMAT);
  validateColumn(sh, 1, yearRule());
  validateColumn(sh, 2, listRule(CATEGORY_TYPES));
  validateColumn(sh, 3, rangeRule(TAB.CATEGORIES, 'A2:A'));
  validateColumn(sh, 4, SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false).setHelpText('Monthly amount in the base currency.').build());
}

function makeRates() {
  // Header only: the app writes the month rows (spec 3.4), history comes from the converter.
  const sh = sheet(TAB.RATES);
  writeHeader(sh, HEADERS.RATES);
  formatColumn(sh, 1, DATE_FORMAT);
  formatColumn(sh, 2, RATE_FORMAT);
  formatColumn(sh, 3, RATE_FORMAT);
  validateColumn(sh, 1, dateRule());
}

// ---------------------------------------------------------------------------------------------
// Entry views (QUERY over Ledger)
// ---------------------------------------------------------------------------------------------

function makeExpenses() {
  const sh = prepareView(TAB.EXPENSES, [yearSelector('B1')]);
  writeUnresolved(sh, 'A2');
  setF(sh, 'A4', sub(VIEW_QUERY, {
    COLUMNS: 'B, D, E, F, G, H, J', TYPE: 'expense',
    LABELS: 'label B \'date\', D \'amount\', E \'place\', F \'description\', G \'category\', H \'account\', J \'base_amount\'',
  }));
  sh.getRange('H4').setValue('currency');
  setF(sh, 'H5', sub(VIEW_CURRENCY, { COL: 'F' }));
  formatViewColumns(sh, ['A'], ['B', 'G']);
  protectView(sh, ['B1']);
}

function makeIncome() {
  const sh = prepareView(TAB.INCOME, [yearSelector('B1')]);
  writeUnresolved(sh, 'A2');
  setF(sh, 'A4', sub(VIEW_QUERY, {
    COLUMNS: 'B, D, F, G, H, J', TYPE: 'income',
    LABELS: 'label B \'date\', D \'amount\', F \'description\', G \'category\', H \'account\', J \'base_amount\'',
  }));
  sh.getRange('G4').setValue('currency');
  setF(sh, 'G5', sub(VIEW_CURRENCY, { COL: 'E' }));
  formatViewColumns(sh, ['A'], ['B', 'F']);
  protectView(sh, ['B1']);
}

function makeTransfers() {
  const sh = prepareView(TAB.TRANSFERS, [yearSelector('B1')]);
  writeUnresolved(sh, 'A2');
  setF(sh, 'A4', sub(VIEW_QUERY, {
    COLUMNS: 'B, D, F, H, I, J', TYPE: 'transfer',
    LABELS: 'label B \'date\', D \'amount\', F \'description\', H \'account\', I \'to_account\', J \'base_amount\'',
  }));
  sh.getRange('G4:H4').setValues([['currency', 'to_currency']]);
  setF(sh, 'G5', sub(VIEW_CURRENCY, { COL: 'D' }));
  setF(sh, 'H5', sub(VIEW_CURRENCY, { COL: 'E' }));
  formatViewColumns(sh, ['A'], ['B', 'F']);
  protectView(sh, ['B1']);
}

// ---------------------------------------------------------------------------------------------
// Monthly Summary
// Layout: B1 year, B2 month (selectors); B3 from, B4 to (exclusive); B5 accounts included;
// B6 unresolved rows; totals A8:B14; expense categories A18:D(18+MAX), other row, warning;
// income categories F18:G(18+MAX), other row, warning. Counts accounts ticked In Monthly (D).
// ---------------------------------------------------------------------------------------------

function makeMonthlySummary() {
  const sh = prepareView(TAB.MONTHLY, [yearSelector('B1'), monthSelector('B2')]);
  const period = '{{Ledger}}$B:$B,">="&$B$3,{{Ledger}}$B:$B,"<"&$B$4';
  const sum = function (criteria) { return sub(TICKED_SUM, { CRITERIA: criteria }); };
  writeTickedAccounts(sh, 'D');
  const first = 19;
  const lastExp = first + MAX_EXPENSE_CATEGORIES - 1;
  const lastInc = first + MAX_INCOME_CATEGORIES - 1;

  sh.getRange('A3:A6').setValues([['From'], ['To (exclusive)'], ['Accounts'], ['Unresolved ledger rows (all dates)']]);
  setF(sh, 'B3', '=DATE($B$1,$B$2,1)');
  setF(sh, 'B4', '=EDATE($B$3,1)');
  setF(sh, 'B5', sub(ACCOUNTS_INCLUDED, { TICK: 'D' }));
  setF(sh, 'B6', UNRESOLVED_COUNT);

  sh.getRange('A8:A14').setValues([['Planned expenses (active categories)'], ['Actual expenses (total)'],
    ['Remaining'], ['Regular (not ' + BUSINESS_CATEGORY + ')'], [BUSINESS_CATEGORY], ['Income'], ['Savings rate']]);
  setF(sh, 'B8', '=SUM(B' + first + ':B' + lastExp + ')');
  setF(sh, 'B9', '=' + sum('{{Ledger}}$C:$C,"expense",' + period));
  setF(sh, 'B10', '=B8-B9');
  setF(sh, 'B11', '=B9-B12');
  setF(sh, 'B12', '=' + sum('{{Ledger}}$C:$C,"expense",{{Ledger}}$G:$G,"' + BUSINESS_CATEGORY + '",' + period));
  setF(sh, 'B13', '=' + sum('{{Ledger}}$C:$C,"income",' + period));
  setF(sh, 'B14', '=IF(B13=0,"",(B13-B9)/B13)');

  sh.getRange('A18:D18').setValues([['Expense category', 'Budgeted', 'Spent', 'Remaining']]);
  setF(sh, 'A' + first, sub(ACTIVE_CATEGORIES, { TYPE: 'expense', MAX: MAX_EXPENSE_CATEGORIES }));
  fillFormulas(sh, first, 2, MAX_EXPENSE_CATEGORIES, 1, '=IF($A{r}="","",SUMIFS({{Budgets}}$D:$D,' +
    '{{Budgets}}$A:$A,$B$1,{{Budgets}}$B:$B,"expense",{{Budgets}}$C:$C,$A{r}))');
  fillFormulas(sh, first, 3, MAX_EXPENSE_CATEGORIES, 1,
    '=IF($A{r}="","",' + sum('{{Ledger}}$C:$C,"expense",{{Ledger}}$G:$G,$A{r},' + period) + ')');
  fillFormulas(sh, first, 4, MAX_EXPENSE_CATEGORIES, 1, '=IF($A{r}="","",B{r}-C{r})');
  sh.getRange('A' + (lastExp + 1)).setValue('Other or inactive categories');
  setF(sh, 'C' + (lastExp + 1), '=B9-SUM(C' + first + ':C' + lastExp + ')');
  setF(sh, 'A' + (lastExp + 2), sub(TOO_MANY_CATEGORIES, { TYPE: 'expense', MAX: MAX_EXPENSE_CATEGORIES }));

  sh.getRange('F18:G18').setValues([['Income category', 'Received']]);
  setF(sh, 'F' + first, sub(ACTIVE_CATEGORIES, { TYPE: 'income', MAX: MAX_INCOME_CATEGORIES }));
  fillFormulas(sh, first, 7, MAX_INCOME_CATEGORIES, 1,
    '=IF($F{r}="","",' + sum('{{Ledger}}$C:$C,"income",{{Ledger}}$G:$G,$F{r},' + period) + ')');
  sh.getRange('F' + (lastInc + 1)).setValue('Other or inactive categories');
  setF(sh, 'G' + (lastInc + 1), '=B13-SUM(G' + first + ':G' + lastInc + ')');
  setF(sh, 'F' + (lastInc + 2), sub(TOO_MANY_CATEGORIES, { TYPE: 'income', MAX: MAX_INCOME_CATEGORIES }));

  sh.getRange('B3:B4').setNumberFormat(DATE_FORMAT);
  sh.getRange('B8:B13').setNumberFormat(MONEY_FORMAT);
  sh.getRange('B14').setNumberFormat(PERCENT_FORMAT);
  sh.getRange('B' + first + ':D' + (lastExp + 1)).setNumberFormat(MONEY_FORMAT);
  sh.getRange('G' + first + ':G' + (lastInc + 1)).setNumberFormat(MONEY_FORMAT);
  protectView(sh, ['B1', 'B2']);
}

// ---------------------------------------------------------------------------------------------
// Annual Summary
// Layout: B1 year (selector); B2 from, B3 to (exclusive); B4 accounts included; B5 unresolved;
// totals A7:B10; per-month totals A12:E24; expense category x month A27:N(27+MAX), other row,
// warning; income category x month below. Counts accounts ticked In Annual (E).
// ---------------------------------------------------------------------------------------------

function makeAnnualSummary() {
  const sh = prepareView(TAB.ANNUAL, [yearSelector('B1')]);
  const sum = function (criteria) { return sub(TICKED_SUM, { CRITERIA: criteria }); };
  writeTickedAccounts(sh, 'E');

  sh.getRange('A2:A5').setValues([['From'], ['To (exclusive)'], ['Accounts'], ['Unresolved ledger rows (all dates)']]);
  setF(sh, 'B2', '=DATE($B$1,1,1)');
  setF(sh, 'B3', '=DATE($B$1+1,1,1)');
  setF(sh, 'B4', sub(ACCOUNTS_INCLUDED, { TICK: 'E' }));
  setF(sh, 'B5', UNRESOLVED_COUNT);

  sh.getRange('A7:A10').setValues([['Income'], ['Expenses'], ['Net savings'], ['Savings rate']]);
  setF(sh, 'B7', '=SUM(B13:B24)');
  setF(sh, 'B8', '=SUM(C13:C24)');
  setF(sh, 'B9', '=B7-B8');
  setF(sh, 'B10', '=IF(B7=0,"",B9/B7)');

  sh.getRange('A12:E12').setValues([['Month', 'Income', 'Expenses', 'Net savings', 'Savings rate']]);
  const month = '{{Ledger}}$B:$B,">="&$A{r},{{Ledger}}$B:$B,"<"&EDATE($A{r},1)';
  const monthStarts = [];
  for (let m = 1; m <= 12; m++) monthStarts.push(['=DATE($B$1,' + m + ',1)']);
  sh.getRange('A13:A24').setFormulas(monthStarts);
  fillFormulas(sh, 13, 2, 12, 1, '=' + sum('{{Ledger}}$C:$C,"income",' + month));
  fillFormulas(sh, 13, 3, 12, 1, '=' + sum('{{Ledger}}$C:$C,"expense",' + month));
  fillFormulas(sh, 13, 4, 12, 1, '=B{r}-C{r}');
  fillFormulas(sh, 13, 5, 12, 1, '=IF(B{r}=0,"",(B{r}-C{r})/B{r})');

  const expEnd = annualCategoryBlock(sh, 27, 'expense', MAX_EXPENSE_CATEGORIES, 'C', sum);
  annualCategoryBlock(sh, expEnd + 3, 'income', MAX_INCOME_CATEGORIES, 'B', sum);

  sh.getRange('B2:B3').setNumberFormat(DATE_FORMAT);
  sh.getRange('B7:B9').setNumberFormat(MONEY_FORMAT);
  sh.getRange('B10').setNumberFormat(PERCENT_FORMAT);
  sh.getRange('A13:A24').setNumberFormat('mmm yyyy');
  sh.getRange('B13:D24').setNumberFormat(MONEY_FORMAT);
  sh.getRange('E13:E24').setNumberFormat(PERCENT_FORMAT);
  protectView(sh, ['B1']);
}

// One "category x month" block of the Annual Summary, header at row `top`. `totalCol` is the
// per-month total column (rows 13-24) used by the "other or inactive" row. Returns its last row.
function annualCategoryBlock(sh, top, type, max, totalCol, sum) {
  const first = top + 1;
  const last = top + max;
  const header = [type === 'expense' ? 'Expense category' : 'Income category'];
  for (let m = 1; m <= 12; m++) header.push('');
  header.push('Total');
  sh.getRange(top, 1, 1, 14).setValues([header]);
  const starts = [];
  for (let m = 1; m <= 12; m++) starts.push('=DATE($B$1,' + m + ',1)');
  sh.getRange(top, 2, 1, 12).setFormulas([starts]).setNumberFormat('mmm');
  setF(sh, 'A' + first, sub(ACTIVE_CATEGORIES, { TYPE: type, MAX: max }));
  fillFormulas(sh, first, 2, max, 12, '=IF($A{r}="","",' + sum('{{Ledger}}$C:$C,"' + type +
    '",{{Ledger}}$G:$G,$A{r},{{Ledger}}$B:$B,">="&{c}$' + top + ',{{Ledger}}$B:$B,"<"&EDATE({c}$' + top + ',1)') + ')');
  fillFormulas(sh, first, 14, max, 1, '=IF($A{r}="","",SUM(B{r}:M{r}))');
  sh.getRange('A' + (last + 1)).setValue('Other or inactive categories');
  const other = [];
  for (let m = 1; m <= 12; m++) {
    const col = columnLetter(m + 1);
    other.push('=' + totalCol + (12 + m) + '-SUM(' + col + first + ':' + col + last + ')');
  }
  other.push('=SUM(B' + (last + 1) + ':M' + (last + 1) + ')');
  sh.getRange(last + 1, 2, 1, 13).setFormulas([other]);
  setF(sh, 'A' + (last + 2), sub(TOO_MANY_CATEGORIES, { TYPE: type, MAX: max }));
  sh.getRange(first, 2, max + 1, 13).setNumberFormat(MONEY_FORMAT);
  return last + 2;
}

// ---------------------------------------------------------------------------------------------
// Balances
// Layout: B1 today; B2 base currency; B3 year for the matrix and flows (selector); B4 unresolved;
// A5 warning; per active account A6:H(6+MAX) and net worth; month-end matrix (base) for all
// accounts; inflows and outflows (base) per account for the selected year.
// ---------------------------------------------------------------------------------------------

function makeBalances() {
  const sh = prepareView(TAB.BALANCES, [yearSelector('B3')]);
  sh.getRange('A1:A2').setValues([['Today'], ['Base currency']]);
  sh.getRange('A4').setValue('Unresolved ledger rows (all dates)');
  setF(sh, 'B1', '=TODAY()');
  setF(sh, 'B2', '={{Settings}}$B$1');
  setF(sh, 'B4', UNRESOLVED_COUNT);
  setF(sh, 'A5', '=IF(COUNTA({{Accounts}}$A$2:$A)>' + MAX_ACCOUNTS + ',"More than ' + MAX_ACCOUNTS +
    ' accounts: only the first ' + MAX_ACCOUNTS + ' are listed","")');
  sh.getRange('B1').setNumberFormat(DATE_FORMAT);
  const netRow = balancesCurrent(sh, 6);
  const matrixEnd = balancesMatrix(sh, netRow + 2);
  balancesFlows(sh, matrixEnd + 2);
  protectView(sh, ['B3']);
}

// Per active account: latest snapshot on or before today, its age, the effect since, the balance.
function balancesCurrent(sh, top) {
  const first = top + 1;
  const last = top + MAX_ACCOUNTS;
  const acc = '$A{r}';
  const from = 'N($C{r})';
  const native = function (type, accCol) {
    return sub(NATIVE_SUM, { ACCCOL: accCol, ACC: acc, TYPE: type, FROM: from, TO: '$B$1' });
  };
  sh.getRange(top, 1, 1, 8).setValues([['Account', 'Currency', 'Snapshot date', 'Snapshot balance',
    'Age (days)', 'Effect since', 'Balance', 'Balance (base)']]);
  setF(sh, 'A' + first, '=ARRAY_CONSTRAIN(IFNA(FILTER({{Accounts}}$A$2:$A,{{Accounts}}$A$2:$A<>"",' +
    '{{Accounts}}$C$2:$C=TRUE),""),' + MAX_ACCOUNTS + ',1)');
  fillFormulas(sh, first, 2, MAX_ACCOUNTS, 1, '=IF($A{r}="","",VLOOKUP($A{r},{{Accounts}}$A$2:$B,2,FALSE))');
  const snapDate = sub(SNAPSHOT_DATE, { ACC: acc, TO: '$B$1' });
  fillFormulas(sh, first, 3, MAX_ACCOUNTS, 1, '=IF($A{r}="","",IF(' + snapDate + '=0,"none",' + snapDate + '))');
  fillFormulas(sh, first, 4, MAX_ACCOUNTS, 1, '=IF($A{r}="","",' + sub(SNAPSHOT_BALANCE, { ACC: acc, DATE: from }) + ')');
  fillFormulas(sh, first, 5, MAX_ACCOUNTS, 1, '=IF(N($C{r})=0,"",$B$1-N($C{r}))');
  fillFormulas(sh, first, 6, MAX_ACCOUNTS, 1, '=IF($A{r}="","",' + native('income', 'H') + '-' +
    native('expense', 'H') + '-' + native('transfer', 'H') + '+' +
    sub(TRANSFER_IN, { ACC: acc, CUR: '$B{r}', FROM: from, TO: '$B$1' }) + ')');
  fillFormulas(sh, first, 7, MAX_ACCOUNTS, 1, '=IF($A{r}="","",D{r}+F{r})');
  fillFormulas(sh, first, 8, MAX_ACCOUNTS, 1, '=IF($A{r}="","",G{r}*' + sub(RATE_AT, { CUR: '$B{r}', DATE: '$B$1' }) + ')');
  sh.getRange(first, 3, MAX_ACCOUNTS, 1).setNumberFormat(DATE_FORMAT);
  sh.getRange(first, 4, MAX_ACCOUNTS, 1).setNumberFormat(MONEY_FORMAT);
  sh.getRange(first, 5, MAX_ACCOUNTS, 1).setNumberFormat('0');
  sh.getRange(first, 6, MAX_ACCOUNTS + 1, 3).setNumberFormat(MONEY_FORMAT);
  sh.getRange('A' + (last + 1)).setValue('Net worth (base)');
  setF(sh, 'H' + (last + 1), '=SUM(H' + first + ':H' + last + ')');
  return last + 1;
}

// Month-end balances in base currency, all accounts x the 12 month-ends of the year in B3.
function balancesMatrix(sh, top) {
  const first = top + 1;
  const last = top + MAX_ACCOUNTS;
  const native = function (type, accCol) {
    return sub(NATIVE_SUM, { ACCCOL: accCol, ACC: '$A{r}', TYPE: type, FROM: 'snapDate', TO: 'monthEnd' });
  };
  sh.getRange('A' + top).setValue('Month-end balance (base)');
  const ends = [];
  for (let m = 1; m <= 12; m++) ends.push('=EOMONTH(DATE($B$3,' + m + ',1),0)');
  sh.getRange(top, 2, 1, 12).setFormulas([ends]).setNumberFormat(DATE_FORMAT);
  setF(sh, 'A' + first, '=ARRAY_CONSTRAIN(IFNA(FILTER({{Accounts}}$A$2:$A,{{Accounts}}$A$2:$A<>""),""),' +
    MAX_ACCOUNTS + ',1)');
  fillFormulas(sh, first, 2, MAX_ACCOUNTS, 12,
    '=IF(OR($A{r}="",EOMONTH({c}$' + top + ',-1)>=$B$1),"",LET(monthEnd,{c}$' + top + ',' +
    'cur,VLOOKUP($A{r},{{Accounts}}$A$2:$B,2,FALSE),' +
    'snapDate,' + sub(SNAPSHOT_DATE, { ACC: '$A{r}', TO: 'monthEnd' }) + ',' +
    'snapBal,' + sub(SNAPSHOT_BALANCE, { ACC: '$A{r}', DATE: 'snapDate' }) + ',' +
    'bal,snapBal+' + native('income', 'H') + '-' + native('expense', 'H') + '-' + native('transfer', 'H') +
    '+' + sub(TRANSFER_IN, { ACC: '$A{r}', CUR: 'cur', FROM: 'snapDate', TO: 'monthEnd' }) + ',' +
    'bal*' + sub(RATE_AT, { CUR: 'cur', DATE: 'monthEnd' }) + '))');
  sh.getRange(first, 2, MAX_ACCOUNTS + 1, 12).setNumberFormat(MONEY_FORMAT);
  sh.getRange('A' + (last + 1)).setValue('Net worth (base)');
  fillFormulas(sh, last + 1, 2, 1, 12,
    '=IF(COUNT({c}' + first + ':{c}' + last + ')=0,"",SUMIF({c}' + first + ':{c}' + last + ',"<1E+300"))');
  return last + 1;
}

// Inflows (income + transfers in) and outflows (expenses + transfers out) per account, in base
// (Ledger!J, entry month's rate), for the year in B3.
function balancesFlows(sh, top) {
  const first = top + 1;
  const year = '{{Ledger}}$B:$B,">="&DATE($B$3,1,1),{{Ledger}}$B:$B,"<"&DATE($B$3+1,1,1),' + J_IS_NUMBER;
  const flow = function (type, accCol) {
    return 'SUMIFS({{Ledger}}$J:$J,{{Ledger}}$' + accCol + ':$' + accCol + ',$A{r},{{Ledger}}$C:$C,"' +
      type + '",' + year + ')';
  };
  sh.getRange(top, 1, 1, 3).setValues([['Account (year in B3)', 'Inflows (base)', 'Outflows (base)']]);
  setF(sh, 'A' + first, '=ARRAY_CONSTRAIN(IFNA(FILTER({{Accounts}}$A$2:$A,{{Accounts}}$A$2:$A<>""),""),' +
    MAX_ACCOUNTS + ',1)');
  fillFormulas(sh, first, 2, MAX_ACCOUNTS, 1, '=IF($A{r}="","",' + flow('income', 'H') + '+' + flow('transfer', 'I') + ')');
  fillFormulas(sh, first, 3, MAX_ACCOUNTS, 1, '=IF($A{r}="","",' + flow('expense', 'H') + '+' + flow('transfer', 'H') + ')');
  sh.getRange(first, 2, MAX_ACCOUNTS, 2).setNumberFormat(MONEY_FORMAT);
}

// ---------------------------------------------------------------------------------------------
// Charts (spec 3.7). Run after the data gate. Removes ALL charts on Monthly Summary, Annual Summary
// and Balances first (user-made ones included), then adds the template charts.
// ---------------------------------------------------------------------------------------------

function addCharts() {
  const monthly = clearCharts(TAB.MONTHLY);
  const expLast = 18 + MAX_EXPENSE_CATEGORIES;
  insertChart(monthly, Charts.ChartType.COLUMN, ['A18:C' + expLast], 1, 9, { title: 'Budget vs actual by category' });
  insertChart(monthly, Charts.ChartType.PIE, ['A18:A' + expLast, 'C18:C' + expLast], 21, 9,
    { title: 'Expense proportions', pieHole: 0.5 });

  const annual = clearCharts(TAB.ANNUAL);
  const expTop = 27;
  const expBottom = expTop + MAX_EXPENSE_CATEGORIES;
  insertChart(annual, Charts.ChartType.COMBO, ['A12:C24', 'E12:E24'], 1, 16, {
    title: 'Income vs expenses, savings rate', seriesType: 'bars',
    series: { 2: { type: 'line', targetAxisIndex: 1 } },
  });
  insertChart(annual, Charts.ChartType.COLUMN, ['A' + expTop + ':M' + expBottom], 21, 16,
    { title: 'Spending by category by month', isStacked: true }, true);
  insertChart(annual, Charts.ChartType.PIE, ['A' + expTop + ':A' + expBottom, 'N' + expTop + ':N' + expBottom], 41, 16,
    { title: 'Expense proportions', pieHole: 0.5 });

  const balances = clearCharts(TAB.BALANCES);
  const matrixTop = 6 + MAX_ACCOUNTS + 3;
  const flowsTop = matrixTop + MAX_ACCOUNTS + 3;
  insertChart(balances, Charts.ChartType.AREA, ['A' + matrixTop + ':M' + (matrixTop + MAX_ACCOUNTS)], 1, 15,
    { title: 'Net worth by account (base)', isStacked: true }, true);
  insertChart(balances, Charts.ChartType.BAR, ['A' + flowsTop + ':C' + (flowsTop + MAX_ACCOUNTS)], 21, 15,
    { title: 'Inflows and outflows by account (year in B3)' });
}

function clearCharts(name) {
  const sh = sheet(name);
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  return sh;
}

function insertChart(sh, type, ranges, row, col, options, transpose) {
  let b = sh.newChart().setChartType(type).setNumHeaders(1).setPosition(row, col, 0, 0);
  ranges.forEach(function (a1) { b = b.addRange(sh.getRange(a1)); });
  if (transpose) b = b.setTransposeRowsAndColumns(true);
  Object.keys(options).forEach(function (k) { b = b.setOption(k, options[k]); });
  sh.insertChart(b.build());
}

// ---------------------------------------------------------------------------------------------
// Helpers (no formula strings below this line)
// ---------------------------------------------------------------------------------------------

function sheet(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Tab missing: ' + name + ' (run buildTemplate first)');
  return sh;
}

// Replaces {{Tab name}} with 'Tab name'! after checking the tab is known and exists.
function resolveTabs(formula) {
  const ss = SpreadsheetApp.getActive();
  return formula.replace(/\{\{([^{}]+)\}\}/g, function (match, name) {
    if (TAB_ORDER.indexOf(name) < 0) throw new Error('Unknown tab "' + name + '" in formula: ' + formula);
    if (!ss.getSheetByName(name)) throw new Error('Tab "' + name + '" does not exist, formula: ' + formula);
    return '\'' + name + '\'!';
  });
}

function assertResolved(formula) {
  if (/\{\{|\}\}|%[A-Z]+%|\{r\}|\{c\}/.test(formula)) throw new Error('Unresolved placeholder in formula: ' + formula);
  return formula;
}

// Replaces %KEY% placeholders in a template.
function sub(template, values) {
  let out = template;
  Object.keys(values).forEach(function (k) { out = out.split('%' + k + '%').join(String(values[k])); });
  return out;
}

function setF(sh, a1, formula) {
  sh.getRange(a1).setFormula(assertResolved(resolveTabs(formula)));
}

// Writes `template` into a block of nRows x nCols, replacing {r} with the row number and {c} with
// the column letter of each cell.
function fillFormulas(sh, firstRow, firstCol, nRows, nCols, template) {
  const resolved = resolveTabs(template);
  const rows = [];
  for (let i = 0; i < nRows; i++) {
    const row = [];
    for (let j = 0; j < nCols; j++) {
      row.push(assertResolved(resolved.split('{r}').join(String(firstRow + i))
        .split('{c}').join(columnLetter(firstCol + j))));
    }
    rows.push(row);
  }
  sh.getRange(firstRow, firstCol, nRows, nCols).setFormulas(rows);
}

function columnLetter(n) {
  if (n < 1 || n > 26) throw new Error('Column out of range: ' + n);
  return String.fromCharCode(64 + n);
}

function writeHeader(sh, names) {
  sh.getRange(1, 1, 1, names.length).setValues([names]).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function dataRange(sh, col) {
  return sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1);
}

function formatColumn(sh, col, format) {
  dataRange(sh, col).setNumberFormat(format);
}

function validateColumn(sh, col, rule) {
  dataRange(sh, col).setDataValidation(rule);
}

function dateRule() {
  return SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
    .setHelpText('A date, for example 2026-11-12.').build();
}

function listRule(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
}

function rangeRule(tab, a1) {
  return SpreadsheetApp.newDataValidation().requireValueInRange(sheet(tab).getRange(a1), true)
    .setAllowInvalid(false).build();
}

function yearRule() {
  return SpreadsheetApp.newDataValidation().requireNumberBetween(2000, 2100).setAllowInvalid(false).build();
}

// Deletes the empty rows beyond `keep` (never a row with data).
function trimRows(sh, keep) {
  const max = sh.getMaxRows();
  if (max > keep && sh.getLastRow() <= keep) sh.deleteRows(keep + 1, max - keep);
}

function yearSelector(cell) {
  return { cell: cell, label: 'Year', value: new Date().getFullYear(), rule: yearRule() };
}

function monthSelector(cell) {
  return {
    cell: cell, label: 'Month', value: new Date().getMonth() + 1,
    rule: SpreadsheetApp.newDataValidation().requireNumberBetween(1, 12).setAllowInvalid(false).build(),
  };
}

// View tabs hold formulas only: clear and rebuild, keeping the selector values already typed.
function prepareView(name, selectors) {
  const sh = sheet(name);
  const kept = selectors.map(function (s) { return sh.getRange(s.cell).getValue(); });
  removeOwnProtections(sh);
  sh.clearContents();
  selectors.forEach(function (s, i) {
    const cell = sh.getRange(s.cell);
    cell.offset(0, -1).setValue(s.label);
    cell.setValue(kept[i] === '' ? s.value : kept[i]).setDataValidation(s.rule).setBackground(SELECTOR_BACKGROUND);
  });
  sh.setFrozenRows(0);
  return sh;
}

// Helper column of a summary tab: the account names ticked in Accounts column `tick` (see TICKED_ACCOUNTS).
function writeTickedAccounts(sh, tick) {
  sh.getRange(TICKED_COL + '1').setValue('Accounts counted (helper)');
  setF(sh, TICKED_COL + '2', sub(TICKED_ACCOUNTS, { TICK: tick }));
}

function writeUnresolved(sh, a1) {
  sh.getRange(a1).setValue('Unresolved ledger rows (all dates)');
  setF(sh, sh.getRange(a1).offset(0, 1).getA1Notation(), UNRESOLVED_COUNT);
}

function formatViewColumns(sh, dateCols, moneyCols) {
  dateCols.forEach(function (c) { sh.getRange(c + '5:' + c).setNumberFormat(DATE_FORMAT); });
  moneyCols.forEach(function (c) { sh.getRange(c + '5:' + c).setNumberFormat(MONEY_FORMAT); });
}

function removeOwnProtections(sh) {
  [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE].forEach(function (type) {
    sh.getProtections(type).forEach(function (p) {
      if (String(p.getDescription()).indexOf(PROTECTION_TAG) === 0) p.remove();
    });
  });
}

// Whole-tab warning-only protection; the selector cells stay free to edit.
function protectView(sh, selectorCells) {
  const p = sh.protect().setDescription(PROTECTION_TAG + sh.getName() + ' is a view (formulas only)')
    .setWarningOnly(true);
  try {
    p.setUnprotectedRanges(selectorCells.map(function (a1) { return sh.getRange(a1); }));
  } catch (e) {
    Logger.log('Selectors of ' + sh.getName() + ' stay under the warning: ' + e);
  }
}

function setSchemaVersion() {
  const ss = SpreadsheetApp.getActive();
  ss.createDeveloperMetadataFinder().withKey(SCHEMA_KEY).find().forEach(function (m) { m.remove(); });
  ss.addDeveloperMetadata(SCHEMA_KEY, SCHEMA_VERSION, SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);
}

// Deletes the sheets that existed before the build (the default "Sheet1", whatever its localised
// name) when they are not template tabs and are completely empty.
function removeDefaultSheet(original) {
  const ss = SpreadsheetApp.getActive();
  original.forEach(function (sh) {
    if (TAB_ORDER.indexOf(sh.getName()) >= 0) return;
    if (sh.getLastRow() === 0 && sh.getLastColumn() === 0) {
      ss.deleteSheet(sh);
    } else {
      const msg = 'Kept tab "' + sh.getName() + '" because it has content; delete it by hand if it is not needed.';
      Logger.log(msg);
      ss.toast(msg, 'Fitracker', 10);
    }
  });
}
