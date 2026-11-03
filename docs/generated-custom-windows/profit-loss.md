# Profit & Loss

## Intent
Show the result of a period (revenue, expenses and the profit or loss they add up to) as the indented account-report tree Etendo Classic prints (`c_acct_rpt`, report type `N`), for one accounting schema and organization, optionally compared with a reference period.

## What this report should allow
- Browse the report from the Finance / Reports menu listed as **Pérdidas y Ganancias** (es) / **Profit & Loss** (en).
- Pick an Accounting Schema (General Ledger), a Year or a date range, and optionally a comparison year or date range.
- Filter by one or more business partners (**Contacto**) and products (**Producto**) in the **Dimensiones** section (ETP-6080). Both are optional multi-select popups; empty means no filter.
- Choose the account level (Heading / Account / Breakdown / Subaccount) and whether to show only accounts with value.
- Render the report inline as HTML preview and download it as PDF, XLSX, or CSV. XLSX and CSV share the Balance Sheet's flat grid (see `balance-sheet.md`).

## Interaction model
- Route: `/report-viewer?report=profit-loss`.
- No ← back button in the TopBar breadcrumb (ETP-5519); the in-page **Cancelar** button (`action-cancel`) returns to the report catalog.
- Visibility: Finance / Reports menu, category `finance`.
- Implementation type: contract-driven SQL report (`artifacts/profit-loss/report-contract.json`). The SQL returns the flat node list; `buildAccountReportTree` (core `report-grouping.js`) builds the tree, the roll-up and the formula nodes.
- Layout: grouped listing in portrait orientation.

## Reactive behavior and dependencies
- The report does not auto-render: the user presses **Run Report** after picking parameters.
- `acctSchemaId` and `orgId` are required, hidden and defaulted. `yearId` is required in this viewer and depends on `orgId`.
- The year and the date range combine: the year clamps activity to its periods, and `dateFrom` / `dateTo` narrow it further. The SQL accepts a request with dates and **no** `yearId` (ETP-6080, for the interactive view): the year clause is optional, so it is stripped instead of zeroing every amount.
- With **Compare To**, `referenceYearId` becomes required and the reference columns are computed the same way.
- Amounts are raw debit − credit in SQL; each branch's sign is applied in JS. Organization scope uses `ad_isorgincluded`, so a parent org includes its children. General Ledger and Journal Entries use the same rule, so a ledger drilled from a parent-org row adds up to its amount. Their account filter (`fromAccountId` / `toAccountId`) compares account **codes** (`ev.value`), so a drill-down passes the row's `value`, not its id. A role that cannot read the requested org gets `403 ORG_ACCESS_DENIED` (ETP-6080).
- The contract declares `"trend": "result"`: with a comparison, each row carries `variationAmount`, `variationPct` and `trend` (`improves` when the result goes up: revenue up or expense down).
- With a comparison, PDF, XLSX and CSV add **Variation** and **Variation %** after the reference amount (ETP-6080). The % cell is empty when the reference amount is 0. The XLSX/CSV templates are shared byte-for-byte with Balance Sheet and print these columns only when the contract declares `labels.variationAmount`, so Balance Sheet exports are unchanged.

### Interactive view (ETP-6080, flag `dynamic-reports`)
With the flag on, the report opens `components/reports/dynamic/DynamicReportView.jsx` instead of the old viewer. There is no **Generar informe**: every change in **Personalizar informe** sends a new query (`POST /api/reports/profit-loss/query`, 300 ms after the last change, an older request cancelled).
- **Opening period:** the fiscal year that contains today, from its first day to today (a July calendar opens on 01/07). The years come from the year selector with `selectedOrgId`, so they are the calendar the org really uses. No year contains today, or the org has no calendar: 1 January to today, with a hint. The query never sends `yearId` / `referenceYearId`: the year picker and the **Año** shortcut only fill the dates. A closed year picked by hand fills its whole range; the current one stops at today.
- **Shortcuts:** Mes, Trimestre (to date), Año (fiscal year to date), 12 meses (the last 12 months).
- **Filters:** Contacto and Producto (multi-select, the old viewer's picker). Organización only when the role reaches more than one org (`*` not counted).
- **Tree:** the query returns every level and the screen folds it. The level selector (default from the contract, Cuenta) sets the expansion; then rows open and close one by one, and **Expandir todo / Contraer todo**. Folding sends no request.
- **Comparison:** Mismo período del año anterior (each date one calendar year back, 29 February → 28) or Período anterior (the same number of days, ending the day before). Adds Comparado / Var. / Var. % columns, green when the result improves and red when it worsens (`trend`).
- **Split:** **Desglosar cuentas por** Organización / Contacto / Producto adds a toggle on every leaf account that lists its parts (`splitQuery`). Postings with no contact or product show as *(sin asignar)*.
- **Context line:** period, organization, filters, comparison and split as chips; the filters, comparison and split can be removed from the chip.
- **Exports:** PDF / Excel / CSV render the same params plus `accountLevel` and `expandedNodeIds`, so the file shows the rows the screen shows.
- **Errors:** a role without access to the org sees *No tienes acceso a esta organización* and keeps the last result; any other failure, *No se pudo cargar el informe*.
- Not in the view yet: the drill-down side panel (F9) and the KPI events (F10).

### Interactive-view parameters (ETP-6080)
Declared `hidden: true`, so they never appear in the filter panel or as an active filter in the PDF header:
- `expandedNodeIds`: comma-separated ids of the expanded rows. When sent, the export prints exactly those rows instead of cutting at the account level.
- `splitBy` (`org` / `bpartner` / `product`), `splitNodeId`, `splitSign`: split one account (and its whole subtree) by a dimension through `sql.splitQuery`, which reads `fact_acct` with exactly the main query's period, organization, schema and dimension predicates, so the parts add up to the account's amount.

## Gap assessment
- One accounting schema per run.
- Balance Sheet keeps the old parameter set until ETP-6079; the two contracts match on everything except the parameters above.

## Manual verification
1. Open Finanzas / Informes, open **Pérdidas y Ganancias**, pick a year and run it; compare totals with Classic for the same year and organization.
2. Pick a Contacto and run again: only that partner's amounts remain, and the totals drop accordingly.
3. Pick two products: the amounts are the sum of both.
4. Turn on Compare To with the previous year: the reference, Variation and Variation % columns fill.
5. Download PDF, XLSX and CSV: all three show the same rows and amounts.

## Automated evidence
- `tools/app-shell/test/report-profit-loss-account-tree.test.js`: contract shape, SQL, templates, and the ETP-6080 additions (optional year clause, dimension filters, hidden params, trend opt-in, `splitQuery` predicates).
- `tools/app-shell/test/report-balance-sheet-account-tree.test.js`: Balance Sheet matches Profit & Loss except the ETP-6080 parameters.
- Core `cli/test/report-query.test.js` and `report-grouping.test.js`: the query answer equals the render at every account level, expansion, variation and the split.
