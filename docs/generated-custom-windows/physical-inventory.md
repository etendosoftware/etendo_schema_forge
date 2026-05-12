# Physical Inventory

## Intent
Physical Inventory should let a warehouse user create an inventory count session, save the header before line work begins, generate the initial count list, record counted quantities line by line, refresh the system count when needed, and then process the count once the session is ready to close.

## What this window should allow
- Create a physical inventory header with at least Movement Date, Name, and Warehouse.
- Classify the count as a Normal, Opening Inventory, or Closing Inventory session, with Normal as the visible default in current contract evidence.
- Open a saved header and work with its child inventory lines.
- Generate a count list from the header through a dedicated more-menu action that filters by product search key, optional product category, and inventory-quantity range.
- Capture user-entered counted quantities on each line while keeping the system count visible as read-only reference data.
- Refresh list system counts before final processing.
- Process the inventory count only when the record still has `processed = false` and at least one line exists.

## Interaction model
- Route: `/physical-inventory` for the list and `/physical-inventory/:recordId` for a specific count session.
- Visibility: visible from the Inventory menu as `Physical Inventory`.
- Implementation type: custom window wrapper at `tools/app-shell/src/windows/custom/physical-inventory/index.jsx`, registered in `customLoaders` in `tools/app-shell/src/windows/registry.js`. The wrapper supplies an explicit `COLUMNS` array to `InventoryTable` (`dot: false` on `movementDate`), passes a `CustomInventoryTable` to `GeneratedApp`, and passes a `hideMoreMenu` function that hides the ⋮ button when `!data?.id` (unsaved record) or `data?.processed` (completed record).
- Window shape: master-child. The header entity is `inventory`, and the detail entity is `inventoryLine`.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. The add-line button and any related panels are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.
- List/detail behavior: the list page opens inventory headers; the record page shows the header form plus the child line table and line form.

## Reactive behavior and dependencies
- Parent/child interaction: the record page binds `inventory` as the header and `inventoryLine` as the child set, so counting happens under a selected header rather than directly from the list. When the user tries to add lines on a brand-new header, `DetailView` saves the header first and reopens the detail route before showing line entry. That is the current fix for previously lost unsaved lines.
- Status-driven actions: the merged window now exposes `processed` as a visible status badge in both the list and the detail header. `Process Inventory Count` is only exposed while the header is not processed and at least one line has loaded. Once processed, `DetailView` locks the document for editing, while the generated line form also keeps Description and Cost guarded by `readOnlyLogic`.
- Count-list generation: the custom more menu exposes `Create Inventory Count List`, which opens a modal rendered over the page. The modal defaults Product Search Key to `%`, loads Product Category options on mount, defaults Inventory Quantity to `N` (`not 0`), and submits `generateList` to the header action endpoint with `ProductValue`, `QtyRange`, and optional `M_Product_Category_ID`. Cancel, close-icon, and backdrop click all dismiss the modal. While the request is running, the Generate button is disabled. On success, the UI closes the modal, shows a success toast, and reloads the page.
- System-count refresh: the same menu exposes `Update List System Count`, which POSTs an empty JSON body to `updateQuantities`, disables the button while the request is in flight, shows a success toast, and reloads the page after success.
- Child selector context: `DetailView` now passes selector context for `inventoryLine` through `parentId`, and both the line table and line form consume that context. That is the current source-level evidence behind the selector-context fix merged on `origin/develop`: the frontend now supplies saved-parent context instead of relying only on unsaved header state.
- Line-entry behavior: quick add-line entry focuses on Line No., Product, Description, and User Count. `System Count` and `UOM` remain read-only in the line form/table. The inline add-line config no longer injects a client-side hidden Storage Bin SQL default, so any locator defaulting is backend/context-driven rather than a visible editable field in the frontend.

## Gap assessment
- The business intent implies reconciliation between user count and system count, but the current evidence only proves that both values are present and that system counts can be refreshed. It does not clearly show any explicit variance field, reconciliation formula, or review workflow in the UI.
- Processing semantics are partially evidenced: the window exposes `processNow`, requires lines before processing, hides the process button once processed, and locks the document for editing. Current repo evidence does not show the downstream accounting or stock-adjustment effects of processing, so those effects remain backend behavior rather than proven UI behavior.
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
7. Confirm `Process Inventory Count` is absent until at least one line exists, then process the record and confirm the processed status badge is visible and line editing becomes read-only.
8. Confirm the ⋮ button is absent on a new (unsaved) header. After saving, confirm it appears. After processing, confirm it disappears again.

## Automated evidence
- `docs/generated-custom-windows/app-shell-functional-flows.md` documents the shared generated-window routing model for `/:windowName` and `/:windowName/:recordId`.
- `tools/app-shell/src/menu.json` includes the visible Inventory menu entry for `physical-inventory`.
- `tools/app-shell/src/windows/registry.js` maps `physical-inventory` in `customLoaders` to `tools/app-shell/src/windows/custom/physical-inventory/index.jsx`, which wraps `InventoryTable` with a custom `COLUMNS` array and passes a `hideMoreMenu` function before forwarding to the generated `GeneratedApp`.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` saves new headers before opening line entry, injects `selectorContextByEntity[detailEntity]` into child selectors/forms/tables, filters process buttons with `requiresLines`, and locks the document when `processed === true`.
- `artifacts/physical-inventory/contract.json` defines the master-child contract, `processed` status field, `processNow` line requirement, header defaults, line fields including `QtyCount` and `QtyBook`, and action endpoints for `generateList`, `updateQuantities`, and `processNow`.
- `artifacts/physical-inventory/generated/web/physical-inventory/InventoryPage.jsx` binds `inventory` + `inventoryLine`, exposes the processed status summary, wires `Process Inventory Count` with `requiresLines`, and injects the custom more-menu content.
- `artifacts/physical-inventory/generated/web/physical-inventory/InventoryTable.jsx` adds the visible `Status` column for the header list.
- `artifacts/physical-inventory/generated/web/physical-inventory/InventoryLineForm.jsx` and `InventoryLineTable.jsx` show `User Count` as the editable count input, keep `System Count`/`UOM` read-only, and add field-level read-only guards for Description and Cost while processed records are globally locked by `DetailView`.
- `artifacts/physical-inventory/custom/InventoryMenuContent.jsx` implements the current more-menu behavior: modal launch, update-system-count POST, disabled pending state, toast feedback, reload on success, and pass-through of `warehouseId` to the modal. Returns `null` when `recordId === 'new'` or `data?.processed` (secondary guard; primary guard is `hideMoreMenu` in the wrapper).
- `artifacts/physical-inventory/custom/InventoryCreateListModal.jsx` implements the create-list modal defaults, category loading, quantity-range options, dismiss behavior, disabled submit state, and `generateList` POST body.
- `artifacts/physical-inventory/custom/__tests__/InventoryMenuContent.test.js` verifies the custom menu wiring, create-list entry, update-system-count entry, update endpoint, modal launch, `warehouseId` handoff, and the two visibility guards (`recordId === 'new'` and `data?.processed`).
- `artifacts/physical-inventory/custom/__tests__/InventoryCreateListModal.test.js` verifies the generation endpoint, quantity-range options, category loading, wildcard default for product search key, success callback, and disabled submit state.

## Merge refresh notes
- This guide was refreshed against `origin/develop` after the `epic/ETP-3504` merge by re-reading the current Physical Inventory window code rather than relying on older guide text.
- The create-list and update-system-count flow comes from `e5876cec` (`Feature ETP-3585: Physical inventory - add actions to kebab menu`) plus the current `InventoryMenuContent.jsx` and `InventoryCreateListModal.jsx` on `origin/develop`.
- The line-required process visibility comes from `3766a7f5` (`Hotfix ETP-3585: Hide process button when no lines exist`) plus the current `DetailView.jsx` process filter on `origin/develop`.
- The selector-context and saved-parent fixes come from `f26c171b` (`Feature ETP-3585: Fix physical inventory selector context`) plus the current `DetailView.jsx`, `InventoryPage.jsx`, and `InventoryLineForm.jsx` on `origin/develop`.
