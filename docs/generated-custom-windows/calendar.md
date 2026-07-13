# Calendar

## Intent
Unifies **Fiscal Calendar** and **Periods** (`open-close-period-control`) — previously two
separate windows connected only by a "Go to Fiscal Calendar" cross-navigation modal (ETP-4452
item 8) — into one window (ETP-4478). A single fiscal-year record now exposes period creation,
period/document open-close status, Year-Close/Undo-Close-Year, and a read-only Accounting subtab,
without leaving the record. `fiscal-calendar` and `open-close-period-control` are retired as
routes (hidden, redirect to `/calendar`) but their underlying AD windows/tabs/processes are
unchanged — this is a Schema Forge-side consolidation, not an AD data migration.

## What this window should allow
- Browse the list of fiscal years (`fiscalYear`, `description`) for the org's calendar.
- Create a new fiscal year, selecting the calendar it belongs to.
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
  `tools/app-shell/src/windows/custom/calendar/index.jsx` wraps the generated `YearPage`
  (primary/header entity is `year`, not a `calendar` entity — the generator names the page after
  `primaryEntity`) and adds `secondaryTabs` for Periods/Accounting (see
  `docs/ui-customization.md` §17 for the `Panel` prop contract).
- Window shape: `year` (header, table `C_Year`) as the only native detail/list entity;
  `periodControl` (table `C_Period`), `documents` (table `C_Period` via a different tab shape),
  and `accounting` (table `FinancialMgmtAccountingFactEndYearHQL`, an HQL-backed AD_Table) are all
  declared as CRUD-routable entities in `decisions.json` purely so their `ETGO_SF_ENTITY` rows
  exist (required for NEO routing — see Reactive behavior), but none of them render via the
  generic entity CRUD UI: `periodControl`/`documents` are fetched and rendered by the custom
  `PeriodsExpandablePanel`, and `accounting` by the custom `AccountingPanel`.
- `calendar` (table `C_Calendar`) is excluded from the contract entirely
  (`entities.calendar.exclude: true`).

## Reactive behavior and dependencies
- **Create Periods** (`year.processNow`, column `Processing`) is bound to classic AD Process `100`
  (`C_YearPeriods`), a plain DB-procedure process — invoked generically via `CallProcess`, no
  custom `NeoHandler` needed. `decisions.json → window.processOverrides.processNow` opens a
  `ProcessParamDialog` with one parameter, `CREATEADJUSTMENT` (Yes/No select).
- **Abrir/Cerrar Periodo** (`periodControl.openClose`) calls AD Process `167` (`C_Period_Process`)
  via `PeriodOpenCloseHandler` (`JAVA_QUALIFIER = 'period-openclose'`, unchanged from the retired
  `open-close-period-control` window — same Java class, same `processId`, only the URL base moved
  from `/sws/neo/open-close-period-control/...` to `/sws/neo/calendar/...`).
- **Abrir/Cerrar Documento** (`documents.openClose`) calls AD Process `168`
  (`C_PeriodControl_Process`) via `PeriodControlDocOpenCloseHandler`
  (`JAVA_QUALIFIER = 'period-control-doc-openclose'`), same carry-over as above.
- **Cerrar Año** / **Deshacer Cierre de Año** are `window.menuActions` entries
  (`closeYear`/`undoCloseYear`), rendered from the kebab menu, each opening
  `CloseYearConfirmModal.jsx` via a thin per-action wrapper (`CloseYearModal.jsx`/
  `UndoCloseYearModal.jsx` — required because the generator emits one `import` per
  `menuActions[].component` with no dedup; pointing two actions at the same component name would
  produce a duplicate-import syntax error). The modal fetches `periodControl` for the year and
  disables its confirm button until every period is `C` (Closed) or `P` (Permanently Closed).
  - **Server-side, the real button fields are `year.createRegFactAcct`/`year.dropRegFactAcct`**
    (raw AD column names `Create_Reg_Fact_Acct`/`Drop_Reg_Fact_Acct`, labels "Close Year"/"Undo
    Close Year", `processId` 800036/800038) — not literal fields named `closeYear`/`undoCloseYear`
    (those are only the `menuActions[].key`/action-URL-segment names; NEO routes any
    `/action/<name>` on an entity to its `javaQualifier` handler regardless of whether a field
    with that exact name exists). `YearCloseHandler` (`JAVA_QUALIFIER = 'year-close'`) dispatches
    on the `closeYear`/`undoCloseYear` action names, re-validates every period is Closed/
    Permanently Closed server-side (defense in depth — the client-side check must not be trusted
    alone), then invokes the legacy `CreateRegFactAcct`/`DropRegFactAcct` `ad_actionButton`
    servlets' `processButton(...)` method directly via reflection — **`CallProcess` does not work
    for these two processes** (confirmed: `AD_Process.procedurename = NULL` for both; `CallProcess`
    has no code path for `classname`-based processes at all). See the class javadoc in
    `YearCloseHandler.java` for the full reflection/`VariablesSecureApp`/`DalConnectionProvider`
    rationale.
- **Accounting** (`accounting` entity, `JAVA_QUALIFIER = 'year-accounting'`) is served by
  `YearAccountingHandler`, which queries `FinancialMgmtAccountingFact` directly, scoped by
  `fa.period.year.id = :yearId` — **not** by re-invoking the stored
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

### year entity (C_Year — header)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| fiscalYear | string | editable | yes | yes | The year value, e.g. "2027" |
| description | string | editable | yes | yes | Optional |
| calendar | foreignKey | editable | no | yes | Required selector |
| processNow | button | editable | no | yes | **Create Periods** — AD Process 100 |
| createRegFactAcct | button | editable | no | yes | **Close Year** — AD Process 800036, triggered only via the `closeYear` menuAction/`CloseYearConfirmModal`, guarded server-side by `YearCloseHandler` |
| dropRegFactAcct | button | editable | no | yes | **Undo Close Year** — AD Process 800038, same guard/trigger path as above |

### periodControl entity (C_Period — Periods subtab)

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

### documents entity (C_Period, per-document-type rows)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| documentCategory | enum | readOnly | yes | yes | AD document base type |
| periodStatus | enum | readOnly | yes | yes | Per-document-type badge: N/O/C/P |
| openClose | button | editable | no | yes | AD Process 168 via `PeriodControlDocOpenCloseHandler` |

### accounting entity (FinancialMgmtAccountingFactEndYearHQL, read-only)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| account | string | readOnly | yes | yes | GL account search key |
| debit | amount | readOnly | yes | yes | |
| credit | amount | readOnly | yes | yes | |
| type | enum | readOnly | yes | yes | Entry type (C/D/R/O/N); not currently rendered by `AccountingPanel.jsx` |
| description | string | readOnly | yes | yes | |

### Discarded fields (not exposed in UI)
- `calendar` entity: fully excluded (`exclude: true`).
- `year` entity: `active`, `organization`, `client`, `id`, `creationDate`, `createdBy`, `updated`, `updatedBy`.
- `periodControl` entity: `active`, `organization`, `client`, `id`, `creationDate`, `createdBy`, `updated`, `updatedBy`, `processNow`, `closingFactAcctGroupID`, `regularizationFactAcctGroupID`, `divideupFactAcctGroupID`, `openFactAcctGroupID`.
- `documents` entity: `calendar`, `period`, `periodControl`, `periodAction`, `processNow`, `id`, `active`, `organization`, `client`, `creationDate`, `createdBy`, `updated`, `updatedBy`.
- `accounting` entity: `generalLedger`, `accountingFact`, `cYearCloseVID`, `active`, `organization`, `client`, `id`, `creationDate`, `createdBy`, `updated`, `updatedBy`.

## Gap assessment
- `ProcessParamDialog` only renders `type: "select"` parameters — `CREATEADJUSTMENT` is modeled as
  a two-option select (Yes/No), same constraint the original `fiscal-calendar` window had.
- The `calendar` field on `year` is a plain required selector rather than an auto-derived single
  default (same as the retired `fiscal-calendar` window).
- No free-text search is configured on any entity (`searchableFields: []`, inherited default).
- `YearCloseHandler`'s reflection into `CreateRegFactAcct`/`DropRegFactAcct`'s private
  `processButton(...)` method is inherently brittle across Etendo core versions — accepted
  trade-off given `CallProcess` is confirmed dead for these two processes and no less-fragile
  officially-supported entry point exists (see the handler's javadoc).
- `AccountingPanel.jsx` doesn't render the `type` field (entry type C/D/R/O/N) even though it's
  available in the contract — a reasonable future enhancement, not a functional gap for the
  current "review the year's Fact_Acct rows" use case.
- `window.secondaryTabs`/`Panel` is a load-bearing, previously undocumented extension point —
  see `docs/ui-customization.md` §17 (added as part of this change, `warehouse` and `calendar` as
  the two real examples).

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
    button is now enabled, and confirm it posts to `/calendar/year/{id}/action/closeYear`.
13. Force the `accounting` request to fail (e.g. block the network request in devtools) and
    confirm the Accounting tab shows the error message, not a blank panel or a false "no entries".
14. Force the `periodControl` request to fail and confirm the Periods tab shows its own error
    message; then restore the network and confirm expanding a period whose `documents` request
    fails shows that period's own error line without affecting other periods.
15. Double-click **Abrir/Cerrar Periodo** (or throttle the network to make the click visibly
    slow) and confirm the button disables immediately and re-enables only after the request
    settles — a second click during the pending window must not fire a second request.

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `calendar` in the Finance group (`windowId: "117"`);
  `fiscal-calendar`/`open-close-period-control` remain with `"hidden": true` for routing.
- `tools/app-shell/src/windows/registry.js`: `calendar` → `./custom/calendar/index.jsx`
  (`customLoaders`); `fiscal-calendar`/`open-close-period-control` →
  `fiscal-calendar-redirect`/`open-close-period-control-redirect` (`windowLoaders`).
- `artifacts/calendar/contract.json` defines four entities (`year`, `periodControl`, `documents`,
  `accounting`) with CRUD endpoints, action endpoints for `processNow`/`openClose`/`closeYear`/
  `undoCloseYear`, and a test manifest.
- `artifacts/calendar/generated/web/calendar/YearPage.jsx` — generated header page, wrapped by
  the hand-written `index.jsx` which adds `secondaryTabs` for Periods/Accounting.
- `tools/app-shell/src/windows/custom/calendar/PeriodsExpandablePanel.jsx`,
  `AccountingPanel.jsx`, `CloseYearConfirmModal.jsx` (+ `CloseYearModal.jsx`/
  `UndoCloseYearModal.jsx` wrappers) — hand-written custom components, each with a Vitest suite
  (`__tests__/AccountingPanel.vitest.jsx`, `__tests__/PeriodsExpandablePanel.vitest.jsx`,
  `__tests__/CloseYearConfirmModal.vitest.jsx`, `__tests__/index.vitest.jsx`) covering the
  loading/error/empty states and the per-row double-submit guard, not just the happy path.
- `e2e/tests/flows/calendar.mocked.spec.js` — mocked E2E coverage: Finance menu shows only
  Calendar, Accounting/Periods tabs render, period expand reveals documents, Abrir/Cerrar Periodo
  hits the mocked action endpoint, Cerrar Año stays disabled until all periods are closed.
- `com.etendoerp.go/src/com/etendoerp/go/schemaforge/YearCloseHandler.java` (`year-close`) and
  `.../handlers/YearAccountingHandler.java` (`year-accounting`), each with a Mockito-only JUnit
  suite (no `OBBaseTest`/real DB — see each class's test file javadoc for why).
- `npx sf-validate-pipeline --scope=calendar` reports 0 violations.
- i18n: `expandPeriod`, `openClosePeriod`, `openCloseDocument`, `debit`, `credit`,
  `accountingNoEntries`, `closeYearTitle`, `closeYearBody`, `undoCloseYearTitle`,
  `undoCloseYearBody`, `calendarAccountingTab`, `calendarPeriodsTab` added to both
  `tools/app-shell/src/locales/en_US.json` and `es_ES.json` (`genericLabels`); `account`,
  `description`, `cancel` were already present and reused as-is.
