# Internal Consumption

## Intent

Use this window to register stock consumed inside the organization rather than sold or transferred. The current contract and generated page present it as an inventory transaction with a header record and operational lines, then a user-triggered process step that moves the document out of draft.

## What this window should allow

- Create and review internal consumption headers with at least Movement Date and Name.
- Add one or more consumption lines under a header.
- Capture the product being consumed, the movement quantity, and the storage bin used for each line.
- Review document status as it moves through Draft, Completed, and Voided states.
- Trigger the custom **Process** action from the detail view More menu so the document can be completed.

## Interaction model

- **Route:** `/internal-consumption`, `/internal-consumption/:recordId`.
- **Visibility:** visible from the Inventory menu as **Internal Consumption**.
- **Implementation type:** generated window with a custom More-menu action component (`InternalConsumptionActions`).
- **Window shape:** master-child. The header entity is `internalConsumption` and the line entity is `internalConsumptionLine`. The list route opens headers; the record route opens a detail page with child lines.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. The add-line button and any related panels are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.

## Reactive behavior and dependencies

- Header and lines are coupled through the standard detail flow. The detail page loads a header plus child lines, and child-row creation posts `parentId` and refreshes both the child list and the header record afterward.
- Status is the main document-state signal. The contract exposes `status` with Draft (`DR`), Completed (`CO`), and Voided (`VO`), defaulting new headers to Draft.
- The custom **Process** action posts to `/internalConsumption/{id}/action/processNow` with `{ action: 'CO' }`, closes the menu, and refreshes the record on success.
- The custom process action is hidden when the current record status is `VO`, so voided records do not expose that menu entry in the current frontend evidence.
- `movementDate` has read-only logic tied to `processed === true`, so the date should stop being editable once the backend marks the document as processed.
- Line entry has lightweight defaults: `movementQuantity` defaults to `0`, and `lineNo` is derived from the next available line number for the current header.
- Line fields show a dependency pattern around product selection: Product is a lookup/search field, UOM is read-only, and the contract declares internal-consumption product/conversion callouts. However, the current repo evidence does not show browser-level proof of exactly how UOM or quantity updates after product changes.
- No totals, discounts, or tax reactions are visible in the current contract or generated page evidence.

## Gap assessment

- Internal consumption business semantics imply stock impact and potentially valuation or costing effects, but the current frontend contract, generated page, and custom action test do not prove what inventory or accounting side effects occur after processing. That remains a gap.
- The frontend evidence proves that the custom action hides only for `VO`. It does not prove whether Completed records also suppress re-processing, nor whether the backend rejects repeated process requests safely. That is an open ambiguity.
- The contract declares product-related callouts and a read-only UOM field, but the current evidence does not demonstrate the exact reactive behavior in the SPA after product or quantity edits. Treat product-to-UOM or quantity-conversion behavior as expected intent, not confirmed current behavior.
- There is no window-specific browser automation covering the full header-create, line-entry, process, and post-process read-only flow. Current proof is source-shape and hook-level, not end-to-end UI evidence.

## Manual verification

1. Open `/internal-consumption` and create a new header.
2. Confirm Movement Date and Name are required before saving a usable record.
3. Open the saved record, add one or more lines, and confirm Product, Movement Quantity, and Storage Bin can be entered.
4. Run **Process** from the More menu and confirm the request completes, the page refreshes, and the status moves from Draft to Completed.
5. After processing, re-open edit mode and confirm Movement Date is no longer editable if the backend marks the record as processed.
6. Open a voided record, if one exists, and confirm the custom **Process** action is not shown.
7. If the business expects product-driven UOM updates, change Product on a draft line and verify whether UOM reacts automatically or remains unresolved in the current implementation.

## Automated evidence

- `artifacts/internal-consumption/custom/__tests__/InternalConsumptionActions.test.js` verifies the custom More-menu component exists, accepts the expected props, POSTs to the `processNow` action endpoint, sends `{ action: 'CO' }`, refreshes after success, disables itself while processing, and hides itself when status is `VO`.
- `artifacts/internal-consumption/contract.json` and `artifacts/internal-consumption/generated/web/internal-consumption/InternalConsumptionPage.jsx` show the master-child structure, status field, Draft/Completed/Voided enum, custom menu injection, child selectors, and the `processNow` action endpoint.
- `artifacts/internal-consumption/generated/web/internal-consumption/InternalConsumptionForm.jsx` and `InternalConsumptionLineForm.jsx` show the visible editable fields, the `movementDate` read-only rule tied to `processed`, the line defaults, and the read-only UOM field.
- `docs/generated-custom-windows/app-shell-functional-flows.md` documents the shared routed-window behavior and the generic detail flow where child creation posts `parentId` and refreshes both header and children.