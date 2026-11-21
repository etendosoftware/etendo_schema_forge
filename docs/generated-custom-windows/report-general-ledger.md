# General Ledger

## Intent
Show the accounting movements of `fact_acct` grouped by account, with an opening balance carried from before the period, so accountants can audit how each account reached its balance. It is also the target of the Trial Balance account drill-down.

## What this report should allow
- Browse the report from the Finance / Reports menu listed as **Libro Mayor** (es) / **General Ledger** (en).
- Pick a date range (`From Date`, `To Date`, both required), optionally an account range (`From Account` / `To Account`) and dimension filters, then run.
- Render the report inline as HTML preview and download it as PDF, XLSX, or CSV in landscape orientation.
- Show one group per account (heading: account name, with its code) and one row per movement: Date, Description, Debit, Credit, Balance. Description is the business partner name, or the line description when there is none.
- Compute the opening balance (`openingQuery`) from activity strictly before `From Date`; the movements (`sql.query`) from the `[From Date, To Date]` window. Regularization (`R`) and closing (`C`) fact types are excluded from the movements.
- Scope by organization through `ad_isorgincluded` so child organizations inherit the parent's postings.
- Filter by Contact, Product, Project and Cost Center (multi-select popups). The **Product** picker uses the `product-all` selector: every active product of the client in the role's organizations, services and products without stock included, instead of `product`, which only lists products with stock (ETP-6080).
- Optionally show the accounting dimensions (`showDimensions` toggle) and group results by a dimension (`groupBy`).

## Interaction model
- Route: `/report-viewer?report=report-general-ledger`.
- No back button in the TopBar breadcrumb (ETP-5519, shared by every report in `ReportViewerPage.jsx`); the in-page **Cancelar** button (`action-cancel`) returns to the report catalog.
- Visibility: Finance / Reports menu, category `finance`.
- Implementation type: contract-driven SQL report served by the `report-api` Vite plugin in dev and by the static manifest in production.
- Layout: grouped listing (`type: grouped-listing`) in landscape orientation, default sort by date ascending.
- Drill-down target: the Trial Balance opens this report scoped to one account through the hidden `accountId` parameter (it filters `fact_acct.account_id` directly so the account index is used). Access is checked on this report on its own (ETP-6080).

## Reactive behavior and dependencies
- The report does not auto-render; the user must press **Run Report** after picking parameters.
- `dateFrom` and `dateTo` are required (section *Period*). `orgId` and `acctSchemaId` are required but hidden, defaulted from the session (the schema via `autoDefault`).
- `fromAccountId` / `toAccountId` (section *Scope*) depend on `acctSchemaId`, so the selector lists accounts of the chosen schema; the range compares account codes (`ev.value`).
- Dimension filters live in the *Dimensions* section; `groupBy` in *Grouping*.
- `showOpenBalances` is declared but hidden.
- `openingEntryAmount` (ETP-6084) is a hidden toggle, default **false**: when false the report behaves exactly as before (R/C entries stay in the opening balance, correct after a year-end close). The Trial Balance drill sends its own value so the ledger opening matches the row clicked. The MCP `GeneralLedgerReportHandler.java` does not mirror it, by design.

## Gap assessment
- The report assumes a single accounting schema per run.
- The legacy `migration-notes.md` records the JRXML field mapping only; the grouping and opening-balance behavior above comes from the contract SQL.

## Manual verification
1. Open the Reports list under Finanzas / Informes and confirm the card shows **Libro Mayor** in Spanish locale and **General Ledger** in English locale.
2. Pick a date range with activity, leave the rest empty, and run the report; confirm one group per account with Date, Description, Debit, Credit, Balance.
3. Open the Product filter and confirm it lists services and products without stock, not only products with stock.
4. Filter by a product and confirm only movements of that product remain.
5. Apply a from-account / to-account range and confirm the groups narrow to it.
6. From the Trial Balance, click an account and confirm this report opens scoped to it.
7. Download the report as PDF, XLSX, and CSV and confirm the landscape layout and the same groups in all three.

## Automated evidence
- `artifacts/report-general-ledger/report-contract.json` declares the report id, SQL (`query` and `openingQuery`), parameters, sections, columns, groups, and outputs (PDF / XLSX / CSV / HTML). The localized title is `{ en_US: "General Ledger", es_ES: "Libro Mayor" }`.
- `artifacts/report-general-ledger/template.hbs`, `template-excel.hbs`, `template-csv.hbs` and `helpers.js` define the rendering per output format.
- `artifacts/report-general-ledger/mock-data.json` provides offline preview data for dev mode (`VITE_MOCK=true`).
- `tools/app-shell/src/pages/ReportViewerPage.jsx` renders the localized title and handles the `trial-balance-drilldown` postMessage that opens this report.
- `tools/app-shell/vite-plugins/report-api.js` mirrors the `product-all` selector for the dev report API (ETP-6080).
