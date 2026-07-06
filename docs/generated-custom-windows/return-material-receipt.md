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
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- Header interaction: the header form exposes movement date, business partner, warehouse, dependent partner address, a read-only sales order field, tracking number, and notes.
- Line interaction: the child table and form expose line number, product, movement quantity, UOM, order quantity, and sales-order-line context.
- No **Attachments** tab (`window.attachments: false`, set under ETP-4408) — the customer's return-receipt proof now has a dedicated upload slot in the row-preview panel's left column instead (see the ETP-4408 note below); a second generic multi-file attachment surface was judged redundant for this window.

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
- **ETP-4408 — Confluence DF "Documento A — Albarán de Devolución" (space PYPI, page "Ventas"):** the row-preview panel the DF asks for (right panel with Editar, General/Mensajes/Historial tabs, Estado section with status badge + billing-status progress bar, Documentos Relacionados) **mostly already existed**, shipped since ETP-4034/ETP-4208 — `windows/custom/return-material-receipt/ReturnMaterialReceiptPreview.jsx` + `useReturnReceiptPdf.js`, wired via `rowQuickActions.documentPreview: true` + `renderPreview` in this window's `index.jsx`, reusing the same shared building blocks as `goods-shipment`/`return-to-vendor-shipment`.
  The billing-status progress bar was the one piece that was **not** actually wired despite the note above — added under ETP-4408: `invoiceStatus` is now exposed (`readOnly`, `columnType: "percent"`) as a list column (`ReturnMaterialReceiptTable.jsx`) and as an "Invoiced:" row using the same `PercentBar` shared with orders/invoices, rendered in `ReturnDocStatsPanel.jsx` (shared by this window and `return-to-vendor-shipment`). Backend support (`ReturnMaterialReceiptHeaderHandler`/`ReturnToVendorShipmentHeaderHandler` in `com.etendoerp.go`, via `ReturnShipmentUtils.fetchInvoiceStatuses`) computes the real percentage from `C_GETINVOICESTATUSFROMSHIPMENT` — without it every record showed 0%.
  The left-panel mismatch flagged earlier is now resolved: the panel no longer auto-shows the system-generated PDF. It's now the customer-supplied return receipt upload (PDF/JPG/PNG, optional — empty if the customer didn't provide one), wired via `GenericPreviewModal`'s `attachmentConfig` prop (`storeCondition: true, autoFetch: false`) — the exact same pattern `InvoicePreview.jsx` uses for purchase-invoice. The system-generated PDF still exists and is used by the "Enviar"/"Descargar PDF" actions; it's just no longer what the left panel shows by default. This window-specific choice does **not** apply to `return-to-vendor-shipment`, which keeps its system PDF in the left panel unchanged.
  Once this single-file upload slot existed, the generic multi-file **Attachments** tab became redundant for this window and was removed (`window.attachments: false`) — see the Interaction model section above.
  Other change made under ETP-4408: discarded `etblkpAccountingstatus` (the sole field on this window's "Otros" form tab, also present on `goods-shipment`) — internal accounting-posting state, not part of the DF and not needed here.
  **Known gap (not fixed under ETP-4408, left for a follow-up):** `ConfirmWithCreditButtonBase.jsx` hides the "Crear factura de devolución" action once `hasReturnInvoice` is true (i.e. *any* return invoice exists), even when `invoiceStatus < 100`. A partially invoiced return (e.g. 83%) has no way to invoice the remainder from this UI. Pre-existing since 2026-05-27 (ETP-4033), not introduced here — just made visible by the new billing-status indicator.

## Manual verification

1. Open `/return-material-receipt` and confirm the generated list view loads instead of a placeholder or error state.
2. Open an existing receipt or start a new one, set the business partner, and confirm the partner-address selector reacts to that customer.
3. Confirm the detail page shows a header plus child lines, and that line editing includes product, movement quantity, UOM, order quantity, and sales-order-line context.
4. Use **Create From** or another source-driven action and verify whether lines are generated from the source order or RMA context; if they are not, treat that as a functional gap.
5. Process the receipt with a document action and confirm whether the record becomes read-only in completed or voided states.
6. Open **Related Documents** and confirm the sales-order chip navigates back to the originating sales order.
7. Open a saved record and confirm there is **no Attachments tab** in the tab strip (removed under ETP-4408 — see the "Interaction model" note).
8. Open the row-preview modal (right-panel eye icon) for a receipt with no customer proof uploaded yet — confirm the left panel shows the empty drop-zone state, not a PDF. Upload a PDF/JPG/PNG — confirm it renders in place, and that download/delete controls appear on it. Close and reopen the preview — confirm the uploaded file persists. Confirm the "Facturado" percentage row and badge in the right panel status card, plus the "Invoice Status" grid column, reflect the real invoiced percentage for that record (not always 0%).

## Automated evidence

- `tools/app-shell/src/menu.json` exposes `return-material-receipt` in the Sales menu, and `tools/app-shell/src/windows/registry.js` maps it to the generated window loader.
- `artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage.jsx` renders a `DetailView` for `returnMaterialReceipt` with `returnMaterialReceiptLine` children and adds a `Related Documents` custom tab.
- `artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptForm.jsx` shows the dependent `partnerAddress` selector and the read-only `salesOrder` field.
- `artifacts/return-material-receipt/custom/RelatedDocuments.jsx` fetches the linked sales order and navigates to `/sales-order/${order.id}` from the related-documents chip.
- `artifacts/return-material-receipt/decisions.json` retains rules for processed-state read-only behavior, business-partner address defaulting, RMA-based line autofill, and product-to-UOM autofill, but these are source-level signals rather than browser-verified behavior.
- I did not find dedicated browser automation for this specific window; shared route and generated-window loading evidence is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- The generated `ReturnMaterialReceiptPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_InOut` AD table.- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.
