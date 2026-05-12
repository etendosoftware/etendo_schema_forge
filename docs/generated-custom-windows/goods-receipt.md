# Goods Receipt

## Intent

This window should let a purchasing user acknowledge that a vendor delivery has physically arrived, capture what was actually received, and complete the receipt so downstream purchasing documents can reflect that intake.

The current evidence shows a receipt header on `M_InOut` plus a child line dataset on `M_InOutLine`, with custom behavior focused on adding received lines, importing pending purchase-order lines, and navigating to linked purchasing documents. The list view uses a custom `HEADER_COLUMNS` array that suppresses the red/green date dot on Movement Date (`dot: false`).

## What this window should allow

A user should be able to:

- create or continue a draft goods receipt for a vendor delivery
- set the operational header context needed to receive stock, including warehouse, vendor, vendor address, movement date, and order reference
- add receipt lines manually when the delivery needs to be keyed in line by line
- import pending lines from completed purchase orders for the same vendor into the current receipt
- review received-line essentials such as product, received quantity, UOM, storage bin, and invoiced quantity
- confirm the receipt from draft so the document moves out of intake mode
- open linked purchasing documents to understand where the receipt came from and whether invoices already exist for the same order
- complete multiple draft receipts at once from the list selection bar using the bulk action, which processes each receipt through the standard `documentAction=CO` endpoint

## Interaction model

- Route: `/goods-receipt`, `/goods-receipt/:recordId`
- Visibility: visible from the Purchases menu under Operations
- Implementation type: custom window override registered in `tools/app-shell/src/windows/registry.js`, built on top of the generated goods-receipt window
- Window shape: master-child window with a header record (`goodsReceipt`) and child received lines (`goodsReceiptLine`).
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. The add-line button and any related panels are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.

In practice, the header behaves like the receipt execution record and the child area behaves like the intake workspace. The custom implementation narrows the visible line table to receipt-focused columns and adds receipt-specific actions for line import and related-document navigation.


## Reactive behavior and dependencies

Observed reactive behavior:

- Vendor-dependent address selection is explicit in the contract: `partnerAddress` is a dependent selector filtered by the chosen `businessPartner`.
- Warehouse, vendor, and movement date each declare callouts in the contract, so the business intent clearly expects server-side reactions when those values change, even though the exact returned effects are not shown in this document set.
- Movement date and accounting date default to the current date in the contract, and draft status defaults to `DR`.
- Draft processing is explicit: the header contract enables draft mode through `documentAction=CO`, and the custom UI only exposes the receipt-specific import affordances while `documentStatus === 'DR'`.
- The empty line area shows both **Add Lines** and **Import from Purchase Order** only for draft receipts, and the import affordance remains available as an extra action after lines already exist.
- Purchase-order import is vendor-scoped and receipt-aware. The modal loads completed purchase orders for the current vendor, loads existing receipt lines for the current receipt, computes what is still available per order line, preselects selectable lines, and prevents importing more than the modal-calculated available quantity.
- Imported lines post directly into `goodsReceiptLine` with `parentId`, product, movement quantity, UOM, source purchase-order line, description, and the next line number.
- Related-document behavior is custom rather than contract-declared: the window adds a **Related Documents** tab that links back to the purchase order from the header and forward to purchase invoices fetched by that order reference.

No current evidence shows:

- header-level totals, discounts, or tax recalculation behavior
- child-to-header financial rollups on this window
- status-driven actions beyond draft-only intake actions and draft completion
- visible parent-child reactions that automatically default line values from the header during manual line entry, aside from normal `parentId` linkage and contract defaults

## Gap assessment

- The business semantics suggest that confirming a goods receipt should finalize vendor delivery intake, but the current evidence only proves draft processing is wired through `documentAction=CO`; it does not prove the exact status transitions, stock effects, or downstream accounting effects after confirmation.
- The import modal prevents over-receiving relative to undelivered purchase-order quantities, but the current evidence does not show equivalent validation for manual line entry. If manual entry is supposed to enforce purchase-order or availability constraints, that is a gap or at least an open ambiguity in the visible implementation.
- The line table exposes `invoicedQuantity`, which suggests receipt-versus-invoice tracking matters, but no visible behavior explains how that field reacts after receipt confirmation or invoice creation.
- The contract includes line-level fields such as operative quantity, operative UOM, storage bin defaulting, and additional accounting dimensions, but the custom receipt view intentionally hides most of them. If users are expected to review or adjust those values during receipt execution, that expectation is not clearly supported by the current visible UI.
- Related documents are available through custom code even though the contract does not advertise `relatedDocuments: true`. That means the linkage is real in the current SPA, but it is a customization-specific behavior rather than a generic contract guarantee.
- There is no dedicated automated UI test proving the receipt confirmation flow, the import flow, or the received-line behavior end to end.

## Manual verification

1. Open `/goods-receipt/:recordId` on a draft receipt and confirm the visible line columns are product, movement quantity, UOM, storage bin, and invoiced quantity.
2. Set a business partner and confirm the partner-address selector is restricted to addresses for that vendor.
3. Use a draft receipt with a selected business partner but no lines and confirm the empty state offers both **Add Lines** and **Import from Purchase Order**.
4. Open the import modal and confirm it only lists completed purchase orders for the current vendor.
5. Expand a purchase order in the modal and confirm each line shows pending quantity, import quantity, and non-selectable fully received lines.
6. Import selected lines and confirm new receipt lines are created under the current receipt, including purchase-order line linkage and incremented line numbers.
7. With lines already present, confirm the line-area extra action still exposes **Import from Purchase Order** while the receipt remains in draft.
8. Confirm the receipt and verify the document leaves draft status and the draft-only import affordances disappear.
9. Open **Related Documents** and confirm the purchase-order chip routes to `/purchase-order/:id` and invoice chips route to `/purchase-invoice/:id`.
10. Select two or more draft goods receipts from the list and confirm the bulk-complete action is available. Trigger it and verify all selected receipts move to completed status and a result toast appears.

## Automated evidence

- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-complete component (CO only, via `buildInOutActions`) mounted in the list selection bar for goods receipts.
- No dedicated goods-receipt UI test was found in `tools/app-shell`.
- Shared route loading, authenticated shell behavior, and generic entity behavior are documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- Source evidence for this document:
  - `tools/app-shell/src/menu.json`
  - `tools/app-shell/src/windows/registry.js`
  - `artifacts/goods-receipt/contract.json`
  - `tools/app-shell/src/windows/custom/goods-receipt/index.jsx`
  - `tools/app-shell/src/windows/custom/goods-receipt/GoodsReceiptBottomPanel.jsx`
  - `tools/app-shell/src/windows/custom/goods-receipt/ImportFromPurchaseOrderModal.jsx` — order totals shown in the import modal are formatted using the org's configured currency via `useCurrency()` and `formatCurrency()`.
  - `tools/app-shell/src/windows/custom/goods-receipt/RelatedDocuments.jsx`
