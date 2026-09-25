# Journal Entries

## Intent
Let finance users print the full journal book for a date range — every accounting entry grouped by entry id with its date, document type, accounts, and debit/credit amounts — for reconciliation, audit, and statutory filing.

## What this report should allow
- Browse the report from the Finance / Reports menu listed as **Diario de Asientos** (es) / **Journal Entries** (en).
- Filter by date range, organization, accounting schema, account range (from/to), business partner, product, and project.
- Render the report inline as HTML preview and download it as PDF, XLSX, or CSV in landscape orientation.
- Group rows by `fact_acct_group_id` (one group = one accounting entry) with a `DENSE_RANK`-derived sequential entry number per date.
- For each group show the entry date, document type label (defaults to `Journal` when no `c_doctype` is linked), and the journal lines with account number, account name, debit, and credit amounts.
- Filter `factaccttype` to `C, N, O, R, D` (the entry-producing fact types) and drop rows where both debit and credit sum to zero.

## Interaction model
- Route: `/report-viewer?report=report-journal-entries`.
- Visibility: Finance / Reports menu, category `finance`.
- Implementation type: contract-driven SQL report served by the `report-api` Vite plugin in dev and by the static manifest in production.
- Layout: grouped listing (`type: grouped-listing`) in landscape orientation.

## Reactive behavior and dependencies
- The report does not auto-render — the user must press **Run Report** after picking parameters.
- `acctSchemaId` (General Ledger) is required and lives in the primary section. `orgId` is required but hidden and defaulted from the session organization.
- `dateFrom` defaults to the first day of the previous month (`__FIRST_OF_PREV_MONTH__`); `dateTo` defaults to today (`__TODAY__`). Both are optional — empty strings short-circuit the SQL guard for that bound.
- Optional refinement filters live in two sidebar sections: `filters` (account range) and `dimensions` (business partner, product, project, all multi-select via `popup` selector).
- Rows are sorted by `dateacct`, `fact_acct_group_id`, a debit/credit priority (`dc_priority` — debit lines before credit lines, matching standard accounting presentation), and the minimum `seqno` within the group as the final tiebreak (ETP-5376 follow-up: the `dc_priority` CASE expression existed in the `je` CTE's `GROUP BY` since the report's creation but was never projected or referenced in the outer `ORDER BY`, so it had no effect until this fix).

## Gap assessment
- The report keeps `Journal Entries` as the English title — the IFRS/accounting standard equivalent is also "General Journal" but the contract uses the shorter form already used in the codebase.
- Document type fallback to the literal string `Journal` (when `c_doctype` is null) is not localized — Spanish users will still see the English word for these rows.
- Multi-currency display is not part of the current contract; debit and credit are shown in the accounting schema's base currency only.

## Manual verification
1. Open the Reports list under Finanzas / Informes and confirm the card shows **Diario de Asientos** in Spanish locale and **Journal Entries** in English locale.
2. Click the card and confirm the report viewer header shows the same localized title.
3. Pick General Ledger, leave the rest on defaults, and run the report.
4. Confirm rows are grouped by entry, with the entry header showing the date and document type, and the lines listing account number, name, debit, and credit.
5. Apply a date range that includes activity from multiple document types and confirm the document type label changes per group.
6. Apply a business partner / product / project multi-select filter and confirm the lines narrow to entries that touch those dimensions.
7. Download the report as PDF, XLSX, and CSV; confirm the landscape layout renders correctly in all three formats.

## Automated evidence
- `artifacts/report-journal-entries/report-contract.json` declares the report id, SQL, parameters, columns, groups, and outputs (PDF / XLSX / CSV / HTML). The localized title is `{ en_US: "Journal Entries", es_ES: "Diario de Asientos" }`.
- `artifacts/report-journal-entries/template.hbs` and `artifacts/report-journal-entries/helpers.js` define the Handlebars rendering and amount-formatting helpers.
- `artifacts/report-journal-entries/mock-data.json` provides offline preview data for dev mode (`VITE_MOCK=true`).
- `tools/app-shell/src/pages/ReportViewerPage.jsx` (`ReportList` + `ReportCard`) renders the localized title for both list and detail views via `report.title?.[locale]`.
- `tools/app-shell/vite-plugins/report-api.js` `listReports()` reads `report-contract.json` at request time, so title changes appear after a browser refresh without rebuilding.
- `cli/src/generate-reports-manifest.js` mirrors the same listing logic for the production static manifest at `tools/app-shell/dist/api/reports`.
