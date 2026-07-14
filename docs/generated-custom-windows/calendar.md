# Calendar

## Intent
Unifies **Fiscal Calendar** and **Periods** (`open-close-period-control`) — previously two
separate windows connected only by a "Go to Fiscal Calendar" cross-navigation modal (ETP-4452
item 8) — into one window (ETP-4478). A single fiscal-year record now exposes period creation,
period/document open-close status, Year-Close/Undo-Close-Year, and a read-only Accounting subtab,
without leaving the record. `fiscal-calendar` and `open-close-period-control` are retired as
routes (hidden, redirect to `/calendar`) but their underlying AD windows/tabs/processes are
unchanged — this is a Schema Forge-side consolidation, not an AD data migration.

**Backend shape (important, and different from a first design attempt):** `/calendar` has **no
NEO spec of its own**. It is backed by **three separate, single-window specs** — `fiscal-calendar`,
`open-close-period-control`, and a new `end-year-close` — stitched together at the frontend layer.
An earlier attempt merged all four entities into one `calendar` spec/artifact; that was reverted
because `schema_forge_core`'s push-to-neo (`populateWindowSpec` in `neo-writer.js`) assumes
**1 spec = 1 AD window** and silently drops (and then actively re-deletes on every subsequent push)
any entity whose physical table isn't reachable from that one window. Filed as
[schema_forge_core#35](https://github.com/etendosoftware/schema_forge_core/issues/35) / Jira
ETP-4481 (tracking only, not being core-fixed) — the fix here is architectural, not a workaround:
keep every spec single-window, and let the custom frontend do the aggregation.

## What this window should allow
- Browse the list of fiscal years (`fiscalYear`, `description`) for the org's calendar.
- Create a new fiscal year. `calendar` is a hidden `system`-visibility field
  (`decisions.json` → `entities.year.fields.calendar`), auto-derived server-side via
  `NeoDefaultsService.tryInjectFirstFromLookup` (the org's first active calendar) —
  there is no calendar selector in the UI. If an organization has zero active
  calendars this will fail with a DB constraint error, since the field can't be
  filled in manually; onboarding is expected to guarantee at least one calendar
  per organization.
- Trigger **Create Periods** on a year to generate its 12 standard periods (Jan–Dec) plus an
  optional adjustment period.
- On a year's detail, switch between two secondary tabs:
  - **Periods** — an expandable list of the year's periods (aggregate status badge), where
    expanding a period row reveals its per-document-type breakdown inline, each with its own
    **Abrir/Cerrar Periodo** / **Abrir/Cerrar Documento** action.
  - **Accounting** — a read-only, year-scoped Fact_Acct grid (account, debit, credit,
    description) for reviewing the year's accounting entries.
- Trigger **Cerrar Año** (Close Year) from the kebab ("more") menu once every period is
  Closed or Permanently Closed, and **Deshacer Cierre de Año** (Undo Close Year) to reverse it.
- The top-level `calendar` entity (`C_Calendar`) itself is not exposed as a browsable tab — most
  tenants have exactly one calendar per organization, provisioned by onboarding, not managed here.

## Interaction model
- Route: `/calendar` for the year list and `/calendar/:recordId` for the year detail.
- Visibility: visible from the Finance menu as **Calendar**. `fiscal-calendar` and
  `open-close-period-control` remain registered in `menu.json` with `"hidden": true` (required —
  `registry.js`'s `buildWindowMap()` only registers routes for names present in `menu.json`;
  deleting the entries outright breaks the redirect below, since the route would 404 before ever
  reaching the redirect component) and point at `FiscalCalendarRedirect`/
  `OpenClosePeriodControlRedirect` (`<Navigate to="/calendar" replace />`) instead of their old
  generated pages.
- Implementation type: `window.layoutType: "custom"` — a hand-written
  `tools/app-shell/src/windows/custom/calendar/index.jsx` has **no backing artifact of its own**.
  It directly imports the generated `YearPage` from the **`fiscal-calendar`** spec
  (`@generated/fiscal-calendar/generated/web/fiscal-calendar/YearPage`) as its header/list, and
  adds `secondaryTabs` (see `docs/ui-customization.md` §17 for the `Panel` prop contract) whose two
  panels each call a **different spec entirely**.
- Window shape — three independent, single-window specs:
  - **`fiscal-calendar`** (unchanged AD window 117) — `year` (header, table `C_Year`) is the only
    entity this spec exposes to the UI; its own native `period` entity/tab exists in the contract
    (carried over from the original ETP-4452 Fiscal Calendar work) but is never rendered — the
    custom window's Periods tab uses a completely different entity from a different spec instead
    (see below). `year.calendar` entity (table `C_Calendar`) stays `exclude: true`.
  - **`open-close-period-control`** (unchanged AD window, `E66E701CCBA14B8BA480CBDE37C50D7A`) —
    `periodControl` (table `C_Period`) and `documents` (table `C_PeriodControl`) — **entirely
    untouched by ETP-4478**, same spec, same fields, same Java handlers as before this feature
    existed.
  - **`end-year-close`** (new spec, AD window `B5673F73F613496C8BEA22FB55E4E1E4`, "End Year
    Close") — only the `accounting` entity is kept (its own header tab, `endYearClose`, is
    `exclude: true`, same pattern as `fiscal-calendar`'s excluded `calendar` entity).

## The apiBaseUrl-rewriting pattern (why one custom window can span 3 NEO specs)
`WindowLoader.jsx` always injects `apiBaseUrl={rootBase}/calendar` into a window's props — derived
from the **route** name, not any real spec — and `DetailView`'s `SecondaryPanelTab` threads that
exact same value, unchanged, into every `secondaryTabs[].Panel`. Since none of the three real
specs is actually named `calendar`, `tools/app-shell/src/windows/custom/calendar/index.jsx` has to
rewrite the base URL for every fetch target, including its own header page:

```jsx
function rootApiBase(apiBaseUrl) {
  return apiBaseUrl.replace(/\/[^/]*$/, ''); // strip the trailing "/calendar" route segment
}
// YearPage (header):        `${rootApiBase(apiBaseUrl)}/fiscal-calendar`
// PeriodsExpandablePanel:    `${rootApiBase(apiBaseUrl)}/open-close-period-control`
// AccountingPanel:           `${rootApiBase(apiBaseUrl)}/end-year-close`
```

`CloseYearConfirmModal.jsx` (see below) needs the identical rewrite for its own independent
`periodControl` status-check fetch, via its own `periodControlApiBase()` helper — it isn't reached
through `secondaryTabs`, so it can't just inherit the panel wiring above.

This is a second, distinct extension pattern beyond a plain `secondaryTabs`/`Panel` (which normally
assumes the Panel talks to the *same* spec the window itself is backed by) — see
`docs/ui-customization.md` §17 for a cross-reference. Known latent fragility (flagged in review,
non-blocking): the stripping regex assumes `apiBaseUrl` has no trailing slash; if that assumption
ever changes, this needs revisiting.

## Reactive behavior and dependencies
- **Create Periods** (`year.processNow`, column `Processing`, on `fiscal-calendar`) is bound to
  classic AD Process `100` (`C_YearPeriods`), a plain DB-procedure process — invoked generically
  via `CallProcess`, no custom `NeoHandler` needed. `decisions.json → window.processOverrides.processNow`
  opens a `ProcessParamDialog` with one parameter, `CREATEADJUSTMENT` (Yes/No select).
- **Abrir/Cerrar Periodo** (`periodControl.openClose`, on `open-close-period-control`) calls AD
  Process `167` (`C_Period_Process`) via `PeriodOpenCloseHandler`
  (`JAVA_QUALIFIER = 'period-openclose'`) — the exact same handler and URL base
  (`/sws/neo/open-close-period-control/...`) this window has always used; nothing about this action
  changed for ETP-4478.
- **Abrir/Cerrar Documento** (`documents.openClose`, on `open-close-period-control`) calls AD
  Process `168` (`C_PeriodControl_Process`) via `PeriodControlDocOpenCloseHandler`
  (`JAVA_QUALIFIER = 'period-control-doc-openclose'`), same carry-over as above.
- **Cerrar Año** / **Deshacer Cierre de Año** are `fiscal-calendar`'s `window.menuActions` entries
  (`closeYear`/`undoCloseYear`), rendered from the kebab menu, each opening
  `CloseYearConfirmModal.jsx` (in `tools/app-shell/src/windows/custom/fiscal-calendar/`) via a thin
  per-action wrapper (`CloseYearModal.jsx`/`UndoCloseYearModal.jsx` — required because the
  generator emits one `import` per `menuActions[].component` with no dedup; pointing two actions at
  the same component name would produce a duplicate-import syntax error). The modal fetches
  `periodControl` (from `open-close-period-control`, via its own base-URL rewrite) for the year and
  disables its confirm button until every period is `C` (Closed) or `P` (Permanently Closed).
  - **Server-side, the real button fields are `year.createRegFactAcct`/`year.dropRegFactAcct`**
    (raw AD column names `Create_Reg_Fact_Acct`/`Drop_Reg_Fact_Acct`, labels "Close Year"/"Undo
    Close Year", `processId` 800036/800038) — both stay `visibility: discarded` in
    `fiscal-calendar/decisions.json` (they are NOT rendered as generic process buttons; doing so
    was tried and rejected during review — see Gap assessment). Field name and menuAction/action-URL
    name are decoupled: NEO routes any `/action/<name>` on an entity to its `javaQualifier` handler
    regardless of whether a field with that exact name exists. `YearCloseHandler`
    (`JAVA_QUALIFIER = 'year-close'`, on `fiscal-calendar`'s `year` entity) dispatches on the
    `closeYear`/`undoCloseYear` action names, re-validates every period is Closed/Permanently
    Closed server-side (defense in depth — the client-side check must not be trusted alone), then
    invokes the legacy `CreateRegFactAcct`/`DropRegFactAcct` `ad_actionButton` servlets'
    `processButton(...)` method directly via reflection — **`CallProcess` does not work for these
    two processes** (confirmed: `AD_Process.procedurename = NULL` for both; `CallProcess` has no
    code path for `classname`-based processes at all). See the class javadoc in
    `YearCloseHandler.java` for the full reflection/`VariablesSecureApp`/`DalConnectionProvider`
    rationale.
- **Accounting** (`accounting` entity on `end-year-close`, `JAVA_QUALIFIER = 'year-accounting'`) is
  served by `YearAccountingHandler`, which queries `FinancialMgmtAccountingFact` directly, scoped
  by `fa.period.year.id = :yearId` — **not** by re-invoking the stored
  `FinancialMgmtAccountingFactEndYearHQL` view text, which has no `year` property on its output at
  all (its `C_Year_Close_V_ID` output column is actually a `PeriodControl` id, not the Year's own
  id) and relies on Etendo's `@additional_filters@` template substitution, which isn't invocable
  standalone. See the class javadoc in `YearAccountingHandler.java`.
- Period metadata fields (`periodNo`, `name`, `startingDate`, `endingDate`, `periodType`) are
  classified `readOnly` — the Periods tab is a status/confirmation view, not a metadata editor.

## Loading, error, and double-submit UX (Periods/Accounting panels)
`AccountingPanel.jsx` and `PeriodsExpandablePanel.jsx` each track three distinct states for their
fetched data — never just "empty vs loaded":
- **Loading** (`rows`/`periods === undefined`, the initial/in-flight state) — a `{ui('loading')}`
  placeholder (`data-testid="accounting-panel-loading"` / `"periods-expandable-panel-loading"`).
- **Error** (`=== null`, set in the fetch's `.catch()` on a non-2xx response or network failure) —
  a destructive-styled message (`ui('accountingLoadError')` / `ui('periodsLoadError')`,
  `data-testid="accounting-panel-error"` / `"periods-expandable-panel-error"`). A failed fetch is
  never silently relabeled as "no rows" — conflating the two would hide real outages behind an
  innocuous-looking empty state.
- **Loaded** — an array, rendered as the table/list even when empty (`AccountingPanel` shows a
  distinct `accounting-panel-empty` state for a loaded-but-zero-rows year; `PeriodsExpandablePanel`
  just renders no rows).

`PeriodsExpandablePanel` applies the same three-state pattern independently to each period's
expanded document list (`documentsByPeriod[periodId]` / `documentsError[periodId]`, testid
`period-documents-error-{id}`) — expanding one period's error state does not affect any other
period's rows.

**Double-submit guard:** every **Abrir/Cerrar Periodo** / **Abrir/Cerrar Documento** button is
disabled while its own action request is in flight, tracked in a `pendingActions` map keyed by
`period-{id}` / `document-{id}` (so one period's pending action never disables a sibling's
button). A failed action surfaces a `toast.error(...)` (message from the response error, falling
back to `ui('networkError')`) rather than leaving the UI in a silent stuck state; the button
re-enables in the `finally` block regardless of success or failure. `CloseYearConfirmModal` uses
the same `submitting` boolean pattern to disable its own confirm button during the request.

## Field reference

### year entity (`fiscal-calendar` spec — C_Year, header)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| fiscalYear | string | editable | yes | yes | The year value, e.g. "2027" |
| description | string | editable | yes | yes | Optional |
| calendar | foreignKey | editable | no | yes | Required selector |
| processNow | button | editable | no | yes | **Create Periods** — AD Process 100 |
| createRegFactAcct | button | discarded | — | — | Backing field for **Close Year**; triggered only via the `closeYear` menuAction/`CloseYearConfirmModal`, never rendered directly |
| dropRegFactAcct | button | discarded | — | — | Backing field for **Undo Close Year**; same trigger path as above |

### periodControl entity (`open-close-period-control` spec — C_Period, Periods subtab)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| status | enum | readOnly | yes | yes | Aggregate badge: N/O/C/P/M |
| calendar | foreignKey | readOnly | yes | yes | |
| year | foreignKey | readOnly | yes | yes | |
| name | string | readOnly | yes | yes | e.g. "Jan-2027" |
| periodNo | integer | readOnly | yes | yes | |
| startingDate | date | readOnly | yes | yes | |
| endingDate | date | readOnly | no | yes | |
| periodType | enum | readOnly | no | yes | Standard (S) or Adjustment (A) |
| openClose | button | editable | no | yes | AD Process 167 via `PeriodOpenCloseHandler` |

### documents entity (`open-close-period-control` spec — C_PeriodControl, per-document-type rows)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| documentCategory | enum | readOnly | yes | yes | AD document base type |
| periodStatus | enum | readOnly | yes | yes | Per-document-type badge: N/O/C/P |
| openClose | button | editable | no | yes | AD Process 168 via `PeriodControlDocOpenCloseHandler` |

### accounting entity (`end-year-close` spec — FinancialMgmtAccountingFactEndYearHQL, read-only)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| account | string | readOnly | yes | yes | GL account search key |
| debit | amount | readOnly | yes | yes | |
| credit | amount | readOnly | yes | yes | |
| type | enum | readOnly | yes | yes | Entry type (C/D/R/O/N); not currently rendered by `AccountingPanel.jsx` |
| description | string | readOnly | yes | yes | |

### Discarded fields (not exposed in UI)
- `fiscal-calendar` spec: `calendar` entity fully excluded (`exclude: true`); `year` entity discards `active`, `organization`, `client`, `id`, `creationDate`, `createdBy`, `updated`, `updatedBy`.
- `open-close-period-control` spec: `periodControl` discards `active`, `organization`, `client`, `id`, `creationDate`, `createdBy`, `updated`, `updatedBy`, `processNow`, `closingFactAcctGroupID`, `regularizationFactAcctGroupID`, `divideupFactAcctGroupID`, `openFactAcctGroupID`; `documents` discards `calendar`, `period`, `periodControl`, `periodAction`, `processNow`, `id`, `active`, `organization`, `client`, `creationDate`, `createdBy`, `updated`, `updatedBy`.
- `end-year-close` spec: `endYearClose` entity fully excluded (`exclude: true`); `accounting` discards `generalLedger`, `accountingFact`, `cYearCloseVID`, `active`, `organization`, `client`, `id`, `creationDate`, `createdBy`, `updated`, `updatedBy`.

## Gap assessment
- `ProcessParamDialog` only renders `type: "select"` parameters — `CREATEADJUSTMENT` is modeled as
  a two-option select (Yes/No), same constraint the original `fiscal-calendar` window had.
- The `calendar` field on `year` is a plain required selector rather than an auto-derived single
  default (same as the retired standalone `fiscal-calendar` window).
- No free-text search is configured on any entity (`searchableFields: []`, inherited default).
- `YearCloseHandler`'s reflection into `CreateRegFactAcct`/`DropRegFactAcct`'s private
  `processButton(...)` method is inherently brittle across Etendo core versions — accepted
  trade-off given `CallProcess` is confirmed dead for these two processes and no less-fragile
  officially-supported entry point exists (see the handler's javadoc).
- `AccountingPanel.jsx` doesn't render the `type` field (entry type C/D/R/O/N) even though it's
  available in the contract — a reasonable future enhancement, not a functional gap for the
  current "review the year's Fact_Acct rows" use case.
- `window.secondaryTabs`/`Panel` is a load-bearing extension point — see
  `docs/ui-customization.md` §17 (`warehouse` and `calendar` as the two real examples). The
  apiBaseUrl-rewriting technique this window adds on top of it (spanning three independent specs
  from one custom window) is a second, distinct pattern documented in the same section.
- **`end-year-close` has one accepted, non-blocking pipeline-validator violation (F3)**: it isn't
  registered in `registry.js`, because nothing ever navigates to it directly (`AccountingPanel.jsx`
  only calls its API, no route/menu entry exists). This is architecturally identical to the
  existing `transaction-type` spec's registry exemption, but the `BACKEND_ONLY_ARTIFACTS` set that
  grants that exemption is hardcoded inside the published `schema_forge_core` package and can't be
  extended from this repo — tracked alongside GH #35/ETP-4481 as a small follow-up, not blocking.
- **Why not one merged spec?** Tried first, reverted — see the Intent section and GH #35/ETP-4481.
  `schema_forge_core`'s push-to-neo assumes 1 spec = 1 AD window; a merged spec silently lost
  entities sourced from AD windows other than the spec's primary one, and any manual DB patch for
  them was actively re-deleted on the next push. The three-single-window-specs-plus-custom-frontend
  shape here is the actual fix, not a workaround pending a future core change.

## Manual verification
1. Open `/calendar` from the Finance menu under **Calendar** and confirm the years list loads.
2. Confirm the Finance menu shows only **Calendar** — not **Fiscal Calendar** or **Periods**.
3. Navigate directly to `/fiscal-calendar` and `/open-close-period-control` and confirm both
   redirect to `/calendar`.
4. Click **New**, fill in Fiscal Year and Calendar, save, confirm the year appears in the list.
5. Open the year, click **Create Periods**, confirm 12 periods appear.
6. Switch to the **Periods** tab, confirm the period list renders with aggregate status badges.
7. Expand a period row and confirm its per-document-type rows appear (fetched only on expand).
8. Click **Abrir/Cerrar Periodo** on a period and confirm the process dialog / status update.
9. Click **Abrir/Cerrar Documento** on a document-type row and confirm only that row's status changes.
10. Switch to the **Accounting** tab and confirm the year's Fact_Acct rows render (account, debit,
    credit, description).
11. Open the kebab menu with at least one period still Open and confirm **Cerrar Año** is present
    but its confirm button is disabled.
12. Close/Permanently-close every period, reopen the kebab menu, confirm **Cerrar Año**'s confirm
    button is now enabled, and confirm it posts to `/sws/neo/fiscal-calendar/year/{id}/action/closeYear`
    (note the `fiscal-calendar` spec base, not `/calendar/...`).
13. Force the `accounting` request to fail (e.g. block the network request in devtools) and
    confirm the Accounting tab shows the error message, not a blank panel or a false "no entries".
14. Force the `periodControl` request to fail and confirm the Periods tab shows its own error
    message; then restore the network and confirm expanding a period whose `documents` request
    fails shows that period's own error line without affecting other periods.
15. Double-click **Abrir/Cerrar Periodo** (or throttle the network to make the click visibly
    slow) and confirm the button disables immediately and re-enables only after the request
    settles — a second click during the pending window must not fire a second request.
16. Confirm all three backing specs push cleanly and independently: `sf-push-neo fiscal-calendar`
    and `sf-push-neo end-year-close` should each succeed with 0 errors; `open-close-period-control`
    needs no re-push (unchanged by this feature).

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `calendar` in the Finance group (`windowId: "117"`);
  `fiscal-calendar`/`open-close-period-control` remain with `"hidden": true` for routing.
- `tools/app-shell/src/windows/registry.js`: `calendar` → `./custom/calendar/index.jsx`
  (`customLoaders`); `fiscal-calendar`/`open-close-period-control` →
  `fiscal-calendar-redirect`/`open-close-period-control-redirect` (`windowLoaders`).
- `artifacts/fiscal-calendar/contract.json` — `year` entity, `menuActions` for
  `closeYear`/`undoCloseYear`, `javaQualifier: "year-close"`.
- `artifacts/open-close-period-control/contract.json` — `periodControl`/`documents`, unchanged.
- `artifacts/end-year-close/contract.json` — the new single-entity `accounting` spec.
- `tools/app-shell/src/windows/custom/calendar/index.jsx` — the aggregating custom window;
  `AccountingPanel.jsx`, `PeriodsExpandablePanel.jsx` (+ Vitest suites covering loading/error/empty
  states and the per-row double-submit guard, not just the happy path).
- `tools/app-shell/src/windows/custom/fiscal-calendar/CloseYearConfirmModal.jsx` (+
  `CloseYearModal.jsx`/`UndoCloseYearModal.jsx` wrappers and Vitest suite) — moved here from the
  retired merged spec, since `menuActions[].component` resolution has no cross-spec-name option.
- `e2e/tests/flows/calendar.mocked.spec.js` — mocked E2E coverage across all three spec URLs:
  Finance menu shows only Calendar, Accounting/Periods tabs render, period expand reveals
  documents, Abrir/Cerrar Periodo hits the mocked action endpoint, Cerrar Año stays disabled until
  all periods are closed.
- `com.etendoerp.go/src/com/etendoerp/go/schemaforge/YearCloseHandler.java` (`year-close`) and
  `.../handlers/YearAccountingHandler.java` (`year-accounting`), each with a Mockito-only JUnit
  suite (no `OBBaseTest`/real DB — see each class's test file javadoc for why). Neither class
  changed during the three-spec rework — only which spec's `ETGO_SF_ENTITY` row carries their
  `javaQualifier` changed.
- `npx sf-validate-pipeline --scope=fiscal-calendar` and `--scope=open-close-period-control` both
  report 0 violations; `--scope=end-year-close` reports 1 accepted, non-blocking F3 (see Gap
  assessment).
- `fiscal-calendar` pushed to NEO as spec `ED05C42028074866AE26EFB6685B68E2` (updated, pre-existing
  spec); `end-year-close` pushed as spec `13C0DD2E83EB40E3B4227662A9E71117` (new). Both with 0
  errors. `open-close-period-control` was not re-pushed (no changes). `./gradlew export.database`
  still needs to be run in the Etendo root so this survives a rebuild.
- i18n: `expandPeriod`, `openClosePeriod`, `openCloseDocument`, `debit`, `credit`,
  `accountingNoEntries`, `closeYearTitle`, `closeYearBody`, `undoCloseYearTitle`,
  `undoCloseYearBody`, `calendarAccountingTab`, `calendarPeriodsTab` added to both
  `tools/app-shell/src/locales/en_US.json` and `es_ES.json` (`genericLabels`); `account`,
  `description`, `cancel` were already present and reused as-is.
