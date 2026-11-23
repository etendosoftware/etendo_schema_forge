# Dynamic (interactive) reports — engine notes

`DynamicReportView` (`tools/app-shell/src/components/reports/dynamic/`) is the shared interactive view of every report in `DYNAMIC_REPORT_IDS`, behind a flag: Profit & Loss on `dynamic-reports`, Balance Sheet and Trial Balance on `dynamic-balance-reports` (`REPORT_FLAG` in `dynamicReports.js`, ETP-6083). Report-specific behaviour is documented per window (`docs/generated-custom-windows/<report>.md`); what is true for all of them lives here.

## How a report joins the engine (ETP-6084)

Two shapes exist. The period engine (P&L and, since ETP-6083, the balance sheet) reads a `report-periods` tree. A **chart-tree** report (Trial Balance) reads the chart of accounts directly; it declares:

- **`tree: 'chart'`** in the contract. Without it nothing below applies.
- **`sql.treeQuery`**: one row per chart node with a posted descendant up to `__DATETO__`: `node_id, parent_id, value, name, elementlevel, sort_path, account_id`, `dimension_id` (NULL) and its own amounts `opening_balance, activity_debit, activity_credit, closing_balance` (raw sums, may be negative). With grouping, extra rows per (S leaf, dimension value) carry `dimension_id` / `dimension_name`. No LIMIT.
- **`sql.periodQuery`**: `WITH buckets(idx, f, t, sf, st, pf, pt) AS (VALUES __PERIODS__)`; one row per (idx, account_id[, dimension_id]) with the four amounts for the range, `_sly` and `_prev`. `__DATEFROM__` / `__DATETO__` are the hull and `__COMPARETO__` is `'false'`: use the bucket's own dates.
- **`amountColumns`**: `[{ field, labelKey, compare: 'never' | 'optional' | 'always' }]`. `always` compares with a variation, `optional` only behind `compareMovements`.
- **Filters and toggles come from the contract**: visible `search` parameters become pickers, visible `toggle` parameters become option switches (persisted in the URL when they differ from the default), `groupBy` options become the grouping. The view does not read `visibleIf`.

`/query` answers `{ kind: 'tree', rows, totals, balance }`: each row carries `opening/debit/credit/closing` plus `cells[i][field] = { amount, sly, prev }`; `balance` is `{ balanced, debitCreditDiff, closingDiff }`.

**`dynamicOnly`.** A parameter or section with `"dynamicOnly": true` is skipped by the old viewer's panel and shown only by the dynamic one (the Trial Balance's `compareTo`, `showOnlyAccountsWithValue` and "Comparación"). A report with `tree: 'chart'` opens the dynamic view only when its descriptor carries `tree` (`opensDynamicView`), else the old viewer.

**`columns` vs `compareTo`.** `reportOffers` offers Columnas only with a hidden `columns` parameter, and the comparison with `compareTo`. The Trial Balance declares `compareTo` alone (comparison without month/quarter columns); P&L and balance sheet declare both.

**`/render`** takes the chart path only when `expandedNodeIds` is sent and the report is `tree: 'chart'`. Extra inputs: `visibleNodeIds` (comma-joined, dimension rows use composite ids such as `S1|bp1`; wins over `expandedNodeIds` and is the exact set of rows on screen) and `compareMovements`. The response carries `meta.chartTotals`, `meta.chartBalance` and `meta.compareMovements`.

**No row cap on the chart `/query`.** `treeQuery` and `periodQuery` are not limited (a cap would drop chart nodes); only the statement timeout applies, so a large account x dimension grouping can be heavy.

**Descriptor forwarding.** The report descriptor (core `buildReportDescriptor`, dev engine `report-api.js` `listReports`, only when the loaded core has the chart path) forwards `tree` and `amountColumns`; if a descriptor drops them the report silently renders as a P&L.

## A report that is a balance at a date (ETP-6083)

The period engine has a second consumer, the Balance Sheet, which is read **at a date** instead of over a period. Nothing in the view or in core names the report: it opts in through contract keys, and a contract without them answers and renders exactly as before.

| Key | Where | Effect |
|-----|-------|--------|
| `balanceCheck: true` | contract top level (server-side, not in the descriptor) | `/query` answers `balance: { balanced, activo, pnPasivo, diff }` (`/render` does not ship it): one figure per root group in displayed sign, each side's TOTAL formula row when it has one, else the sum of its other top rows. `null` unless there are exactly two root groups, or when `showOnlyAccountsWithValue` hides a whole side. `DynamicReportBalance` shows it; it has two shapes (`debitCreditDiff` for the Trial Balance, `activo` for a sheet) |
| `result_onthefly` / `result_onthefly_ref` (tree) and `own_result` / `own_result_sly` / `own_result_prev` (period and split queries) | SQL columns on the income-summary node only | core adds `row.result` / `cells[i].result = { onTheFly, posted }` (`posted = amount - onTheFly`, displayed sign). A row that carries `result` opens `DynamicResultPanel` instead of the ledger |
| `dateTo.shortcuts: ['today','lastMonthEnd','lastQuarterEnd','lastFiscalYearEnd']` | `dateTo` parameter | the panel offers these end-date buttons instead of Mes / Trimestre / Año; the fiscal year comes from the org calendar (`dynamicDates.js` `endShortcutDate`) |
| `dateFrom.role: 'ledgerStart'` | `dateFrom` parameter | Desde never changes the amounts: the query always sends the start of the fiscal year of Hasta (no refetch on a Desde edit), and Desde only moves where the ledger drill starts, clamped to that year (`ledgerStartFor`) |
| `compareTo.compareModes: { sly, prev }` | `compareTo` parameter | `sameDateLastYear` / `previousFiscalYearClose`: each comparison is a **one-day range** (`comparedRanges(period, grain, rules)`); the panel and column headers name the date. Absent (P&L): the period-shaped comparisons |
| `maxIndent` | an `accountLevel` option | the fold cuts by the indent of the **listed** rows (`reportTree.js` `expansionForIndent`) instead of the E/C/D/S rank, so a chart whose roots are never rows can still offer Grupo / Epígrafe |
| `dynamicOnly` / `legacyOnly` | an `accountLevel` **option** (the parameter and section forms are described above) | `dynamicOnly`: hidden from the old viewer (`ReportViewerPage.jsx`); `legacyOnly`: hidden from the interactive view (`useContractReportConfig`) |
| `excludeFromSummary: true` | a **parameter** (section-level already existed, ETP-5128) | the control stays live in the viewer but is not printed in the PDF/HTML filter grid (core `report-filters.js`) |
| folded levels (no key, `visibleRows(..., { foldedSummary })`) | a report read at a date (`dateFrom.role: 'ledgerStart'`) | a closed row stands for its hidden accounts: it opens the ledger as a code range (`foldedRange`) only when no other leaf has a code inside it, and the 129 panel only when the row is made of result accounts alone; a mixed row drills the ledger with `amount - calculated`. Detail and limits: the Balance Sheet guide |

Ledger drill of such a report (`ledgerParams(..., { atDate: true })`): the ledger is asked with `openingEntryAmount=true`, so its signed closing balance equals the amount clicked (`ledgerSummary` `closingSigned`), and `DynamicDrillPanel` shows whether they match. The result panel opens the P&L through `RESULT_REPORT_ID` (`drillDown.js`), like the ledger and entry reports.

A report with this shape declares **no** `columns` parameter: Mes / Trimestre are not offered (columns by period on the Balance Sheet: ETP-6292). Its URL keys follow *Selections in the URL* unchanged (`orgId`, `dateFrom` + `dateTo`, `compare`, pickers). Report-specific behaviour: `docs/generated-custom-windows/balance-sheet.md`; core side: `schema_forge_core` `docs/report-query.md` → *Balance block and income-summary split (ETP-6083)* and *Export filter grid*.

## Selections in the URL (ETP-6239)

F5, a bookmark or a shared link restore what the panel had. Nothing in this mechanism names a report: `reportUrlState.js` derives what a report persists from its own definition (`report.parameters`, the contract's), so a report joining the engine gets it with no code.

| Key | Persisted when the report declares |
|-----|-----------------------------------|
| `orgId` | an `orgId` parameter |
| `dateFrom` + `dateTo` | both as `date` parameters (written and read as a pair) |
| each picker (`bPartnerId`, `productId`, …) | a visible `search` parameter on a selector the panel offers (`PICKER_SELECTORS`: contact, product, project, cost centre, account, so also `fromAccountId` / `toAccountId`); ids comma-joined |
| `columns` | a `columns` parameter (Mes / Trimestre; own marker since ETP-6084) |
| `compare` | `compareTo` (the comparison; the Trial Balance declares it without `columns`) |
| `splitBy` | `splitBy` |
| `groupBy` | a chart-tree report (`tree: 'chart'`) with a `groupBy` parameter; only its declared option values are restored (ETP-6084) |
| each visible option toggle (e.g. `openingEntryAmount`, `showOnlyAccountsWithValue`) | a chart-tree report; written as `true`/`false` only when different from the parameter's default (`compareTo` excluded) |
| `compareMovements` | a chart-tree report with an `amountColumns` entry `compare: 'optional'`; written only when `true` |

`reportUrlKeys(report)` returns the keys a report owns; it is what a write clears and what the restore reads. Add a key by declaring the parameter, not by editing the helper.

- **Only what differs from the default is written.** An untouched period stays out of the URL, so tomorrow it still opens on its default. A clean `/report-viewer?report=<id>` opens the defaults. A shortcut range (e.g. "Mes a la fecha") is stored as literal dates, so after a day it is no longer "to date".
- **Replace, through the router.** Every change calls the router's `setSearchParams(next, { replace: true })` (the page hands the view `search` and `onSearchChange`; on its own the view uses `history.replaceState`), so filter tweaks do not fill the back history and the router never disagrees with the address bar. While the defaults reload (an org change) nothing is written, or the not-yet-known defaults would be frozen into the URL.
- **Scope.** The keys belong to the report: `ReportViewerPage` keeps only `category` when leaving a report and starts a picked report with only `category` + `report`, so nothing leaks to the catalog or to another report. Not persisted: the account level and folded rows, the drill-down panel, the panel-collapsed flag (its own per-user storage).
- **The URL is user input.** Dates must be real `yyyy-MM-dd` days (date-only utilities), in order (a half or reversed period is ignored whole); enums are checked against their allowed values (`total` is never restored); ids are `[A-Za-z0-9_-]` strings (64 characters, 100 per list). An invalid value is ignored and its default stays. A restored `orgId` must be in the list the org picker offers (the role's orgs without `0` / `*`), otherwise it is ignored and the default org is used.
- **Names are not in the URL.** `_display_*` is neither written nor read (it would be unchecked text shown as a label and printed in the export header). A picker restored from ids resolves exactly those ids with one `GET /sws/report-selectors/<bpartner|product>?ids=a,b` lookup (`useRestoredPickerNames`), so it works beyond the selector's first page. The endpoint ignores `q`/paging/`isactive` in that mode, caps at 100 and keeps the client/role scoping (com.etendoerp.go `docs/neo-headless.md` §4.18; the dev engine mirrors it in `vite-plugins/report-api.js`). Names travel as an array (`_names_*`), so a name containing a comma stays one chip; `_display_*` is only the joined text (`', '`) for the export header. The query never waits for the lookup.
- **Stale ids.** An id the lookup answers without (deleted, out of the role's reach) is dropped from the selection and the URL, but only when at least one other id resolves. Nothing is dropped when: the lookup fails; the answer holds an id nobody asked for (a backend without `ids` answers its first page: the answer is not an `ids` answer, so it is ignored whole); or no id resolves at all. The rule is that a report is never silently widened by a restore. A deactivated contact or product still resolves. A URL id that passes the format check but is not a valid record id (the endpoint only accepts hex and hyphens) resolves to nothing and is treated as stale.
- **A filter holds at most 100 items** (`MAX_PICKER_IDS`, mirroring the endpoint's `MAX_IDS`): the picker disables the 101st checkbox and shows a hint (`dynamicReportMaxItems`, a live region that is always mounted so the announcement is read), and a URL with more keeps the first 100 distinct ids.
- **The panel offers what the URL persists.** Columnas/Comparar need `compareTo` and Dividir needs `splitBy` in the contract (`reportOffers`, shared by the panel and `urlStateSpec`); without them the controls are not shown and the link's values are ignored.
- **Restore.** The state is read when the view mounts, before the first query: one request, not the defaults and then a second. It emits no `report_filter_applied`. Restoring Mes / Trimestre hides the panel silently for the session (`panel.setCollapsed(true, { persist: false })`): no `report_panel_toggled` event and no focus move.
- **Old viewer.** Flag off, the old viewer keeps reading deep links (`?report=X&dateFrom=...`) from the query string, unchanged.

## Columns by period: how many are shown (ETP-6239)

The panel's *Columnas* (Total / Mes / Trimestre) shows the last **12 months or 8 quarters** plus the Total without a comparison, and the last **6 months or 4 quarters** with one (a comparison takes four columns per period). The numbers are core's `SCREEN_PERIODS` (`report-periods.js`), read through `periodLimit` in `reportColumns.js`. The query always asks for the larger set, so toggling the comparison trims or restores columns with **no request**; the PDF requests the set of its own mode and splits it into balanced pages of at most 7 groups. Under each *Comparado* header the table, the PDF and the Excel/CSV header cell say what it is compared against (`Comparado (ene 25)`; the Total group names the compared range). Details per report: `docs/generated-custom-windows/profit-loss.md` -> *Columns by period*.

## Horizontal scroll (ETP-6239)

A wide table scrolls inside its own box, so a tall one would push that scrollbar below the fold. `StickyHScroll` wraps the table and adds a proxy scrollbar after it: `sticky bottom-0`, `print:hidden`, `aria-hidden`, rendered only when the table overflows (measured with a `ResizeObserver`), and kept in step with the box in both directions through `registerLinesScroller` (`linesScrollSync`). While the proxy shows, the box's own bar is hidden (`scrollbarWidth: none`); keyboard, trackpad and shift-wheel still scroll the box. Known limit: macOS overlay scrollbars may hide the proxy while idle.
