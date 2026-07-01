# Open/Close Period Control

## Intent
Manage the open/close status of fiscal periods for each organization. Controls which periods accept accounting transactions by exposing the aggregate period status at the header level and the per-document-type status at the line level, both with an action button to trigger the open/close process.

## What this window should allow
- Browse the list of fiscal periods showing their aggregate status (All Never Opened / All Opened / All Closed / All Permanently Closed / Mixed).
- See period details: name, calendar, year, period number, start and end dates, and period type (Standard / Adjustment).
- Use the **Open Close** action button on a period to change the status for all document types at once.
- Drill into a period's Documents tab to see the per-document-type status breakdown.
- Use the **Open Close** action button on an individual document-type row to change the status only for that document type.
- Filter and paginate the period list; no free-text search is currently configured (no searchable fields declared in the contract).

## Interaction model
- Route: `/open-close-period-control` for the period list and `/open-close-period-control/:recordId` for the period detail.
- Visibility: visible from the Finance menu as **Periods** (label `Abrir/Cerrar periodos` in `es_ES`).
- Implementation type: generated window route loaded from the app-shell window registry.
- Window shape: master-detail — `periodControl` (header, table `C_Period`) with a `documents` child tab (lines, table `C_PeriodControl`).
- The **New**, **Print**, and **More menu** toolbar buttons are hidden (`hideCreate`, `hidePrint`, `hideMoreMenu` all set to `true`). Periods are defined in the Fiscal Calendar and provisioned by the onboarding process; they cannot be created or deleted from this window.

## Reactive behavior and dependencies
- Period status on the header (`status`) is an aggregate read-only enum derived by the backend. Valid values: `N` (All Never Opened), `O` (All Opened), `C` (All Closed), `P` (All Permanently Closed), `M` (Mixed).
- Period status on each documents row (`periodStatus`) is a per-document-type enum: `N` (Never opened), `O` (Open), `C` (Closed), `P` (Permanently closed).
- Status transitions follow Classic Etendo period-control logic: Never Opened → Open → Closed → Permanently Closed. Reverse transitions may be blocked depending on whether accounting entries exist.
- The `openClose` action button is routed to classic stored procedures via `processId`/`processType` overrides in `decisions.json`:
  - `periodControl` entity: calls AD Process 167 (`C_Period_Process`) via `PeriodOpenCloseHandler` (`JAVA_QUALIFIER = 'period-openclose'`). Endpoint: `POST /sws/neo/open-close-period-control/periodControl/{id}/action/openClose`
  - `documents` entity: calls AD Process 168 (`C_PeriodControl_Process`) via `PeriodControlDocOpenCloseHandler` (`JAVA_QUALIFIER = 'period-control-doc-openclose'`). Endpoint: `POST /sws/neo/open-close-period-control/documents/{id}/action/openClose`
- A validation rule (`Allowed PeriodActions`) guards which transitions are permitted on the `openClose` button; the contract validation code is `Value<>'N'`.
- Several fields on the header (`periodNo`, `startingDate`, `endingDate`, `periodType`) carry a read-only logic guard (`@C_Period_Not_Editable@='Y'`), evaluated as JS: `record['c_Period_Not_Editable'] === 'Y'`. Since all these fields are already classified as `readOnly` in the contract, this guard adds no additional editable surface — all period metadata is read-only by design.
- No new-record defaulting applies because period creation is disabled (`hideCreate: true`).
- Parent filter for the documents child tab: `parentId={periodControlId}`.

## Field reference

### periodControl entity (C_Period — header)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| status | enum | readOnly | yes | yes | Aggregate badge: N/O/C/P/M |
| calendar | foreignKey | readOnly | yes | yes | Fiscal calendar (selector) |
| year | foreignKey | readOnly | yes | yes | Fiscal year (selector) |
| name | string | readOnly | yes | yes | Period name, e.g. "Jan-2025" |
| periodNo | integer | readOnly | yes | yes | Sequence number within the year |
| startingDate | date | readOnly | yes | yes | Period start date |
| endingDate | date | readOnly | no | yes | Period end date |
| periodType | enum | readOnly | no | yes | Standard (S) or Adjustment (A) |
| openClose | button | editable | no | yes | Triggers open/close for all document types |

### documents entity (C_Year — lines)

| Field | Type | Visibility | Grid | Form | Notes |
|-------|------|------------|------|------|-------|
| documentCategory | enum | readOnly | yes | yes | AD document base type (DocBaseType) |
| periodStatus | enum | readOnly | yes | yes | Per-document-type status badge: N/O/C/P |
| openClose | button | editable | no | yes | Triggers open/close for this document type |

### Discarded fields (not exposed in UI)
- `processNow` (Processing button) — discarded on both entities; superseded by `openClose`.
- `periodAction` (PeriodAction enum) — discarded on the documents entity.
- All system fields: `id`, `client`, `organization`, `active`, `creationDate`, `createdBy`, `updated`, `updatedBy`, `closingFactAcctGroupID`, `regularizationFactAcctGroupID`, `divideupFactAcctGroupID`, `openFactAcctGroupID` (periodControl); `period`, `periodControl`, `calendar` (documents).

## Gap assessment
- No free-text search is configured in the contract (`searchableFields: []` on both entities). Users cannot search periods by name or date range from the list toolbar. If filtering is needed, it must be added as a dedicated filter field in `decisions.json`.
- The `openClose` button is currently classified as an action button in the contract, but the NEO Headless spec ID (`EB6BD6D721284B77B299F618A62A1600`) and process route are confirmed pushed. Whether the process dialog renders correctly in the generated UI depends on app-shell support for `obuiapp`-type process buttons — this should be verified manually.
- Status badge colors are not specified in the contract. The generator will use the default badge style; product may need a custom color mapping (e.g., red for Permanently Closed, green for Open) via `decisions.json → window.statusBar` or a custom component.
- The `documents` lines entity maps to `C_PeriodControl` (PK `C_PeriodControl_ID`). The `C_Year_ID` field visible in the raw AD schema is a property field (navigation path `period.year`) and is not a physical column of `C_PeriodControl` — the extractor now correctly identifies this via `AD_Column.IsKey='Y'`.

## Manual verification
1. Open `/open-close-period-control` from the Finance menu under **Periods** and confirm the period list loads through the generated window route.
2. Confirm the list columns show: Status (badge), Calendar, Year, Name, Period No., Starting Date.
3. Confirm the **New** and **Print** toolbar buttons are absent; only search/filter controls and pagination are visible.
4. Open a period record and confirm the detail form shows all header fields as read-only except the **Open Close** button.
5. Confirm the period detail includes a **Documents** child tab listing document-type rows.
6. On a Documents row in the detail form, confirm **Period Status** is read-only and **Open Close** is the only actionable control.
7. Click **Open Close** on a period header and confirm the process dialog appears and the status updates after completion.
8. Click **Open Close** on a document-type row and confirm only that document type's status changes.
9. Confirm a Permanently Closed period does not allow re-opening (the `Allowed PeriodActions` validation should block it).
10. Confirm the window is NOT accessible via direct URL navigation if there are no provisioned period control records for the logged-in organization.

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `open-close-period-control` in the Finance group with label `Periods`.
- `tools/app-shell/src/windows/registry.js` maps `open-close-period-control` to the generated window loader via `import('@generated/open-close-period-control/generated/web/open-close-period-control/index.jsx')`.
- `artifacts/open-close-period-control/contract.json` defines two entities (`periodControl` on `C_Period` and `documents` on `C_Year`), CRUD endpoints for both, two action endpoints for `openClose`, two selector endpoints (`calendar`, `year`), and a test manifest of 82 cases covering field presence, field types, visibility, read-only logic, selectors, actions, and system-field separation.
- `artifacts/open-close-period-control/generated/web/open-close-period-control/PeriodControlPage.jsx` implements the master list/detail for `periodControl`.
- `artifacts/open-close-period-control/generated/web/open-close-period-control/PeriodControlTable.jsx` implements the header list columns.
- `artifacts/open-close-period-control/generated/web/open-close-period-control/PeriodControlForm.jsx` implements the header detail form.
- `artifacts/open-close-period-control/generated/web/open-close-period-control/DocumentsTable.jsx` implements the documents child tab list.
- `artifacts/open-close-period-control/generated/web/open-close-period-control/DocumentsForm.jsx` implements the documents child tab form.
- NEO Headless spec pushed with ID `EB6BD6D721284B77B299F618A62A1600`, 38 fields total across both entities.
