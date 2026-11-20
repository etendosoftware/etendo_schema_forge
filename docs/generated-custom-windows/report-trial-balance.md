# Trial Balance

## Intent
One row per account with opening balance, period debit, period credit and closing balance, so accountants can check that the books balance and inspect activity before issuing financial statements. Since ETP-6084 the report also runs on the dynamic report engine (flag `dynamic-balance-reports` since ETP-6083, shared with the Balance Sheet; it was `dynamic-reports` until then), where the user explores it without re-running: level, folding, grouping by dimension, comparison and drill-down.

## What this report should allow
- Browse it from Finance / Reports as **Balance de Sumas y Saldos** (es) / **Trial Balance** (en).
- Download PDF, XLSX or CSV from either viewer.
- Two viewers, same contract (`artifacts/report-trial-balance/report-contract.json`):

| | Old viewer (flag `dynamic-balance-reports` off) | Dynamic view (flag on, `DYNAMIC_REPORT_IDS`) |
|---|---|---|
| Route | `/report-viewer?report=report-trial-balance` | same route; `ReportViewerPage` switches on the flag |
| Run | press **Run Report** | renders on open, re-queries on every change |
| Query | `sql.query` (flat or grouped) | `sql.treeQuery` + `sql.periodQuery` (`tree: 'chart'`) |
| Output | HTML iframe from `template.hbs` | native table; exports render the same templates |

`sql.query` is untouched: it feeds the old viewer, its `/render`, and the MCP twin (`TrialBalanceReportHandler.java`).

## Parameters
| Parameter | Notes |
|---|---|
| `dateFrom`, `dateTo` | required; defaults first day of previous month / today |
| `orgId`, `acctSchemaId` | required, hidden, defaulted from the session |
| `fromAccountId`, `toAccountId` | account range (by `ev.value`), depends on `acctSchemaId` |
| `bPartnerId`, `productId`, `projectId`, `costCenterId` | multi-select dimension filters (product uses `product-all`, ETP-6080) |
| `accountLevel` | `C` / `D` / `E` / `S`, default `S` (initial level) |
| `groupBy` | dimension grouping: contact, product, project, cost centre |
| `openingEntryAmount` | "Opening Entry Amount to Initial Balance", default on |
| `showOnlyAccountsWithValue` | default on; off also lists accounts with postings up to `dateTo` but all-zero amounts |
| `compareTo` | comparison marker (see below) |
| `expandedNodeIds` | hidden; its presence on `/render` selects the tree shape |

Selections (org, period, pickers, `groupBy`, the toggles, `compareMovements`) persist in the URL, see `docs/dynamic-reports.md`.

## Dynamic view behaviour
- **Level and fold.** The account level is the initial fold. The tree is mixed (local charts have E>E, E>D, E>S, C>C, C>S, D>D), so at the chosen level nested same-level nodes are shown and their other children folded. A leaf with no ancestor at the chosen level is still shown and counted in the totals.
- **Grouping / dimensions.** With `groupBy`, each subaccount (S leaf) gets one child row per dimension value (empty value = "none"), starting expanded. Order is account then dimension. A row with no dimension value is not drillable.
- **Comparison.** `compareTo` offers current vs same period last year / previous period. **Closing** is always compared. Debit and credit are compared only with **Comparar también movimientos** (`compareMovements`, off by default, display only, no re-query). Opening is never compared. The variation % keeps the mathematical sign (denominator `abs(ref)`), neutral colour.
- **Size.** The chart query has no row cap, only the statement timeout: a large account x dimension grouping can be slow.
- **Drill-down.** Clicking a subaccount (or a dimension row) opens the General Ledger drill panel with the account, project, cost centre, clicked dimension and the **opening-entry toggle** (`openingEntryAmount`, see `report-general-ledger.md`). A summary row is expanded, not drilled. The General Ledger access is checked on its own (ETP-6080).
- **Totals and balance check.** TOTALES is the sum of the roots. A chip reports `balanced` when sum(debit) = sum(credit) and sum(closing) = 0 (tolerance 0.005); with a partial filter (dimension, account range) it is a warning instead of an error.
- **Sign convention.** Raw sums as Classic: debit and credit can be negative (reversals, credit-side postings). Closing = opening + debit - credit.

## Exports
- **Dynamic view:** sends `expandedNodeIds` (or `visibleNodeIds`, the exact rows currently shown, which wins), `compareMode` and `compareMovements`. The templates take the `meta.chartTotals` branch: PDF/HTML, Excel (numeric cells) and CSV (`csvField`). CSV headers name the compared amount.
- **Old viewer:** no `expandedNodeIds`, so the flat/grouped shape; output is byte-identical to before ETP-6084.

## Declared divergences
- The new queries (`treeQuery`, `periodQuery`) **include child organisations** (`ad_isorgincluded`, as Classic, P&L and General Ledger). The old `sql.query` and the MCP `TrialBalanceReportHandler.java` filter the exact organisation, so the two viewers and the MCP can differ for an org with children.
- Leaves with no ancestor at the chosen level are shown and counted (the old query dropped them at a coarser level).
- **ETP-6059 is still open:** the opening balance can double-count after a year-end close (R/C entries). Not fixed here; the General Ledger drill keeps R/C entries in its opening.

## Gap assessment
- Single-currency (schema base currency) only.
- Accounts without activity are excluded unless `showOnlyAccountsWithValue` is off; for a specific zero account use the General Ledger.

## Manual verification
1. Reports list: card titled **Balance de Sumas y Saldos** (es) / **Trial Balance** (en).
2. Flag on: the view renders at once with the fiscal-year period; set level to Heading and Subaccount, and confirm totals do not change.
3. Group by Contact: subaccounts expand to contact rows; their sum equals the subaccount.
4. Turn on comparison: Closing shows compared value and variation; Debit/Credit only after the movements toggle.
5. Balance chip shows balanced with no filters.
6. Click a subaccount: General Ledger panel opens for it; toggle the opening entry and confirm the opening line changes.
7. Reload: filters, grouping and toggles are restored from the URL.
8. Export PDF, XLSX, CSV from both the dynamic view and (flag off) the old viewer.

## Automated evidence
- `artifacts/report-trial-balance/report-contract.json`: `tree: 'chart'`, `sql.query` / `treeQuery` / `periodQuery`, `amountColumns`, parameters, outputs.
- `artifacts/report-trial-balance/template.hbs`, `template-excel.hbs`, `template-csv.hbs`: both shapes (`{{#if meta.chartTotals}}`).
- `tools/app-shell/test/report-trial-balance-account-blocks.test.js`, `report-trial-balance-account-level.test.js`, and the `dynamic/__tests__` vitest suites.
- `tools/app-shell/vite-plugins/report-api.js`: dev engine mirror of the core `/query` and `/render` tree path.
