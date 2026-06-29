# Assets

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
4a. With **Depreciate** enabled, scroll to the last section and confirm the **Dimensiones contables** group appears **after Dates**, showing 8 selectors in a 4-column grid: Project, Cost Center, Business Partner, 1st Dimension, 2nd Dimension, Sales Region, Activity, Sales Campaign. Open a selector (e.g. Cost Center) and confirm it returns options. Select a value, save and reopen the asset — the value persists. Disable **Depreciate** and confirm the dimensions section disappears.
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
- `renderDepreciationProgress` in `cli/src/generate-frontend.js` reads `row.etgoAmortizationStatus` directly instead of computing `depreciatedValue / depreciationAmt` on the frontend.
- No assets-specific browser or component test file was found in `tools/app-shell/test` or `tools/app-shell/src/**/__tests__`, so the automated evidence is structural/code-backed rather than end-to-end behavioral proof.
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
- Group 5 (Accounting dimensions): **last section**, visible only when `depreciate=true`. Title key `assetsGroupDimensionsTitle` ("Dimensiones contables" / "Accounting dimensions"). Renders 8 dimension selectors in a 4-column grid (`cols={4}`) via `EntityForm`: Project (C_Project_ID), Cost Center (EM_Etadas_Costcenter_ID), Business Partner (C_BPartner_ID), 1st Dimension (EM_Etadas_User1_ID), 2nd Dimension (EM_Etadas_User2_ID), Sales Region (EM_Etadas_Salesregion_ID), Activity (EM_Etadas_C_Activity_ID), Sales Campaign (EM_Etadas_Campaign_ID). Placed after Dates because it is optional. The grid wrapper forces white backgrounds on selectors (`[&_button[role=combobox]]:!bg-white [&_input]:!bg-white`).
- All header fields set to `form: false` in `decisions.json` — the standard `EntityForm` renders nothing. `hideFormCard: true` hides the now-empty card. The 8 dimension fields are set to `visibility: editable, form: false` in `decisions.json` so they are registered in the NEO spec (`ETGO_SF_FIELD`) — required for the `/assets/selectors/<column>` endpoints to return options — without being rendered by the standard form. `project` was previously `discarded` and is now re-enabled.
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
