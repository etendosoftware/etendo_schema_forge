# Assets

## Theme roles

The generated page, depreciation-progress cell, and artifact custom components
use shared semantic roles. Structural layout consumes card and subtle-border
roles; amortization progress uses success or warning foreground roles. The
window does not declare a local palette, so its appearance follows the active
application theme.

## Intent

The Assets window should let a finance user register fixed assets, define how each asset will depreciate or amortize over time, review the resulting amortization schedule, and inspect the accounting mappings that support depreciation posting and reporting.

## What this window should allow

- Create and maintain asset master records with core identity fields such as Search Key, Name, and Asset Category.
- Capture lifecycle and valuation context, including purchase date, depreciation start/end dates, asset value, residual value, and previously depreciated amounts.
- Decide whether the asset is depreciated at all, then configure the depreciation method:
  - depreciation type
  - calculation type
  - annual depreciation percentage for percentage-based setups
  - amortization frequency and usable life for time-based setups
- Review the amortization schedule for the asset through the Asset Amortization child surface.
- Review the accounting setup for the asset through the Accounting child surface, including the general ledger schema and the accumulated-depreciation/depreciation accounts.
- Trigger the visible amortization-generation action when depreciation is enabled.

## Interaction model

- Route: `/assets` for the list and `/assets/:recordId` for record detail.
- Visibility: visible from the Finance menu as **Assets**.
- Implementation type: generated window route with custom detail surfaces layered into the generated page (`AssetsConfigPanel`, `AssetsAmortizationPanel`, `AssetsSidebar`).
- Window shape: master-child. The master entity is `assets`; the child surfaces are `amortizationLine` and `assetAcct`.
- Detail layout: the detail page uses a sidebar layout, exposes an **Overview** tab plus a **Depreciation Setup** tab, and hides print, more-menu, more-details chrome.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- List toolbar: shows an **"All statuses ▾"** dropdown to filter by `fullyDepreciated` (Fully deprecated / Still in progress) and a funnel icon for the Conditional Filter. The `fullyDepreciated` column is hidden from visual display (`hiddenColumns`) but present in the columns array to power the status dropdown.
- List columns include a **Depreciate** (`IsDepreciated`) Sí/No badge column (green/gray pill, same pattern as Payment Term's "Default" column) between "Purchase Date" and "Depreciation Start Date", filterable via the Conditional Filter's boolean value picker (ETP-4549).

## Reactive behavior and dependencies

- Depreciation setup is explicitly state-driven:
  - When **Depreciate** is off, the depreciation-specific setup is not supposed to be shown.
  - When **Depreciate** is on, the window reveals depreciation type and calculation options.
  - When calculation type is **Percentage**, the setup emphasizes **Annual Depreciation %**.
  - When calculation type is **Time**, the setup reveals **Amortize** and then switches between **Usable Life - Years** and **Usable Life - Months** based on the chosen schedule.
- The asset category selector has a callout attached, so category selection is expected to drive or prefill related depreciation behavior. The repo evidence shows that dependency exists, but it does not fully document every value the callout changes.
- Currency defaults from `@C_Currency_ID@` and becomes read-only once amortization progress already exists (`depreciatedPlan` or `depreciatedValue` greater than zero), which indicates that key monetary context should stop changing after planning starts.
- The **Create Amortization** action is only exposed when the asset is marked as depreciated.
- The amortization footer panel and right sidebar both depend on the current asset record id. They fetch amortization lines with `parentId={assetId}` and sort them by `sEQNoAsset asc`, so the child schedule is expected to stay anchored to the selected asset and appear in sequence order.
- After a successful asset process event (`neo:processSuccess` for the current asset), the amortization footer re-fetches its lines. This is the clearest visible evidence that generating an amortization plan should refresh the schedule immediately in the detail view.
- `AssetsSidebar.jsx` reads `data.etgoAmortizationStatus` (DB-backed integer 0–100, maintained by `ETGO_A_ASSET_AMORT_STATUS_TRG`) for the "Depreciado %" card — no frontend math. `renderDepreciationProgress` in the list table does the same. `AssetsAmortizationPanel.jsx` batch-fetches the `processed` field of each parent amortization document (`/amortization/header/{id}`) to show accurate "Confirmado/Pendiente" badges — the previous heuristic based on `depreciatedValue` was removed because it inverted statuses when individual amortizations were reactivated out of order.
- In the Asset Amortization child surface, editable fields become read-only when the line is processed, which indicates that posted or finalized schedule lines should no longer be freely editable.
- The `GroupDivider` component in `AssetsDetailPanel.jsx` carries `mt-5` so each section heading (Depreciación, Financiero, Fechas, Dimensiones contables) has visible breathing room above the separator line. Without this margin the border-t line was flush against the fields from the previous section.
- In the Accounting child surface, selectors are exposed for general ledger, accumulated depreciation, and depreciation accounts. The current evidence shows selectable mappings, but no additional reactive cross-field behavior is visible.
- No totals, discounts, or tax-style recalculations are visible here beyond depreciation progress, planned amount totals, and sequence-based schedule refresh.

## Gap assessment

- The window clearly exposes depreciation inputs and a **Create Amortization** action, but the repo evidence does not prove the business correctness of the generated depreciation plan itself. The exact calculation rules, rounding behavior, and period generation outcomes should be treated as a gap until verified against a live backend.
- The asset-category callout implies dependency-driven defaulting, but the exact fields it mutates are not explicit in the current evidence. That remains an open ambiguity.
- The accounting child surface shows account mappings, but the current evidence does not prove whether those mappings are required before amortization generation, required before posting, or merely informational.
- The sidebar and footer infer completion/progress from line amounts and depreciated values, but there is no evidence here that those figures are reconciled to accounting postings or to a formal close process.
- The action endpoint for `processAsset` is wired as a classic process, but the success/failure outcomes exposed to the end user are not documented here beyond line refresh on success.
- The contract and generated code show no dedicated browser-level automation for this window, so user-facing behavior across setup, generation, and accounting review still depends on manual verification.

## Manual verification

1. Open `/assets` from the Finance menu and confirm the Assets list renders with a funnel (Advanced Filter) and "Nuevo activo" button only — no "All statuses ▾" status dropdown, no print or more-menu chrome.
2. Open or create an asset and confirm the record starts with core setup fields such as Search Key, Name, and Asset Category.
3. Toggle **Depreciate** off and on and confirm the depreciation setup section appears only when depreciation is enabled.
4. Switch calculation type between percentage-based and time-based setups and confirm the window swaps the expected inputs:
   - percentage path shows **Annual Depreciation %** (label: `assetsAnnualDepreciationLabel`)
   - time path shows **Amortize** and usable-life inputs
4a. **Product** is a plain, always-visible field in the first (Asset Info) section — confirm it appears next to Asset Category regardless of Depreciate state or GL Configuration, and that selecting a product, saving, and reopening the asset persists the value (see "Accounting dimension visibility per section — ETP-4529" below for why Product is not part of the dimensions group).
4b. With **Depreciate** enabled, scroll to the last section and confirm the **Dimensiones contables** group appears **after Dates**, config-gated: it shows a **Project** and/or **Cost Center** selector, each independently, only when the client's accounting-dimension configuration enables that dimension for this org's ledger (ETP-4914 — Cost Center is now also "Por config", not "Nunca"), and disappears entirely when both resolve to not-visible. Open each visible selector and confirm it returns options; select a value, save and reopen the asset — the value persists. Disable **Depreciate** and confirm the dimensions section disappears.
5. Save an asset with depreciation enabled and confirm the **Create Amortization** action is available.
6. Trigger **Create Amortization** against a live backend and confirm the amortization plan tab refreshes and shows ordered schedule rows. Confirm that line status badges read "Pendiente" (not "Planificado") and "Confirmado" (not "Procesado").
7. Review the right sidebar and confirm it shows four cards in order: Valor actual → Valor residual → Depreciación planificada → Depreciado %. Confirm that "Progreso de depreciación" is absent. Confirm that the sidebar ends above the tabs row — tabs (Plan de amortización, Adjuntos) span the full width below the form area.
7a. In the Amortization Plan tab, click the **Período** link on any row and confirm it navigates to `/amortization/{id}`, opening the corresponding amortization document. Clicking elsewhere on the row does not navigate.
8. Open the **Asset Amortization** child surface and confirm line ordering follows sequence number, with processed rows becoming non-editable.
9. Open the **Accounting** child surface and confirm the record exposes selectors for general ledger, accumulated depreciation, and depreciation accounts.
10. If amortization lines already exist, confirm the asset currency can no longer be edited.
11. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## ETP-4190 changes (feature/ETP-4190)

### Section divider spacing fix

- `AssetsDetailPanel.jsx` — `GroupDivider` wrapper now includes `mt-5`. This adds 20 px of top margin before the `border-t` line that separates each configuration group (Depreciation, Financial, Dates, Accounting dimensions). Previously the line sat flush against the fields above it with no visual gap.

## Automated evidence

- `tools/app-shell/src/menu.json` exposes **Assets** in the Finance menu and routes the slug to `/assets`.
- `tools/app-shell/src/windows/registry.js` registers `assets` as a generated window route.
- `artifacts/assets/generated/web/assets/AssetsPage.jsx` wires the master/detail page, hides list-filter and print chrome, sets the detail sort to `sEQNoAsset asc`, adds the **Depreciation Setup** tab, and injects the custom sidebar and amortization footer.
- `artifacts/assets/contract.json` defines:
  - the `processAsset` action override as **Create Amortization** with display logic tied to `Depreciate`
  - display logic for depreciation fields
  - currency defaulting and read-only logic once amortization progress exists
  - child CRUD surfaces for `amortizationLine` and `assetAcct`
  - selector endpoints for asset category, currency, amortization, accounting schema, accumulated depreciation, and depreciation accounts
  - generated validation entries covering field presence, types, read-only/display logic, CRUD flags, and selector endpoints for the assets, amortizationLine, and assetAcct entities
- `tools/app-shell/src/windows/custom/assets/AssetsConfigPanel.jsx` implements the visible setup logic that switches fields based on depreciation and calculation choices. All field labels — including currency, purchase/cancellation/depreciation dates, asset value, residual value, depreciation amount, previously depreciated amount, and **annual depreciation percentage** (`assetsAnnualDepreciationLabel`) — are resolved through `useUI()` with keys registered in both `en_US` and `es_ES` locales. On new records, a `useEffect` calls `onChange('currency', data.currency)` on mount to register the backend-defaulted currency value in the form's change tracking — preventing it from being silently dropped on first save. The currency default expression `@C_Currency_ID@` is configured in `artifacts/assets/decisions.json` and pushed to `ETGO_SF_FIELD.DefaultValue` so the NEO `/defaults` endpoint resolves the org's functional currency for new records.
- `tools/app-shell/src/windows/custom/assets/AssetsAmortizationPanel.jsx` fetches amortization lines by `parentId`, refreshes on `neo:processSuccess`, and renders a table of scheduled lines. Navigation to the Amortization document is scoped to the **Período** cell only — a `PeriodLink` component renders the period identifier as an underlined link with an `ArrowUpRight` icon; clicking elsewhere on the row does nothing. No footer total is shown (the information is already in the "Depreciación planificada" sidebar card).
- `tools/app-shell/src/windows/custom/assets/AssetsSidebar.jsx` reads `data.etgoAmortizationStatus` (the DB-backed percentage) directly — no frontend math. The `depreciatedPlan` variable is kept only for the "Planned Depreciation" monetary card.
- `artifacts/assets/decisions.json` discards `fullyDepreciated` (ISFULLYDEPRECIATED is no longer maintained) and adds `etgoAmortizationStatus` with `cellType: "depreciationProgress"`, `columnType: "number"`, and `filterable: true`. The `statusField: "none"` setting disables the auto-detected status field to prevent the "All statuses" toolbar button from appearing. `labelOverrides` includes `EM_Etgo_Amortization_Status` → `"Estado de amortización"` (es_ES) so the grid column header is translated via `useLabel(labelOverrides)` in `DataTable`.
- `renderDepreciationProgress` in `cli/src/generate-frontend.js` reads `row.etgoAmortizationStatus` directly instead of computing `depreciatedValue / depreciationAmt` on the frontend. It returns `null` (empty cell) only when `pct == null`; assets with a status of `0` render a 0 % bar rather than a blank cell.
- `tools/app-shell/src/windows/custom/assets/__tests__/AssetsTable.test.js` covers the `renderDepreciationProgress` helper, including the case where `pct === 0` (bar rendered at 0% instead of hidden).
- The generated `AssetsPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `A_Asset` AD table.

## ETP-4333 — DeferredInput amount fields and currency-echo freeze fix

### DeferredInput for the three amount fields

`assetValue`, `residualAssetValue`, and `depreciationAmt` now use `calloutOn: 'blur'` in `AssetsDetailPanel.jsx`. `EntityForm` renders these fields via `DeferredInput`: typing only updates a local buffer inside the input; the commit fires on blur, not per keystroke. This prevents the async `SL_Assets` callout from racing against partially-typed values (the "Asset Value 4000 keeps Residual at -2000" race bug).

When the user blurs one of these fields, the commit does **not** fire the async `/assets/callout`. Instead, `AssetsDetailPanel.handleAmountChange` calls the exported `computeAssetAmounts()` function, which replicates the `SL_Assets` Java callout arithmetic locally and synchronously:

- `assetValue` changed: if `depreciationAmt ≠ 0` then `residualAssetValue = assetValue − depreciationAmt`; then `depreciationAmt = assetValue − residualAssetValue`.
- `residualAssetValue` changed: `depreciationAmt = assetValue − residualAssetValue`.
- `depreciationAmt` changed: `residualAssetValue = assetValue − depreciationAmt`.

All three fields are written together via `onLocalChange` (which calls `handleChange` without triggering a callout), so the sidebar "Current Value" and sibling inputs update immediately and consistently. All results are rounded to 2 decimal places via `round2()` (avoids JS float drift).

**Source of truth:** `org.openbravo.erpCommon.ad_callouts.SL_Assets#execute` (lines 43–63 in Etendo Classic). If that Java arithmetic ever changes, `computeAssetAmounts` in `AssetsDetailPanel.jsx` **must** be updated in sync — they are not automatically linked.

### Currency-echo freeze fix

`AssetsDetailPanel` contains a `useEffect` that echoes the backend-provided default currency (`@C_Currency_ID@`) into the form change handler exactly once per new-record session. Without a guard, this creates a passive-effect feedback loop:

> `onChange` fires → `setEditing` updates identity → new `onChange` reference is created → effect re-runs because `onChange` was in its deps → repeat

Because this cycles through React's passive-effect phase (one commit per frame), it never trips the synchronous "Maximum update depth" guard — it silently starves the render queue and freezes route transitions (Cancel and sidebar navigation stop unmounting the detail view).

The fix uses two `useRef` guards:
- `currencyEchoedRef` — set to `true` after the first echo; reset to `false` when the record gains an `id` (saved, no longer a new record).
- `onChangeRef` — stores the latest `onChange` so it can be called inside the effect without being listed in the dependency array.

The effect only re-runs when `isNewRecord` or `d.currency` changes, not when `onChange` identity rotates.

### Tests

- `tools/app-shell/src/windows/custom/assets/__tests__/AssetsDetailPanel.test.js` — unit tests for `computeAssetAmounts` covering all three field paths and the `round2` rounding.
- `tools/app-shell/src/windows/custom/assets/__tests__/AssetsDetailPanelCurrencyEcho.vitest.jsx` — regression test for the currency-echo freeze fix: verifies the effect fires exactly once per new-record session and does not loop.

## ETP-4103 changes

Changes landed in `feature/ETP-4103`. Covers visual polish, full-form restructure, sidebar updates, and list-view adjustments specific to the Assets window.

### Visual polish

- `toolbarBorderBottom: true` in `decisions.json` — adds a horizontal divider line below the toolbar buttons row.
- `sidebarClassName: "w-[30%] shrink-0 overflow-y-auto border-l border-[#E8EAEF] p-2"` in `decisions.json` — sidebar is now proportional (30% of detail width) with a left-border divider and 8 px internal padding. Previously fixed at `w-96`.
- `toolbarButtonSize: "default"` in `decisions.json` — toolbar buttons (including the kebab menu) are now `h-10 w-10`, matching the Contacts window. Previously `sm` (`h-9`).
- `listbarPaddingX: "px-2"` and `tablePaddingX: "px-2"` in `decisions.json` — list-view toolbar and table horizontal padding reduced from 24 px to 8 px.
- `tools/app-shell/src/windows/custom/assets/AssetsSidebar.jsx` — outer `rounded-2xl border bg-white shadow-sm` card wrapper removed; the sidebar `border-l` divider from `sidebarClassName` makes the wrapper border redundant.
- `whiteFormBackground: true` in `decisions.json` — forces white background on form inputs and textareas, overriding the `bg-[#F5F7F9]` default on inputs and `bg-background` on textareas. Disabled textareas use `opacity-50` instead of `bg-muted/50` for visual consistency.
- `compactSidebarPadding: true` in `decisions.json` — reduces the detail content wrapper padding to `p-2` (8 px) instead of `pl-6 pr-2`. This prop is scoped exclusively to Assets.
- `tools/app-shell/src/windows/custom/assets/AssetsConfigPanel.jsx` — outer container classes updated to `bg-white [&_input]:bg-white [&_textarea]:bg-white [&_textarea:disabled]:!bg-white [&_textarea:disabled]:opacity-50`, ensuring white field backgrounds in the Depreciation Setup tab consistent with `whiteFormBackground`.

### Form structure (AssetsDetailPanel.jsx)

- `primaryTabs` removed from `decisions.json` — the "General" / "Depreciation Setup" tab selector no longer exists; the window opens directly to a unified form.
- `AssetsDetailPanel.jsx` added at `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` — custom `formFooter` component that renders all fields in four grouped sections. Replaces both the standard `EntityForm` and `AssetsConfigPanel` as the primary form UI.
- Group 1 (Asset Info): renders searchKey, name, assetCategory, description in a 4-column grid **without a subtitle or GroupHead** — the `assetsGroupInfoTitle` title was removed. Fields render inline.
- Group 2 (Financial Info): currency, assetValue, residualAssetValue, depreciationAmt, previouslyDepreciatedAmt — moved **inside** Group 3 (Depreciation Config). It only appears when `depreciate=true`. When depreciation is disabled, only the ToggleCard and a disabled hint text are shown.
- Group 3 (Depreciation Config): ToggleCards + conditional depreciation fields. Financial Info (Group 2) is nested here, visible only when `depreciate=true`. The `ToggleCard` switch now renders the shared `PillToggle` component (`@/components/PillToggle`) instead of an inline `<button role="switch">` — same size/colors/behavior (disabled while not editing), deduped with the match-rule footer and grid toggles. No behavior change.
- Group 4 (Dates): still visible only when `depreciate=true`.
- Group 5 (Accounting dimensions): **last section**, visible only when `depreciate=true`. Title key `assetsGroupDimensionsTitle` ("Dimensiones contables" / "Accounting dimensions"). Renders the dimension selectors in a 4-column grid (`cols={4}`) via `EntityForm`, placed after Dates because it is optional. The grid wrapper forces white backgrounds on selectors (`[&_button[role=combobox]]:!bg-white [&_input]:!bg-white`). _(Superseded by ETP-4429: the selector set is now Project, Cost Center, Business Partner, and Product — see the ETP-4429 section below.)_
- All header fields set to `form: false` in `decisions.json` — the standard `EntityForm` renders nothing. `hideFormCard: true` hides the now-empty card. The dimension fields are set to `visibility: editable, form: false` in `decisions.json` so they are registered in the NEO spec (`ETGO_SF_FIELD`) — required for the `/assets/selectors/<column>` endpoints to return options — without being rendered by the standard form. `project` was previously `discarded` and is now re-enabled.
- Dimension labels resolved via `window.labelOverrides` (es_ES + en_US) in `decisions.json`, mapping each dimension column (e.g. `EM_Etadas_Costcenter_ID` → "Centro de coste" / "Cost Center"); `EntityForm` resolves them through `t(column)` against `api.labelOverrides`.
- `AssetsAmortizationPanel` moved from `formFooter` to a secondary tab — declared via `window.customPanelTabs` in `decisions.json`; appears as the first secondary tab "Plan de amortización" (before Attachments); reports line count via `onCountChange` for the tab badge.
- `hideFormCard` prop added to `DetailView.jsx` (default `false`) — when `true`, adds a `hidden` class to the form card wrapper; safe for all other windows because the default is `false`.
- `customPanelTabs` support added to the generator (`generate-frontend.js` + `resolve-curated.js`) — accepts an array of `{ key, labelKey, component }` entries under `window` config; each entry is imported from the custom directory and added as a `customTab` with `placement: 'tab'`, before Attachments in tab order.
- `contentBg` changed to `bg-white` — the detail content area background is now white (was `bg-slate-50`).
- `AssetsAmortizationPanel.jsx` — internal title/description header removed; table uses system design tokens (`text-foreground`, `border-border/50`) matching DataTable style; horizontal padding removed (`px-5` dropped).

### Sidebar (AssetsSidebar.jsx)

- `sidebarAboveTabsOnly: true` in `decisions.json` — sidebar is now positioned **only** alongside the form area, NOT alongside the tabs section. Tabs (Plan de amortización, Adjuntos, Otros) now occupy full width below the form.
- "Progreso de depreciación" ProgressCard **removed** from the sidebar.
- "Valor residual" MetricCard **added** between "Valor actual" and "Depreciación planificada".
- Sidebar card order: Valor actual → Valor residual → Depreciación planificada → Depreciado %.
- "Valor actual" MetricCard uses `bg-blue-50` tint (was neutral gray).

### List view

- `dot: false` on `depreciationStartDate` column — "Fecha inicio" shows only the date value, no colored dot indicator.
- `fullyDepreciated` field: **discarded** — `ISFULLYDEPRECIATED` is no longer maintained by the core and has been replaced by `EM_ETGO_AMORTIZATION_STATUS`.
- List toolbar now shows only: funnel (Advanced Filter) + "Nuevo activo" button. No status dropdown.

#### ETP-4103 — DB-backed depreciation progress (`EM_ETGO_AMORTIZATION_STATUS`)

- New column `EM_ETGO_AMORTIZATION_STATUS` (Number, default 0) added to `A_ASSET` via `com.etendoerp.go`. Registered as AD element/column and exposed as `etgoAmortizationStatus` through NEO Headless.
- Maintained by `ETGO_A_ASSET_AMORT_STATUS_TRG` — a `BEFORE INSERT OR UPDATE` trigger that computes: `LEAST(ROUND((DEPRECIATEDVALUE + DEPRECIATEDPREVIOUSAMT) / AMORTIZATIONVALUEAMT * 100), 100)`. Returns 0 when `AMORTIZATIONVALUEAMT` is null or zero. `DEPRECIATEDPREVIOUSAMT` is included because `DEPRECIATEDVALUE` only tracks what the Etendo plan has processed — previously depreciated amounts are stored separately.
- `decisions.json`: `etgoAmortizationStatus` → `cellType: "depreciationProgress"`, `columnType: "number"`, `filterable: true`. `statusField: "none"` disables the toolbar status dropdown. `fullyDepreciated` → `visibility: "discarded"`.
- `renderDepreciationProgress` (generator) and `AssetsSidebar.jsx` both read the DB value directly — no frontend math.
- **Backfill** existing assets once per environment after installing the trigger:
  ```sql
  UPDATE public.a_asset
  SET em_etgo_amortization_status = CASE
      WHEN COALESCE(amortizationvalueamt, 0) = 0 THEN 0
      ELSE LEAST(ROUND((COALESCE(depreciatedvalue, 0) + COALESCE(depreciatedpreviousamt, 0)) / amortizationvalueamt * 100), 100)
  END;
  ```


### Amortization plan tab — badge labels

- Status badge "Planificado" renamed to **"Pendiente"** (i18n key `assetsStatusPlanned`).
- Status badge "Procesado" renamed to **"Confirmado"** (i18n key `assetsStatusProcessed`).

## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; this window has no required header fields so the array is empty and there is no behavioral change.
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.

## ETP-4229 — Fix spec assets: defaults + depreciationEndDate callout

### Default values fix

- `decisions.json`: `depreciate` field now has `defaultExpr: "Y"` — `neo_defaults` returns `depreciate: true` (boolean, coerced from Yes/No column). Previously returned null.
- `decisions.json`: `calculateType` field now has `defaultExpr: "TI"` — `neo_defaults` returns `calculateType: "TI"` (Time-based). Previously returned `"PE"` (Percentage), which was the wrong default for the standard amortization flow.
- Both values are written to `ETGO_SF_FIELD.DefaultValue` via `push-to-neo.js` and persisted to `src-db/database/sourcedata/ETGO_SF_FIELD.xml` via `export.database`.

### depreciationEndDate auto-computation (AssetsHandler)

- `decisions.json`: `entities.assets.javaQualifier: "assetsHandler"` — wires the `AssetsHandler` CDI bean to the assets entity via `ETGO_SF_ENTITY.JAVA_QUALIFIER`.
- `AssetsHandler.java` (com.etendoerp.go): new `NeoHandler` that auto-computes `depreciationEndDate = depreciationStartDate + usableLifeMonths` on every POST and PATCH that touches either source field.
  - **POST**: both `depreciationStartDate` and `usableLifeMonths` must be present in the body. Computes and injects `depreciationEndDate` before the record is persisted.
  - **PATCH (partial update)**: fires whenever either source field is in the diff body. The missing field is loaded from the persisted record via `OBDal.getInstance().get(Asset.class, recordId)`, so single-field edits (e.g., only changing `usableLifeMonths`) still trigger a recompute.
  - Date arithmetic uses `java.time.LocalDate.plusMonths()`. The persisted `Date` is formatted via `SimpleDateFormat("yyyy-MM-dd")` (consistent with the rest of the module; avoids `java.sql.Date.toInstant()` which throws `UnsupportedOperationException`).
  - `depreciationEndDate` must remain `visibility: editable` in the spec — if reclassified to `readOnly`, the PATCH write is filtered by `NeoFieldFilter.filterWriteRequest` and the recompute silently stops persisting. Move the write to `afterHandle()` if that classification ever changes.

## ETP-4232 — businessCritical advisory flag on depreciation fields

### What changed

- `decisions.json`: 12 fields marked `businessCritical: true` — these are the fields
  an AI agent must confirm with the user before creating or updating an asset, because
  they represent business or fiscal decisions that the ERP cannot infer automatically:
  `assetCategory`, `depreciationType`, `calculateType`, `annualDepreciation`,
  `amortize`, `usableLifeYears`, `usableLifeMonths`, `depreciationStartDate`,
  `assetValue`, `residualAssetValue`, `depreciationAmt`, `previouslyDepreciatedAmt`.
- `contract.json` and `contract.mcp.json` regenerated to reflect the flag.

### What this does NOT change

- No UI behavior is affected. The flag is advisory metadata only: it surfaces in the
  `neo_schema` MCP response (`businessCritical: true/false` per field) so that AI
  agents know which fields to ask for explicitly. The window renders identically.
- `depreciationEndDate` is intentionally excluded — it is auto-computed by
  `AssetsHandler` from `depreciationStartDate + usableLifeMonths` and should not be
  requested from the user.

## ETP-4402 — Fix orphaned Accounting tab (feature/assets-accounting)

### What was wrong

The `assetAcct` entity (AD_Tab 800190, table `A_Asset_Acct`, holding the general ledger
schema plus the accumulated-depreciation and depreciation account combinations) was fully
generated at the data layer — `contract.json` defined its fields, selector endpoints, and
validations, and `artifacts/assets/generated/web/assets/AssetAcctTable.jsx` /
`AssetAcctForm.jsx` existed and compiled cleanly — but `window.secondaryTabs` in
`decisions.json` was an empty object (`{}`). Nothing in `decisions.json` referenced the
`assetAcct` entity as a tab, so `generate-frontend.js` never imported `AssetAcctTable` /
`AssetAcctForm` into `AssetsPage.jsx`, and the Accounting child surface never rendered in
the running app. It looked "already done" from the artifacts alone (fields classified,
components generated, contract tests passing), but the tab itself was unreachable —
generated-but-unmounted. Live screenshots confirmed only **Plan de amortizacion**
(the unrelated `amortizationLine`/`AssetsAmortizationPanel` surface, wired via
`customPanelTabs`) appeared in the tab strip; there was no Accounting tab at all.

### The fix

Added an entry to `window.secondaryTabs` in `decisions.json`:

```json
"secondaryTabs": {
  "assetAcct": {
    "tabOrder": 1,
    "label": "Accounting",
    "addLineFields": ["accountingSchema", "accumulatedDepreciation", "depreciation"],
    "requireSavedRecord": true
  }
}
```

No `customTable`/`customForm` override was needed — omitting them makes the generator
default to the exact `AssetAcctTable`/`AssetAcctForm` naming that was already generated
from the `assetAcct` entity, the same convention used by `contacts`' `secondaryTabs.contact`
and `secondaryTabs.bankAccount`. `secondaryTabs` is the correct mechanism here (full generic
grid + add-line form for a child entity), as opposed to `customPanelTabs` (used by
`amortizationPlan`), which mounts an arbitrary hand-written component with no grid/form
scaffolding — unnecessary since the generic Table/Form pair already existed and needed no
custom rendering logic.

Field visibility inside `assetAcct` was verified against the AD and left unchanged:
`accountingSchema` (`C_AcctSchema_ID`) is `isupdateable = 'N'` at the AD level and correctly
classified `readOnly` after creation; `accumulatedDepreciation` and `depreciation` are
`isupdateable = 'Y'` and correctly classified `editable`. All three are exposed as selectors
in the add-line mini-form so a new accounting mapping row can be created with all three
values set once, then the accounting schema locks.

No new i18n keys were required — `label: "Accounting"` resolves through `tMenu()` against
the existing `menus.Accounting` / `tabs.Accounting` entries already present in both
`en_US.json` and `es_ES.json` ("Accounting" / "Contabilidad").

### Automated evidence (post-fix)

- `artifacts/assets/generated/web/assets/AssetsPage.jsx` now imports `AssetAcctTable` and
  `AssetAcctForm` from `'./AssetAcctTable'` / `'./AssetAcctForm'` and lists them in
  `secondaryTabs={[{ key: 'assetAcct', label: 'Accounting', Table: AssetAcctTable, Form: AssetAcctForm, ... }]}`,
  alongside the pre-existing `customTabs` entries for `amortizationPlan` and `attachments`.
- `node cli/src/validate-pipeline.js --scope=assets` reports 0 violations.

## ETP-4334 — Visual & toolbar refinements (feature/ETP-4334)

Window-scoped polish plus two cross-cutting changes. Items flagged **(global)** affect
all windows; everything else is scoped to Assets via `decisions.json` or a custom component.

### Window-scoped changes

- `decisions.json` — `purchaseDate` now has `"dot": false`, removing the red status dot
  from the grid cell (same treatment already applied to `depreciationStartDate`). The dot
  was meaningless for this date column.
- `decisions.json` — `"tabsSeparator": true` added. Draws a full-width `border-b` between
  the form/sidebar region and the secondary tabs (Amortization Plan / Attachments),
  spanning across the sidebar column too. Only takes effect together with the existing
  `sidebarAboveTabsOnly` + sidebar content (both already present). See the generator note below.
- `decisions.json` — `"formScrollPaddingX": "px-2"` added. The detail content container
  (form + sidebar + tabs) now uses 8 px horizontal padding instead of the `px-6` (24 px)
  default. `formScrollPaddingX` was already a generator passthrough; Assets simply did not
  set it before.
- `tools/app-shell/src/windows/custom/assets/index.jsx` — **new** custom wrapper (mirrors
  the generated `index.jsx`) that passes `saveBeforeProcesses` to `AssetsPage`. This renders
  the **Save** button before the process buttons (e.g. **Create Amortization**) in the
  toolbar, so the order becomes `[delete] [Save] [Create Amortization]`. The flag is kept out
  of the global generator vocabulary on purpose — it is an Assets-only toolbar preference.
- `tools/app-shell/src/windows/registry.js` — `assets` entry added to `customLoaders` so the
  route resolves to the custom wrapper above (overrides the generated `windowLoaders` entry;
  `customLoaders` wins). `registry.js` is hand-maintained / pipeline-appended, so the override
  survives regeneration.
- `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` — the Depreciation Config
  grid is now always `grid grid-cols-2 gap-4` (was `grid-cols-1 max-w-sm` when depreciation
  was off). The **Depreciate** ToggleCard previously resized when toggled because the grid
  switched column templates; it now keeps a constant width in both states, and the
  **Every month is 30 days** card simply appears in the second column when depreciation is enabled.

### Cross-cutting changes

- `cli/src/generate-frontend.js` + `cli/src/resolve-curated.js` — `tabsSeparator` wired as a
  first-class `decisions.json` window prop (passthrough + `fragmentIf` emission, mirroring
  `sidebarAboveTabsOnly`). Additive: defaults to `false`, so no other window's generated
  output changes. Consumed by `DetailView.jsx` (the full-width border only renders when
  `sidebarAboveTabsOnly && sidebarContent && tabsSeparator`).
- **(global)** `tools/app-shell/src/components/contract-ui/DetailView.jsx`
  (`renderExistingRecordSaveAction`) — the existing-record **Save** button now uses the
  `Save` (floppy) icon with the light/outline style (`variant="outline"`,
  `bg-white border-[#D1D4DB] text-[#121217]`, icon color `#64748B`) instead of the `Check`
  icon on the dark primary button. This affects **all non-draft windows** and aligns the
  existing-record Save with the new-record Save (which already used the floppy icon) and the
  draft-mode "Save Draft" button.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — new `saveBeforeProcesses`
  prop (default `false`). When set, `renderSaveActions` is rendered before the process-button
  block instead of after it. Default-off, so no behavioral change for any other window.
  (ETP-4542 Bloque 2 later extended this same flag to also silently save before running a
  process — see the "ETP-4542 (Bloque 2)" section below.)

## ETP-4335 — Amortization status bar fix, plan tab row selection, and Search Key list column (feature/ETP-4335)

### Amortization status bar — 0% renders instead of blank

`renderDepreciationProgress` in `cli/src/generate-frontend.js` (line 327 template) previously
returned `null` when `pct === 0`, leaving the grid cell empty for assets with no amortization
progress yet. The guard was tightened to `pct == null`, so the function only hides the cell
when the status field is genuinely absent. Assets with a DB-backed `etgoAmortizationStatus`
of `0` now show a 0 % progress bar.

- **File changed:** `cli/src/generate-frontend.js` — `renderDepreciationProgress` template
- **Generated output updated:** `artifacts/assets/generated/web/assets/AssetsTable.jsx`
- **Test added:** `tools/app-shell/src/windows/custom/assets/__tests__/AssetsTable.test.js` —
  new case "renders bar at 0% instead of hiding it when pct is 0"

The `AssetsSidebar.jsx` "Depreciado %" card is unaffected — it reads the same
`etgoAmortizationStatus` field but delegates rendering to `ProgressCard`, which already
handled zero correctly.

### Amortization Plan tab — row selection and bulk delete

`AssetsAmortizationPanel.jsx` now supports full row selection on the "Plan de amortización"
tab, using the same shared `SelectionToolbar` component as Sales Order and Physical Inventory.

**Select-all checkbox** — first column header contains a `Checkbox` with three states:
unchecked (nothing selected), checked (all rows selected), and indeterminate (some rows
selected). Driven by `allSelected` / `someSelected` flags derived from the `selectedRows` Set
and the current `lines` array length.

**Per-row checkbox** — each row has a `Checkbox` in the first column. Clicking toggles the
row's id in `selectedRows`.

**`SelectionToolbar` floating bar (ETP-4972)** — rendered via portal to `document.body` with
true `position: fixed` coordinates (bottom-center of the viewport, `bottom: 24px; left: 50%;
transform: translateX(-50%)`) — no rect-measuring, no `ResizeObserver`/`barAnchorRef`. (An
earlier version of this component tracked the bar's position off a `ResizeObserver` on a
`barAnchorRef` sentinel div in the table container — the same anchor-rect pattern the old,
now-retired `LinesSelectionBar` used everywhere; it broke once the sentinel scrolled out of
view on a long list. `SelectionToolbar` owns its position outright, so that bug class cannot
recur here.) Appears when `selectedRows.size > 0`, with a 250 ms exit animation when
selection drops to zero. Displays selection count, an icon-only red **Delete** button (no
visible "Eliminar" label, `title` tooltip only — ETP-4972 Figma-driven restyle), and the
shell's own built-in **Close** (×) button.

**Bulk delete** — `handleDeleteSelected` fires `Promise.allSettled` with parallel `DELETE
/amortizationLine/{id}` requests for every selected row id. On completion, selection is
cleared and `fetchLines()` is called to refresh the table. The delete button shows a
loading spinner (`deleting` flag) while requests are in flight.

**Automatic selection clear** — a `useEffect` on `[lines]` calls `setSelectedRows(new Set())`
whenever the lines array is replaced (e.g. after "Create Amortization" triggers a
`neo:processSuccess` refresh). This prevents stale ids from persisting across plan
regenerations.

- **File changed:** `tools/app-shell/src/windows/custom/assets/AssetsAmortizationPanel.jsx`

### Search Key — first column in the assets list view

`searchKey` already had `"searchable": true` and `"form": false` in `decisions.json`. Adding
`"grid": true` registers it as a visible list column. Because the `columns` array in the
generator output preserves the field order from `decisions.json`, and `searchKey` is the first
field declared under `entities.assets.fields`, it becomes the first entry in the generated
`columns` array.

- **File changed:** `artifacts/assets/decisions.json` — `searchKey` field gains `"grid": true`
- **Generated output updated:** `artifacts/assets/generated/web/assets/AssetsTable.jsx` —
  `searchKey` is now the first column in the `columns` array, appearing as **Search Key** in
  the list/grid view

## ETP-4336 — Cosmetic required asterisk on conditionally-required fields

`AssetsDetailPanel.jsx` sets `requiredVisual: true` on 6 field literals so their labels show
the red `*` while editing, even though the fields are not declared `required: true`:

- `currency` ("Moneda")
- `depreciationAmt` ("Valor a amortizar" — column `Amortizationvalueamt`)
- `annualDepreciation` ("% Amortización anual")
- `usableLifeYears` ("Vida útil - Años")
- `usableLifeMonths` ("Vida útil - Meses")
- `depreciationStartDate` ("Fecha inicio")

This is purely cosmetic — `EntityForm` does not enforce validation from `requiredVisual`, only
from `required`. It exists because these fields' real obligatoriness is **conditional** on
"Tipo de cálculo" (`calculateType`, Time vs. Percentage): e.g. `usableLifeYears` is only
mandatory when calculation type is "Time" and the schedule is yearly, so a real
`required: true` would incorrectly block submission when the field is hidden or not yet
applicable. `assetValue` ("Valor del activo") does **not** carry the flag. The asterisk only
renders while editing — the panel marks these fields read-only in view mode, and `EntityForm`
gates the marker on `!isReadOnly`.

`requiredVisual` is a reusable `EntityForm` field-descriptor prop, not a `decisions.json`
option — see `docs/ui-customization.md` for the generic reference.

## ETP-4336 — Amortization Plan total footer

`AssetsAmortizationPanel.jsx` now renders a `<tfoot>` row under the plan lines table showing
the accumulated total of the **Amount** column — the sum of `amortizationAmount` across all
fetched lines, formatted with `formatCurrency(orgCurrency, ...)`. This is a hand-authored
`<table>` (not the generic `DataTable`), so the footer is implemented directly in the panel.

- The total cell is left-aligned, matching the rest of the Amount column in this panel —
  numbers here are left-aligned by design, unlike right-aligned amount columns elsewhere.
- The footer only renders when there is at least one plan line (`lines.length > 0`); the
  empty-state and loading branches show no table at all.
- **Alert color rule:** the total renders in `text-red-500` when it does **not** match the
  asset's "amount to amortize" — `data.depreciationAmt` (column `Amortizationvalueamt`, the
  "Valor a amortizar" field). Both values are rounded to 2 decimals before comparison, with a
  `0.005` tolerance for float drift (`amortizationTotalMismatch` in the component). When
  `depreciationAmt` is `null`/`undefined`, the alert is never forced — the total renders in the
  normal `text-foreground` color.

- **File changed:** `tools/app-shell/src/windows/custom/assets/AssetsAmortizationPanel.jsx`

## ETP-4429 — Product added to accounting dimensions, dimension set trimmed

This iteration adjusts the **Accounting dimensions** group (Group 5) in the Depreciation Setup form. Changes are declared in `artifacts/assets/decisions.json` and rendered by `AssetsDetailPanel.jsx`.

### Product added to the dimensions panel

- A **Product** selector (column `M_Product_ID`, `reference: 'Product'`) is added to the `dimensionFields` array in `AssetsDetailPanel.jsx` and now loads and selects product data correctly through the `/assets/selectors/M_Product_ID` endpoint.
- In `decisions.json`, the `product` field is classified `visibility: "editable", form: false` so it is registered in the NEO spec (`ETGO_SF_FIELD`) — powering the selector endpoint — without being rendered by the standard form. `labelOverrides` maps `M_Product_ID` → "Producto" (es_ES) / "Product" (en_US).

### Dimension set trimmed to four

- The Accounting dimensions group now shows exactly four selectors, in this order: **Project** (`C_Project_ID`), **Cost Center** (`EM_Etadas_Costcenter_ID`), **Business Partner** / Contacto (`C_BPartner_ID`), and **Product** (`M_Product_ID`).
- The previously-shown dimensions — **1st Dimension** (`eTADASUser1`), **2nd Dimension** (`eTADASUser2`), **Sales Region** (`eTADASSalesRegion`), **Activity** (`eTADASActivity`), and **Sales Campaign** (`eTADASSalesCampaign`) — are `visibility: "discarded"` in `decisions.json` and no longer appear.

### Manual verification (ETP-4429)

1. Open an asset with **Depreciate** enabled and scroll to **Dimensiones contables**. Confirm exactly four selectors are shown: Project, Cost Center, Business Partner, Product — no 1st/2nd Dimension, Sales Region, Activity, or Sales Campaign.
2. Open the **Product** selector and confirm it returns product options. Select a product, save, and reopen the asset — confirm the product value persists.

## Accounting dimension visibility per section — ETP-4529

The ETP-4529 matrix asks for `Activo (Amortizaciones) | Cabecera`: Contacto=**Nunca**,
Producto=**Nunca**, Proyecto=**Por config**, Centro de costo=**Nunca**.

**Reworked (follow-up to the initial ETP-4529 pass) — the panel is now config-driven.**
The "Dimensiones contables" group (see the ETP-4429 section below) used to render a
**hardcoded** `dimensionFields` array (`project`, `eTADASCostCenter`, `businessPartner`,
`product`) unconditionally whenever `depreciate === true`, ignoring the generated
contract's `displayLogic`/`visibility` entirely — a recent, deliberate ETP-4429 decision
("Product added to accounting dimensions, dimension set trimmed") that directly conflicted
with this matrix. Resolved by reversing ETP-4429's "always show all 4" behavior in favor of
the matrix, using the ETP-4429 panel's own visual shape as the template for a shared,
reusable mechanism (per explicit product direction):

- `AssetsDetailPanel.jsx`'s dimension field list is now `dimensionFieldCandidates = [project]`
  only — `businessPartner`, `product`, `eTADASCostCenter` were removed as candidates
  entirely (Nunca; matches `decisions.json`, where all three are now `visibility: "discarded"`
  with an ETP-4529 reason).
- The candidate list is filtered through the new shared hook
  `tools/app-shell/src/hooks/useAccountingDimensionFields.js`, which calls the same
  `useDisplayLogic('assets', data, { token, apiBaseUrl })` evaluator DetailView uses for
  generated windows (`POST /sws/neo/assets/assets/evaluate-display` →
  `NeoDisplayLogicHelper` → `DynamicExpressionParser` →
  `DimensionDisplayUtility.computeAccountingDimensionDisplayLogic()`), instead of a static
  array. `project`'s raw AD display logic (`@$Element_PJ@='Y' & @IsDepreciated@='Y'`) is
  resolved server-side against the client's real accounting-dimension configuration.
- The "Dimensiones contables" heading and grid are now both gated on
  `depreciate && dimensionFields.length > 0` — the whole section disappears cleanly when
  `project` resolves to not-visible (e.g. Project dimension disabled for that client),
  instead of showing an empty-looking grid.
- **Net effect:** when the client's config happens to enable the Project dimension, this
  panel looks exactly like it did before (single "Project" selector shown, same 4-column
  grid styling) — but it now actually responds to the client's dimension configuration
  instead of being permanently hardcoded, and it no longer shows Contacto/Centro de costo
  at all (per the matrix). Producto's own matrix value changed after this pass — see
  "Producto corrected to Siempre" below.

This is the reference pattern used by the same shared hook in `amortization.md`'s
`AmortizationLinesTable.jsx` rework.

**Tests updated (Tester pass complete).** `AssetsDetailPanel.test.js`'s field-definition
assertion now reads "defines only Project as a dimension field candidate (ETP-4529)" (checks
`dimensionFieldCandidates` and asserts the 3 dropped dimensions are absent) plus a new
assertion covering the `useAccountingDimensionFields` wiring. `AssetsDetailPanel.vitest.jsx`
gained coverage for the config-driven filtering (dimension hidden when the evaluator returns
`visibility.project === false`, section gated on `dimensionFields.length > 0`). All suites
pass against the 1-field (`project`-only), config-driven behavior.

### Header (`assets` entity) section placement fix (ETP-4529 follow-up)

`assets.project` (this window's header-equivalent entity is named `assets`, not `header`) had
`"section": "other"` instead of `"section": "principal"`. Fixed by changing `section` to
`"principal"` in `decisions.json` and regenerating; confirmed in `contract.json`
(`section: "principal"`) and in the generated `AssetsForm.jsx`.

### Producto corrected to Siempre (ETP-4529 follow-up)

The accounting-dimension matrix source was corrected after the initial ETP-4529 pass above:
`Activo (Amortizaciones) | Cabecera` now reads Contacto=**Nunca**, Producto=**Siempre**,
Proyecto=**Por config**, Centro de costo=**Nunca** (Producto was previously, incorrectly,
**Nunca**). Producto is a plain business field (which product this asset represents) and was
never a GL-config-gated accounting dimension like Project/Cost Center/Business Partner, so it
does not join the "Dimensiones contables" panel at all — it is now always shown.

- `decisions.json`: `assets.product.visibility` changed from `discarded` to `editable`
  (`section: "principal"`), matching its natural raw-AD classification.
- `AssetsDetailPanel.jsx`: `product` is now a regular field in `group1Fields` (Asset Info,
  next to Asset Category) — `{ key: 'product', column: 'M_Product_ID', type: 'search',
  lookup: true, reference: 'Product', inputMode: 'search', section: 'principal' }`, using the
  same `type: 'search'` pattern as other high-cardinality product lookups (e.g.
  `price-list/PriceListProductPrices.jsx`). It remains in the `readOnlyAll` hardcoded list so
  it still locks like every other field when the record is not in edit mode. It stays excluded
  from `dimensionFieldCandidates` (per the section above) since it is not config-gated.
- Label reuses the existing generic `product` key (`genericLabels.product` — "Product" /
  "Producto") via `useUI()`; no new i18n keys needed.
- No backend change needed: `product`'s raw AD field already carries the
  `SL_Asset_Product` callout, so selecting a value fires the standard `/assets/callout`
  round-trip like any other field, same as before it was discarded.

### Centro de costo corrected to Por config (ETP-4914)

The accounting-dimension matrix was corrected again: `Activo (Amortizaciones) | Cabecera`
now reads Contacto=**Por config** (deferred, see below), Producto=**Siempre**, Proyecto=
**Por config**, Centro de costo=**Por config** (Centro de costo was previously, incorrectly,
**Nunca** — the "Producto corrected to Siempre" section above and the original ETP-4529
matrix both had it wrong). Direct DB verification confirmed `eTADASCostCenter`'s raw
`AD_Field.DisplayLogic` on the Assets tab was already correctly wired all along
(`@$Element_CC@='Y' & @IsDepreciated@='Y'`, the exact same pattern as `project`'s
`@$Element_PJ@='Y' & @IsDepreciated@='Y'`) — this was a pure classification/decisions.json
fix, no AD metadata change needed.

- `decisions.json`: `assets.eTADASCostCenter.visibility` changed from `discarded` to
  `editable` (`section: "principal"`), matching `project`'s shape.
- `AssetsDetailPanel.jsx`: `eTADASCostCenter` added to `dimensionFieldCandidates` —
  `{ key: 'eTADASCostCenter', column: 'EM_Etadas_Costcenter_ID', type: 'selector', section:
  'principal', reference: 'Costcenter', inputMode: 'selector' }` — resolved through the same
  `useAccountingDimensionFields('assets', d, dimensionFieldCandidates, { token, apiBaseUrl })`
  call as `project`, so it is independently config-gated (visible only when the client's Cost
  Center dimension is enabled for this org's ledger). Confirmed in the regenerated
  `AssetsForm.jsx`: `eTADASCostCenter` now carries `visibilitySource: 'server'` and
  `displayLogicReason: 'accounting-dimension'`, the same server-evaluated shape as `project`.
- **Contacto remains out of scope for this pass**, even though the corrected matrix also
  marks it "Por config": its raw `AD_Field.DisplayLogic` on the Assets tab is only
  `@IsDepreciated@='Y'` — missing the `@$Element_BP@` dimension term that `project` and
  `eTADASCostCenter` both carry — so fixing it properly requires an AD-level `DisplayLogic`
  metadata edit first, tracked as a separate follow-up. `businessPartner` stays
  `visibility: "discarded"` in `decisions.json` until that lands.
- Regenerated via `make regen ONLY=assets`; the contract's auto-generated system-field test
  entry for `eTADASCostCenter` (previously "should exist in backend but not frontend")
  was replaced automatically by the standard editable-field test set (displaylogic-evaluable,
  displaylogic-valid, field-presence, field-type, selector-endpoint) — no manual test-file
  authoring needed for the contract itself. `AssetsDetailPanel.vitest.jsx` and
  `AssetsDetailPanel.test.js` were updated to expect both `project` and `eTADASCostCenter`
  as independently-gated dimension candidates.

## ETP-4542 — Generic declarative numeric validation (min + integer), applied to Usable Life

Bug: `usableLifeMonths` ("Vida útil - Meses") and `usableLifeYears` ("Vida útil - Años")
accepted zero, negative or decimal values in the form. The **Create Amortization** process
already rejected these server-side, but the user only found out after completing the whole
form and running the process.

This iteration **replaced the earlier Assets-specific hack** (`isInvalidUsableLife` /
`USABLE_LIFE_ERROR_KEYS` / `handleUsableLifeBlur` / the key-based `getInvalidUsableLifeField`
gate) with a **generic, declarative mechanism usable by ANY window**. A numeric field now
opts into validation purely through two field-config properties (see
`docs/decisions-reference.md`):

- `min` — value must be `>= min`.
- `integer: true` — decimals are rejected. **Default (flag absent) accepts decimals**, so
  every other window is unaffected. Only whole-number fields declare it.

Assets declares `"min": 1, "integer": true` on both `usableLifeYears` and `usableLifeMonths`
(in `artifacts/assets/decisions.json`, and mirrored on the hardcoded field configs in
`AssetsDetailPanel.jsx` / `AssetsConfigPanel.jsx` since those panels build their own field
arrays rather than reading them from the contract).

**How the generic mechanism works:**

- `getNumericFieldError(field, value)` (`tools/app-shell/src/lib/numericValidation.js`) is a
  pure function returning the first failing i18n descriptor `{ key, params }`
  (`fieldMinValueError` with `params: { min }`, or `fieldIntegerError` with `params: {}`) or
  `null`. Returning the interpolation params — not a bare key — lets the caller render a precise
  message: `fieldMinValueError` is `"Value must be at least {min}"`, so a `0` on a `min: 1`
  field reads "Value must be at least 1" instead of the old, inaccurate "Value cannot be
  negative" (0 is not negative). An empty/null value is always `null` — emptiness stays the
  responsibility of the existing `required` mechanism, never mixed in here.
- **Inline blur feedback** lives in the shared `EntityForm.jsx`: on blur of any numeric field
  (both the default `Input` path and the `DeferredInput`/`calloutOn: 'blur'` path) it calls
  `getNumericFieldError` and, on a hit, `toast.error(ui(err.key, err.params))`. Fields declaring
  neither `min` nor `integer` produce `null` → no toast, so the behaviour is fully
  backwards-compatible.
- **Hard save block** lives in the shared `useEntity.js` `handleSave`: `getNumericFieldViolation(fields, editing)`
  scans ALL currently registered fields (not just ones the user "changed" this session),
  skips read-only / hidden fields, and returns `{ key, errorKey, errorParams }` for the first
  violation. On a hit `handleSave` calls `reportInvalidFormatField(errorKey, ui, ..., errorParams)`
  (same helper as the email/website/phone gates, extended with an optional `params` argument so
  the `{min}` interpolates) and returns before the network request, so the save is blocked.
- The same interpolation is applied in the two grid/inline call sites that reimplement the
  below-min guard: `DataTable.jsx` (`ui('fieldMinValueError', { min: belowMin[0].min })`) and
  `InlineLinesPanel.jsx` (`ui('fieldMinValueError', { min: col.min })`).
- The registration wiring landed previously (Bug 2/3 follow-up) is unchanged: `DetailView.jsx`
  passes `registerFields`/`fieldErrors` into the `formFooter` slot, and `AssetsDetailPanel.jsx`
  forwards them into every internal `EntityForm`, so the `deprecFields` reach `formFieldsRef`.
- The backend validation in the "Create Amortization" process is unchanged and remains the
  authoritative safety net.

**Design note — emptiness:** the Usable Life fields are `requiredVisual` (conditional
obligation), not hard `required`, so under the generic mechanism an *empty* value no longer
raises a client toast (it did under the old hack). This is deliberate: numeric validation
does not duplicate required semantics. The backend still rejects an empty value on process.

**Pipeline (`integer` passthrough):** the new `integer` property travels the full chain —
`decisions.json` → `resolve-curated.js` (`if (fieldDecision.integer !== undefined) field.integer = ...`)
→ `generate-contract.js` `applyFieldUIHints` (`if (f.integer !== undefined) mapped.integer = ...`)
→ `contract.json`. Verified in `artifacts/assets/contract.json`: `usableLifeMonths` and
`usableLifeYears` now carry `min: 1, integer: true`.

- **Files changed:**
  - `schema_forge_core/cli/src/resolve-curated.js` (+`integer` passthrough) + test
  - `schema_forge_core/cli/src/generate-contract.js` (+`integer` passthrough in `applyFieldUIHints`) + test
  - `tools/app-shell/src/lib/numericValidation.js` (new — generic `getNumericFieldError`; replaces the deleted `lib/usableLife.js`)
  - `tools/app-shell/src/components/contract-ui/EntityForm.jsx` (generic on-blur numeric validation, both input paths)
  - `tools/app-shell/src/hooks/useEntity.js` (generic `getNumericFieldViolation` gate replaces `getInvalidUsableLifeField`)
  - `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` (removed the ad-hoc helper/blur handler; `usableLife*` now declare `min: 1, integer: true`)
  - `tools/app-shell/src/windows/custom/assets/AssetsConfigPanel.jsx` (`usableLife*` declare `min: 1, integer: true`)
  - `artifacts/assets/decisions.json` (`usableLifeYears`/`usableLifeMonths` → `min: 1, integer: true`)
  - `tools/app-shell/src/locales/{en_US,es_ES,es_AR}.json` (new `fieldIntegerError` key; `fieldMinValueError` reworded to the interpolated `"Value must be at least {min}"` / `"El valor debe ser al menos {min}"`)
  - `tools/app-shell/src/components/contract-ui/{DataTable,InlineLinesPanel}.jsx` (below-min toasts now interpolate `{min}`)
  - tests: `lib/__tests__/numericValidation.test.js` (new), `hooks/__tests__/useEntity-helpers.test.js` (rewritten gate coverage), `components/contract-ui/__tests__/EntityForm.numericBlur.vitest.jsx` (new, window-agnostic), `windows/custom/assets/__tests__/AssetsDetailPanel.{usableLifeValidation,registerFieldsWiring}.vitest.jsx` (rewritten to the generic mechanism)

### Manual verification (ETP-4542)

1. Open an asset with **Depreciate** enabled, **Calculation type** = "Time" (`TI`), and
   **Amortize** = "Monthly" so **Usable Life - Months** is visible.
2. Type `0`, a negative number, or a decimal like `5.5`, then click away (blur). Confirm a
   toast error appears — "Value must be at least 1" for below-min (the message names the actual
   threshold; `0` is NOT reported as "negative"), "Value must be a whole number" for decimals
   (or the Spanish equivalents under `es_ES`).
3. Click **Save** with the field still invalid — confirm the save is blocked (the toast
   reappears, no network request is sent, the form stays in edit mode).
4. Type a valid positive integer (e.g. `12`), blur — confirm no toast appears — then Save.
   Confirm the save succeeds.
5. Repeat steps 1–4 with **Amortize** = "Yearly" for **Usable Life - Years**.

## ETP-4542 (Bloque 1) — extended to Annual Depreciation %

Same generic mechanism, extended to `annualDepreciation` ("Annual Depreciation %" /
`Amortizationpercentage`), visible when **Depreciate** is on and **Calculate Type** =
"Percentage" (`PE`). Unlike Usable Life, this field declares **only `min: 1`** —
**no `integer: true`** — because it is a percentage and decimals are valid business input
(e.g. `12.5%`). It rejects empty/zero/negative but accepts any positive decimal.

Changed in `annualDepreciation`'s field config in three places, mirroring the Usable Life
pattern: `artifacts/assets/decisions.json` (documentation source of truth, field renders via
`headerExtra.customForm` so this entry is `form: false` + `min: 1`), and the hardcoded field
arrays in `AssetsDetailPanel.jsx` (`deprecFields`, principal section) and
`AssetsConfigPanel.jsx` (`deprecFields`, other section) — both custom panels build their own
field arrays rather than reading them from the contract.

**Files changed:**
- `artifacts/assets/decisions.json` (`annualDepreciation` → `min: 1`)
- `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` (`annualDepreciation` → `min: 1`)
- `tools/app-shell/src/windows/custom/assets/AssetsConfigPanel.jsx` (`annualDepreciation` → `min: 1`)
- test: `tools/app-shell/src/windows/custom/assets/__tests__/AssetsDetailPanel.annualDepreciationValidation.vitest.jsx` (new)

### Manual verification (ETP-4542, Bloque 1)

1. Open an asset with **Depreciate** enabled and **Calculate Type** = "Percentage" (`PE`) so
   **Annual Depreciation %** is visible.
2. Type `0` or a negative number, then blur. Confirm the "Value must be at least 1" toast
   appears (or the Spanish equivalent).
3. Type a decimal like `12.5`, blur — confirm **no** toast appears (decimals are valid for a
   percentage) — then Save. Confirm the save succeeds.
4. Type a valid positive integer (e.g. `20`), blur — confirm no toast appears — then Save.
   Confirm the save succeeds.

## ETP-4542 (Bloque 2) — auto-save before running a process

`saveBeforeProcesses` (documented above as an Assets-only toolbar preference that reorders the
**Save** button before the process buttons) now **also drives a silent save gate** in front of
every toolbar process button (e.g. **Create Amortization**). The flag stays opt-in — only
windows that pass it participate; every other window's process buttons behave exactly as before.

Behavior when the flag is set and a process button is clicked:

1. **Form dirty + save succeeds** → the pending changes are persisted silently (no "Record
   saved" toast) and the process then runs on the fresh data.
2. **Form dirty + save fails** (required empty, ETP-4542 numeric violation, or backend error)
   → the process is **aborted**; no confirm modal, no param dialog, no process POST.
   `handleSave` has already shown the validation/error toast, so nothing extra is surfaced.
3. **Form not dirty** → the process runs directly, no save step.

**Interception point & rationale:** the save gate runs in the toolbar process-button `onClick`
in `DetailView.jsx`, **before** `dispatchProcessAction` — i.e. before any confirm modal or
param dialog opens. Saving first means the process always operates on persisted data, and a
failed save never opens a modal the user would then have to dismiss. The dirty signal reused is
the same `isDirty` (`computeIsDirty`) that drives the **Save** button, so the two never diverge
(header edits, line edits, and `additionalDirtyState` all count). The logic is extracted into
the exported, unit-tested `maybeSaveBeforeProcess({ saveBeforeProcesses, isDirty, handleSave })`
helper, which returns `true` to proceed or `false` to abort.

**Files changed:**
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — new exported
  `maybeSaveBeforeProcess` helper + process-button `onClick` now awaits it before dispatching.
  Additive: no-op for any window that does not pass `saveBeforeProcesses`.
- test: `tools/app-shell/src/components/contract-ui/__tests__/DetailView.dispatchProcessAction.vitest.jsx`
  (four new cases: dirty+ok → runs, dirty+fail → aborts, not dirty → runs, no flag → never saves)

### Manual verification (ETP-4542, Bloque 2)

1. Open an existing asset, edit a header field so the form is dirty, then click
   **Create Amortization**. Confirm the record is saved (no success toast) and the process runs.
2. Clear a required field (or enter an invalid numeric value), then click **Create Amortization**.
   Confirm the validation error toast appears and the process does **not** run.
3. Open an asset without editing anything and click **Create Amortization**. Confirm the process
   runs immediately with no extra save.
4. On any window that does **not** set `saveBeforeProcesses` (e.g. sales-order), confirm process
   buttons still run with no save-first step.

## ETP-4542 (Bloque 2, Bug 6) — process button loading state

While a header process is running in the backend (e.g. **Create Amortization**), its toolbar
button now shows a spinner + a **"Generating…"** label (`ui('generating')`, already present in
`en_US` / `es_ES` / `es_AR` as "Generating…" / "Generando…") and is **disabled** so the user
cannot fire the same process twice. When the process finishes — **success or error** — the button
returns to its normal label and enabled state.

This is a **separate opt-in flag** from `saveBeforeProcesses` (the two behaviors are distinct and
were deliberately not conflated). The Assets wrapper passes both.

**How it works:**
- `useEntity.js` tracks a `runningProcess` state holding the id of the header process whose POST
  is in flight (`process.columnName ?? process.name`), or `null` when idle. It is set at the start
  of `handleProcess` and cleared in a `finally` block, so both the success and error paths reset it.
  Using a per-process id (not a global boolean) gives per-button granularity: only the clicked
  button reflects the loading state, not every process button in the toolbar. Exposed on the hook
  return alongside `isSaving`.
- `DetailView.jsx` gained a new opt-in prop **`showProcessLoadingState`** (default `false`). Only
  when it is set does a header process button whose `columnName ?? name` matches `hook.runningProcess`
  render the spinner (`Loader2`, `data-testid="Loader2__process-running"`) + `ui('generating')` and
  become `disabled`. Windows that don't pass the flag are completely unchanged (normal label, no
  extra disabled state) — the running state is still tracked in the hook (harmless) but never shown.
- The spinner turns on when the real POST starts inside `handleProcess`, not when the click opens a
  confirm modal or param dialog. If the user **cancels** a confirm/param modal, `handleProcess` never
  runs, so `runningProcess` never gets set — the button never gets stuck in the loading state.

**Files changed:**
- `tools/app-shell/src/hooks/useEntity.js` — new `runningProcess` state, set/cleared in
  `handleProcess` (set at start, cleared in `finally`), exposed on the hook return.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — new opt-in `showProcessLoadingState`
  prop; header process button conditionally renders spinner + "Generating…" + `disabled` while its
  process runs. Additive: no-op for any window that does not pass the flag.
- `tools/app-shell/src/windows/custom/assets/index.jsx` — passes `showProcessLoadingState` next to
  `saveBeforeProcesses`.
- test: `tools/app-shell/src/components/contract-ui/__tests__/DetailView.processLoadingState.vitest.jsx`
  (flag on + running → disabled + spinner + "generating"; finished → normal; flag off → never shows;
  double-click blocked; different running process → button stays normal).
- i18n: reuses the existing `generating` key (`Generating…` / `Generando…`) in all three locales — no
  new key added.

### Manual verification (ETP-4542, Bloque 2, Bug 6)

1. Open an existing asset and click **Create Amortization**. While the backend runs, confirm the
   button shows the spinner + "Generando…" and is greyed out / not clickable.
2. On success, confirm the button returns to "Create Amortization" and is clickable again.
3. Force an error (e.g. backend rejects), confirm the button also returns to normal (not stuck).
4. Rapidly double-click **Create Amortization**; confirm only one process request is sent.
5. Cancel the confirm/param modal (if the process has one) and confirm the button never enters the
   loading state.
6. On any window that does **not** set `showProcessLoadingState` (e.g. sales-order), confirm process
   buttons show no spinner and behave exactly as before.

## ETP-4539 — "Amortizar" toggle rename, header-level Asset Value, currency always read-only

### Depreciate toggle renamed to "Amortizar" / "Amortize"

The main depreciation toggle in the **Depreciación** group previously read "Depreciar" / "Depreciate" (description: "Habilitar la depreciación para este activo." / "Enable depreciation for this asset."). It now reads **"Amortizar" / "Amortize"** (description: "Habilitar la amortización para este activo." / "Enable amortization for this asset."). Only the i18n label/description changed — the underlying field key (`depreciate`, column `IsDepreciated`) is untouched.

- **Files changed:** `tools/app-shell/src/locales/en_US.json`, `es_ES.json`, `es_AR.json` — `assetsDepreciateLabel` / `assetsDepreciateDesc` keys.

### "Valor del activo" moved to the main header section

`assetValue` (column `AssetValueAmt`) previously lived in the **Información financiera** group, visible only when **Amortizar** is enabled. It is now part of **Group 1 (Asset Info)** in `AssetsDetailPanel.jsx`, rendered right after **Description**, and is therefore always visible regardless of the depreciation toggle.

- `artifacts/assets/decisions.json` — `assetValue` no longer carries `displayLogicJs` (it was gating visibility to `record.depreciate === true || record.depreciate === 'Y'`); the field's `grid`/`summable`/`businessCritical` flags are unchanged.
- `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` — `assetValue`'s field descriptor moved from `group2Fields` to `group1Fields`. The Group 1 `EntityForm` now uses `onChange={handleAmountChange}` (previously only Group 2 did) so the ETP-4333 local-recompute arithmetic (`computeAssetAmounts`) still fires correctly when the field is edited from its new position; `handleAmountChange` already forwards non-amount fields to the plain `onChange` untouched, so `searchKey`/`name`/`assetCategory`/`description` are unaffected.
- The field's grid column position and summable behavior in the list view are unchanged — only its position/visibility inside the detail form moved.

### Currency is always read-only

`currency` (column `C_Currency_ID`) was previously read-only only *after* amortization progress existed (`depreciatedPlan` or `depreciatedValue` > 0) — editable otherwise. It is now **always** read-only, in every document state.

- `artifacts/assets/decisions.json` — `currency` gains `"visibility": "readOnly"` (maps to `isReadOnly: 'Y'` unconditionally in `push-to-neo.js`'s `mapVisibility`, so the backend rejects writes regardless of state), the field-level `readOnlyLogic` is explicitly set to `null` to neutralize the raw AD expression (`@existAmortizationLines@ = 'Y'`), and it no longer carries `readOnlyLogicJs`. The rule catalog entry was renamed to `readOnlyLogic_Currency_alwaysReadOnly` (previously `readOnlyLogic_Currency_existAmortizationLines`) and its description updated, since the old name implied the field is still conditional on amortization progress.
- `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` — the `currency` field descriptor's conditional `readOnlyLogic: (record) => Number(record.depreciatedPlan || 0) > 0 || Number(record.depreciatedValue || 0) > 0` was replaced with **`readOnlyLogic: () => true`** (a function, not a static `readOnly: true` boolean). This distinction matters: `EntityForm`'s horizontal-layout-without-`section` render path filters `displayFields = visibleBaseFields.filter(f => !f.readOnly)` — any field with a truthy *static* `f.readOnly` is stripped from the form entirely, not just disabled. A static `readOnly: true` on `currency` would have made **Moneda** disappear from the form altogether instead of rendering as a disabled input. `readOnlyLogic` is not checked by that filter — it only feeds `evalReadOnlyLogic()`, which correctly disables the input (see `isReadOnly` in `renderField`) while keeping the field visible. See the inline comment at `AssetsDetailPanel.jsx` lines ~184-192 for the full rationale. Do not replace this with a static `readOnly: true` in future changes.
- The currency default-echo `useEffect` (ETP-4333, `currencyEchoedRef`) is unaffected — new records still get `@C_Currency_ID@` defaulted and registered in the form's change tracking; the field is simply never editable afterward.

### Known follow-up — unit tests updated as part of this change

Three assertions in the existing test suite encoded the previous behavior and were updated (as part of this change, following review feedback) to match the new intended behavior:

- `tools/app-shell/src/windows/custom/assets/__tests__/AssetsDetailPanel.vitest.jsx` — "hides financial... fields when depreciate is off" asserted `assetValue` is absent from any rendered form when `depreciate: 'N'`; it now asserts `assetValue` renders unconditionally in Group 1.
- `tools/app-shell/src/windows/custom/assets/__tests__/AssetsDetailPanel.test.js` — "currency field has readOnlyLogic when amortization lines exist" asserted the source contains `depreciatedPlan`/`depreciatedValue`/`readOnlyLogic` for the currency field descriptor; it now asserts `readOnlyLogic: () => true` (unconditional) is present instead.
- Any snapshot/manual-verification step in this doc's earlier sections that describes "Depreciar" as the toggle label, or describes `assetValue` as conditional on depreciation, should be read in light of this section going forward.

### Manual verification (ETP-4539)

1. Open an asset and confirm the toggle previously labeled "Depreciar" now reads **"Amortizar"** (with description "Habilitar la amortización para este activo."), in both `es_ES` and `en_US` locales.
2. Open a new or existing asset with **Amortizar** off and confirm **"Valor del activo"** is visible in the main section, right after **Descripción** — not hidden, not inside a Depreciation-only group.
3. Toggle **Amortizar** on and off and confirm **"Valor del activo"** remains visible and editable in both states, at the same position.
4. Confirm the **Moneda** field is read-only (not editable) on a brand-new asset record (before any amortization progress exists), and remains read-only after amortization lines are generated.

## ETP-4276 — MCP advertises `usableLifeMonths`/`currency` as conditionally required for amortization

### Problem

`usableLifeMonths` (or `usableLifeYears`) and `currency` are required to generate the amortization plan, but they are **not** mandatory in the AD schema (`AD_Column.isMandatory()` is false — the requirement is conditional on `calculateType`/`amortize`, enforced late by the "Create Amortization" PL/SQL). Because they were not surfaced as required in the MCP schema, an agent had to guess — the validation bot invented `usableLifeMonths = 60`. ETP-4275 already added a reactive gate that rejects the process with a structured `PRECONDITIONS_UNMET` at execution time; this change adds the **proactive** signal so the agent knows upfront.

### What changed (MCP-only, derived from `preconditions`)

`neo_schema` now derives a per-field `userRequired` signal from the **same** `ETGO_SF_ENTITY.preconditions` declaration that the runtime gate enforces (single source of truth — no separate `decisions.json` flag, no duplication). When a field is named in the entity's `preconditions`, the schema emits:

- `userRequired: true`
- `requiredWhen: "<expr>"` — only when the rule is conditional, so the agent knows the requirement depends on other field values (e.g. `usableLifeMonths` is `@calculateType@ != 'PE' && @amortize@ != 'YE'`; `usableLifeYears` is `@amortize@ == 'YE'`; `currency` is unconditional, so no `requiredWhen`).

- **Files changed (`com.etendoerp.go`):** `src/com/etendoerp/go/mcp/McpSchemaFieldBuilder.java` (`loadPreconditionRequirements` + `applyPreconditionRequirement`, applied in `buildSchemaField` after `addVisibility`), `src/com/etendoerp/go/mcp/McpToolRouter.java` (loads the map and passes it to `buildSchemaFieldsArray`), and the test `src-test/src/com/etendoerp/go/mcp/McpSchemaFieldBuilderTest.java`.
- **No `decisions.json` change** — the requirement already lives in `preconditions` (ETP-4275). This is intentionally MCP-only: the UI keeps its own cosmetic required-asterisk (`requiredVisual`, see **ETP-4336**), and the reactive gate remains the enforcement backstop.

### Two layers, one declaration

| Layer | Where | When | Behavior |
|-------|-------|------|----------|
| Proactive hint (this change) | `neo_schema` → `userRequired`/`requiredWhen` | at schema discovery | advisory — tells the agent to fill the field |
| Reactive gate (ETP-4275) | `NeoProcessPreconditionValidator` | at process execution | enforcing — returns `PRECONDITIONS_UNMET` (400) |

Both read `ETGO_SF_ENTITY.preconditions`. The hint is best-effort (the condition is dynamic and the client may ignore it); the gate is the guarantee. The proactive hint does **not** make the gate obsolete.

### Create → amortization flow (agent-facing)

1. **schema** — `neo_schema` for the assets window now flags `usableLifeMonths`/`usableLifeYears` + `currency` as `userRequired` (with `requiredWhen` where conditional).
2. **defaults** — `neo_defaults` resolves server-side defaults (e.g. `currency` from `@C_Currency_ID@`).
3. **selectors** — resolve foreign keys via the per-field selector endpoints (e.g. asset category, product, accounting dimensions).
4. **create** — `neo_create` the asset with `depreciate` on and the depreciation setup filled.
5. **verify state / callouts** — re-read the record: the asset-category callout may change `calculateType`, which flips whether `usableLifeMonths` vs `usableLifeYears` applies (mirrors the reactive-behavior section above).
6. **action `Processed`** — invoke the "Create Amortization" action. If a precondition is still unmet, the gate returns `PRECONDITIONS_UNMET` with the missing field names instead of an opaque PL/SQL error.
7. **list `amortizationLine`** — read the generated schedule (child amortization lines, sorted by `sEQNoAsset asc`).

### Manual verification (ETP-4276)

1. Call `neo_schema` for the assets window and confirm `usableLifeMonths`, `usableLifeYears` and `currency` carry `userRequired: true`; confirm `usableLifeMonths`/`usableLifeYears` also carry `requiredWhen` and `currency` does not.
2. Confirm a field **not** listed in `preconditions` carries no `userRequired` from this path (unchanged behavior).
3. End-to-end: create an asset omitting `usableLifeMonths` with a Time/non-yearly setup, invoke Create Amortization, and confirm the gate still returns `PRECONDITIONS_UNMET` (the proactive hint does not replace enforcement).

## ETP-4983 — Search Key uniqueness validation per Organization

### Problem

Classic Etendo maintained document-number uniqueness at the database level via sequences. When the Assets window was migrated to Etendo GO (no document sequence, no built-in uniqueness for `searchKey`), the Identificador field became freely duplicable within the same client and organization — a data integrity gap. Creating two assets with identical Search Keys was possible but not validated. This ticket enforces **per-organization uniqueness** of the `searchKey` (Identificador) at the backend layer.

### Solution

A new `AssetSearchKeyUniqueHandler` (in `com.etendoerp.go`, `src/com/etendoerp/go/schemaforge/AssetSearchKeyUniqueHandler.java`) implements the validation as a CDI-managed `EntityPersistenceEventObserver`:

- **Observes:** Asset (`A_Asset`) create and update events
- **Scope:** Per-organization (not client-wide) — two assets CAN share the same Search Key if they belong to different organizations of the same client
- **Enforcement:** On every save attempt (both Classic AD window direct OBDal and Etendo GO NEO routes), the handler queries for existing assets in the same organization with the same search key. If found (excluding the current record's own id on update), an `OBException` is thrown.
- **Ignores:** Active flag — an inactive duplicate still blocks the search key, matching database-level unique constraint semantics
- **Error message:** New AD_MESSAGE `ETGO_AssetSearchKeyDuplicate` with English text "There is already an asset with this identifier in this organization."

### Frontend error mapping

The backend exception message is translated at the frontend via the existing `backendErrors.js` mechanism:

- **backendErrors.js:** Maps the AD_MESSAGE text to `backendError.assetSearchKeyDuplicate` (line 33)
- **i18n keys added to all three locales:**
  - `en_US.json`: `"backendError.assetSearchKeyDuplicate": "There is already an asset with this identifier in this organization."`
  - `es_ES.json`: `"Ya existe un activo con este identificador en esta organización."`
  - `es_AR.json`: Same as `es_ES`

When a user attempts to create or update an asset with a duplicate Search Key in the same org, the validation fires before the record is persisted, and a Spanish error toast appears: **"Ya existe un activo con este identificador en esta organización."**

### Architecture note

The pattern used here (`EntityPersistenceEventObserver`) is the same sibling pattern employed by `AssetGroupNameUniqueHandler` for enforcing Asset Category name uniqueness (Client-scoped, not Organization-scoped). Both handlers respond to OBDal persistence events at the model layer, ensuring the validation applies regardless of whether the save originated from the Classic AD window, NEO Headless, or any direct API call. This is distinct from the `NeoHandler` pattern (which hooks the NEO HTTP request layer only).

### Tests

- **Backend (`com.etendoerp.go`):** `AssetSearchKeyUniqueHandlerTest.java` covers:
  - Same org, duplicate key → throws `OBException`
  - Different org, same key → succeeds (allows duplication across orgs)
  - Update with own key → succeeds (self-update excluded)
  - Null or blank search key → succeeds (validation skipped for empty values)
  - Missing organization → succeeds (validation skipped if org is null)
- **Frontend (`tools/app-shell`):** `backendErrors.test.js` verifies:
  - Error message mapping from backend text to `backendError.assetSearchKeyDuplicate` key
  - Regression coverage for the sibling `assetGroupNameDuplicate` mapping (closed a pre-existing test gap)

### Manual verification (ETP-4983)

1. **Create an asset with a given Search Key in Organization A:**
   - Open `/assets` or navigate to Assets from the Finance menu
   - Create a new asset record with **Identificador** = `"ASSET-001"`, **Name** = "Test Asset 1", and **Organization** = Organization A
   - Save and confirm the record is persisted

2. **Attempt to create a duplicate in the same organization — expect rejection:**
   - Create a second asset with **Identificador** = `"ASSET-001"`, different **Name** = "Test Asset 2", same **Organization** = Organization A
   - Click **Save** and confirm an error toast appears: **"Ya existe un activo con este identificador en esta organización."** (Spanish) or **"There is already an asset with this identifier in this organization."** (English, depending on session locale)
   - Confirm the record is NOT saved (the form remains in edit mode, no success toast)

3. **Verify that the same key IS allowed in a different organization:**
   - Create a new asset with **Identificador** = `"ASSET-001"`, different **Name** = "Test Asset 3", **Organization** = Organization B (a different organization of the same client)
   - Click **Save** and confirm the record is saved successfully (no error)
   - This confirms the uniqueness check is scoped by organization, not client-wide

4. **Update an existing asset without changing its Search Key — expect success:**
   - Open an existing asset with **Identificador** = `"ASSET-001"`
   - Edit another field (e.g. **Nombre** / Name)
   - Click **Save** and confirm the save succeeds (no false-positive duplicate error)

5. **Verify translation in both locales:**
   - Switch the session locale to Spanish and repeat steps 2–3 — confirm the error message reads **"Ya existe un activo con este identificador en esta organización."**
   - Switch the session locale to English — confirm it reads **"There is already an asset with this identifier in this organization."**
