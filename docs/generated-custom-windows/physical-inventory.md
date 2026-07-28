# Physical Inventory

## Intent
Physical Inventory should let a warehouse user create an inventory count session, save the header before line work begins, generate the initial count list, record counted quantities line by line, refresh the system count when needed, and then process the count once the session is ready to close.

## What this window should allow
- Create a physical inventory header with at least Movement Date, Name, and Warehouse.
- Classify the count as a Normal, Opening Inventory, or Closing Inventory session, with Normal as the visible default in current contract evidence.
- Open a saved header and work with its child inventory lines.
- Generate a count list from the header through a dedicated more-menu action that filters by product search key, optional product category, and inventory-quantity range.
- Generate lines automatically for the current warehouse via a 3-field modal (product category, inventory-quantity comparison, optional book-quantity reset), available both from the empty-state and from the "+ Add line" menu.
- Capture user-entered counted quantities on each line while keeping the system count visible as read-only reference data.
- Refresh list system counts before final processing.
- Process the inventory count only when the record still has `processed = false` and at least one line exists.

## Interaction model
- Route: `/physical-inventory` for the list and `/physical-inventory/:recordId` for a specific count session.
- Visibility: visible from the Inventory menu as `Physical Inventory`.
- Implementation type: custom window wrapper at `tools/app-shell/src/windows/custom/physical-inventory/index.jsx`, registered in `customLoaders` in `tools/app-shell/src/windows/registry.js`. The wrapper supplies an explicit `COLUMNS` array to `InventoryTable` (`dot: false` on `movementDate`; `enumLabels` for `processed`), passes a `CustomInventoryTable` and a `hideMoreMenu` function to `GeneratedApp`, and injects `SortIconComponent={SortIcon}` and `RefreshIconComponent={RefreshIcon}` (same icons used by goods-movements).
- Window shape: master-child. The header entity is `inventory`, and the detail entity is `inventoryLine`.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- List/detail behavior: the list page opens inventory headers; the record page shows the header form plus the child line table and line form. The list toolbar omits the status filter dropdown (`hideStatusFilter`), the Link button (`hideLink`), and the Print button (`hidePrint`). The `Inventory Type` column is not shown in the list; it remains searchable via filters but not as a visible table column. The sort and refresh toolbar icons use the shared custom set (`SortIcon`, `RefreshIcon`) from `@/components/ui/custom-icons`. The header form has no border (`noHeaderBorder`). The "Others" tab is removed — Description, Inventory Type, and Project are all `form: false`.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies
- Parent/child interaction: the record page binds `inventory` as the header and `inventoryLine` as the child set, so counting happens under a selected header rather than directly from the list. When the user tries to add lines on a brand-new header, `DetailView` saves the header first and reopens the detail route before showing line entry. That is the current fix for previously lost unsaved lines.
- Status-driven actions: the window uses `draftMode` (`processField: processNow`, `label: confirm`, `disableWhenEmpty: true`). The toolbar shows a **Save** button (floppy disk icon, saves draft) and a **Confirm** button (checkmark icon, saves and processes). The Confirm button is disabled when there are no lines and hidden once the record is processed (`isProcessed = processed === true`). When processed, a locked alert banner appears (`lockedAlert`) with the message and a "Create new inventory" link to `/physical-inventory/new`, matching goods-movements exactly. `processNow` is `visibility: discarded` so the legacy process button is suppressed.
- Count-list generation: the custom more menu exposes `Create Inventory Count List`, which opens a modal rendered over the page. The modal defaults Product Search Key to `%`, loads Product Category options on mount, defaults Inventory Quantity to `N` (`not 0`), and submits `generateList` to the header action endpoint with `ProductValue`, `QtyRange`, and optional `M_Product_Category_ID`. Cancel, close-icon, and backdrop click all dismiss the modal. While the request is running, the Generate button is disabled. On success, the UI closes the modal, shows a success toast, and reloads the page.
- System-count refresh: the same menu exposes `Update List System Count`, which POSTs an empty JSON body to `updateQuantities`, disables the button while the request is in flight, shows a success toast, and reloads the page after success.
- Generate lines automatically (ETP-4528): a second, independent line-generation action, distinct from the more-menu "Create Inventory Count List" above. It surfaces in two places that both open the same `GenerateLinesModal`:
  - **Empty state** (no lines yet): a secondary "Generate lines automatically" button next to the primary "+ Add line" button in `LinesEmptyState`, wired via `PhysicalInventoryBottomPanel.linesEmptyState`.
  - **"+ Add line" dropdown** (lines already exist): a "Generate lines automatically" item in the split-button menu, wired via `PhysicalInventoryBottomPanel.lineMenuActions`, which opens the modal through a `forwardRef` host (`PhysicalInventoryBottomPanel.detailExtraActions`) exposing `openGenerateLinesModal()`.

  The modal has exactly 3 fields: **Product Category** (DB-backed selector fetched from `/product/product/selectors/M_Product_Category_ID`; leaving it unset means all categories), **Inventory Quantity** (fixed enum `< 0` / `> 0` / `= 0` / `not 0`, mapped to backend codes `<`, `>`, `=`, `N`; default `not 0`), and **Set Book Quantity to zero** (checkbox, sent as `regularization: 'Y'|'N'`). Submitting POSTs to `/inventory/{recordId}/action/generateLines`; on success it toasts (`linesGeneratedAutomatically`) and calls `onRefresh` to reload only the lines list (no full page reload); on error the modal stays open and shows the server message or a generic fallback (`errorGeneratingList`).

  The backend action is implemented by `InventoryHandler`, a `NeoHandler` registered as `@Named("inventory")` (matches `javaQualifier: "inventory"` on the header entity in `decisions.json`). It forwards the request to the core Etendo AD Process 105 (`M_Inventory_ListCreate`, "Generar líneas automáticamente") via `NeoProcessService.executeProcess`, mapping the exposed fields to the process parameters `M_Product_Category_ID`, `QtyRange`, and `regularization`, and forcing `ProductValue = "%"` (Storage Bin and ABC class are not exposed and stay unset). Two correctness rules are load-bearing and must not regress:
  1. **Warehouse is resolved server-side** from `inventory.getWarehouse()` and sent as `M_Warehouse_ID` — NEO does not resolve the classic `@M_Warehouse_ID@` window token, so omitting this parameter would make the process scan every warehouse instead of the current one.
  2. **"All categories" must omit `M_Product_Category_ID` entirely** — never send `"0"` or the literal string `"null"`. The process filters with `v_Product_Category_ID IS NULL OR p.M_Product_Category_ID = v_Product_Category_ID`, so any non-null placeholder matches zero products. The frontend omits the key when no category is chosen; the handler's `resolveProductCategory` additionally treats a blank value or the literal `"null"` (a Jettison `optString` quirk when a JSON `null` is sent) as "no filter", as defense in depth.
- Child selector context: `DetailView` now passes selector context for `inventoryLine` through `parentId`, and both the line table and line form consume that context. That is the current source-level evidence behind the selector-context fix merged on `origin/develop`: the frontend now supplies saved-parent context instead of relying only on unsaved header state.
- Line-entry behavior: the Lines tab shows columns Product → UOM → System Count → User Count (all `grow: true`, `columnWidth: 192` on the number columns for equal flex distribution). `Line No.` is not a visible grid column (`grid: false`). `UOM` is `gridReadOnly: true` so it is non-editable in both display and inline-edit modes; it is auto-populated by the product callout. `System Count` is read-only. The `InlineLinesPanel` and the add-row `DataTable` both use the same column flex-basis (192px) to stay aligned. Quick add-line entry fields: Product, Description, User Count.

## Gap assessment
- The business intent implies reconciliation between user count and system count, but the current evidence only proves that both values are present and that system counts can be refreshed. It does not clearly show any explicit variance field, reconciliation formula, or review workflow in the UI.
- Processing semantics: `draftMode` (`processField: processNow`) handles the Confirm action. The Confirm button is hidden once `isProcessed = true` and the locked alert appears. Downstream accounting or stock-adjustment effects remain backend behavior — not proven in the UI.
- The modal receives `warehouseId` from the more-menu component, but the current modal implementation does not include it in the frontend request payload. If warehouse scoping is required during list generation, that dependency is not explicit in the current UI code.
- The ⋮ button and its custom actions are now hidden by the frontend in two cases: when the header has not yet been saved (`!data?.id`) and when `processed = true`. Enforced at two levels — the `hideMoreMenu` function in the custom wrapper hides the button entirely; `InventoryMenuContent` also returns `null` as a secondary guard.
- There is still no browser-level automated evidence for the full create-list -> update system count -> process lifecycle; current proof is source-level and component-test level.

## Manual verification
1. Open `/physical-inventory` and create a new header with Movement Date, Name, and Warehouse.
2. Before manually saving, try `Add Lines` and confirm the app first saves the header and then reopens the persisted detail route with line entry available.
3. Open the More menu and confirm `Create Inventory Count List` opens a modal with Product Search Key prefilled as `%`, Product Category options, and Inventory Quantity defaulted to `not 0`.
4. Generate the list and confirm the UI shows a success toast, reloads the page, and displays the created inventory lines under the header.
5. Open a generated or manually added line and confirm `User Count` is editable while `System Count` and `UOM` are read-only before processing.
6. Run `Update List System Count` and confirm the action disables while pending, then the page reloads and the line-level system counts refresh.
7. Confirm the **Confirm** button (draftMode) is absent until at least one line exists. Click it — confirm the processed status badge turns green and the locked alert banner appears. Confirm Save and Confirm buttons are no longer visible.
8. Confirm the ⋮ button is absent on a new (unsaved) header. After saving, confirm it appears. After processing, confirm it disappears again.
9. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
10. On a header with no lines yet, confirm the empty state shows both "+ Add line" and "Generate lines automatically". Click the latter, confirm the modal shows Product Category (default "All categories"), Inventory Quantity (default `not 0`), and "Set Book Quantity to zero" (unchecked). Submit and confirm lines are generated for the header's warehouse only, a success toast appears, and the modal closes without a full page reload.
11. On a header with existing lines, open the "+ Add line" dropdown and confirm "Generate lines automatically" is listed; confirm it opens the same modal.
12. In the modal, pick a specific Product Category and confirm only products in that category are generated. Leave it on "All categories" and confirm products across categories are generated (i.e. the request omits `M_Product_Category_ID` rather than sending a placeholder).

## Automated evidence
- `docs/generated-custom-windows/app-shell-functional-flows.md` documents the shared generated-window routing model for `/:windowName` and `/:windowName/:recordId`.
- `tools/app-shell/src/menu.json` includes the visible Inventory menu entry for `physical-inventory`.
- `tools/app-shell/src/windows/registry.js` maps `physical-inventory` in `customLoaders` to `tools/app-shell/src/windows/custom/physical-inventory/index.jsx`, which wraps `InventoryTable` with a custom `COLUMNS` array (movementDate `dot: false`; processed with `enumLabels`), passes `hideMoreMenu`, `SortIconComponent`, and `RefreshIconComponent` before forwarding to the generated `GeneratedApp`. The list hides the status filter, Link, and Print controls via `decisions.json` → `listViewOptions.hideStatusFilter`, `hideLink`, `hidePrint`.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` saves new headers before opening line entry, injects `selectorContextByEntity[detailEntity]` into child selectors/forms/tables, filters process buttons with `requiresLines`, and locks the document when `processed === true`.
- `artifacts/physical-inventory/contract.json` defines the master-child contract, `processed` status field, `processNow` line requirement, header defaults, line fields including `QtyCount` and `QtyBook`, and action endpoints for `generateList`, `updateQuantities`, and `processNow`.
- `artifacts/physical-inventory/generated/web/physical-inventory/InventoryPage.jsx` binds `inventory` + `inventoryLine`, wires `draftMode` (Save draft + Confirm), injects `lockedAlert` (shown when processed), and passes `labelOverrides`, `statusEnumLabels`, `noHeaderBorder`, and the custom more-menu content.
- `artifacts/physical-inventory/generated/web/physical-inventory/InventoryTable.jsx` defines the visible list columns: `movementDate`, `name`, `warehouse`, `processed` (Status). `Inventory Type` is excluded from the list (`grid: false` in `decisions.json`). The `processed` column carries `enumLabels: { 'true': 'statusProcessed', 'false': 'statusDraft' }` generated from `enumValues` in `decisions.json`.
- `artifacts/physical-inventory/generated/web/physical-inventory/InventoryLineForm.jsx` and `InventoryLineTable.jsx` show `User Count` as the editable input; `System Count` and `UOM` are read-only (`readOnly: true` in both form and table columns via `gridReadOnly: true`). Line No. is hidden from the grid (`grid: false`). Columns ordered: Product → UOM → System Count → User Count, all `grow: true` with equal 192px flex-basis.
- `artifacts/physical-inventory/custom/InventoryMenuContent.jsx` implements the current more-menu behavior: modal launch, update-system-count POST, disabled pending state, toast feedback, reload on success, and pass-through of `warehouseId` to the modal. Returns `null` when `recordId === 'new'` or `data?.processed` (secondary guard; primary guard is `hideMoreMenu` in the wrapper).
- `artifacts/physical-inventory/custom/InventoryCreateListModal.jsx` implements the create-list modal defaults, category loading, quantity-range options, dismiss behavior, disabled submit state, and `generateList` POST body.
- `artifacts/physical-inventory/custom/__tests__/InventoryMenuContent.test.js` verifies the custom menu wiring, create-list entry, update-system-count entry, update endpoint, modal launch, `warehouseId` handoff, and the two visibility guards (`recordId === 'new'` and `data?.processed`).
- `artifacts/physical-inventory/custom/__tests__/InventoryCreateListModal.test.js` verifies the generation endpoint, quantity-range options, category loading, wildcard default for product search key, success callback, and disabled submit state.
- The generated `InventoryPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_Inventory` AD table.
- `artifacts/physical-inventory/custom/GenerateLinesModal.jsx` implements the "Generate lines automatically" modal: the 3-field form, the category selector fetch, the `M_Product_Category_ID` omission rule, and the `generateLines` POST.
- `artifacts/physical-inventory/custom/PhysicalInventoryBottomPanel.jsx` implements both seams that open `GenerateLinesModal` — the empty-state secondary action (`linesEmptyState`) and the "+ Add line" dropdown item (`lineMenuActions` + `detailExtraActions` forwardRef host) — and reuses the shared `LinesEmptyState` component with `margin="0" padding="16px"` overrides local to this window.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/InventoryHandler.java` implements the `@Named("inventory")` NeoHandler backing `generateLines`: reads the header's warehouse, forwards it as `M_Warehouse_ID`, resolves the optional product category (treating blank/`"null"` as "all categories"), and invokes AD Process 105 (`M_Inventory_ListCreate`) via `NeoProcessService`.
- `tools/app-shell/src/locales/en_US.json`, `es_ES.json`, and `es_AR.json` include the i18n keys for this feature: `generateLinesAutomatically`, `addLinesManuallyOrGenerateAutomatically`, `setBookQuantityToZero`, `linesGeneratedAutomatically`.

## Design changes — ETP-4270

- Removed `All statuses` status filter, `Link` button, and `Print` button from the list toolbar (`decisions.json` → `listViewOptions.hideStatusFilter`, `hideLink`, `hidePrint`).
- Removed `Inventory Type` entirely from the UI: `grid: false` and `searchable: false` in `decisions.json`, removed from the custom `COLUMNS` array in `index.jsx`, and excluded from the `DetailView` summary strip via `summaryFields: []` in the window config.
- Added custom sort and refresh icons to match goods-movements (`SortIconComponent={SortIcon}`, `RefreshIconComponent={RefreshIcon}` in `index.jsx`).
- Aligned the `Processed` status column with the goods-movements pattern: `enumValues` in `decisions.json`, `statusEnumLabels` in the window config, and `enumLabels` in the custom `COLUMNS` array. Pills now resolve through `statusBadge.js` → `useUI()` → i18n instead of raw literal strings.
- Renamed the column header from `Processed` to `Status` (es_ES `Estado`) **only** via `labelOverrides` in `decisions.json` — the custom `COLUMNS` entry carries no hardcoded `label` string (that would trip the quality-gate i18n blocker). `DataTable` resolves the header as `t(field.column)`, which `labelOverrides` maps `Processed → Status`/`Estado`.
- Gave header `name` a `readOnlyLogic: "@Processed@='Y'"` so it locks once processed. With `draftMode` enabled, the quality-gate invariants check requires every editable header field to declare `readOnlyLogic`.
- Removed the form border (`noHeaderBorder: true`).
- Removed the "Others" tab: Description, Inventory Type, and Project set to `form: false` in `decisions.json`.
- Warehouse list column rendered as a grey badge chip (same pattern as the Warehouse window's Identifier column) via a custom `render` function in `index.jsx`.
- Lines tab redesign: Line No. hidden from grid; columns reordered to Product → UOM → System Count → User Count; all columns `grow: true` with `columnWidth: 192` on number columns for equal flex-basis and alignment between `InlineLinesPanel` and the add-row `DataTable`; UOM marked `gridReadOnly: true` to prevent inline editing.
- Replaced process button with `draftMode` (`processField: processNow`, `label: confirm`, `disableWhenEmpty: true`): Save button gets a floppy disk icon; Confirm button (dark, checkmark) is disabled without lines and hidden when processed. `processNow` set to `visibility: discarded` to suppress the legacy process button from the `processes` array.
- Added `lockedAlert` (reusing `goodsMovementsLockedTitle/Message/Action` i18n keys) that shows when processed, with a "Create new inventory" link to `/physical-inventory/new`.
- "Difference" column (`etgoQtydiff`) rendered with the new declarative `columnType: "signedDelta"` (`decisions.json`): shows `-N`/`±0`/`+N` in `#D50B3E`/`#121217`/`#1E874C` at Inter 600, tabular-nums, right-aligned, in both `InlineLinesPanel` and the main `DataTable`. See `docs/decisions-reference.md` § "Signed delta column rendering".

## Design changes — ETP-4528

- Added the "Generate lines automatically" feature: a new `GenerateLinesModal` (Product Category, Inventory Quantity, Set Book Quantity to zero) reachable from the lines empty-state and from the "+ Add line" dropdown, both wired through `PhysicalInventoryBottomPanel`.
- Added the `inventory` NeoHandler (`InventoryHandler.java`, `@Named("inventory")`) that drives core AD Process 105 (`M_Inventory_ListCreate`) from NEO Headless — the first backend handler for this window's header entity.

## Merge refresh notes
- This guide was refreshed against `origin/develop` after the `epic/ETP-3504` merge by re-reading the current Physical Inventory window code rather than relying on older guide text.
- The create-list and update-system-count flow comes from `e5876cec` (`Feature ETP-3585: Physical inventory - add actions to kebab menu`) plus the current `InventoryMenuContent.jsx` and `InventoryCreateListModal.jsx` on `origin/develop`.
- The line-required process visibility comes from `3766a7f5` (`Hotfix ETP-3585: Hide process button when no lines exist`) plus the current `DetailView.jsx` process filter on `origin/develop`.
- The selector-context and saved-parent fixes come from `f26c171b` (`Feature ETP-3585: Fix physical inventory selector context`) plus the current `DetailView.jsx`, `InventoryPage.jsx`, and `InventoryLineForm.jsx` on `origin/develop`.

## Accounting dimension visibility per section — ETP-4529

| Field | Header | Lines |
| --- | --- | --- |
| `businessPartner` (Contacto) | **Nunca** — no such field on the header | **Nunca** — no such field on the lines tab |
| `product` | *(no such field on the header)* | **Siempre** — core line field, no dimension gating |
| `project` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` passthrough (`section: "other"`, previously `form: false`) | **N/A** — `M_InventoryLine` has no `project` column; the matrix's "Por config" cell cannot be implemented via `decisions.json` (would require an AD Application Dictionary change to expose the column on this tab) |
| `costCenter` | **Por config** — same fix as `project` (previously discarded) | **N/A** — same AD-level limitation as `project` |

**Runtime evaluator — fixed (ETP-4529 follow-up).** Three generic bugs (the `EntityForm.jsx`
visibility filter never actually consulting the evaluate-display result, the `principal` section
hardcoding empty visibility, and no lines-scoped `useDisplayLogic` call existing at all) were
found and fixed — full write-up in `sales-invoice.md`. `header.project`/`header.costCenter` are
now genuinely config-gated at runtime. This window has no dimension fields on the lines tab at
all, so the lines-scoped part of the fix and the ETP-4543 fix (non-grid line fields invisible
under `inlineEditable` line layout, resolved for `sales-invoice`/`purchase-invoice`/
`goods-shipment`/`goods-receipt` — see `sales-invoice.md`, Jira ETP-4543 / GitHub
`etendosoftware/etendo_schema_forge#895`) don't apply here — there is no such field in this
window's `lines` entity for that fix to affect in the first place (see the "N/A" cells above),
so the header fix is the whole story for this window.

### Header section placement fix (ETP-4529 follow-up)

`header.project` and `header.costCenter` (both already present and config-gated, confirmed —
no AD-level gap) had `"section": "other"` instead of `"section": "principal"`, making them
render in the secondary/collapsed area instead of the main visible form. Fixed by changing
`section` to `"principal"` for both fields in `decisions.json` and regenerating; confirmed in
`contract.json` (`section: "principal"`) and in the generated `InventoryForm.jsx`.

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.
