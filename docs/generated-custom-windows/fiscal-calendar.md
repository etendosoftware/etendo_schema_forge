# Fiscal Calendar

## Intent
Closes a genuine feature gap (ETP-4452 item 8): users could not create new fiscal periods because no period/year-generation capability existed anywhere in Etendo GO — the existing **Periods** window (`open-close-period-control`) has `hideCreate: true` by design; it manages open/close status, it does not generate periods. Classic Etendo AD already has this via the **Calendar** window (AD window `117`, display name `Fiscal Calendar`), whose Year tab exposes a "Create Periods" button. This spec onboards that window into Schema Forge so a client-side user can add a new fiscal year and generate its periods without AD Backoffice access.

## What this window should allow
- Browse the list of fiscal years (`fiscalYear`, `description`) for the org's calendar.
- Create a new fiscal year, selecting the calendar it belongs to (`calendar` is a normal required selector — most orgs have exactly one active calendar, but the field is left as a plain editable selector rather than auto-derived, since no single-default derivation could be established with confidence at classification time).
- Trigger **Create Periods** on a year to generate its 12 standard periods (Jan–Dec) plus an optional adjustment period, with a Yes/No choice for "Create Adjustment Period".
- Drill into a year to see its **Periods** child tab: a read-only list of the periods generated for that year (period number, name, start/end dates, status badge).
- The top-level `calendar` entity (`C_Calendar`) itself is intentionally **not** exposed as a browsable tab — most tenants have exactly one calendar per organization and it is provisioned by onboarding, not managed here. Years are already org/client-scoped by the standard NEO security filters, so hiding the calendar tab does not leak cross-org data.

## Interaction model
- Route: `/fiscal-calendar` for the year list and `/fiscal-calendar/:recordId` for the year detail.
- Visibility: visible from the Finance menu as **Fiscal Calendar**, right after **Periods**.
- Implementation type: generated window route loaded from the app-shell window registry.
- Window shape: master-detail — `year` (header, table `C_Year`) with a `period` child tab (table `C_Period`), exposed via `window.detailEntity: "period"`. `calendar` (table `C_Calendar`, level `header` in the raw AD tab hierarchy) is excluded from the contract entirely (`entities.calendar.exclude: true`), so `year` becomes the primary/header entity (`curatedEntities[0]`).
- The `period` tab has no add-row UI (`decisions.json` declares no `addLineFields` for it) — periods are never created directly, only via the year's **Create Periods** process.

## Reactive behavior and dependencies
- **Create Periods** (`year.processNow`, column `Processing`) is bound to classic AD Process `100` (`C_YearPeriods`), a plain DB-procedure process (`procedurename = C_YearPeriods`, no Java class) — invoked generically by `NeoProcessService.executeDbProcedure` via `CallProcess`, no custom `NeoHandler` needed. `decisions.json → window.processOverrides.processNow` opens a `ProcessParamDialog` with one parameter:
  - `CREATEADJUSTMENT` (key matches the AD_Process_Para DB column name exactly) — modeled as a `select` (Yes/No) because `ProcessParamDialog` only renders `type: "select"` params today; a native boolean/checkbox param type does not exist yet in the shared dialog component (tracked as a gap below, not fixed here — out of scope for a window-onboarding change).
  - `AD_LANGUAGE_ID` (not mandatory) is intentionally omitted from `params` — the backend resolves it from context.
- `year.createRegFactAcct` / `year.dropRegFactAcct` ("Close Year" / process `800036`, "Undo Close Year" / process `800038`) exist on the raw AD tab but are **discarded** — advanced accounting year-closing actions, out of scope for the period-creation story and risky to expose without review.
- `period.processNow` (process `168`/`167`, "Open/Close"/"Open/Close All") and `period.openClose` (OBUIAPP process `Open Close Periods`) are **discarded** on this window — status transitions are already the exclusive responsibility of the existing `open-close-period-control` window; exposing them here would duplicate/fork that logic.
- Period metadata fields (`periodNo`, `name`, `startingDate`, `endingDate`, `periodType`) are classified `readOnly` even though the raw AD columns are updatable — this window's Periods tab is a read-only confirmation view, not an editor.

## Field reference

### year entity (C_Year — header)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| fiscalYear | string | editable | yes | yes | The year value, e.g. "2027" |
| description | string | editable | yes | yes | Optional |
| calendar | foreignKey | editable | no | yes | Required selector; most orgs have one calendar |
| processNow | button | editable | no | yes | **Create Periods** — AD Process 100, `CREATEADJUSTMENT` param |
| createRegFactAcct | button | discarded | — | — | Close Year (out of scope) |
| dropRegFactAcct | button | discarded | — | — | Undo Close Year (out of scope) |

### period entity (C_Period — detail, read-only)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| periodNo | integer | readOnly | yes | yes | Sequence number within the year |
| name | string | readOnly | yes | yes | e.g. "Jan-2027" |
| startingDate | date | readOnly | yes | yes | |
| endingDate | date | readOnly | yes | yes | |
| periodType | enum | readOnly | no | yes | Standard (S) or Adjustment (A) |
| status | enum | readOnly | yes | yes | Badge: N/O/C/P — same enum as `open-close-period-control`'s `periodStatus`; changed only from that window |
| processNow / openClose | button | discarded | — | — | Superseded by `open-close-period-control` |

### Discarded fields (not exposed in UI)
- `calendar` entity: fully excluded (`exclude: true`).
- `year` entity: `active`, `organization`, `client`, `id`, `creationDate`, `createdBy`, `updated`, `updatedBy`, `createRegFactAcct`, `dropRegFactAcct`.
- `period` entity: `active`, `organization`, `client`, `id`, `year`, `closingFactAcctGroupID`, `divideupFactAcctGroupID`, `openFactAcctGroupID`, `regularizationFactAcctGroupID`, `creationDate`, `createdBy`, `updated`, `updatedBy`, `processNow`, `openClose`.

## Cross-window navigation: Periods → Fiscal Calendar
`open-close-period-control` (the Periods window) has `hideCreate: true` by design and no create path of its own. To route users to where new periods actually get created, a **"more" menu action** was added there:
- `decisions.json → window.menuActions` gained a `goToFiscalCalendar` entry with `"component": "GoToFiscalCalendarModal"`.
- `window.hideMoreMenu` was flipped from `true` to `false` on `open-close-period-control` so the kebab menu (previously fully hidden) now renders with exactly this one action.
- **New pattern flag:** there is no generic decisions.json-level "navigate to another window" primitive in the pipeline today — `menuActions` only supports opening a modal component (`component`), or triggering a process (`action` / `documentAction` / `columnName`). `GoToFiscalCalendarModal.jsx` (`artifacts/open-close-period-control/custom/GoToFiscalCalendarModal.jsx`) reuses the modal slot to render a small confirmation dialog whose confirm button calls `useNavigate('/fiscal-calendar')` instead of performing a POST. This is the simplest option that fits the existing mechanism without changing the generator; a cleaner first-class "navigate" menu-action type (e.g. `{ "route": "/fiscal-calendar" }`) is a reasonable follow-up for the Schema Forge Developer to generalize if more windows need this.

## Gap assessment
- `ProcessParamDialog` (`tools/app-shell/src/components/contract-ui/ProcessParamDialog.jsx`) only renders `type: "select"` parameters; there is no native boolean/checkbox param widget. `CREATEADJUSTMENT` was modeled as a two-option select (Yes/No) to work within this constraint. A generic tooling improvement to add a `checkbox` param type is a candidate follow-up but out of scope for this window onboarding.
- The `calendar` field on `year` is a plain required selector rather than an auto-derived single default. If a tenant has more than one active calendar for the same organization, the user must pick the right one when creating a year — there was no reliable signal to auto-derive this safely at classification time.
- No free-text search is configured (`searchableFields: []`, inherited default) — users filter years by the standard grid controls only.

## Manual verification
1. Open `/fiscal-calendar` from the Finance menu under **Fiscal Calendar** and confirm the years list loads.
2. Click **New**, fill in Fiscal Year (e.g. "2027") and pick a Calendar, save, and confirm the new year record appears in the list.
3. Open the new year record, confirm the **Periods** tab is present and empty.
4. Click **Create Periods**, leave "Create Adjustment Period" as No, confirm — confirm 12 periods (Jan–Dec) appear in the Periods tab afterward.
5. Repeat with "Create Adjustment Period" = Yes on a different year and confirm a 13th adjustment period appears.
6. Confirm the Periods tab has no add-row / create control (read-only).
7. Open `/open-close-period-control` (Periods), open the kebab ("more") menu on a period, and confirm **Go to Fiscal Calendar** appears and navigates to `/fiscal-calendar` on confirm.
8. Confirm the newly created periods for the new year now show up in the Periods (`open-close-period-control`) window's list.

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `fiscal-calendar` in the Finance group with label `Fiscal Calendar` (`windowId: "117"`, the classic AD window id).
- `tools/app-shell/src/windows/registry.js` maps `fiscal-calendar` to the generated window loader via `import('@generated/fiscal-calendar/generated/web/fiscal-calendar/index.jsx')`.
- `artifacts/fiscal-calendar/contract.json` defines two entities (`year` on `C_Year`, `period` on `C_Period`), CRUD endpoints for both, an action endpoint for `year.processNow` (`processId: "100"`, `processType: "classic"`), and a test manifest (79 cases).
- `artifacts/fiscal-calendar/generated/web/fiscal-calendar/YearPage.jsx` implements the master list/detail for `year`, including the `processNow` process button (label "Create Periods").
- `artifacts/fiscal-calendar/generated/web/fiscal-calendar/PeriodTable.jsx` / `PeriodForm.jsx` implement the read-only Periods child tab.
- `artifacts/open-close-period-control/custom/GoToFiscalCalendarModal.jsx` — the cross-window navigation confirmation dialog; imported by the regenerated `PeriodControlPage.jsx` as `'../../../custom/GoToFiscalCalendarModal'`.
- NEO Headless spec pushed for `fiscal-calendar` with ID `ED05C42028074866AE26EFB6685B68E2` (35 fields across 2 entities). **`./gradlew export.database` still needs to be run in the Etendo root** so this config survives a rebuild.
- `node cli/src/validate-pipeline.js --scope=fiscal-calendar` and `--scope=open-close-period-control` both report 0 violations.
- i18n: `Fiscal Calendar`, `Create Periods`, `Create Adjustment Period`, `Yes`, `No`, `goToFiscalCalendar`, `goToFiscalCalendarBody` added to both `tools/app-shell/src/locales/en_US.json` and `es_ES.json` (`genericLabels`).
