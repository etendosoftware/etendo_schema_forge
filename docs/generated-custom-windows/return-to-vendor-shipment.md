# Return to Vendor Shipment

## Intent
This window should let a purchasing user complete the physical outbound shipment that sends returned goods back to a vendor. It sits after the return-to-vendor authorization step and before any vendor credit-memo settlement, so its business meaning is operational shipment execution rather than commercial approval or invoicing.

## What this window should allow
Users should be able to review or prepare a vendor-return shipment header, confirm who the goods are being returned to, set shipment and accounting dates, choose the warehouse context, and keep notes for the shipment record.

For a draft shipment, the window should also let the user:
- pick or edit the shipment lines that will be sent back to the vendor
- review each shipped product, quantity, UOM, storage bin, and traceability back to the originating return source
- process the shipment so the document moves out of draft once the outbound return is ready to complete

Because the line model points back to a return source, this window should primarily support completing a shipment derived from an approved vendor return rather than building an unrelated outbound movement from scratch.

## Interaction model
- Route: `/return-to-vendor-shipment`, `/return-to-vendor-shipment/:recordId`
- Visibility: visible in the Purchases menu
- Implementation type: generated window registered in `tools/app-shell/src/windows/registry.js` and loaded through the generic app-shell window loader
- Window shape: master-child window with a header entity on `M_InOut` and child lines on `M_InOutLine`.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.

At list level, the window exposes return-to-vendor shipments as purchase records. At detail level, it renders the shipment header plus child lines and a related-documents tab. The contract uses the default layout, marks `description` as the notes field, and enables related-documents support.

## Reactive behavior and dependencies
The main visible parent-child dependency is the standard shipment header to shipment lines relationship: child rows belong to the selected header record, and app-shell behavior refreshes child rows and the header together after line changes.

Observed shipment-specific reactions and dependencies include:
- **Draft-only actions:** `Pick/Edit Lines` is only shown while `Processed = N`. `Process Shipment` is shown while the document is not closed or voided.
- **Header editability changes by status:** business partner, partner address, movement date, warehouse, and several accounting dimensions become read-only after processing or posting conditions defined in the contract.
- **Agentic address dependency:** `partnerAddress` is treated as dependent on `businessPartner`, passing `C_BPartner_ID` to the selector so vendor-return shipment agents can resolve valid partner locations without hardcoded IDs.
- **Date defaulting:** movement date and accounting date both default to the current date in the contract.
- **Header-driven callouts:** the contract attaches callouts to business partner, movement date, and warehouse, which suggests dependent updates for address/accounting/warehouse context even though the exact UI result is not documented in current evidence.
- **Return-source traceability on lines:** the line model includes a read-only `Return to Vendor line` reference (`C_OrderLine_ID`), plus product, movement quantity, UOM, storage bin, and optional attribute-set value.
- **Related-document navigation:** the generated detail view exposes a Related Documents tab because the contract marks the window as `relatedDocuments: true`.

Current evidence does not show totals, discounts, taxes, or pricing reactions on this shipment window, which is consistent with a logistics document rather than a commercial order.

## Gap assessment
- The business flow strongly suggests this shipment should be created from an approved vendor return or RMA-like source, but the current generated header form does not visibly expose an explicit return header field such as `M_RMA_ID`. The linkage is implied through the document purpose, the research findings, and the line reference back to the return source, but the exact user-facing source-selection flow is not fully evidenced.
- The generated page defines dependent add-line fields for a return order line and an RMA line, but the rendered line form in current evidence is largely read-only and does not expose those same editable dependencies in a clearly supported way. This leaves ambiguity about whether users actually add lines manually in the SPA, rely entirely on `Pick/Edit Lines`, or get lines from another server-driven workflow.
- Shipment-completion semantics imply an outbound stock movement that decreases inventory, but the current SPA evidence does not directly prove the stock effect, reservation changes, or warehouse-on-hand updates. That should be treated as expected ERP behavior, not confirmed UI behavior.
- The document-status field and process button show lifecycle state, but the exact status transition path for this window is not covered by a dedicated browser test.
- Related-document support is clearly enabled, but the exact linked targets shown to users for vendor returns versus receipts or credit memos are not demonstrated in current evidence.
- **ETP-4408 — Confluence DF "Documento A — Albarán de Devolución" (space PYPI, page "Compras"):** the row-preview panel the DF asks for (PDF left panel; right panel with Enviar/Descargar PDF/Editar, General/Mensajes/Historial tabs, Estado section with status badge + billing-status progress bar, Documentos Relacionados) **mostly already existed**, shipped since ETP-4034/ETP-4208 — `windows/custom/return-to-vendor-shipment/ReturnToVendorShipmentPreview.jsx` + `useReturnToVendorPdf.js`, wired via `rowQuickActions.documentPreview: true` + `renderPreview` in this window's `index.jsx`, reusing the same shared building blocks as `goods-shipment` (`GenericPreviewModal`, `PreviewPdfPanel`, `SummaryCard`'s `PercentBar`/`InfoRow`/`CardShell`, `RelatedDocumentsCard`).
  The billing-status progress bar was the one piece that was **not** actually wired despite the note above — added under ETP-4408: `invoiceStatus` is now exposed (`readOnly`, `columnType: "percent"`) as a list column (`ReturnToVendorShipmentTable.jsx`) and as an "Invoiced:" row using the same `PercentBar` shared with orders/invoices, rendered in `ReturnDocStatsPanel.jsx` (shared by this window and `return-material-receipt`).
  Other change made under ETP-4408: discarded `etblkpAccountingstatus` (the sole field on this window's "Otros" form tab, also present on `goods-shipment`) — internal accounting-posting state, not part of the DF and not needed here.
  **Bug fixed under ETP-4408 (same defect as `return-material-receipt`, pre-existing since 2026-03):** `businessPartner` (Contacto) stayed editable even on completed shipments, because its AD rule (`@Processed@='Y' | @HAS_M_INOUTLINES@='Y'`) includes a session variable the pipeline can never translate to client-side JS. Fixed the same way — overrode `readOnlyLogic` with the simplified `"@Processed@='Y'"`. Same residual gap as the sales-side window: the "lock once lines exist, even in draft" half of the original rule isn't enforced client-side.
  (`warehouse` and `partnerAddress` were checked too and found not actually broken — see `return-material-receipt.md` for why their `"readOnlyLogic": null` was always a no-op, not a real silencer. Left untouched.)

## Manual verification
1. Open `/return-to-vendor-shipment/:recordId` for a draft record.
2. Confirm the header shows vendor-facing shipment context: business partner, partner address, movement date, accounting date, warehouse, description, and document status.
3. Select or change a business partner and confirm partner address options are scoped to that selected vendor.
4. Confirm draft records expose both `Pick/Edit Lines` and `Process Shipment`.
5. Use `Pick/Edit Lines` and verify the resulting shipment lines reflect the return source, including product, movement quantity, UOM, storage bin, and the `Return to Vendor line` reference when available.
6. Process the shipment and confirm the document moves out of draft and the draft-only actions disappear or become unavailable.
7. If related documents exist, open the Related Documents tab and verify it links the shipment back to the surrounding return flow.
8. If stock-movement behavior is important for the rollout, verify separately in the ERP/backend that processing this shipment produces the expected outbound inventory effect, because that consequence is not directly proven by current SPA evidence.
9. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence
- `tools/app-shell/src/menu.json` places `return-to-vendor-shipment` in the Purchases menu.
- `tools/app-shell/src/windows/registry.js` registers the generated window route.
- `artifacts/return-to-vendor-shipment/contract.json` defines a default-layout `M_InOut` header with `relatedDocuments: true`, draft-sensitive shipment actions, status/read-only logic, current-date defaults, and `M_InOutLine` child records.
- `artifacts/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnShipmentPage.jsx` shows the detail view with child lines and the Related Documents tab.
- `artifacts/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/HeaderForm.jsx` and `LinesForm.jsx` show the currently surfaced header and line fields.
- `artifacts/return-to-vendor-shipment/FINDINGS.md` documents the intended logistics meaning of this window as vendor outbound movement (`MovementType = V-`) and its relationship to the return-to-vendor authorization flow.
- There is no dedicated `return-to-vendor-shipment` browser test in current evidence. Shared route loading and generic entity data behavior are documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- The generated `ReturnShipmentPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_InOut` AD table.
- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.
