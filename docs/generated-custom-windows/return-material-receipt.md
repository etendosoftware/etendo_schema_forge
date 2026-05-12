# Return Material Receipt

## Intent

Receive material back into stock after a sales-side return flow. The window is oriented around a receipt header that captures who is returning goods, where the material is received, and which sales order provides the source context, then child lines that record the returned products and quantities against that source document.

## What this window should allow

- Create, review, and update a return material receipt header with movement date, business partner, warehouse, partner address, tracking reference, and notes.
- Keep the receipt anchored to a source sales order so users can understand which commercial transaction the returned material belongs to.
- Add and maintain receipt lines that identify the returned product, received quantity, UOM, and originating sales-order line.
- Process the receipt through document actions and operational actions such as creating lines from source context, updating lines, receiving materials, or processing goods.
- Open the related sales order from the receipt detail view when users need upstream order context.

## Interaction model

- Route: `/return-material-receipt` for the list and `/return-material-receipt/:recordId` for the detail workspace.
- Visibility: visible from the Sales menu and not marked hidden in `tools/app-shell/src/menu.json`.
- Implementation type: generated window loaded through `tools/app-shell/src/windows/registry.js`.
- Window shape: master-child. The detail view uses `returnMaterialReceipt` as the header entity and `returnMaterialReceiptLine` as the child entity.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. The add-line button and any related panels are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.
- Header interaction: the header form exposes movement date, business partner, warehouse, dependent partner address, a read-only sales order field, tracking number, and notes.
- Line interaction: the child table and form expose line number, product, movement quantity, UOM, order quantity, and sales-order-line context.

## Reactive behavior and dependencies

- The child lines depend on the header record through the standard detail relationship; generated data flow uses `parentId={id}` for child queries, so lines are scoped to the selected receipt.
- Partner address is explicitly dependent on the selected business partner. The generated form declares `dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }`, so the available address choices should react to customer selection.
- The receipt depends on source sales-order context. The header includes a read-only `salesOrder` field, the line model includes `salesOrderLine`, and the related-documents tab resolves the linked sales order and navigates to `/sales-order/:id`.
- The window exposes status-driven actions. `documentAction` is the explicit process endpoint, and retained rules indicate the form should become read-only when the document is completed or voided.
- Retained business rules also indicate expected defaulting: changing business partner should auto-fill the delivery address, selecting an RMA should auto-fill lines, and selecting a product on a line should auto-fill the UOM.
- No current evidence shows visible totals, tax recalculation, discount recalculation, or other header-level monetary reactions in this window.

## Gap assessment

- The header field that carries order context is labeled `RM order` and is read-only, but the current evidence does not show how the user sets or changes that source order in the UI. If the business flow requires choosing a sales order directly from the header, that interaction is not clearly evidenced.
- The kept rule `RMA_AutoFill_Lines` says line generation should happen when selecting an RMA, but the current generated form does not expose an RMA field by that name. This is an open ambiguity between business intent and observable UI.
- Actions such as `createLinesFrom`, `receiveMaterials`, `sendMaterials`, `generateTo`, and `processGoodsJava` suggest stock-impacting or line-generation reactions, but the repo evidence here does not show their runtime behavior or sequencing. Those effects should be treated as expected but unverified.
- The line selector for `salesOrderLine` is searchable, but there is no clear evidence that it is constrained by the header sales order or by the selected product. If that dependency matters for data integrity, it is a current gap in observable behavior.
- The related-documents tab clearly links back to the sales order, but no evidence here shows links to downstream inventory or accounting documents created from the receipt.

## Manual verification

1. Open `/return-material-receipt` and confirm the generated list view loads instead of a placeholder or error state.
2. Open an existing receipt or start a new one, set the business partner, and confirm the partner-address selector reacts to that customer.
3. Confirm the detail page shows a header plus child lines, and that line editing includes product, movement quantity, UOM, order quantity, and sales-order-line context.
4. Use **Create From** or another source-driven action and verify whether lines are generated from the source order or RMA context; if they are not, treat that as a functional gap.
5. Process the receipt with a document action and confirm whether the record becomes read-only in completed or voided states.
6. Open **Related Documents** and confirm the sales-order chip navigates back to the originating sales order.

## Automated evidence

- `tools/app-shell/src/menu.json` exposes `return-material-receipt` in the Sales menu, and `tools/app-shell/src/windows/registry.js` maps it to the generated window loader.
- `artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage.jsx` renders a `DetailView` for `returnMaterialReceipt` with `returnMaterialReceiptLine` children and adds a `Related Documents` custom tab.
- `artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptForm.jsx` shows the dependent `partnerAddress` selector and the read-only `salesOrder` field.
- `artifacts/return-material-receipt/custom/RelatedDocuments.jsx` fetches the linked sales order and navigates to `/sales-order/${order.id}` from the related-documents chip.
- `artifacts/return-material-receipt/decisions.json` retains rules for processed-state read-only behavior, business-partner address defaulting, RMA-based line autofill, and product-to-UOM autofill, but these are source-level signals rather than browser-verified behavior.
- I did not find dedicated browser automation for this specific window; shared route and generated-window loading evidence is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.