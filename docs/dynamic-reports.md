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
