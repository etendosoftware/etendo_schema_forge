# Goods Shipment

## Intent

Use this window to register and complete outbound customer shipments. The functional goal is to move goods out of inventory, confirm what was actually shipped line by line, and then continue into downstream commercial steps such as draft invoicing, customer returns, and shipment document sending.

## What this window should allow

- Create or review a shipment header with warehouse, customer, delivery address, movement date, status (rendered as a status badge, not a dot indicator), and invoicing state.
- Maintain shipment lines that represent the delivered products and quantities for the selected shipment.
- Complete a draft shipment when it is ready to be executed.
- Create a draft sales invoice from one completed shipment or from multiple completed shipments when they are invoiceable together.
- Start a return flow from a completed shipment so the user can select shipped lines and quantities to send back through the return process.
- Open related downstream or upstream documents from the shipment, especially the linked sales order and the invoices created from that order.
- Send the shipment document from the detail view.
- Complete multiple draft shipments at once from the list selection bar using the bulk action, which processes each shipment through the standard `documentAction=CO` endpoint.

## Interaction model

- Route: `/goods-shipment` and `/goods-shipment/:recordId`; the custom window wrapper also supports `?DocStatus=...`, currently used to prefilter the list to a status such as completed shipments. The list `COLUMNS` definition has `dot: false` on `movementDate` (no red/green date dot) and `type: 'status'` on `documentStatus` (proper status badge, not a dot-prefixed display).
- Visibility: visible in the Sales menu and not marked hidden in `tools/app-shell/src/menu.json`.
- Implementation type: custom route entry in `tools/app-shell/src/windows/registry.js` that loads a generated `GoodsShipmentPage` plus shipment-specific custom actions (`GoodsShipmentActions`, `BulkInvoiceFromShipment`, `RelatedDocuments`).
- Window shape: master-child window. The header entity is `goodsShipment` and the child entity is `goodsShipmentLine`.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. The add-line button, related-documents panel, notes panel, and totals panel are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.

## Reactive behavior and dependencies

- The window is master-child: opening a shipment detail loads the header plus its child lines, and line creation/editing happens in the context of the current shipment.
- The partner address selector depends on the selected business partner. Current contract evidence shows `partnerAddress` as a dependent selector filtered by `businessPartner`.
- Header editability is status-driven. Core header fields such as warehouse, business partner, partner address, and movement date become read-only once the shipment is processed.
- Shipment lines react to processing state as well. Product and quantities become read-only after processing, and `orderQuantity` only appears when the UOM-related display logic evaluates true.
- Completing is the primary status-driven action exposed through the document action override: the UI labels the action as `Complete` when the shipment is in draft status.
- The detail top bar exposes shipment-specific downstream actions. `Create Invoice` appears only for completed shipments that are not considered fully invoiced by the current page logic; `Create Return` appears for completed shipments; `Send Document` is always exposed from the custom top bar component.
- Single-shipment invoicing opens a preview modal that loads shipment lines, enriches them with unit prices from the related sales order lines, lets the user reduce quantities per line, warns when a draft invoice already exists, and posts to `createDraftInvoice`. The visible total in that modal is a preview derived from selected lines and prices, not a shipment-header total.
- Batch invoicing from the list is constrained by current UI logic: only completed shipments that are not fully invoiced are counted as invoiceable, and all selected invoiceable shipments must belong to the same business partner before `Create Invoice` is enabled. The batch modal lets the user include or exclude specific lines, adjust quantities per line, previews a derived total, checks for an existing draft invoice, and creates one draft invoice for the selected shipment set.
- Related documents currently react to the shipment's linked sales order. The tab fetches the sales order by `salesOrder`, then fetches sales invoices by the same order id, and renders navigation chips for both. Return receipts are only shown from an internal `_returnReceipts` payload if present.
- Send Email recipient resolution: the Send Email modal (`SendDocumentModal`) pre-fills the `Para` field by fetching `GET /sws/neo/contacts/businessPartner/{businessPartner}` when the modal opens, reading `etgoEmail` (`C_BPartner.EM_Etgo_Email`) from the contacts spec. The field is left empty if no email is registered for the business partner. The modal title uses `useMenuLabel()` so it renders in the active UI language (e.g. "Factura de Venta" in Spanish instead of "Invoice").
- No explicit shipment-level tax, discount, or financial recalculation behavior is visible in the current evidence. The only observed financial reaction is invoice preview total calculation based on selected shipment lines and sales-order prices.

## Gap assessment

- The return workflow is not fully backed by stable observed behavior yet. `ReturnWizard.jsx` explicitly marks the `createReturn` endpoint as pending backend implementation, and the related-documents tab says return receipts are reserved for backend support. The business intent is clear, but end-to-end return creation should be treated as a gap until backend support is confirmed.
- Batch invoice creation is clearly implemented as a draft-invoice flow, but current evidence only proves source shape and endpoint usage, not a browser-tested logistics scenario. It should be treated as supported-by-code with limited automated proof.
- The documented shipment-to-invoice relationship is order-centric: the related-documents tab resolves invoices through the linked sales order, not by directly querying invoices from the shipment id. If the business expects shipment-specific invoice traceability independent of the order link, that remains an open ambiguity.
- The top-bar and list invoicing logic check a `completelyInvoiced` flag in custom components, while the contract and generated fields expose the frontend field as `invoiced` / `Iscompletelyinvoiced`. The runtime payload may normalize both names, but this is not explicit in current evidence, so the exact gating behavior for already invoiced shipments remains an implementation ambiguity.

## Manual verification

1. Open `/goods-shipment` and confirm the list shows shipment records with document number, movement date, status, and invoicing state.
2. Open `/goods-shipment?DocStatus=CO` and confirm the list starts filtered to completed shipments.
3. Open a shipment detail and verify it behaves as a master-child page with editable header fields in draft status and child shipment lines underneath.
4. Change the business partner on a draft shipment and confirm the partner-address selector reacts as a dependent field.
5. Open a completed shipment and confirm the top bar exposes `Create Invoice`, `Create Return`, and shipment sending controls.
6. Use `Create Invoice` on a completed shipment and confirm the preview loads shipment lines, allows quantity reduction, warns if a draft invoice already exists, and navigates to the created draft invoice when successful.
7. From the list, select multiple completed shipments for the same customer and confirm batch `Create Invoice` is enabled; repeat with different customers and confirm it stays disabled.
8. In the batch invoice modal, deselect some lines or reduce quantities and confirm the preview total changes before creation.
9. Open `Related Documents` on a shipment that came from a sales order and confirm the order chip and any invoice chips navigate to the expected records.
10. Attempt the return flow on a completed shipment and verify whether the backend actually completes the return creation; if it fails, record it as the current functional gap.
11. Select two or more draft shipments from the list and confirm the bulk-complete action is available. Trigger it and verify all selected shipments move to completed status and a result toast appears.
12. Open the Send Email modal from the topbar and confirm: the `Para` field is pre-filled with the business partner's email when one is registered in `EM_Etgo_Email`; the field is empty (showing the "no email found" hint) when none is registered; and the modal title reads the translated document name in the active UI language.

## Automated evidence

- `artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage.jsx` defines the master-child page, status-driven detail actions, related-documents tab, and list bulk-action entry point.
- `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` implements single-shipment draft invoice creation, shipment return launch, shipment sending, existing-draft warning, and quantity-based invoice preview.
- `artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx` implements batch draft invoice creation for completed shipments from the same customer, with per-line selection, quantity editing, draft-invoice checking, and preview totals.
- `artifacts/goods-shipment/custom/RelatedDocuments.jsx` shows that related-document navigation currently resolves the linked sales order and sales invoices, with return receipts left pending backend support.
- `artifacts/goods-shipment/custom/ReturnWizard.jsx` explicitly documents the pending backend dependency for `createReturn`.
- `artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js` provides source-shape coverage for the bulk invoice component, including invoiceable filtering, same-customer enforcement, line fetching, sales-order price enrichment, draft-invoice checking, and draft-invoice creation endpoint usage.
- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-complete component (CO only, via `buildInOutActions`) mounted in the list selection bar for goods shipments.
- There is no dedicated browser E2E or interaction test in the current worktree proving the full shipment execution, invoicing, or return flow end to end.
- `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` proves the Send Email modal is wired with `bPartnerId` and `apiBaseUrl` so the recipient email is resolved from the contacts spec at open time, and `documentType` is translated via `useMenuLabel()`.