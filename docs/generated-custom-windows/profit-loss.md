# Profit & Loss

## Intent
Show the result of a period (revenue, expenses and the profit or loss they add up to) as the indented account-report tree Etendo Classic prints (`c_acct_rpt`, report type `N`), for one accounting schema and organization, optionally compared with a reference period.

## What this report should allow
- Browse the report from the Finance / Reports menu listed as **Pérdidas y Ganancias** (es) / **Profit & Loss** (en).
- Pick an Accounting Schema (General Ledger), a Year or a date range, and optionally a comparison year or date range.
- Filter by one or more business partners (**Contacto**) and products (**Producto**) in the **Dimensiones** section (ETP-6080). Both are optional multi-select popups; empty means no filter.
- Choose the account level (Heading / Account / Breakdown / Subaccount) and whether to show only accounts with value.
- Render the report inline as HTML preview and download it as PDF, XLSX, or CSV. XLSX and CSV share the Balance Sheet's flat grid (see `balance-sheet.md`).
- With the `dynamic-reports` flag on, the report's card (and list row) in *Informes* carries a sparkle mark (top-right corner of the card; tooltip *Interactivo: …*) and a soft primary glow (`DynamicReportBadge.jsx`; only reports in `DYNAMIC_REPORT_IDS`). Use the interactive view instead: live filters, an on-screen tree, comparison, splits by dimension and a drill-down to the ledger, the entry and the document (see *Interactive view* below).

## Interaction model
- Route: `/report-viewer?report=profit-loss`. The old viewer also reads parameters from the URL (`&dateFrom=…`) and runs the report; the interactive view ignores them and opens on its own defaults (accepted: nothing in the app builds such links for this report).
- No ← back button in the TopBar breadcrumb (ETP-5519); the in-page **Cancelar** button (`action-cancel`) returns to the report catalog.
- Visibility: Finance / Reports menu, category `finance`.
- Implementation type: contract-driven SQL report (`artifacts/profit-loss/report-contract.json`). The SQL returns the flat node list; `buildAccountReportTree` (core `report-grouping.js`) builds the tree, the roll-up and the formula nodes.
- Layout: grouped listing in portrait orientation.

## Reactive behavior and dependencies
- The report does not auto-render: the user presses **Run Report** after picking parameters (old viewer; the interactive view applies every change on its own).
- `acctSchemaId` and `orgId` are required, hidden and defaulted. `yearId` is required in this viewer and depends on `orgId`.
- The year and the date range combine: the year clamps activity to its periods, and `dateFrom` / `dateTo` narrow it further. The SQL accepts a request with dates and **no** `yearId` (ETP-6080, for the interactive view): the year clause is optional, so it is stripped instead of zeroing every amount.
- With **Compare To**, `referenceYearId` becomes required and the reference columns are computed the same way.
- Amounts are raw debit − credit in SQL; each branch's sign is applied in JS. Organization scope uses `ad_isorgincluded`, so a parent org includes its children. General Ledger and Journal Entries use the same rule, so a ledger drilled from a parent-org row adds up to its amount; they resolve the org tree once over `ad_org` (`fa.ad_org_id IN (SELECT … ad_isorgincluded(o.ad_org_id, …))`) instead of once per line, with identical results. Their account filter (`fromAccountId` / `toAccountId`) compares account **codes** (`ev.value`), so a drill-down passes the row's `value`, not its id. A role that cannot read the requested org gets `403 ORG_ACCESS_DENIED` (ETP-6080).
- The contract declares `"trend": "result"`: with a comparison, each row carries `variationAmount`, `variationPct` and `trend` (`improves` when the result goes up: revenue up or expense down).
- With a comparison, PDF, XLSX and CSV add **Variation** and **Variation %** after the reference amount (ETP-6080). The % cell is empty when the reference amount is 0. The XLSX/CSV templates are shared byte-for-byte with Balance Sheet and print these columns only when the contract declares `labels.variationAmount`, so Balance Sheet exports are unchanged.

### Interactive view (ETP-6080, flag `dynamic-reports`)
With the flag on, the report opens `components/reports/dynamic/DynamicReportView.jsx` instead of the old viewer. There is no **Generar informe**: every change in **Personalizar informe** sends a new query (`POST /api/reports/profit-loss/query`, 300 ms after the last change, an older request cancelled).
- **Opening period:** the fiscal year that contains today, from its first day to today (a July calendar opens on 01/07). The years come from the year selector with `selectedOrgId`, so they are the calendar the org really uses. No year contains today, or the org has no calendar: 1 January to today, with a hint. The query never sends `yearId` / `referenceYearId`: the year picker and the **Año** shortcut only fill the dates. A closed year picked by hand fills its whole range; the current one stops at today. The year selector shows the year the period exactly covers (the opening period and **Año** show the current one); a period that is not a whole year, such as **Mes**, leaves it on *Seleccionar…*.
- **Shortcuts:** Mes, Trimestre (to date), Año (fiscal year to date), 12 meses (the last 12 months).
- **Filters:** Contacto and Producto (multi-select, the old viewer's picker). Organización only when the role reaches more than one org (`*` not counted).
- **Tree:** the query returns every level and the screen folds it. The level selector (default from the contract, Cuenta), **Expandir todo** and **Contraer todo** set the base; then rows open and close one by one. The base applies to every result, so a row a new filter brings in follows it instead of showing folded; the user's own opens and closes are kept. Folding sends no request.
- **Comparison:** Mismo período del año anterior (each date one calendar year back, 29 February → 28) or Período anterior (the same number of days, ending the day before). Adds Comparado / Var. / Var. % columns, green when the result improves and red when it worsens (`trend`).
- **Headline figures (`DynamicReportKpis.jsx`, reports in `RESULT_REPORT_IDS`):** four cards above the tree — **Ingresos** (sum of the positive top-level lines), **Gastos** (the negative ones, as a positive figure), **Resultado del ejercicio** (their difference, lime when positive, red when negative) and **Margen** (Resultado del ejercicio ÷ Ingresos × 100: the profit left from every 100 of income). Each card has an ⓘ whose tooltip explains the calculation. Formula subtotals and child rows are not added (they would count twice). With a comparison each card shows a ▲/▼ pill with the change (in points for the margin) and the compared value; the pill is green when the change is good news, so Gastos going up is red. Pure helpers: `reportVisuals.js`.
- **Look of the tree:** each top-level line opens a band (soft primary tint, primary edge); formula subtotals (*A. RESULTADO DE EXPLOTACIÓN*…) are lime with a rule above. Every amount carries a thin bar with its weight within its parent (a top-level line: within the largest top-level line; a split part: within the parts' total), primary for positive amounts and lavender for negative ones; formulas have none. Negative amounts read in a soft red, the compared column is muted, and Var. % is a ▲/▼ pill coloured by `trend`.
- **Split:** **Desglosar cuentas por** Organización / Contacto / Producto adds a toggle on every leaf account that lists its parts (`splitQuery`). Postings with no contact or product show as *(sin asignar)*.
- **Context line:** period, organization, filters, comparison and split as chips; the filters, comparison and split can be removed from the chip.
- **Exports:** PDF / Excel / CSV render the same params plus `accountLevel` and `expandedNodeIds`, so the file shows the rows the screen shows.
- **Errors:** a role without access to the org sees *No tienes acceso a esta organización* and keeps the last result; a role without access to the report itself, *No tienes acceso a este informe*; any other failure, *No se pudo cargar el informe*. The old viewer (flag off) shows the same translated messages when `/render` is refused with `ORG_ACCESS_DENIED` or `REPORT_ACCESS_DENIED`; other render failures keep the server's message.
- **Report access:** `/render` and `/query` check that the role can open the report (any tier in the Roles matrix), before the org check and before any SQL. The source is NEO `myreportaccess`: `governed` lists the 9 catalog reports, `reportAccess` the ones the role can open; a report outside `governed` (printables, reports open by design) is not checked. The drill-down only offers the steps the role can open: without General Ledger the account name is plain text; without Journal Entries the ledger lines do not open an entry. A backend that does not send `governed` yet is not enforced (deploy skew; see `assertReportAccess` in core).
- **Drill-down (side panel):** a leaf account's name opens its ledger (`POST /api/reports/report-general-ledger/query` with the view's period, org, schema, Contacto and Producto, and the account **code** as `fromAccountId` = `toAccountId`): opening, debit, credit and closing balance (debit − credit, the closing includes every earlier period), plus **Movimiento del período**: the period's debit − credit signed like the report row, so it equals the amount clicked; and a text search over the loaded lines. The ledger loads at most 500 lines (`LEDGER_LINE_CAP`; production, Nov 2026: p99 324 and max 661 lines per account and year). Past the cap only the opening balance is shown, since debit, credit, closing and movement summed over part of the lines would be wrong, with a note and **Cargar todas las líneas (puede tardar)**, which reloads without the limit. A summary account only folds. A line opens its whole entry (`report-journal-entries` with only `acctSchemaId`, `orgId` and `factAcctGroupId`, so no line is filtered out and a restricted role is not refused), with the account you came from highlighted, and **Abrir documento** opens the document in a new tab. An entry whose table has no window mapped ends there with a note. The breadcrumb (report › account › entry) goes back a step. The document URL is built by `components/reports/reportDocumentUrl.js`, shared with the old viewer's `navigate-invoice` message.
- **Dates from `/query`:** `pg` sends a SQL `date` as the server's local midnight in UTC, so the panel reads the day with `sqlDateDay` (rounded to the nearest UTC day), never the raw prefix.
- **Telemetry:** `report_opened`, `report_filter_applied`, `report_group_toggled` and `report_drilldown`, one `reportSessionId` per report session. Firing rules: `docs/ops/app-shell-observability.md` → *Interactive report events*.

### The `/query` route (ETP-6080)
`POST /api/reports/:id/query` answers JSON instead of a document. It is served by the same `report-server` as `/render` (CloudFront sends every `/api/reports/*` request there; in `make dev`, the Vite plugin `report-api.js`), and runs the same session and org check before any SQL. The handler is core's `cli/src/report-query.js`, shared by both engines.
- **Request:** `{ params, locale, limit? }`. `params` are the contract's parameters, the same values `/render` takes. A JSON `null` body reads as `{}`.
- **Account-tree report** (a contract with `sql.operandsQuery`, like this one): `{ kind: 'tree', rows }`, every level at once (the view folds them; `accountLevel` is ignored). Each row: `node_id`, `value`, `name`, `elementlevel`, `parentId`, `sign`, `isFormula`, `amount`, `amount_ref`, and with `compareTo: 'true'` the variation fields above.
- **Split** (`splitBy` + `splitNodeId` + `splitSign`): `{ kind: 'split', rows }`, one row per dimension value (`node_id` = its id, `null` = unassigned), signed like the account.
- **Listing report** (General Ledger, Journal Entries): `{ kind: 'rows', rows, openingRows }`, the SQL rows as they come. A SQL `date` arrives as a UTC timestamp (see *Dates from `/query`*).
- **Errors:** JSON `{ error, code }`. `401` no session, `403` no CSRF, `REPORT_ACCESS_DENIED` or `ORG_ACCESS_DENIED` (no SQL runs), `502 REPORT_ACCESS_UNAVAILABLE` (the access check could not be read), `404 REPORT_NOT_FOUND`, `400 QUERY_NOT_SUPPORTED` (not a SQL report), `400 INVALID_LIMIT`, `400 SPLIT_NOT_SUPPORTED`, `500 QUERY_FAILED` (logged server-side; the SQL and the DB message never reach the client).

### Interactive-view parameters (ETP-6080)
Declared `hidden: true`, so they never appear in the filter panel or as an active filter in the PDF header:
- `expandedNodeIds`: comma-separated ids of the expanded rows. When sent, the export prints exactly those rows instead of cutting at the account level. `none` means no row is open (only the top rows print). A blank value counts as not sent: the old viewer sends `''` for every parameter it has no value for, so it keeps the account-level cutoff.
- `splitBy` (`org` / `bpartner` / `product`), `splitNodeId`, `splitSign`: split one account (and its whole subtree) by a dimension through `sql.splitQuery`, which reads `fact_acct` with exactly the main query's period, organization, schema and dimension predicates, so the parts add up to the account's amount.

### Performance (ETP-6080, measured 2026-11-04)
Production read replica, the client with the most accounting lines (9.2k lines in its main schema, 6 orgs), org `*` (every org), a three-year period. Server execution time (`EXPLAIN ANALYZE`, 3 runs each); the browser adds the network round trip on top:
- Tree: 140–190 ms (98 rows); with a comparison, the same.
- Split by contact, product or organization: 22–30 ms.
- Operands query: 2–4 ms.

Almost all of the tree's time is the scan of the client's `fact_acct` lines through the `fact_acct_account` index with `ad_isorgincluded` evaluated on each line (about 14 µs per line). This is the Profit & Loss tree query; the General Ledger and Journal Entries drill-downs resolve the org tree once over `ad_org` instead. The period is applied inside the sums, not as a filter, so the cost follows the client's total number of lines, not the period's. At that rate a client with 100k lines would take about 1.5 s. No index was added.

## Gap assessment
- One accounting schema per run.
- Balance Sheet keeps the old parameter set until ETP-6079; the two contracts match on everything except the parameters above.

## Manual verification
1. Open Finanzas / Informes, open **Pérdidas y Ganancias**, pick a year and run it; compare totals with Classic for the same year and organization.
2. Pick a Contacto and run again: only that partner's amounts remain, and the totals drop accordingly.
3. Pick two products: the amounts are the sum of both.
4. Turn on Compare To with the previous year: the reference, Variation and Variation % columns fill.
5. Download PDF, XLSX and CSV: all three show the same rows and amounts.

Interactive view (flag `dynamic-reports` on):
6. Open **Pérdidas y Ganancias**: it opens on the current fiscal year up to today, with no button to press, folded at Cuenta.
7. Change the period with **Mes**, then pick a Contacto: the tree reloads each time, and the chips show both. Remove the Contacto from its chip.
8. Pick **Mismo período del año anterior**: Comparado, Var. and Var. % appear, coloured by trend, and the four headline cards show their change; Ingresos − Gastos equals Resultado and the last formula row (*D. RESULTADO DEL EJERCICIO*).
9. Pick **Desglosar cuentas por → Contacto**, expand all and open a leaf account's split: the parts add up to the account.
10. Click a leaf account's name: the ledger's closing balance moves by the account's amount; open a line, then **Abrir documento**.
11. Open the ledger of an account with more than 500 lines in the period: only the opening balance shows, with the cap note and **Cargar todas las líneas (puede tardar)**; click it: every line loads and the totals come back.
12. Export to PDF with some rows expanded: the PDF shows the same rows as the screen, and its header names the organization, Contacto and Producto, not their ids.

## Automated evidence
- `tools/app-shell/test/report-profit-loss-account-tree.test.js`: contract shape, SQL, templates, and the ETP-6080 additions (optional year clause, dimension filters, hidden params, trend opt-in, `splitQuery` predicates).
- `tools/app-shell/test/report-balance-sheet-account-tree.test.js`: Balance Sheet matches Profit & Loss except the ETP-6080 parameters.
- Core `cli/test/report-query.test.js` and `report-grouping.test.js`: the query answer equals the render at every account level, expansion, variation and the split.
- `tools/app-shell/src/components/reports/dynamic/__tests__/`: the interactive view (`DynamicReportView.vitest.jsx`: opening period, folding, comparison, chips, split, errors, exports, drill-down, telemetry, translation parity), `dynamicDates.vitest.js` (periods, run in Madrid and Buenos Aires), `reportTree.vitest.js`, `reportVisuals.vitest.js` (headline figures, KPI trends, bar widths), `drillDown.vitest.js`, `useReportQuery.vitest.js`.
- `e2e/tests/flows/accounting/dynamic-profit-loss.mocked.spec.js`: the old viewer with the flag off; with it on (Vite started with `VITE_FEATURE_FLAGS='{"dynamic-reports":true}'` and `E2E_DYNAMIC_REPORTS_FLAG=on`, otherwise skipped), the first query with no button, folding with no request, a period shortcut, and the drill-down to the ledger, the entry and the document tab.
- Core `cli/test/report-auth.test.js` (`assertReportAccess`: governed, 403, 502, older module not enforced) and Go `SFMyReportAccessTest` (`governed` in every answer). `DynamicReportView.vitest.jsx` also covers the 500-line ledger cap and the drill steps hidden by report access.
- `tools/app-shell/src/pages/__tests__/ReportViewerPage.dynamicSwitch.vitest.jsx` (flag switch) and `ReportViewerPage.networkError.vitest.jsx` (translated `ORG_ACCESS_DENIED` in the old viewer).
