# Balance Sheet

## Intent
Give finance users a point-in-time snapshot of assets, liabilities, and owner equity grouped by accounting category, sourced from `fact_acct` and the chart of accounts, so they can review the company's financial position for a chosen accounting schema, organization, and year.

## What this report should allow
- Browse the report from the Finance / Reports menu listed as **Balance de Situación** (es) / **Balance Sheet** (en).
- Pick an Accounting Schema (General Ledger), an Organization, and a Year before running.
- Render the report inline as HTML preview and download it as PDF, XLSX, or CSV.
- Group rows by accounting category: `1. Assets`, `2. Liabilities`, `3. Owner Equity` (with `Net Income` rolled into Owner Equity from income/expense accounts).
- Show one row per account (`code - name`) with the signed balance: debit-minus-credit for assets and owner equity; credit-minus-debit for liabilities.
- Hide accounts whose net movement is below `0.01` (`HAVING ABS(...) > 0.01`).
- Apply organization scoping through `ad_isorgincluded` so child organizations inherit the parent's accounts.

## Interaction model
- Route: `/report-viewer?report=balance-sheet`.
- No ← back button in the TopBar breadcrumb (ETP-5519, shared by every report in `ReportViewerPage.jsx`); the in-page **Cancelar** button (`action-cancel`) returns to the report catalog.
- Visibility: Finance / Reports menu, category `finance`.
- Implementation type: contract-driven SQL report served by the `report-api` Vite plugin in dev and by the static manifest in production.
- Layout: grouped listing (`type: grouped-listing`) in portrait orientation.

## Reactive behavior and dependencies
- The report does not auto-render — the user must press **Run Report** after picking parameters.
- `acctSchemaId` (General Ledger) and `yearId` (Year) are required. `orgId` is required but hidden and defaulted from the session organization.
- `yearId` depends on `orgId` via `dependsOn: "orgId"`, so the year picker filters to years valid for the active organization.
- When `yearId` is set, the SQL clamps activity to the `c_year`'s maximum `c_period.enddate`, so the report shows year-to-date balances as of year end.

## Gap assessment
- The report assumes a single accounting schema per run; consolidated multi-schema views are not exposed.
- Comparative columns (prior year, prior period) are not present in the current contract.
- The English title remains "Balance Sheet" (IFRS standard); the Spanish title is the formal Spanish accounting term "Balance de Situación", not the legacy "Balance General" wording.

## Manual verification
1. Open the Reports list under Finanzas / Informes and confirm the card shows **Balance de Situación** in Spanish locale and **Balance Sheet** in English locale.
2. Click the card and confirm the report viewer header shows the same localized title.
3. Pick General Ledger and Year, leave Organization on its default, and run the report.
4. Confirm three category headers appear in order: `1. Assets`, `2. Liabilities`, `3. Owner Equity`.
5. Confirm `Net Income` appears as the last row under Owner Equity when income/expense activity exists in the selected year.
6. Download the report as PDF, XLSX, and CSV; confirm all three formats render the same grouping and totals.
7. Switch organization and confirm the balance set updates accordingly (child orgs inherit via `ad_isorgincluded`).

## Automated evidence
- `artifacts/balance-sheet/report-contract.json` declares the report id, SQL, parameters, columns, groups, and outputs (PDF / XLSX / CSV / HTML). The localized title is `{ en_US: "Balance Sheet", es_ES: "Balance de Situación" }`.
- `artifacts/balance-sheet/template.hbs` and `artifacts/balance-sheet/helpers.js` define the Handlebars rendering and currency/category helpers.
- `artifacts/balance-sheet/mock-data.json` provides offline preview data for dev mode (`VITE_MOCK=true`).
- `tools/app-shell/src/pages/ReportViewerPage.jsx` (`ReportList` + `ReportCard`) renders the localized title for both list and detail views via `report.title?.[locale]`.
- `tools/app-shell/vite-plugins/report-api.js` `listReports()` reads `report-contract.json` at request time, so title changes appear after a browser refresh without rebuilding.
- `cli/src/generate-reports-manifest.js` mirrors the same listing logic for the production static manifest at `tools/app-shell/dist/api/reports`.
