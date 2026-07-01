# Internal Consumption

## Intent

Use this window to register stock consumed inside the organization rather than sold or transferred. The current contract and generated page present it as an inventory transaction with a header record and operational lines, then a user-triggered process step that moves the document out of draft and an optional void step that reverses a completed document.

## What this window should allow

- Create and review internal consumption headers with at least Movement Date and Name.
- Add one or more consumption lines under a header.
- Capture the product being consumed, the movement quantity, and the storage bin used for each line.
- Review document status as it moves through Draft, Completed, and Voided states.
- Complete a draft document with the **Process** action that sits next to **Save** in the detail toolbar.
- Void a completed document from the kebab (⋮) **Void** action.

## Interaction model

- **Route:** `/internal-consumption`, `/internal-consumption/:recordId`.
- **Visibility:** visible from the Inventory menu as **Internal Consumption**.
- **Implementation type:** generated window with a custom kebab action component (`InternalConsumptionActions`) for the Void step.
- **Window shape:** master-child. The header entity is `internalConsumption` and the line entity is `internalConsumptionLine`. The list route opens headers; the record route opens a detail page with child lines.

### List view

- **Toolbar trimmed:** the per-row link icon (`hideLink`), the Print button (`hidePrint`), and the **All statuses** filter dropdown (`hideStatusFilter`) are all hidden. Only the date filter and **Filters** remain on the left; sort and refresh remain on the right.
- **Custom toolbar icons:** sort and refresh use the same icon set as Contacts/Warehouse (`customListIcons`, which emits `SortIcon` / `RefreshIcon` from `@/components/ui/custom-icons`).
- **Tighter padding:** the list toolbar and table use `px-2` (8 px) horizontal padding. Note: `px-2` is now the global `ListView` default, so the window relies on the default rather than per-window overrides.
- **No status dot on the date column:** `movementDate` sets `dot: false`, so the list does not render the red date indicator next to Movement Date.

### Detail view (single record)

- **No form card border:** the header fields render without the rounded card/border/shadow (`noHeaderBorder`); fields remain fully visible.
- **No Others tab:** `description` is discarded, which removes both the field and the **Others** tab that previously held it.
- **Lines tab layout:** this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Lines columns:** the **Line No.** column is hidden in the grid (`lineNo.grid = false`). `movementQuantity` sets `columnWidth: 160` so the "Movement Quantity" header fits on one line; Product takes the remaining width.
- **Product picker:** the Product column on lines uses a custom lookup drawer (`InternalConsumptionProductSearchDrawer`), registered as `internal-consumption-product` in `lookupDrawers.js`. The drawer shows available stock per storage bin for the selected product and auto-fills the Storage Bin field on selection.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies

- Header and lines are coupled through the standard detail flow. The detail page loads a header plus child lines, and child-row creation posts `parentId` and refreshes both the child list and the header record afterward.
- Status is the main document-state signal. The contract exposes `status` with Draft (`DR`), Completed (`CO`), and Voided (`VO`), defaulting new headers to Draft.
- **Complete (Process):** wired through the native `draftMode` workflow on the header entity. The detail toolbar shows **Save** (outline) plus **Process** (filled, with a check icon). Process saves and then posts to `/internalConsumption/{id}/action/processNow`. The mandatory process parameter `action` is supplied via `draftMode.extraParams` as a flat `{ action: 'CO' }` body (validated against the request root by the backend). The Process button hides once the record is processed (`processed === 'Y'`), which covers both Completed and Voided.
- **Void:** offered as a kebab (⋮) action via `customComponents.moreMenuContent` (`InternalConsumptionActions`). It is shown only when `status === 'CO'` and posts the same `processNow` endpoint with a flat `{ action: 'VO' }` body. The DB process `M_Internal_Consumption_Post` accepts `action` values `CO` (Complete) and `VO` (Void). The kebab button is always present, but the menu opens nothing when no action applies (e.g. Draft or Voided) — the popover only renders when its content is non-empty.
- `movementDate` has read-only logic tied to `processed === true`, so the date should stop being editable once the backend marks the document as processed.
- Line entry has lightweight defaults: `movementQuantity` defaults to `0`, and `lineNo` is derived from the next available line number for the current header (the value is still set even though its grid column is hidden).
- Line fields show a dependency pattern around product selection: Product is a lookup/search field, UOM is read-only, and the contract declares internal-consumption product/conversion callouts. However, the current repo evidence does not show browser-level proof of exactly how UOM or quantity updates after product changes.
- No totals, discounts, or tax reactions are visible in the current contract or generated page evidence.

## Gap assessment

- Internal consumption business semantics imply stock impact and potentially valuation or costing effects, but the current frontend contract, generated page, and custom action do not prove what inventory or accounting side effects occur after processing or voiding. That remains a gap.
- The frontend proves the Void action is shown only for `CO` and the Process button hides once `processed` is set. It does not prove whether the backend rejects repeated process or void requests safely. That is an open ambiguity.
- The contract declares product-related callouts and a read-only UOM field, but the current evidence does not demonstrate the exact reactive behavior in the SPA after product or quantity edits. Treat product-to-UOM or quantity-conversion behavior as expected intent, not confirmed current behavior.
- There is no window-specific browser automation covering the full header-create, line-entry, process, void, and post-process read-only flow. Current proof is source-shape and hook-level, not end-to-end UI evidence.

## Manual verification

### List view
1. Open `/internal-consumption` and confirm the toolbar shows the date filter and **Filters**, but no **All statuses** dropdown, no Print button, and no per-row link icon.
2. Confirm the sort and refresh icons match the Contacts/Warehouse style, and the toolbar/table padding is tight (8 px).
3. Confirm there is no red dot next to the Movement Date values.

### Detail view
4. Create a new header; confirm Movement Date and Name are required before saving a usable record, and that the header fields render without a surrounding card border.
5. Confirm there is no **Others** tab.
6. Open the saved record, add one or more lines, and confirm Product, Movement Quantity, and Storage Bin can be entered. Confirm there is no **Line No.** column and that "Movement Quantity" fits on one line.
7. Press **Process** (next to Save) and confirm the request completes, the page refreshes, and the status moves from Draft to Completed.
8. After processing, re-open edit mode and confirm Movement Date is no longer editable if the backend marks the record as processed, and that the **Process** button is no longer shown.
9. On a Completed record, open the kebab (⋮) and confirm a neutral **Void** entry appears; run it and confirm the status moves to Voided.
10. On a Draft or Voided record, open the kebab and confirm it opens nothing (no empty popover box).
11. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence

- `artifacts/internal-consumption/contract.json` and `artifacts/internal-consumption/generated/web/internal-consumption/InternalConsumptionPage.jsx` show the master-child structure, status field, Draft/Completed/Voided enum, the `draftMode` Save/Process workflow with `extraParams`, the list-view trims (`hidePrint`, `hideLink`, `hideStatusFilter`, `customListIcons`), `noHeaderBorder`, the kebab `customMenuContent` injection, child selectors, and the `processNow` action endpoint.
- `artifacts/internal-consumption/custom/InternalConsumptionActions.jsx` is the kebab Void action: it renders only when `status === 'CO'`, POSTs `{ action: 'VO' }` to the `processNow` endpoint, refreshes after success, disables while processing, and uses neutral (black-text) styling.
- `artifacts/internal-consumption/generated/web/internal-consumption/InternalConsumptionForm.jsx` and `InternalConsumptionLineForm.jsx` show the visible editable fields, the `movementDate` read-only rule tied to `processed`, the line defaults, the hidden Line No. column, and the read-only UOM field.
- `tools/app-shell/src/components/contract-ui/__tests__/ListFilterBar.vitest.jsx` covers the generic `hideStatusFilter` behavior used by this window's list view.
- `docs/generated-custom-windows/app-shell-functional-flows.md` documents the shared routed-window behavior and the generic detail flow where child creation posts `parentId` and refreshes both header and children.
- The generated `InternalConsumptionPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_Internal_Consumption` AD table.
