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
  **ETP-4948 Issue 1 — FIXED (real root cause, distinct from the staleness fix below):**
   `C_Calendar_ID` is `C_Year`'s AD parent-link column (`AD_Column.ISPARENT = 'Y'`). The generic
   parent-default mechanism correctly handles nested child-tab creates, but this custom route
   exposes `C_Year` directly, so its create request has no `parentId` and cannot use that mechanism.
   `YearCloseHandler` therefore validates the create request and overwrites the hidden calendar
   field with the current organization's calendar before generic CRUD persists it. This
   prevents the org-blind first-combo fallback from choosing the global (`*`) calendar when a
   client owns more than one. The handler also rejects missing or malformed fiscal years: only
   four-digit values from 1900 through 2999 are accepted — on both **create** and **update** (see
   the DEV fix note directly below; the update-side gap this closes was ETP-4948 Issue 5). The `decisions.json`
   `derivation: "fromParent"` declaration remains semantic documentation only; it does not reach
   the backend shape for a `system`-visibility field. The broader selector fallback issue remains
   tracked separately as Jira ETP-5086.
   **REVIEW correction (cycle 1):** the initial fix read `Organization.getCalendar()` directly,
   which only returns the org's own *directly-assigned* `C_Calendar_ID` — it does not walk the
   org tree, so an org that inherits its calendar from a parent (the standard `AD_Org.
   AD_InheritedCalendar_ID` setup) resolved to `null` and either errored or fell through to the
   org-blind fallback anyway. Now uses `org.openbravo.erpCommon.utility.AccDefUtility.
   getCalendar(Organization)` — the pattern already used elsewhere in classic Etendo for "the
   calendar this org should use, walking up to the nearest ancestor that owns one" — which also
   deliberately treats org `*` (id `"0"`) as "no usable calendar" rather than returning the
   global one.
   **ETP-4948 Issue 5 — FIXED:** the fiscal-year format/range check above originally only ran on
   `isFiscalCalendarCreate` (`recordId == null`), so editing an existing year and setting Fiscal
   Year to a garbage value (e.g. `"asd"`) or an out-of-range one (e.g. `"1800"`) fell through to
   default CRUD with no rejection — the exact symptom originally reported (creating a year named
   `"asd"`), still reproducible via edit even after the create-side fix landed. `YearCloseHandler`
   now also runs `isFiscalCalendarYearUpdate` (any write method, `recordId != null`, same
   spec/entity match) and validates `fiscalYear` with the identical four-digit/1900-2999 check —
   but only when the update body actually includes `fiscalYear`; a partial update touching only
   e.g. `Description` is never rejected for a field it didn't send. The calendar FK injection
   remains create-only by design (the calendar is set once, from the organization, never
   re-derived on update).
   **Known residual risk, NOT fixed by this cycle:** a manual live retest after the original
   fix still reproduced the wrong-calendar symptom. Investigation traced the NEO JWT's
   `organization` claim (read by `NeoAuthenticator.authenticateJwt`, the sole input to every
   handler's `OBContext.getCurrentOrganization()`, including this one) back to
   `EtendoGoJwtServlet`'s environment-login endpoint, which mints the token for
   `roleListData.firstRoleId` — the **oldest-created** `AD_Role` for the user (`ORDER BY
   r.created, o.name`), not any notion of "the role/org the user is currently working in" — and
   then resolves that role's org from an **unordered** `AD_Role_OrgAccess` list when no explicit
   org is passed (`SecureWebServicesUtils.getOrganization`, no `@OrderBy`). For a user with more
   than one role (e.g. one scoped to `*`/GOClient and one scoped to GOOrg), this can mint a
   session whose `getCurrentOrganization()` never was GOOrg in the first place — no per-request
   fix in `YearCloseHandler` can compensate for a session that already has the wrong org baked
   into its JWT. This is a session/login-layer issue affecting every NEO handler that trusts
   `getCurrentOrganization()` (the overwhelming majority of them), not something scoped to
   Calendar — recommend filing it as its own platform ticket (parented to epic ETP-3504,
   alongside ETP-5086) rather than folding a login-layer fix into this branch. Until fixed,
   retesting this window with a single-role test user (or a user whose oldest role is the
   GOOrg-scoped one) is the reliable way to verify the `AccDefUtility` fix above in isolation.
- Trigger **Create Periods** on a year to generate 12 standard periods plus an optional adjustment
  period. The required **Fiscal Year Range** choice defaults to **January - December**; selecting
  **July - June** for Fiscal Year 2027 creates July 2027 through June 2028, with chronological
  period numbers 1-12. January-December remains the untouched core process-100 flow; July-June is
  handled by the `year-close` NEO handler because core process metadata has no range parameter. A
  year must not already contain periods for a different range. Invalid range values are rejected
  server-side rather than silently falling back to January.
- On a year's detail, switch between two secondary tabs:
   - **Periods** (the first detail tab) — an expandable list of the year's periods (aggregate status badge), where
    expanding a period row reveals its per-document-type breakdown inline, each with its own
    **Abrir/Cerrar Periodo** / **Abrir/Cerrar Documento** action.
   - **Accounting** (the second detail tab) — a read-only, year-scoped Fact_Acct grid (account, debit, credit,
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
  classic AD Process `100` (`C_YearPeriods`). `decisions.json → window.processOverrides.processNow`
  opens a `ProcessParamDialog` with `FISCALYEARSTART` (January - December or July - June) and
  `CREATEADJUSTMENT` (Yes/No select) parameters. The entity's existing `YearCloseHandler` qualifier
  delegates only `processNow` to the dedicated `FiscalYearPeriodsHandler`, which consumes the range selector:
  it removes the UI-only key and lets the standard January-December request run through `CallProcess`,
  while it creates the July-June periods directly through DAL. The core `C_PERIOD_TRG` still creates
  the normal period-control records for those DAL inserts. This
  process runs in the **`YearPage`** subtree (`fiscal-calendar` spec), while the Periods tab
  (`PeriodsExpandablePanel.jsx`) lives on a completely different spec (`open-close-period-control`)
  stitched in via `secondaryTabs` — so the two do not share React state. `PeriodsExpandablePanel`
  listens for the generic `neo:processSuccess` window `CustomEvent` (dispatched by
  `useEntity.js`'s `handleProcess` on any successful process, matching the same convention
  `AmortizationLinesTable.jsx`/`AssetsAmortizationPanel.jsx` already use to refresh a sibling
  panel), filtered on `detail.recordId === parentId` (the year id) only — not `entity` — and
  calls `loadPeriods()` on a match (ETP-4948 Issue 1). Without this, "Create Periods" reported
  success but the Periods tab kept showing its pre-create (usually empty) list until a manual
  navigation away and back.
- **Abrir/Cerrar Periodo** (`periodControl.openClose`, on `open-close-period-control`) calls AD
   Process `167` (`C_Period_Process`) via `PeriodOpenCloseHandler`
   (`JAVA_QUALIFIER = 'period-openclose'`) — the exact same handler and URL base
   (`/sws/neo/open-close-period-control/...`) this window has always used; nothing about this action
   changed for ETP-4478. This process opens/closes **every** `C_PeriodControl` row for the period
   in one transaction, so `PeriodsExpandablePanel.jsx`'s `handleDialogConfirm` refreshes both
   `loadPeriods()` (the aggregate badge) and, when the acted-on period is the currently expanded
   one, `loadDocumentsForPeriod(id)` too (ETP-4948 Issue 2). When the period is collapsed, it
   invalidates any earlier document-list cache instead, so a later expansion always fetches the
   updated child statuses rather than displaying rows cached before the period-level action.
- **Abrir/Cerrar Documento** (`documents.openClose`, on `open-close-period-control`) calls AD
  Process `168` (`C_PeriodControl_Process`) via `PeriodControlDocOpenCloseHandler`
  (`JAVA_QUALIFIER = 'period-control-doc-openclose'`), same carry-over as above.
- **`documents` list filtering (ETP-4948 Issue 3).** The `documents` entity is a plain generic
  CRUD list — every `C_PeriodControl` row for a period used to be returned unfiltered, one per
  registered `documentCategory` (DocBaseType), including base types that never post to accounting
  at all (`SOO` Sales Order, `POO` Purchase Order, `POR` Purchase Requisition, …). Since GET/CRUD
  requests aren't `openClose` ACTION requests, `AbstractPeriodOpenCloseHandler.handle()` safely
  no-ops for them (`PeriodOpenCloseSupport.parse()` returns `SKIP`), so
  `NeoServletSupport.handleWithHooks` runs the default CRUD list first and then calls
  `PeriodControlDocOpenCloseHandler.afterHandle` — which now filters the response down to
  accounting-relevant categories only, using the exact same predicate the Not Posted Documents
  window already applies (`com.etendoerp.go.schemaforge.util.AccountingDocumentTypeSupport`,
  extracted out of `NotPostedDocumentsHandler` so the two windows can never diverge — see
  [`not-posted-documents.md`](not-posted-documents.md#document-type-accounting-support) for the
  full document-type table). Confirmed in scope by the product owner: the same 5 codes globally
  excluded there by product decision (ETP-4452 — `BMP`, `DD`, `LC`, `LCC`, `CA`, in Not Posted
  Documents' own code space) are also hidden here, in Calendar's own DocBaseType code space
  (`MMP`, `DDB`, `LDC`, `LCC`, `CAD` — same underlying tables, different codes; only `LCC` shares
  the literal code across both vocabularies).
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
The Periods tab uses the shared table and button primitives used by generated windows: a standard
header row, table-cell spacing, hover tint, selected-row contrast, and compact outline/ghost
actions. Its expandable document breakdown remains custom because it supports nested document
actions and bulk selection, but it is rendered as a full-width child table row rather than a
separate flex-list visual language.

Persisted `C_Period.Name` values remain the canonical core abbreviations (for example, `Jan-27`).
The Calendar UI renders a full localized month and two-digit year from `startingDate` instead:
`January 27` in English and `Enero 27` in Spanish. Reading the date through the shared date-only
utility also makes a July-June period ending in June 2028 display `June 28` / `Junio 28`, regardless
of the stored name or the browser timezone.

**ETP-4948 QA finding — FIXED.** A July-June year's 13th "adjustment" period (`periodType: "A"`,
`startingDate` = June 30 of the fiscal-year end) shares its displayed month/year with the regular
12th period (`periodType: "S"`, `startingDate` = June 1) — `formatPeriodName()` only ever reads
month+year, never the day, so both used to render the identical text (e.g. `June 28`) with nothing
in the row to tell them apart. `FiscalYearPeriodsHandler.createPeriod` already names the adjustment
period distinctly server-side (`"13th Period - YY"`, vs. the regular period's `"MMM-yy"`), and
`periodControl.periodType` is already exposed (`readOnly`, form-only) — the gap was purely a
frontend rendering one. `PeriodsExpandablePanel.jsx` now renders an `ui('calendarAdjustmentPeriod')`
("Adjustment Period" / "Período de ajuste") badge (`data-testid="period-adjustment-badge-{id}"`)
next to the period name whenever `period.periodType === 'A'`; the regular period's row is
unaffected. No data-shape change — `periodType` was already present on every row.

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

The expanded period row is highlighted with `bg-primary/5 ring-1 ring-focus-ring` — the same
selected-row token family `DataTable.jsx` already uses for `isSelectedLine` — instead of bare
`bg-card`, which had no visible contrast against the surrounding page background (confirmed via
live screenshot comparison, ETP-4948 Issue 4). The year list itself
(`YearTableWithCloseStatus.jsx` → generic `DataTable`) was unaffected — it already reused this
same token family with no wiring bug found there.

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
| fiscalYear | string | editable | yes | yes | Required four-digit value from 1900 through 2999, e.g. "2027"; enforced server-side on both create and update (ETP-4948 Issue 5) |
| description | string | editable | yes | yes | Optional |
| calendar | foreignKey | system | no | no | Hidden parent-link field (`C_Calendar_ID`, `AD_Column.ISPARENT='Y'`); no UI selector. On direct Fiscal Calendar creates, `YearCloseHandler` sets it from the current organization calendar and ignores any caller value — see Issue 1 note above (ETP-4948, fixed) |
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
| documentCategory | enum | readOnly | yes | yes | AD document base type (DocBaseType). List rows are filtered server-side to accounting-relevant categories only — see Reactive behavior, ETP-4948 Issue 3 |
| periodStatus | enum | readOnly | yes | yes | Per-document-type badge: N/O/C/P |
| openClose | button | editable | no | yes | AD Process 168 via `PeriodControlDocOpenCloseHandler` |

**List-level filtering:** `PeriodControlDocOpenCloseHandler.afterHandle` drops any row whose
`documentCategory` is not accounting-relevant (not actively registered in `c_acctschema_table`, or
structurally/product-decision excluded — see `AccountingDocumentTypeSupport`, shared with
[Not Posted Documents](not-posted-documents.md#document-type-accounting-support)). This only
applies to the GET/list path; the `openClose` ACTION on an individual row is untouched.

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
- `ProcessParamDialog` only renders `type: "select"` parameters — `FISCALYEARSTART` and
  `CREATEADJUSTMENT` are modeled as selects. The former defaults to January - December; the latter
  remains the optional Yes/No adjustment-period choice.
- ~~The `calendar` field on `year` is auto-derived server-side (`NeoDefaultsService.tryInjectFirstFromLookup`,
   "the org's first active calendar") rather than resolved via its actual AD parent-link
   (`ISPARENT='Y'`) relationship — on a tenant with more than one active calendar this picks the
   alphabetically-first readable row instead of the year's real parent calendar (ETP-4948 Issue 1).~~
   **Fixed** — since the custom Fiscal Calendar route creates the child-tab `C_Year` directly and
   has no parent record id, `YearCloseHandler` injects the current organization's calendar (via
   `AccDefUtility.getCalendar`, which walks the org tree to the nearest ancestor that owns a
   calendar — see the Issue 1 note above for the cycle-1 REVIEW correction) before generic CRUD
   runs and never trusts a caller-supplied value. It also rejects non-four-digit fiscal years
   outside 1900-2999, on both create and update (ETP-4948 Issue 5 — editing an existing year to an
   invalid Fiscal Year previously fell through to default CRUD unrejected; fixed by adding an
   update-side validation path alongside the existing create-side one, without repeating the
   create-only calendar FK injection). The broader, still-open class of bug — the org-blind selector fallback
  (`SelectorOrgFilter`/`resolveFirstComboOption` picking the alphabetically-first org for *any*
  combo field, not just parent-links) — is tracked separately as Jira ETP-5086. A second, distinct
  residual risk (the JWT organization-claim/role-selection issue) is documented in the Issue 1
  note above and is NOT fixed by this cycle.
- No free-text search is configured on any entity (`searchableFields: []`, inherited default).
- `YearCloseHandler`'s reflection into `CreateRegFactAcct`/`DropRegFactAcct`'s private
  `processButton(...)` method is inherently brittle across Etendo core versions — accepted
  trade-off given `CallProcess` is confirmed dead for these two processes and no less-fragile
  officially-supported entry point exists (see the handler's javadoc). **REVIEW W2 (cycle 1):**
  the only prior coverage of `invokeCreateRegFactAcct`/`invokeDropRegFactAcct` overrode both
  methods with canned results, so `newServletInstance`, `findMyPoolField` and the real
  `Method.invoke(...)` mechanics had zero test signal. `YearCloseHandlerTest` now also resolves
  (without invoking) both servlets' `processButton` signatures via `getDeclaredMethod`, walks for
  the `myPool` field, and exercises the real (private) `newServletInstance` end to end — so a
  future Etendo core version that renames/reshapes either signature or the `myPool` field breaks
  the build here instead of failing silently at runtime.
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
5. Open an empty year, click **Create Periods**, retain the default **January - December**, and
   confirm 12 periods appear from January through December.
6. Open another empty Fiscal Year 2027, select **July - June**, and confirm 12 periods appear from
   July 2027 through June 2028, with period numbers 1 through 12 and month/year labels matching
   their actual dates.
7. Run Create Periods again for an already-populated year and confirm the existing periods are
   retained rather than moved or duplicated. Do not change range on a populated year.
8. Switch to the **Periods** tab, confirm the period list renders chronologically by starting date
   with aggregate status badges.
9. Expand a period row and confirm its per-document-type rows appear (fetched only on expand).
10. Click **Abrir/Cerrar Periodo** on a period and confirm the process dialog / status update.
11. Click **Abrir/Cerrar Documento** on a document-type row and confirm only that row's status changes.
12. Switch to the **Accounting** tab and confirm the year's Fact_Acct rows render (account, debit,
   credit, description).
13. Open the kebab menu with at least one period still Open and confirm **Cerrar Año** is present
   but its confirm button is disabled.
14. Close/Permanently-close every period, reopen the kebab menu, confirm **Cerrar Año**'s confirm
   button is now enabled, and confirm it posts to `/sws/neo/fiscal-calendar/year/{id}/action/closeYear`
   (note the `fiscal-calendar` spec base, not `/calendar/...`).
15. Force the `accounting` request to fail (e.g. block the network request in devtools) and
   confirm the Accounting tab shows the error message, not a blank panel or a false "no entries".
16. Force the `periodControl` request to fail and confirm the Periods tab shows its own error
   message; then restore the network and confirm expanding a period whose `documents` request
   fails shows that period's own error line without affecting other periods.
17. Double-click **Abrir/Cerrar Periodo** (or throttle the network to make the click visibly
   slow) and confirm the button disables immediately and re-enables only after the request
   settles — a second click during the pending window must not fire a second request.
18. Confirm all three backing specs push cleanly and independently: `sf-push-neo fiscal-calendar`
    and `sf-push-neo end-year-close` should each succeed with 0 errors; `open-close-period-control`
    needs no re-push (unchanged by this feature).
19. Open an existing year and edit its Fiscal Year to a non-numeric value (e.g. `asd`) or an
    out-of-range one (e.g. `1800`); confirm the save is rejected with a 400 error, not silently
    accepted (ETP-4948 Issue 5).
20. Open a July-June year with an adjustment period (Create Periods with **Fiscal Year Range =
    July - June** and **Create adjustment period? = Yes**), switch to the **Periods** tab, and
    confirm the 13th period's row shows an **Adjustment Period** badge next to its name while the
    regular June period's row does not (ETP-4948 QA finding — adjustment period badge).

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `calendar` in the Finance group (`windowId: "117"`);
  `fiscal-calendar`/`open-close-period-control` remain with `"hidden": true` for routing.
- `tools/app-shell/src/windows/registry.js`: `calendar` → `./custom/calendar/index.jsx`
  (`customLoaders`); `fiscal-calendar`/`open-close-period-control` →
  `fiscal-calendar-redirect`/`open-close-period-control-redirect` (`windowLoaders`).
- `artifacts/fiscal-calendar/contract.json` — `year` entity, `menuActions` for
  `closeYear`/`undoCloseYear`, `javaQualifier: "year-close"`.
- `artifacts/fiscal-calendar/decisions.json` — `entities.year.fields.calendar` declares
  `"derivation": "fromParent"` (ETP-4948 Issue 1, documentation only — see the Issue 1 note
  above for why this key has no runtime effect on `system`-visibility fields). `make regen
  ONLY=fiscal-calendar` re-ran clean (extract → resolve → contract → frontend, 5 components
  generated); a before/after diff of `contract.json` confirmed the change is a no-op there —
  expected, not a regression.
- `com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoMandatoryDefaultsService.java` — the
  actual Issue 1 fix. `tryInjectFromParentValues` now checks `Column.isLinkToParentColumn()`
  (`AD_Column.ISPARENT`) and injects the parent tab's own record id directly from
  `NeoParentValuesLoader`'s `parentValues` map, ahead of the `@VarName@`-only match and the
  org-blind `tryInjectFirstFromLookup` fallback. No `decisions.json`/`contract.json`/`push-to-neo`
  step involved — this is a pure Java default-injection fix, applies to every `ISPARENT='Y'`
  column across every window, not just `year.calendar`. Covered by three new unit tests in
  `NeoDefaultsServiceTest` (the ISPARENT-with-no-default-expression fix case, the pre-existing
  `@VarName@` fallback still working, and a non-parent column still returning false).
- `com.etendoerp.go/src/com/etendoerp/go/schemaforge/PeriodControlDocOpenCloseHandler.java` —
  review finding W2: `afterHandle` now also guards on `NeoEndpointType.CRUD.equals(context.getEndpointType())`
  alongside the existing `GET` check, matching the `FinancialAccountHandler` convention
  (`docs/neo-headless-extensibility.md`) exactly. Currently a no-op in practice (no selector/
  defaults GET path exists on the `documents` entity), kept for convention parity. Covered by a
  new `afterHandleReturnsNullForGetWithNonCrudEndpointType` test in
  `PeriodControlDocOpenCloseHandlerTest`.
- `artifacts/open-close-period-control/contract.json` — `periodControl`/`documents` structurally
  unchanged; **REVIEW W1 (cycle 1):** `periodControl.status`'s `enumVariants.C` was `"neutral"`,
  drifted from `PeriodsExpandablePanel.jsx`'s hand-maintained `PERIOD_STATUS_VARIANTS` (already
  `"red"`) and from this same spec's `documents.periodStatus.C` (already `"red"`) — reconciled to
  `"red"` in `decisions.json` (Closed is visually flagged the same way as Permanently Closed,
  consistent across both period- and document-level status badges) and regenerated via `make
  regen ONLY=open-close-period-control SKIP_EXTRACT=1` (contract `0.6.0` → `0.7.0`, additive;
  `PeriodControlTable.jsx`'s generated `enumVariants` updated to match — that generated page is
  otherwise dead code post-ETP-4478, since `/open-close-period-control` now redirects to
  `/calendar`, but must still regenerate consistently with `decisions.json`).
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
