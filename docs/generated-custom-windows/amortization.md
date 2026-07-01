# Amortization

## Intent

The Amortization window lets a finance user view, edit, and process amortization documents. Each document represents a set of depreciation entries that occurred between two dates for a group of fixed assets. Lines link the document to specific assets and record the depreciation percentage and amount for that period.

Records are typically created from the **Assets** window via the **Create Amortization** action. The Amortization window is where users inspect and edit those records while still in draft, confirm them (triggering the accounting entries), and later reactivate them if a correction is needed.

## What this window should allow

- List existing amortization documents with name, accounting date, starting date, and total amortization formatted with currency symbol, with a status filter dropdown ("All statuses / Borrador / Procesado") in the toolbar.
- Open a document to inspect the header and its amortization lines.
- While in **draft** (`processed='N'`):
  - Edit header fields: name, description, accounting date, starting date, currency.
  - Edit lines inline: asset (required), amortization percentage, amortization amount.
  - Add and delete lines.
  - Press **Confirmar** to open a confirmation modal showing the current total, line count, and a lock warning, then confirm the document.
- Once **processed** (`processed='Y'`):
  - All header and line fields become read-only.
  - The **Delete** action is hidden.
  - A **Reactivar** option appears in the three-dot menu to unprocess the document.
- Attach files via the **Adjuntos** tab.

## Interaction model

- Route: `/amortization` for the list and `/amortization/:recordId` for detail.
- Visibility: Finance menu as **Amortización**, immediately below **Assets**.
- Implementation type: generated window with confirm modal (`AmortizationConfirmModal`). No sidebar — status shown as a `DocumentStatusPill` in the toolbar next to Cancel; total shown as a footer in the lines table.
- Window shape: master-detail. Header (`A_Amortization`) + lines (`A_Amortizationline`). Accounting tab (Fact_Acct) excluded.
- Detail layout: full-width form (no sidebar); **Adjuntos** tab in the tab strip.
- Lines layout: `inlineEditable` — existing rows use InlineLinesPanel (flex), new rows use a DataTable add-row form. Hovering a row reveals pencil/trash icons in a dedicated 160px action slot (not a trailing-column swap, because `amortizationAmount` has `noTrailing: true`).
- Confirm button: black primary button on the far right, disabled when no lines exist. Opens `AmortizationConfirmModal` rather than executing directly.
- List toolbar: Print and Link buttons are hidden (`hidePrint: true`, `hideLink: true`). Only the status dropdown, funnel, and "New amortization" button are shown.

## Reactive behavior and dependencies

- **Draft/processed lock**: all editable header fields and all line fields carry `readOnlyLogic: @Processed@='Y'`. Delete is suppressed on processed documents.
- **Confirmar button**: wired via `draftMode.processField: "Processed"`. Only visible while draft; disabled when no lines; opens the confirm modal. The modal fetches the record and line count independently, calculates the total from line amounts (not from the stored header field), shows a warning, and submits `POST /action/Processed`. On success, the detail view refetches the header.
- **Reactivar menu action**: appears in the three-dot menu only when `processed='Y'`. Calls `/action/Processed` again, which the backend interprets as an unprocess request. After success, the page reloads.
- **Status pill**: `statusField: "processed"` in `decisions.json` causes DetailView to render a `DocumentStatusPill` next to the Cancel button. Values: `'Y'` → "✓ Procesado" (green/success), `'N'` → "Borrador" (neutral/grey). Tone mapping lives in `tools/app-shell/src/lib/statusBadge.js` (`getStatusTone`).
- **Lines total footer**: computed from visible lines (`lines.reduce()`) so it updates immediately on any mutation — no server round-trip needed. `TOTALAMORTIZATION` on the header is kept in sync by `ETGO_A_AMORTLINE_TOTAL_TRG` (AFTER trigger on `A_AMORTIZATIONLINE`) and is the authoritative value shown in the list view column.
- **New record currency default**: the `currency` field defaults to the org's functional currency via `defaultExpr: "@$C_Currency_ID@"` in decisions.json. The currency is editable until the document is processed.
- **Main list total**: the `totalAmortization` column uses `type: 'amount'` (with `summable: true`) so it renders with the currency symbol and a column footer total.
- **Status filter dropdown**: the list toolbar shows an "All statuses ▾" dropdown (same mechanism as Sales Order). It filters by `processed` column value: 'N' → Borrador/Draft, 'Y' → Procesado/Processed. The `processed` column is in the table schema (type `status`, `filterOnly: true`) so `ListFilterBar` can detect it, but is hidden from visual display via `hiddenColumns` and excluded from the Conditional Filter via `filterable: false`.
- Accounting dimensions are discarded: `project`, `salesCampaign`, `activity`, `costcenter`, `User1_ID`, `User2_ID` are not surfaced.

## Gap assessment

- The confirm flow uses `POST /action/Processed` — the same endpoint as the classic "Post Amortization" button. The backend procedure `A_Amortization_Process` handles both process and unprocess based on the record's current state.
- There is no inline recalculation between `amortizationPercentage` and `amortizationAmount` on the line. Both fields are independently editable.
- The Accounting tab (Fact_Acct) is excluded; users cannot review accounting entries from the simplified UI.
- Lines created manually via the inline form now receive the header currency automatically (`currency: data?.currency` is included in the POST body).

## Manual verification

1. Open `/amortization` from Finance and confirm the list renders with formatted amounts (e.g., `5,000.00 €`) and no currency column.
2. From Assets, trigger **Create Amortization** on a depreciation-enabled asset. Open the new record in `/amortization`.
3. Confirm the record is in draft:
   - Header fields (name, accounting date, starting date, currency) are editable.
   - Lines render in the custom `AmortizationLinesTable` — columns: Asset | Amortization % | Amount | Accounting dimensions.
   - Toolbar shows a grey "Borrador" pill next to the Cancel button (no sidebar).
   - Below the lines table a right-aligned footer shows "Amortización total: X €".
   - **Confirmar** button is black/primary on the far right; **Guardar** is grey.
4. Click the pencil icon on an existing line and confirm the Asset, %, and Amount fields become editable inline within the same row. Edit the amount and click outside (blur) — confirm the value saves without pressing a confirm button. Verify the sidebar total updates to reflect the new sum.
4a. Click the circular chevron button on a line row — confirm it rotates and a white panel expands below (no section title, no filled-count counter). The panel shows the Organisation field (read-only) and 7 dimension selectors. Hover a selector — confirm the background changes to `#F5F7F9`. Select a value in one selector (e.g., Cost Center) and confirm it auto-saves immediately without a Save button. Collapse the panel and verify the Accounting dimensions column now shows a "Label: Value" badge for the filled dimension.
4b. Select one or more rows using the row checkboxes — confirm the shared `LinesSelectionBar` appears at the bottom with the count and a red trash button. Click × to clear the selection. In processed/read-only state, confirm the checkboxes are visible but disabled.
4c. Click "+ Añadir línea" — confirm an inline draft row appears aligned to the table columns (asset buscador, % and amount inputs with column-name placeholders). The "+ Añadir línea" button must remain visible. Type a value, press Enter — confirm the line saves and the draft row stays open. Press Esc — confirm the draft row closes. Click outside with a value entered — confirm it saves and closes.
4d. Add the first line to a new draft record and confirm the **Confirmar** button becomes enabled immediately (without page reload).
5. Press **Confirmar** with no lines and confirm the button is disabled.
6. With at least one line, press **Confirmar** and verify the modal opens showing the correct total (matching the line sum, not the old header value).
7. Confirm in the modal. Verify:
   - Toast "Registro procesado" appears.
   - Fields become read-only.
   - The **Confirmar** button disappears.
   - The three-dot menu shows **Reactivar**.
8. Press **Reactivar**. Verify the document returns to draft (fields editable, Confirmar button visible).
9. Reactivate, change a line amount, then confirm again. Verify the modal shows the updated total (not the previously-processed total).
10. Open the **Adjuntos** tab and upload, download, and delete a file.

## Manual verification (list toolbar)

1. Open `/amortization` list — toolbar shows: **All statuses ▾** | **funnel** | **+ New amortization**. Print and Link buttons are absent.
2. Click "All statuses ▾" — dropdown shows: All statuses ✓ / Borrador / Procesado. Selecting "Borrador" filters to draft records only.
3. Open the funnel (Conditional Filter) — `processed` does NOT appear in the field selector.

## Automated evidence

- `tools/app-shell/src/menu.json` — **Amortización** under Finance, `windowId: 800026`.
- `tools/app-shell/src/windows/registry.js` — `amortization` route.
- `cli/config/regen-windows.json` — `amortization` entry.
- `artifacts/amortization/decisions.json` — source of truth:
  - `linesLayout: "inlineEditable"` with `noTrailing: true` on `amortizationAmount` (dedicated 160px action slot).
  - `customLinesComponent: "AmortizationLinesTable"` — replaces the standard InlineLinesPanel with the custom component.
  - `statusField: "processed"` — drives the `DocumentStatusPill` in the toolbar (green for 'Y', grey for 'N').
  - `asset.grow: true` and `amortizationPercentage.grow: true` for balanced column distribution.
  - `draftMode: { processField: "Processed", label: "confirm", confirmModal: "AmortizationConfirmModal", disableWhenEmpty: true }`.
  - `menuActions: [{ key: "reactivate", visibleWhenFieldTrue: "processed", columnName: "Processed" }]`.
  - `hideDeleteWhenComplete: true`, `hidePrint: true`, `hideLink: true`.
  - `currency.defaultExpr: "@$C_Currency_ID@"`.
  - `processed` header field: `grid: true`, `filterOnly: true`, `columnType: "status"`, `filterable: false` — feeds the status dropdown without showing as a column.
  - Accounting entity excluded; accounting dimensions discarded.
- `tools/app-shell/src/lib/statusBadge.js` — `getStatusTone` maps `'y'`/`'yes'` → `'success'`; `statusLabel` MAP includes `Y: 'statusProcessed'` and `N: 'statusDraft'` so `DocumentStatusPill` resolves tones and labels for `processed` field values.
- `tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx` — custom lines component. Renders Asset (`w-64`, 256 px) | Amortization % | Amount | Accounting dimensions columns. The Asset column has an explicit `w-64` so it stays proportional on wide viewports instead of absorbing all remaining table space. Per-row and select-all checkboxes for multi-select (disabled, not hidden, in read-only state); shared `LinesSelectionBar` for bulk delete. Circular icon button toggles a white-background expand panel with Organisation (read-only) + 7 dimension selectors (auto-save on `onChange`). Pencil activates inline editing for 3 core fields (blur-saves; calls `onRefresh` after each save to keep header in sync). Add-line auto-saves the header first when `isNew` (mirrors Sales Order `openAddLine` pattern: saves → navigates to real recordId → useEffect opens inline form on re-mount). New lines include `currency` from header. Footer computed from `lines.reduce()` for immediate accuracy. Test coverage: `__tests__/AmortizationLinesTable.vitest.jsx` (27 tests).
- `artifacts/amortization/custom/AmortizationConfirmModal.jsx` — confirmation modal. Fetches lines to calculate current total independently. Calls `POST /action/Processed` on confirm. On success calls `onClose(true)` which triggers `window.location.reload()`. Blocks confirmation when any line has a zero/negative amount (`amortizationErrorLineAmountInvalid`) or a missing percentage (`amortizationErrorLinePercentageMissing`). Both i18n keys are in `packages/app-shell-core/src/locales/`. Headers include `Accept-Language: getStoredLocale()` so backend process errors (e.g. closed accounting period) are returned in the user's UI language.

## ETP-4103 changes

Changes landed in `feature/ETP-4103`. Covers visual polish, sidebar simplification, custom lines table, and a Java process bug fix for the Amortization window.

### Visual polish

- `toolbarBorderBottom: true` in `decisions.json` — adds a horizontal divider line below the toolbar buttons row.
- `toolbarButtonSize: "default"` in `decisions.json` — toolbar buttons (including the kebab menu) are now `h-10 w-10`, matching the Contacts window. Previously `sm` (`h-9`).
- `listbarPaddingX: "px-2"` and `tablePaddingX: "px-2"` in `decisions.json` — list-view toolbar and table horizontal padding reduced from 24 px to 8 px.
- `whiteFormBackground: true` in `decisions.json` — forces white background on form inputs and textareas, overriding the `bg-[#F5F7F9]` default on inputs and `bg-background` on textareas. Disabled textareas use `opacity-50` instead of `bg-muted/50` for visual consistency.
- `noHeaderBorder: true` in `decisions.json` — removes the rounded card border around the header form fields, matching the Contacts window layout.
- `primaryTabsVariant: "pill"` in `decisions.json` — tab strip uses pill style, matching Contacts.
- `tabsBarPaddingX: "px-2"` in `decisions.json` — tabs bar horizontal padding set to 8 px.
- `toolbarPaddingX: "px-2"` in `decisions.json` — toolbar horizontal padding set to 8 px.

### Status pill + total footer (replaces sidebar)

- Sidebar removed. `statusField: "processed"` in `decisions.json` — DetailView renders a `DocumentStatusPill` next to the Cancel button showing "✓ Procesado" (green) or "Borrador" (grey).
- `AmortizationLinesTable` now renders a right-aligned total footer below the lines using `data.totalAmortization` from the header record.
- `getStatusTone` in `statusBadge.js` extended: `'y'`/`'yes'` → `'success'`; `statusLabel` MAP extended: `Y: 'statusProcessed'`, `N: 'statusDraft'`.

### Lines tab — custom AmortizationLinesTable

- `customLinesComponent: "AmortizationLinesTable"` in `decisions.json` — the standard InlineLinesPanel is replaced by a custom component at `tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx`.
- Table shows columns: Asset | Amortization % | Amount | Accounting dimensions.
- **Multi-select checkboxes**: every row has a checkbox; the header has a select-all checkbox (indeterminate when partially selected). In read-only/processed mode checkboxes remain visible but are disabled (matching Sales Order behaviour). Selecting ≥1 row shows the shared `LinesSelectionBar` (same as Sales Order) — a floating bottom bar with the selection count, a red trash/delete button, and an × cancel button. Bulk delete issues concurrent DELETE requests via `Promise.all`.
- **Circular expand toggle**: each row has a circular icon button (24 px, border `#D1D4DB`, rounded-full, shadow xs, `ChevronDown #828FA3`) that toggles the accounting dimensions panel. Rotates 180° when expanded.
- **Inline editing** (pencil icon): clicking the pencil on a row makes the 3 core fields (Asset, %, Amount) editable inline within the same row. Save happens on blur — no confirm button needed. Same pattern as Sales Order.
- **Expandable dimensions panel**: expanding a row reveals a white-background panel (no section title, no filled-count counter) with a read-only Organisation field and 7 dimension selectors: Cost Center, Contact/Business Partner, 1st Dimension, 2nd Dimension, Sales Region, Activity, Sales Campaign. Project is hidden (`displayLogic: @ACCT_DIMENSION_DISPLAY@`). Selectors have a hover background (`#F5F7F9`) on pointer-over.
- Dimension selectors auto-save on `onChange` — immediate PUT per field, no Save button required.
- When the document is **processed** (`processed='Y'`), dimension selectors are rendered as disabled `<input>` elements with `opacity-50` and `cursor-not-allowed` — visually greyed out to signal that no editing is possible. In draft mode, read-only inputs retain full opacity (`!opacity-100`) to stay visually neutral. This is controlled via the `isCompleted` prop on `DimensionGrid`, passed as `processed` from the parent component.
- **Accounting dimensions column summary**: badges in "Label: Value" format (`#F5F7F9` background, 8px radius, `#3F3F50` label text). Organisation always leads when filled. Up to 2 badges shown; remaining are collapsed into a `+N` badge. Empty rows show a dashed "+ Añadir dimensiones" button.
- **Add line — inline draft row** (Sales Order pattern): clicking "+ Añadir línea" inserts an inline editable row aligned to the table columns. Field placeholders are the column labels (e.g. "Activo", "Amortization %", "Amortization Amount"). Enter saves and keeps the row open for rapid entry; Esc cancels; clicking outside saves (or cancels if empty). The "+ Añadir línea" button stays visible while the draft row is open. The hint "Enter o clic fuera para guardar · Esc para cancelar" (`inlineAddHint`) appears below the table while the draft row is active.
- After any line mutation (create, delete, bulk delete), the component calls `onRefresh()` to trigger `hook.fetchChildren()` in the parent DetailView — this keeps the **Confirmar** button state in sync without a page reload (`hook.children.length > 0` enables the button).
- Delete individual line via trash icon on row hover.
- Dimension fields are also exposed as columns in the list view: Project, Cost Center, 1st Dimension, 2nd Dimension, Business Partner, Sales Region, Activity, Sales Campaign.

### Lines — badge labels

- Status badge "Planificado" renamed to **"Pendiente"**.
- Status badge "Procesado" renamed to **"Confirmado"**.

### Java bug fix (NeoProcessService.java)

- Fixed: the "Crear amortizaciones" process was failing with `JSONObject["A_Asset_ID"] not found`. Root cause: `AssetLinearGroupedDepreciationMethodProcess.doExecute()` reads the record id from the table's key column name (`A_Asset_ID`) in the content JSON, but `NeoProcessService` was only providing it under `inpRecordId`. Fix: `NeoProcessService` now resolves the key column from the tab's table and exposes the record id under the DB column name. This fix is generic — works for any OBUIAPP process that reads the record id by table key column name.

## ETP-4173 changes

Changes landed in `feature/ETP-4173`. Covers AD_Message error token resolution and UI locale propagation.

### Confirm modal — locale-aware error messages

- `AmortizationConfirmModal.jsx` now includes `Accept-Language: getStoredLocale()` in its fetch headers. The `getStoredLocale()` helper (added to `packages/app-shell-core/src/i18n/useLocaleState.js`) reads the active locale from `localStorage` (`schema-forge-locale`) without requiring a React hook — safe to use in `useMemo` and outside the render cycle.
- Backend (`NeoAuthenticator.java`): after JWT validation, reads the `Accept-Language` header, validates it matches the Etendo language code format (`xx_YY`), looks up an active `AD_Language` record, and calls `OBContext.setLanguage()`. This makes `OBMessageUtils.parseTranslation()` resolve AD_Message tokens in the user's language for the duration of the request.
- Backend (`NeoProcessService.java`): all three result-translation methods (`translatePInstanceResult`, `translateClassicResult`, `translateObuiappResult`) now wrap error messages with `OBMessageUtils.parseTranslation()`, which resolves Etendo AD_Message key tokens (`@KeyName@`) to their translated text. Previously, tokens like `@PeriodNotAvailable@` were forwarded as-is and shown raw in the UI.

## ETP-4190 changes (feature/ETP-4190)

### Dimension fields — visual disabled state when processed

- `DimensionGrid` in `AmortizationLinesTable.jsx` now accepts an `isCompleted` prop.
- When `isCompleted={true}` (document `processed='Y'`), the `[&_input:disabled]:!opacity-100` override is removed from the wrapper so Tailwind's default `disabled:opacity-50` + `cursor-not-allowed` applies — dimension inputs are visually greyed out.
- When `isCompleted={false}` (draft), the override stays active so read-only inputs look neutral (same as before).

### Asset column width

- The `<th>` for the Asset column now carries `w-64` (256 px). Previously it had no explicit width and absorbed all available table space, making it disproportionately wide on large screens.

## Iteration backlog (out of current scope)

- Callout linking `amortizationPercentage` ↔ `amortizationAmount` so that editing one updates the other based on the asset's value.
- Read-only **Accounting** tab showing the resulting Fact_Acct entries.
- Bi-directional integration with the asset's amortization plan so that lines auto-populate from the plan.

## ETP-4230 — Defaults fixes: line asset, header name + accountingDate

### Line `asset` no longer inherits the header id (bug fix)

- Root cause: `A_Amortizationline` has two `isparent='Y'` columns in AD — `A_Amortization_ID` (the real header FK) and `A_Asset_ID`. The NEO defaults link-to-parent logic injected the `parentId` (header id) into **every** parent-link column, so `neo_defaults` for `lines` returned the header id as the `asset` value.
- Fix (generic, in `NeoDefaultsService`): the `parentId` is now applied only to the parent-link column whose referenced entity matches the parent tab's table (`A_Amortization`). `A_Asset_ID` references `A_Asset`, so it no longer receives the header id and falls through to normal resolution (→ `null` when the header has no asset). Benefits any child entity with multiple `isparent` FKs.

### Header defaults — `name` and `accountingDate`

- `accountingDate`: `decisions.json` header field now has `defaultExpr: "@#Date@"` → `neo_defaults` returns the current system date. Editable; an explicit value on create still wins.
- `name`: computed dynamically by a new `AmortizationHeaderHandler` (`@Named("amortizationHeaderHandler")`, wired via `entities.header.javaQualifier` in `decisions.json`). On the `DEFAULTS` endpoint it reads the `assetId` query param, loads the asset, and returns `"Amortización - {asset name} - {amortizationStartDate}"`. Falls back to `"Amortización"` when no `assetId` is present, the asset is not found, or any lookup error occurs — never blocks the defaults call. It only fills `name` when not already set, so an explicit value on create wins.

### Deferred to a follow-up

- Direct FK from the header (`A_Amortization`) to the asset (Issue 3 of ETP-4230) — requires a new AD column; tracked separately.
