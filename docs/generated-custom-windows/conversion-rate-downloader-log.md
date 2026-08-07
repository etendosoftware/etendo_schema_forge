# Conversion Rate Downloader Log

## Intent
Give administrators an observability surface for the automated conversion-rate downloader (`com.smf.currency.conversionrate`). Each row records one execution of the scheduled job that fetches external FX rates and upserts the matching `Conversion Rates` records (the ones flagged `Synced`). The log answers "did the last refresh run, when, did it succeed, and how many pairs did it touch?" without anyone reading server logs.

This is a read-only audit window — it is written by the background job, never by the user. The rates it produces are maintained in the companion window — see `conversion-rates.md`.

## What this window should allow
Users should be able to review the history of downloader runs and diagnose a failed or partial sync.

From the current generated form and decisions, every field is read-only and the window allows a user to:
- see the **Sync Date** of each run (timestamp the downloader executed)
- read the run **Status** (success / error outcome reported by the job)
- read **Pairs Updated** — how many currency pairs were written or refreshed
- read **Pairs Failed** — how many pairs the run could not process
- read **Duration (ms)** — wall-clock time the run took, in milliseconds
- open a run and read **Error Detail** — the captured error text for a failed or partial run (form-only, not shown in the list)

## Interaction model
- **Route:** `/conversion-rate-downloader-log` and `/conversion-rate-downloader-log/:recordId`.
- **Visibility:** visible from the **Settings / System** group in `tools/app-shell/src/menu.json` (`windowId: "6FEBA130CDE24CC09041FFA6117ADFA9"`), next to Fiscal Configuration.
- **Implementation type:** generated window loaded through `tools/app-shell/src/windows/registry.js`; `category: settings`.
- **Window shape:** single-entity window (`conversionRateDownloaderLog`) with no child entities and no process endpoints.
- **List columns:** Sync Date, Status, Pairs Updated, Pairs Failed, and Duration (ms). `Error Detail` and `Active` are form-only.
- **Mode:** read-only, **UI and API**. `decisions.json` declares `window.readOnly: true`, which derives `hideCreate` + `hideDelete` for the UI and — since ETP-4254 — restricts the `conversionRateDownloaderLog` entity on `ETGO_SF_ENTITY` to `ISGET=Y, ISGETBYID=Y, ISPOST=N, ISPUT=N, ISPATCH=N, ISDELETE=N`. NEO Headless answers `405 "<METHOD> not enabled for conversionRateDownloaderLog"` to the React app *and* to the MCP agent, and `neo_discover` reports `readOnly: true`. Create/edit/delete are not part of the intended flow because the rows are machine-generated. Criteria and mechanism: [`../agentic-validation/agentic-write-exposure-criteria.md`](../agentic-validation/agentic-write-exposure-criteria.md).

## Reactive behavior and dependencies
This window has no reactive UI behavior — there are no selectors, callouts, defaulting, or status-driven actions. Its contents depend entirely on the downloader job:
- Each scheduled (or manually triggered) downloader run appends one row here and, on success, upserts the corresponding `Conversion Rates` records with `Synced = true`.
- A row with a non-zero **Pairs Failed** or an error **Status** is the signal to open the record and read **Error Detail**.
- There is no "re-run" action in the window; re-running the download is owned by the background process / scheduler in `com.smf.currency.conversionrate`.

## Gap assessment
- The window reports outcomes but offers no in-UI trigger to launch a fresh download or retry a failed run; that lifecycle lives in the backend job.
- `Status` is surfaced as the raw value the job records; the window does not map it to a colored badge the way transactional document statuses are rendered elsewhere.
- Retention/pruning of old log rows is not governed by the window — it follows whatever the job or DB housekeeping defines.

## Manual verification
1. Open `/conversion-rate-downloader-log` from the **Settings / System** menu and confirm the list loads with Sync Date, Status, Pairs Updated, Pairs Failed, and Duration (ms) columns.
2. Confirm rows are sorted/readable by Sync Date and that the most recent run is identifiable.
3. Open a successful run and confirm Pairs Updated is populated, Pairs Failed is 0, and Error Detail is empty.
4. Open a failed/partial run (if present) and confirm Error Detail shows the captured message and Pairs Failed is non-zero.
5. Confirm no create/edit/delete affordances mutate the data (the window is for inspection only).
6. Cross-check: after a successful run, open `/conversion-rates` and confirm the affected pairs now show `Synced = true`.

## Automated evidence
- `artifacts/conversion-rate-downloader-log/decisions.json` declares the `conversionRateDownloaderLog` header entity with all fields marked `readOnly` (`syncDate`, `status`, `pairsUpdated`, `pairsFailed`, `durationms`, `errorDetail`, `active`).
- `artifacts/conversion-rate-downloader-log/generated/web/conversion-rate-downloader-log/ConversionRateDownloaderLogTable.jsx` confirms the list columns; `ConversionRateDownloaderLogForm.jsx` confirms the read-only form including the form-only `errorDetail`.
- `artifacts/conversion-rate-downloader-log/generated/web/conversion-rate-downloader-log/index.jsx` confirms the route, the `settings` category, and the standalone generated layout.
- `tools/app-shell/src/menu.json` places the window in the Settings/System group with `windowId: "6FEBA130CDE24CC09041FFA6117ADFA9"`.
- Backend: the rows are written by the downloader job in `com.smf.currency.conversionrate`, which also produces the `Synced` records consumed by `conversion-rates.md`.
