# Dynamic (interactive) reports — engine notes

`DynamicReportView` (`tools/app-shell/src/components/reports/dynamic/`) is the shared interactive view of every report in `DYNAMIC_REPORT_IDS`, behind the `dynamic-reports` flag. Report-specific behaviour is documented per window (`docs/generated-custom-windows/<report>.md`); what is true for all of them lives here.

## Selections in the URL (ETP-6239)

F5, a bookmark or a shared link restore what the panel had. Nothing in this mechanism names a report: `reportUrlState.js` derives what a report persists from its own definition (`report.parameters`, the contract's), so a report joining the engine gets it with no code.

| Key | Persisted when the report declares |
|-----|-----------------------------------|
| `orgId` | an `orgId` parameter |
| `dateFrom` + `dateTo` | both as `date` parameters (written and read as a pair) |
| each picker (`bPartnerId`, `productId`, …) | a visible `search` parameter on a selector the panel offers (`PICKER_SELECTORS`); ids comma-joined |
| `columns`, `compare` | `compareTo` (the period engine's marker: Columnas and the comparison travel together) |
| `splitBy` | `splitBy` |

`reportUrlKeys(report)` returns the keys a report owns; it is what a write clears and what the restore reads. Add a key by declaring the parameter, not by editing the helper.

- **Only what differs from the default is written.** An untouched period stays out of the URL, so tomorrow it still opens on its default. A clean `/report-viewer?report=<id>` opens the defaults. A shortcut range (e.g. "Mes a la fecha") is stored as literal dates, so after a day it is no longer "to date".
- **Replace, through the router.** Every change calls the router's `setSearchParams(next, { replace: true })` (the page hands the view `search` and `onSearchChange`; on its own the view uses `history.replaceState`), so filter tweaks do not fill the back history and the router never disagrees with the address bar. While the defaults reload (an org change) nothing is written, or the not-yet-known defaults would be frozen into the URL.
- **Scope.** The keys belong to the report: `ReportViewerPage` keeps only `category` when leaving a report and starts a picked report with only `category` + `report`, so nothing leaks to the catalog or to another report. Not persisted: the account level and folded rows, the drill-down panel, the panel-collapsed flag (its own per-user storage).
- **The URL is user input.** Dates must be real `yyyy-MM-dd` days (date-only utilities), in order (a half or reversed period is ignored whole); enums are checked against their allowed values (`total` is never restored); ids are `[A-Za-z0-9_-]` strings (64 characters, 100 per list). An invalid value is ignored and its default stays. A restored `orgId` must be in the list the org picker offers (the role's orgs without `0` / `*`), otherwise it is ignored and the default org is used.
- **Names are not in the URL.** `_display_*` is neither written nor read (it would be unchecked text shown as a label and printed in the export header); a picker restored from ids resolves its names through the same selector endpoints the pickers use (`useRestoredPickerNames`, first page of 100, no lookup by id) and shows the id until then or when the item is outside that page. The query never waits for it.
- **Restore.** The state is read when the view mounts, before the first query: one request, not the defaults and then a second. It emits no `report_filter_applied`. Restoring Mes / Trimestre hides the panel for the session like a manual pick.
- **Old viewer.** Flag off, the old viewer keeps reading deep links (`?report=X&dateFrom=…`) from the query string, unchanged.
