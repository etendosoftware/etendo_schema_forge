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
- **Route:** none. Since ETP-5068 the window has **no UI route** in the Etendo Go app-shell: it is absent from `tools/app-shell/src/menu.json` and has no loader in `tools/app-shell/src/windows/registry.js`, so `/conversion-rate-downloader-log` resolves through the catch-all `:windowName` route to `WindowLoader`'s `Window "conversion-rate-downloader-log" not found` state.
- **Visibility:** **retired from the UI (ETP-5068).** It was previously listed in the **Settings / System** group, but an internal log of the downloader job adds no value to the Etendo Go end user, so the entry was removed rather than merely hidden — reinstating it is not planned. Administrators who need the log read it in **Etendo classic**; the GO template roles keep their AD window grant for `6FEBA130CDE24CC09041FFA6117ADFA9` (see `TemplateRoleWindowAccess` in `com.etendoerp.go`), which is what preserves that access. The window is also gone from **Configuración → Roles** and from **Usuario → Roles**: those two screens are fed by `SFRolesOverview`, not by `menu.json`, so ETP-5068 additionally adds the window id to `SFRolesOverview.UI_EXCLUDED_WINDOW_IDS` in `com.etendoerp.go` — one entry there covers both, because each role's `windows[]`, its `windowCount` and the `matrix` all derive from the same resolver. See `com.etendoerp.go/docs/neo-headless.md` §8c.
- **Implementation type:** API-only window — the artifact, `contract.json` and the NEO spec are intact and the slug is declared in `apiOnlyWindows` in `tools/app-shell/src/windows/registry.js` (which is what keeps pipeline rule F3 green for a window with a contract and no registry loader); `category: settings`.
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
Since ETP-5068 there is no UI to verify. What must be checked is the *absence* of the entry and the survival of the API/classic paths:

1. Expand the sidebar, open **Configuración**, and confirm there is no "Registro de descarga de tipos de cambio" / "Conversion Rate Downloader Log" entry (the last Settings item is Fiscal Configuration).
2. Open the command palette (⌘K) and search "conversion"/"descarga" — only `Conversion Rates` / `Rangos de conversión` may appear.
3. Navigate directly to `/conversion-rate-downloader-log` and confirm the graceful `Window "conversion-rate-downloader-log" not found` state (no blank page, no console crash).
4. Confirm `/conversion-rates` is unaffected and still reachable from **Configuración**.
5. Open **Configuración → Roles** and confirm the window is no longer a row in the window x role matrix; open a user's **Roles** tab and confirm the same.
6. Etendo classic: with a GO template role, open the "Registro descarga tipos de cambio" window and confirm the log rows are still readable there.
7. API/MCP: `GET /sws/neo/conversion-rate-downloader-log/header` still answers 200, and `neo_discover` still reports the entity `readOnly: true`.

## Automated evidence
- `artifacts/conversion-rate-downloader-log/decisions.json` declares the `conversionRateDownloaderLog` header entity with all fields marked `readOnly` (`syncDate`, `status`, `pairsUpdated`, `pairsFailed`, `durationms`, `errorDetail`, `active`).
- `artifacts/conversion-rate-downloader-log/generated/web/conversion-rate-downloader-log/ConversionRateDownloaderLogTable.jsx` confirms the list columns; `ConversionRateDownloaderLogForm.jsx` confirms the read-only form including the form-only `errorDetail`.
- `artifacts/conversion-rate-downloader-log/generated/web/conversion-rate-downloader-log/index.jsx` confirms the `settings` category and the standalone generated layout — still generated, simply no longer mounted by the app-shell.
- `tools/app-shell/src/menu.json` no longer contains the window (ETP-5068); `tools/app-shell/src/windows/registry.js` lists the slug in `apiOnlyWindows` instead of `windowLoaders`.
- `e2e/tests/flows/window-visibility-etp4249.mocked.spec.js` asserts the menu entry and any `conversion-rate-downloader` sidebar href are absent, that the retired route degrades to WindowLoader's not-found state, and that the companion `conversion-rates` window is untouched. Its precondition test pins that the Settings group is actually rendered, so the absence assertions cannot go green for the wrong reason.
- Backend: `SFRolesOverviewTest.testUiExcludedWindowNeverReachesTheResponse` proves the window is absent from the `matrix`, from a role's `windows[]` and from its `windowCount` even when the role holds a live `AD_Window_Access` grant — which is the real tenant state, since the grant is deliberately kept for Etendo classic.
- Backend: the rows are written by the downloader job in `com.smf.currency.conversionrate`, which also produces the `Synced` records consumed by `conversion-rates.md`.
