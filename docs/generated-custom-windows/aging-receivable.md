# Aging Report (Receivables)

## Intent
Show treasury users how much each contact owes and how overdue it is: the open receivables at an "as of" date, split into aging brackets, so they can chase the oldest debt first. Its payables twin is `aging-payable.md`, which shares everything below except where that guide says otherwise.

## What this report should allow
- Open it from **Tesorería › Informes** (`report-viewer?category=treasury`), card **Antigüedad de Cobros** (es) / **Aging of Receivables** (en). Since ETP-6389 both aging reports live in the treasury category; before, they were under Finanzas › Informes.
- Find it from the global search while typing (e.g. "Antigüedad"), listed under Tesorería, when the role holds a grant on it (see `app-shell-functional-flows.md`, authenticated shell flow).
- Pick the **As of Date** (required). Optionally narrow to one **Contact**, switch on **Show Details**, and change the four bracket limits (**Días Tramo 1–4**, defaults 30 / 60 / 90 / 120). Organization and General Ledger are required but hidden and filled in from the session.
- Read one row per contact, sorted by contact: Contact · Current · one amount column per aging bracket (the preview builds the bracket headers from the **Días Tramo** limits) · Total · Credits · Net.
- With **Show Details**, read one card per contact listing its documents (document number and date, the number opening the invoice) with a per-contact subtotal, and a grand total after the cards.
- Click a contact name in the summary to open a modal with the same report filtered to that contact, in detail mode. Its "open full report" link opens the report in a new tab under `category=treasury`.
- Download it as PDF (landscape), XLSX or CSV.

## Interaction model
- Route: `/report-viewer?category=treasury&report=aging-receivable`. An old link or favourite with `category=finance` is rewritten to `category=treasury` (see `app-shell-functional-flows.md`, breadcrumb section).
- Breadcrumb: `Tesorería / Informes / Antigüedad de Cobros`; Informes links back to the treasury catalog.
- Menu: a hidden `menu.json` row in the Treasury group (`reportId: "aging-receivable"`, `path: "report-viewer?category=treasury&report=aging-receivable"`). It never shows in the sidebar; the Informes entry (`report-viewer-treasury`) is the way in.
- Implementation type: contract-driven report with `source: "neo"` — `POST /sws/neo/aging-receivable` with `{ "recOrPay": "RECEIVABLES" }`, served by `AgingReportHandler` (`@Named("agingReportHandler")`) in `com.etendoerp.go`. Classic report viewer, not the `dynamic-reports` interactive view.

## Access
- Backend: running the report requires the OBUIAPP process grant of Receivables Aging (`0D37A9F6109549DEB058373EF2DAEB6A`); without it the handler answers 403. Its catalog-level check (`isAccessibleForCurrentRole`, read by `NeoAccessHelper` for `etendo_discover` and the report tools) passes with either aging grant, receivables or payables.
- Roles matrix: `ReportAccessCatalog` row `aging-receivable`, category `Treasury` (`TREASURY_CATEGORY`), so "Configuración › Roles" and the user's "Roles del usuario" tab list it under Tesorería › Informes.
- SPA: the treasury catalog opens with the Financial Reports window grant or a grant on either aging report, and its cards are filtered to the reports the role holds. The sidebar's Tesorería › Informes link needs a grant on an aging report (`requiresGroupReport`); the Financial Reports window alone does not show it.

## Manual verification
1. As a role with the Receivables Aging grant, open Tesorería › Informes and confirm the **Antigüedad de Cobros** card is there and no finance report is.
2. Run it for today's date and confirm one row per contact with the bracket columns and a Total / Credits / Net that add up.
3. Switch on **Show Details** and confirm one card per contact with its documents, a subtotal per card and a grand total at the end.
4. Click a contact in the summary: the modal shows only that contact in detail mode; its "open full report" link opens a new tab whose URL carries `category=treasury`.
5. Download PDF, XLSX and CSV and confirm they show the same figures; the PDF is landscape.
6. Open `/report-viewer?category=finance&report=aging-receivable` and confirm the URL becomes `category=treasury` and the breadcrumb reads Tesorería.
7. As a role without the grant, confirm the card is missing and a direct `POST /sws/neo/aging-receivable` answers 403.

## Automated evidence
- `artifacts/aging-receivable/report-contract.json` declares the category, NEO endpoint and handler, columns, parameters (sections Periodo / Alcance / Tramos de antigüedad) and outputs; `template.hbs`, `template-excel.hbs`, `template-csv.hbs` and `helpers.js` render it; `mock-data.json` feeds dev mock mode.
- `tools/app-shell/test/report-aging-detail-cards.test.js` (detail cards, subtotals, grand total, bracket columns) and `report-aging-excel-csv-detail.test.js` (one export row per document, Credit / Net) run against both aging reports.
- `tools/app-shell/src/pages/__tests__/ReportViewerPage.vitest.jsx` covers the treasury category gate and `catalogCategoryOf`; `components/__tests__/CommandPalette.vitest.jsx` the global-search listing per grant.
- `com.etendoerp.go`: `RoleAccessMatrixTest` / `SFRolesOverviewTest` pin both aging rows under the `Treasury` category of `reportsMatrix`.
