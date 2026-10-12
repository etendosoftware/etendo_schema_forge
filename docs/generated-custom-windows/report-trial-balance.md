# Trial Balance

## Intent
Show one row per account with opening balance, period debit, period credit, and closing balance so accountants can verify that the books balance and inspect activity before issuing financial statements.

## What this report should allow
- Browse the report from the Finance / Reports menu listed as **Balance de Sumas y Saldos** (es) / **Trial Balance** (en).
- Pick a date range (`From Date`, `To Date`), accounting schema, organization, and optional account / business partner / product / project filters before running.
- Render the report inline as HTML preview and download it as PDF, XLSX, or CSV in landscape orientation.
- Show six columns per account: Account No., Name, Opening Balance, Debit, Credit, Closing Balance.
- Drive the opening balance from activity strictly before `From Date`; the period debit/credit from activity inside the `[From Date, To Date]` window; the closing balance from cumulative activity up to and including `To Date`.
- Hide accounts whose absolute period activity sums to zero (`HAVING SUM(...) > 0`), so the report only lists accounts that moved in the selected window.

## Interaction model
- Route: `/report-viewer?report=report-trial-balance`.
- No ← back button in the TopBar breadcrumb (ETP-5519, shared by every report in `ReportViewerPage.jsx`); the in-page **Cancelar** button (`action-cancel`) returns to the report catalog.
- Visibility: Finance / Reports menu, category `finance`.
- Implementation type: contract-driven SQL report served by the `report-api` Vite plugin in dev and by the static manifest in production.
- Layout: flat listing (`type: listing`) in landscape orientation, default sort by account number ascending.

## Reactive behavior and dependencies
- The report does not auto-render — the user must press **Run Report** after picking parameters.
- `dateFrom`, `dateTo`, and `acctSchemaId` are required and live in the primary section. `orgId` is required but hidden and defaulted from the session organization.
- `dateFrom` defaults to the first day of the previous month (`__FIRST_OF_PREV_MONTH__`); `dateTo` defaults to today (`__TODAY__`).
- Optional account-range filters (`fromAccountId`, `toAccountId`) live in the primary section and depend on `acctSchemaId` so the account selector filters to accounts of the chosen schema.
- Dimension filters (business partner, product, project) live in the `dimensions` sidebar section as multi-select popups.
- Each account row supports drill-down: clicking the account in the HTML render dispatches a `trial-balance-drilldown` postMessage that opens the General Ledger report (`report-general-ledger`) scoped to that account — see `ReportViewerPage.jsx` `handler` for the wiring.

## Gap assessment
- The report keeps "Trial Balance" as the English title — the standard IFRS/accounting term; no alternative spelling is exposed.
- The trial balance only checks single-currency activity in the schema's base currency; multi-currency reporting requires a different report.
- Accounts inactive or never moved during the window are intentionally excluded — auditors who need a "zero rows" line for a specific account must use the General Ledger detail report.

## Manual verification
1. Open the Reports list under Finanzas / Informes and confirm the card shows **Balance de Sumas y Saldos** in Spanish locale and **Trial Balance** in English locale.
2. Click the card and confirm the report viewer header shows the same localized title.
3. Pick a date range that includes activity, set General Ledger and Organization, leave the rest empty, and run the report.
4. Confirm rows are sorted by account number ascending and show all six columns: Account No., Name, Opening Balance, Debit, Credit, Closing Balance.
5. For each row, manually verify: `Closing = Opening + Debit - Credit`.
6. Apply a from-account / to-account range and confirm rows narrow to that range.
7. Click an account in the HTML render and confirm the General Ledger drill-down dialog opens scoped to that account value.
8. Download the report as PDF, XLSX, and CSV; confirm the landscape layout renders correctly in all three formats.

## Automated evidence
- `artifacts/report-trial-balance/report-contract.json` declares the report id, SQL, parameters, columns, and outputs (PDF / XLSX / CSV / HTML). The localized title is `{ en_US: "Trial Balance", es_ES: "Balance de Sumas y Saldos" }`.
- `artifacts/report-trial-balance/template.hbs` and `artifacts/report-trial-balance/helpers.js` define the Handlebars rendering, currency formatting, and drill-down anchor wiring.
- `artifacts/report-trial-balance/mock-data.json` provides offline preview data for dev mode (`VITE_MOCK=true`).
- `tools/app-shell/src/pages/ReportViewerPage.jsx` (`ReportList` + `ReportCard`) renders the localized title for both list and detail views via `report.title?.[locale]`, and the `trial-balance-drilldown` postMessage handler opens the General Ledger viewer.
- `tools/app-shell/vite-plugins/report-api.js` `listReports()` reads `report-contract.json` at request time, so title changes appear after a browser refresh without rebuilding.
- `cli/src/generate-reports-manifest.js` mirrors the same listing logic for the production static manifest at `tools/app-shell/dist/api/reports`.
