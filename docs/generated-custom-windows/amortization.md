# Amortization

## Intent

The Amortization window lets a finance user view, edit, and process amortization documents. Each document represents a set of depreciation entries that occurred between two dates for a group of fixed assets. Lines link the document to specific assets and record the depreciation percentage and amount for that period.

Records are typically created from the **Assets** window via the **Create Amortization** action. The Amortization window is where users inspect and edit those records while still in draft, confirm them (triggering the accounting entries), and later reactivate them if a correction is needed.

## What this window should allow

- List existing amortization documents with name, accounting date, starting date, and total amortization formatted with currency symbol, with a status filter dropdown ("All statuses / Borrador / Procesado") in the toolbar. Amortization documents cannot be created from the list — the create button is hidden (`window.hideCreate: true`); records originate from the **Assets** → **Create Amortization** action.
- Open a document to inspect the header and its amortization lines.
- Header fields are read-only regardless of document state — **Name**, **Accounting Date**, **Starting Date**, and **Currency** are locked unconditionally. Only **Description** is editable.
- While in **draft** (`processed='N'`):
  - Edit the **Description** header field.
  - Edit lines inline: asset (required), amortization percentage, amortization amount.
  - Add and delete lines.
  - Set line accounting dimensions (**Project**, **Cost Center**, **Contact**) via the per-line expand panel.
  - Press **Confirmar** to open a confirmation modal showing the current total, line count, and a lock warning, then confirm the document.
- Once **processed** (`processed='Y'`):
  - The remaining editable field (Description) and all line fields become read-only.
  - A **Reactivar** option appears in the three-dot menu to unprocess the document, including when it is posted. When posted, the action first unposts the document and then reactivates it; when not posted, it only reactivates. There is no separate **Descontabilizar** action in Etendo Go.
- The header **Delete** (trash) button is hidden in all states via `window.hideDeleteButton` (see `docs/decisions-reference.md` / `docs/ui-customization.md` for the flag mechanics).
- Attach files via the **Adjuntos** tab.
- The document-level **Delete** action (list row trash icon and detail toolbar) is hidden unconditionally, in both draft and processed status (`window.hideDeleteButton: true`) — this is stricter than the previous processed-only behavior. Deleting individual **lines** while in draft is unaffected and still available.

## Interaction model

- Route: `/amortization` for the list and `/amortization/:recordId` for detail.
- Visibility: Finance menu as **Amortización**, immediately below **Assets**.
- Implementation type: generated window with confirm modal (`AmortizationConfirmModal`). No sidebar — status shown as a `DocumentStatusPill` in the toolbar next to Cancel; total shown as a footer in the lines table.
- Window shape: master-detail. Header (`A_Amortization`) + lines (`A_Amortizationline`). Accounting tab (Fact_Acct) excluded.
- Detail layout: full-width form (no sidebar); **Adjuntos** tab in the tab strip.
- Lines layout: `inlineEditable` — existing rows use InlineLinesPanel (flex), new rows use a DataTable add-row form. Hovering a row reveals pencil/trash icons in a dedicated 160px action slot (not a trailing-column swap, because `amortizationAmount` has `noTrailing: true`).
- Confirm button: black primary button on the far right, disabled when no lines exist. Opens `AmortizationConfirmModal` rather than executing directly.
- List toolbar: Print, Link, and the create button are hidden (`hidePrint: true`, `hideLink: true`, `hideCreate: true`). Only the status dropdown and funnel are shown — there is no "New amortization" button.
- Delete action fully suppressed: `hideDeleteButton: true` hides the delete (red trash) icon in the list grid rows and in the detail toolbar, regardless of the document's processed state. This is stronger than `hideDeleteWhenComplete` (which only hides delete once the document is processed). Deleting individual **lines** while in draft is unaffected and still available.
- No footer summary bar: `window.summaryFields: []` removes the bottom summary strip. The header form already surfaces those fields, so the footer strip is redundant.

## Reactive behavior and dependencies

- **Header field locking**: Name, Accounting Date, Starting Date, and Currency are classified `readOnly` in `decisions.json`, so they are locked in every state (not just once processed). Description stays editable in draft and locks when the document is processed. The header **Delete** button is hidden in all states via `window.hideDeleteButton`.
- **Line lock**: all line fields carry `readOnlyLogic: @Processed@='Y'` and become read-only once the document is processed.
- **Confirmar button**: wired via `draftMode.processField: "Processed"`. Only visible while draft; disabled when no lines; opens the confirm modal. The modal fetches the record and line count independently, calculates the total from line amounts (not from the stored header field), shows a warning, and submits `POST /action/Processed`. On success, the detail view refetches the header.
- **Reactivar menu action**: appears in the three-dot menu only when `processed='Y'`, regardless of the accounting `posted` value. It uses `preUnpost: true`, so posted records first call `/action/unpost` and then `/action/Processed`; unposted records skip the unpost step and only call `/action/Processed`. After success, the page reloads. The independent **Descontabilizar** menu action is intentionally not exposed for amortizations.
- **Status pill**: `statusField: "processed"` in `decisions.json` causes DetailView to render a `DocumentStatusPill` next to the Cancel button. Values: `'Y'` → "✓ Procesado" (green/success), `'N'` → "Borrador" (neutral/grey). Tone mapping lives in `tools/app-shell/src/lib/statusBadge.js` (`getStatusTone`).
- **Lines total footer**: computed from visible lines (`lines.reduce()`) so it updates immediately on any mutation — no server round-trip needed. `TOTALAMORTIZATION` on the header is kept in sync by `ETGO_A_AMORTLINE_TOTAL_TRG` (AFTER trigger on `A_AMORTIZATIONLINE`) and is the authoritative value shown in the list view column.
- **New record currency default**: the `currency` field defaults to the org's functional currency via `defaultExpr: "@$C_Currency_ID@"` in decisions.json. Currency is classified `readOnly`, so it is displayed but never editable from this window.
- **Main list total**: the `totalAmortization` column uses `type: 'amount'` (with `summable: true`) so it renders with the currency symbol and a column footer total.
- **Status filter dropdown**: the list toolbar shows an "All statuses ▾" dropdown (same mechanism as Sales Order). It filters by `processed` column value: 'N' → Borrador/Draft, 'Y' → Procesado/Processed. The `processed` column is in the table schema (type `status`, `filterOnly: true`) so `ListFilterBar` can detect it, but is hidden from visual display via `hiddenColumns` and excluded from the Conditional Filter via `filterable: false`.
- Header accounting dimensions: `salesCampaign`, `activity`, `stDimension`, `ndDimension` are discarded and not surfaced on the header. `project` **is** surfaced (config-gated — see the ETP-4529 header section below); it is the one header dimension the ETP-4529 matrix requires (TC-104).
- **Line accounting dimensions**: only **Project**, **Cost Center**, and **Contact** are shown in the per-line expand panel. The remaining dimensions (1st/2nd Dimension, Sales Region, Activity, Sales Campaign) are discarded. **Product** is not shown on amortization lines.
- **"+ Add dimensions" trigger**: on a line with no dimensions set, the dashed "+ Añadir dimensiones" affordance is shown only while the document is editable. When the document is **processed** and the line has no dimensions, the trigger is hidden entirely (there is nothing to reveal but disabled fields). When a line has at least one dimension set, the value(s) render as read-only "Label: Value" chips regardless of state.
- **Others tab removed**: the empty "Others" tab is gone. Its Accounting Status field (`etblkpAccountingstatus`) is discarded and no longer appears in the header, and the `etblkpBulkposting` label was removed from the summary/footer area.

## Gap assessment

- The confirm flow uses `POST /action/Processed` — the same endpoint as the classic "Post Amortization" button. The backend procedure `A_Amortization_Process` handles both process and unprocess based on the record's current state.
- There is no inline recalculation between `amortizationPercentage` and `amortizationAmount` on the line. Both fields are independently editable.
- The Accounting tab (Fact_Acct) is excluded; users cannot review accounting entries from the simplified UI.
- Lines created manually via the inline form now receive the header currency automatically (`currency: data?.currency` is included in the POST body).

## Manual verification

1. Open `/amortization` from Finance and confirm the list renders with formatted amounts (e.g., `5,000.00 €`) and no currency column.
2. From Assets, trigger **Create Amortization** on a depreciation-enabled asset. Open the new record in `/amortization`.
3. Confirm the record is in draft:
   - Header fields Name, Accounting Date, Starting Date, and Currency are displayed read-only; only **Description** is editable. The header trash/Delete button is absent.
   - Lines render in the custom `AmortizationLinesTable` — columns: Asset | Amortization % | Amount | Accounting dimensions.
   - Toolbar shows a grey "Borrador" pill next to the Cancel button (no sidebar).
   - Below the lines table a right-aligned footer shows "Amortización total: X €".
   - **Confirmar** button is black/primary on the far right; **Guardar** is grey.
4. Click the pencil icon on an existing line and confirm the Asset, %, and Amount fields become editable inline within the same row. Edit the amount and click outside (blur) — confirm the value saves without pressing a confirm button. Verify the sidebar total updates to reflect the new sum.
4a. Click the circular chevron button on a line row — confirm it rotates and a white panel expands below (no section title, no filled-count counter). The panel shows the Organisation field (read-only) and 3 dimension selectors: **Project**, **Cost Center**, and **Contact**. Hover a selector — confirm the background changes to `#F5F7F9`. Select a value in one selector (e.g., Cost Center) and confirm it auto-saves immediately without a Save button. Collapse the panel and verify the Accounting dimensions column now shows a "Label: Value" badge for the filled dimension. On a processed document, verify a line with no dimensions shows no "+ Añadir dimensiones" affordance, while a line that already has dimensions still renders its value chips as read-only.
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

1. Open `/amortization` list — toolbar shows: **All statuses ▾** | **funnel**. The create ("+ New amortization"), Print, and Link buttons are all absent.
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
  - `menuActions: [{ key: "reactivate", visibleWhenFieldTrue: "processed", preUnpost: true, columnName: "Processed" }]`; there is no standalone `unpost` action for amortizations.
  - `hideDeleteButton: true`, `hideCreate: true`, `summaryFields: []`, `hidePrint: true`, `hideLink: true`.
  - `currency.defaultExpr: "@$C_Currency_ID@"`; `currency.visibility: "readOnly"`.
  - Header fields `name`, `accountingDate`, `startingDate`, `currency`: `visibility: "readOnly"`. Only `description` stays editable.
  - `etblkpAccountingstatus` and `etblkpBulkposting`: `visibility: "discarded"` — removes the "Others" tab Accounting Status field and the stale Bulk Posting label.
  - `processed` header field: `grid: true`, `filterOnly: true`, `columnType: "status"`, `filterable: false` — feeds the status dropdown without showing as a column.
  - Accounting entity excluded. Line dimensions kept: `project`, `costcenter`, `eTADASBpartner` (editable); all other line dimensions discarded.
- `tools/app-shell/src/lib/statusBadge.js` — `getStatusTone` maps `'y'`/`'yes'` → `'success'`; `statusLabel` MAP includes `Y: 'statusProcessed'` and `N: 'statusDraft'` so `DocumentStatusPill` resolves tones and labels for `processed` field values.
- `tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx` — custom lines component. Renders Asset | Amortization % | Amount | Accounting dimensions columns. Per-row and select-all checkboxes for multi-select (disabled, not hidden, in read-only state); shared `LinesSelectionBar` for bulk delete. Circular icon button toggles a white-background expand panel with Organisation (read-only) + 3 dimension selectors — **Project**, **Cost Center**, **Contact** (`DIMENSION_FIELDS`) — auto-saving on `onChange`. `DimSummary` returns `null` (hides the "+ Add dimensions" affordance) when the document is processed and the line has no dimensions; when dimensions exist it always renders read-only "Label: Value" chips. Pencil activates inline editing for 3 core fields (blur-saves; calls `onRefresh` after each save to keep header in sync). Add-line auto-saves the header first when `isNew` (mirrors Sales Order `openAddLine` pattern: saves → navigates to real recordId → useEffect opens inline form on re-mount). New lines include `currency` from header. Footer computed from `lines.reduce()` for immediate accuracy.
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
- **Expandable dimensions panel**: expanding a row reveals a white-background panel (no section title, no filled-count counter) with a read-only Organisation field and dimension selectors. Selectors have a hover background (`#F5F7F9`) on pointer-over. _(Superseded by ETP-4429: the selector set was trimmed to Project, Cost Center, and Contact — see the ETP-4429 section below.)_
- Dimension selectors auto-save on `onChange` — immediate PUT per field, no Save button required.
- When the document is **processed** (`processed='Y'`), dimension selectors are rendered as disabled `<input>` elements with `opacity-50` and `cursor-not-allowed` — visually greyed out to signal that no editing is possible. In draft mode, read-only inputs retain full opacity (`!opacity-100`) to stay visually neutral. This is controlled via the `isCompleted` prop on `DimensionGrid`, passed as `processed` from the parent component.
- **Accounting dimensions column summary**: badges in "Label: Value" format (`#F5F7F9` background, 8px radius, `#3F3F50` label text). Organisation always leads when filled. Up to 2 badges shown; remaining are collapsed into a `+N` badge. Empty rows show a dashed "+ Añadir dimensiones" button.
- **Add line — inline draft row** (Sales Order pattern): clicking "+ Añadir línea" inserts an inline editable row aligned to the table columns. Field placeholders are the column labels (e.g. "Activo", "Amortization %", "Amortization Amount"). Enter saves and keeps the row open for rapid entry; Esc cancels; clicking outside saves (or cancels if empty). The "+ Añadir línea" button stays visible while the draft row is open. The hint "Enter o clic fuera para guardar · Esc para cancelar" (`inlineAddHint`) appears below the table while the draft row is active.
- After any line mutation (create, delete, bulk delete), the component calls `onRefresh()` to trigger `hook.fetchChildren()` in the parent DetailView — this keeps the **Confirmar** button state in sync without a page reload (`hook.children.length > 0` enables the button).
- Delete individual line via trash icon on row hover.
- Dimension fields are also exposed as columns in the list view. _(Superseded by ETP-4429: only Project, Cost Center, and Contact remain — see the ETP-4429 section below.)_

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

## ETP-4429 — Simplified header, hidden create/delete, trimmed line dimensions

This iteration tightens the Amortization window to a read-focused, assets-driven flow. All changes are declared in `artifacts/amortization/decisions.json` (or realised through `AmortizationLinesTable.jsx`) and survive pipeline re-runs.

### List view — create button hidden

- `window.hideCreate: true` — the "New amortization" create button is removed from the list toolbar. Users can no longer start an amortization from the list; documents are created from the **Assets** window via **Create Amortization**. The list toolbar now shows only the status dropdown and the funnel.

### Record header — read-only except Description

- `name`, `accountingDate`, `startingDate`, and `currency` are classified `visibility: "readOnly"` in `decisions.json`, so they are displayed but locked in every state (draft and processed alike). This replaces the previous "editable until processed" behaviour.
- `description` remains the only editable header field in draft; it locks when the document is processed.

### "Others" tab and stale labels removed

- `etblkpAccountingstatus` → `visibility: "discarded"` — removes the empty "Others" tab and its Accounting Status field. It no longer appears in the header.
- `etblkpBulkposting` → `visibility: "discarded"` — removes the stale Bulk Posting label from the summary/footer area (the Bulk Posting button was already excluded via `processOverrides`).

### Footer summary bar removed

- `window.summaryFields: []` — the bottom summary strip is removed. The fields it duplicated already appear in the header form, so the strip was redundant.

### Header Delete button hidden

- `window.hideDeleteButton: true` — the header trash/Delete button is hidden in all states. This is a distinct flag from the previous `hideDeleteWhenComplete` (which only hid Delete once processed); the mechanics of the flag are documented in `docs/ui-customization.md` and `docs/decisions-reference.md`.

### Line accounting dimensions trimmed to three

- The per-line expand panel and the list-view dimension columns now show only **Project**, **Cost Center**, and **Contact**. In `decisions.json` the `lines` entity keeps `project`, `costcenter`, and `eTADASBpartner` (editable, `grid: true`); `stDimension`, `ndDimension`, `eTADASSalesRegion`, `eTADASActivity`, and `eTADASSalesCampaign` are discarded. `AmortizationLinesTable.jsx` reflects the same trimmed set in its `DIMENSION_FIELDS`.
- **Product is not shown** on amortization lines.

### "+ Add dimensions" trigger — conditional on state and content

- `DimSummary` in `AmortizationLinesTable.jsx` hides the dashed "+ Añadir dimensiones" affordance when the document is **processed** and the line has **no** dimensions set — there would be nothing to reveal but disabled fields. On editable documents the affordance still appears for empty lines.
- When a line has at least one dimension set, the value(s) always render as read-only "Label: Value" chips (Organisation leads when present), regardless of document state.

### Manual verification (ETP-4429)

1. Open `/amortization` — confirm there is no create/"New amortization" button in the toolbar; only the status dropdown and funnel are present.
2. Open a draft amortization — confirm Name, Accounting Date, Starting Date, and Currency are read-only and only Description accepts input. Confirm there is no header trash/Delete button and no bottom summary strip.
3. Confirm there is no "Others" tab and no Accounting Status field anywhere in the header.
4. Expand a line — confirm the dimension panel shows exactly Organisation (read-only) + Project, Cost Center, Contact. Confirm no Product selector is present.
5. On a processed document, confirm an empty-dimension line shows no "+ Añadir dimensiones" trigger, while a line with dimensions still displays its value chips.

## Accounting dimension visibility per section — ETP-4529

The ETP-4529 matrix asks for `Amortización | Líneas`: Contacto=**Por config**,
Producto=**Nunca**, Proyecto=**Por config**, Centro de costo=**Por config**.

**Correction to a premise used while scoping ETP-4529 (now resolved):** the ticket's
confirmed scope decisions originally cited this window's `lines.project` as the reference
example of a *working, correctly-wired* `@ACCT_DIMENSION_DISPLAY@` field. That was only half
true. `contract.json` for `lines.project` is correct
(`displayLogic.raw: "@ACCT_DIMENSION_DISPLAY@"`, `evaluable: false`, `reason: "server-macro"`),
but the amortization lines grid never rendered fields via the generic generated
`LinesForm.jsx`/`EntityForm` path — it uses a fully custom component,
`tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx`, whose
`DIMENSION_FIELDS` array (`project`, `costcenter`, `eTADASBpartner`) was **hardcoded with no
`displayLogic`/`hidden` property at all**, so all three rendered unconditionally regardless of
the client's accounting-dimension configuration — matching the "Manual verification" item 4
above (a deliberate ETP-4429 decision), but meaning none of the three was actually
config-gated, `project` included.

**Reworked (follow-up pass) — now uses the same shared, config-aware hook as
`assets.md`.** Per explicit product direction, the fix generalizes this panel's own visual
shape into a reusable mechanism rather than special-casing it:

- `DIMENSION_FIELDS` was renamed `DIMENSION_FIELD_CANDIDATES` (still all three: `project`,
  `costcenter`, `eTADASBpartner` — all three are "Por config" per the matrix, unlike `assets`
  where three of four are "Nunca").
- `AmortizationLinesTable` now calls
  `useAccountingDimensionFields('lines', data, DIMENSION_FIELD_CANDIDATES, { token, apiBaseUrl })`
  once per mount (not per row — dimension-macro visibility is config-driven, not
  line-specific, so one evaluate-display call against the amortization header record is
  shared by every row's `DimSummary` badge list and `DimensionGrid` expand-panel).
- `DimSummary` now takes the resolved `fields` list as a prop instead of closing over a
  module-level constant, so hidden dimensions drop out of both the badge summary and the
  expand-panel consistently.
- **`project`**: raw AD `displayLogic` = `@ACCT_DIMENSION_DISPLAY@` — now genuinely
  config-gated for the first time in this window's history.
- **`costcenter` / `eTADASBpartner`**: raw AD `displayLogic` on the amortization-line tab is
  still **empty** for both (`AD_Field.DisplayLogic` was never wired to
  `@ACCT_DIMENSION_DISPLAY@` at the Application Dictionary level) — a separate, already-tracked
  gap explicitly **deferred** per product direction (to be fixed by a different, already-existing
  ticket that populates the AD_Field and regenerates the contract). Per that direction, this hook
  is wired to *read* whatever `displayLogic.raw` the AD eventually provides rather than hardcoding
  a value — it fails open (stays visible) for both today, exactly like
  `NeoDisplayLogicHelper.evaluateExpression()`'s own fail-open behavior server-side. Once the AD
  change lands and the contract is regenerated, both fields start being correctly gated with
  **zero further changes** needed in `AmortizationLinesTable.jsx` or the hook.
- **`product`**: no product dimension field exists on the amortization-line tab — matrix's
  "Nunca" is already trivially satisfied.

**Tests updated (Tester pass complete).** `AmortizationLinesTable.test.js`'s two assertions
were renamed to "defines DIMENSION_FIELD_CANDIDATES with exactly 3 entries..." and "renders
the project dimension (no hidden: true on any candidate entry)", updated for the
`DIMENSION_FIELD_CANDIDATES` rename, plus a new assertion covering the
`useAccountingDimensionFields('lines', data, DIMENSION_FIELD_CANDIDATES, ...)` wiring.
`AmortizationLinesTable.vitest.jsx` gained coverage for the config-driven filtering
(a candidate dropping out of both `DimSummary` and the expand panel when the evaluator
returns `visibility[key] === false`). All suites pass.

### Header `project` was fully discarded instead of config-gated (ETP-4529 gap fix)

The ETP-4529 matrix's own test case (TC-104: "Activo (Amortizaciones) header shows only
Proyecto, gated by global config — visible when the global Proyecto dimension is enabled,
hidden when disabled") requires the header `project` field to be **config-gated**, not
absent. Confirmed by direct inspection, `header.project` in `decisions.json` was instead
`{"visibility": "discarded", "reason": "Accounting dimension — out of MVP scope, only visible
when @ACCT_DIMENSION_DISPLAY@"}` — the reason text itself described config-gating, but the
`visibility` value made the field **never** visible regardless of config, contradicting TC-104.

`schema-raw.json` confirms the raw AD field (`C_Project_ID`, header entity) carries
`displayLogic: "@ACCT_DIMENSION_DISPLAY@"` and `readOnlyLogic: "@Posted@='Y'"` — the same
config macro used everywhere else in this ticket, plus the standard posted-lock rule other
Amortización header fields already rely on (`decisions.json`'s raw-AD-passthrough
convention).

Fixed by promoting `header.project` from `discarded` to `{"visibility": "editable", "section":
"principal", "reason": "..."}`, matching the exact shape already used for `header.project` on
`sales-invoice`/`goods-shipment`/`purchase-invoice`/`goods-receipt` — no `displayLogic` or
`readOnlyLogic` override, so the raw AD passthrough handles both the config gating and the
posted-lock automatically. Confirmed in the regenerated `HeaderForm.jsx`: `project` now
appears with `section: 'principal'`, `visibilitySource: 'server'` (evaluated against
`@ACCT_DIMENSION_DISPLAY@` at runtime), and `readOnlyLogic: (record) => record['posted'] ===
true`.

### DimBadge/DimSummary/DimensionGrid extracted to a shared component (ETP-4529 follow-up)

`DimBadge`, `DimSummary`, and `DimensionGrid` — the "Dimensiones contables" badge/summary/
expand-grid pattern this window originated — were extracted into
`tools/app-shell/src/components/contract-ui/DimensionsPanel.jsx`, generalized (the
`amortizationDimensionsEmpty`/`amortizationDimensionsTitle` i18n keys became an optional
`emptyLabel` prop plus a generic `dimensionsPanelEmpty` default; `entityName` became a prop
defaulting to `'lines'`), so `InlineLinesPanel`'s new `dimensionsPanel` column type (see
`docs/ui-customization.md` §14b) and any future custom lines table can reuse the exact same
UX. This window was refactored to import from the shared file instead of defining them
locally — a pure extraction, verified against the full existing `AmortizationLinesTable.test.js`
and `AmortizationLinesTable.vitest.jsx` suites (all 31 + 34 assertions pass unmodified), and
this window's own visible behavior/labels are unchanged (it still passes its original i18n
keys through as explicit props).
---

## ETP-4538 — Reactivate replaces Unpost on posted amortizations

- The three-dot menu no longer exposes the independent **Descontabilizar** (`unpost`) action for amortization documents.
- **Reactivar** is visible whenever the document is processed (`processed='Y'`), including records whose accounting status is posted (`posted='Y'`). For posted records, `preUnpost: true` makes the UI call the existing unpost endpoint before triggering the `Processed` action; for unposted records, only the `Processed` action runs. This matches the Etendo Go document lifecycle rule: reactivation is the single user action and accounting reversal is part of that flow.
- Role-based access restrictions for **Reactivar** are deferred until the role permissions model exists.
