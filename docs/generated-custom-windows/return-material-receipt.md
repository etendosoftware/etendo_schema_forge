# Return Material Receipt

## Intent

Receive material back into stock after a sales-side return flow. The window is oriented around a receipt header that captures who is returning goods, where the material is received, and which sales order provides the source context, then child lines that record the returned products and quantities against that source document.

## What this window should allow

- Create, review, and update a return material receipt header with movement date, business partner, warehouse, partner address, tracking reference, and notes.
- Keep the receipt anchored to a source sales order so users can understand which commercial transaction the returned material belongs to.
- Maintain receipt lines that identify the returned product, received quantity, UOM, and originating sales-order line. **Lines are import-only (ETP-4462):** a return line must originate from a source shipment line via the "Importar desde envío" modal — there is no manual add-line entry path.
- Process the receipt through document actions and operational actions such as creating lines from source context, updating lines, receiving materials, or processing goods.
- Open the related sales order from the receipt detail view when users need upstream order context.
- Copy a direct link to a record — from the list selection bar when exactly one row is selected, or from the record detail view once the record is saved.
- Complete multiple draft receipts at once from the list selection bar using the bulk action (labeled "Confirmar" / i18n key `confirmBulk`), which processes each receipt through the standard `documentAction=CO` endpoint (ETP-4857).

## Interaction model

- Route: `/return-material-receipt` for the list and `/return-material-receipt/:recordId` for the detail workspace.
- Visibility: visible from the Sales menu and not marked hidden in `tools/app-shell/src/menu.json`.
- Implementation type: generated window loaded through `tools/app-shell/src/windows/registry.js`.
- Window shape: master-child. The detail view uses `returnMaterialReceipt` as the header entity and `returnMaterialReceiptLine` as the child entity.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Import-only lines (ETP-4462):** manual line creation is disabled on this window. `window.maxDetailLines: 0` in `artifacts/return-material-receipt/decisions.json` makes the generator emit `addLineGuard={(_, children) => children.length < 0}` in the generated `ReturnMaterialReceiptPage.jsx`, so `DetailView` resolves `canAddLines` to `false` unconditionally. Effects: the lines empty state hides the primary "+ Añadir líneas" button and shows only the "Importar desde envío" CTA with the import-only description key `linesImportOnlyFromShipment` ("Import the lines from the shipment to return"); and `DetailView` suppresses the add-line area below the lines table (manual add button and its kebab menu included). To keep importing possible on a draft that already has lines, the bottom panel (`artifacts/return-material-receipt/custom/ReturnMaterialReceiptBottomPanel.jsx`) re-renders the "Importar desde envío" trigger (`ReturnReceiptLineActions`) itself, above `LinesBottomSection`, when the record has lines (`props.lines.length > 0`), is in draft (`documentStatus === 'DR'`), and has a business partner set. Known limitations of this panel-rendered path: it passes no `onSave`, so the header is not saved before the import modal opens, and it refreshes via a full `window.location.reload()` after a successful import (`DetailView`'s `bottomSection` contract exposes no refresh callback). The same panel's custom empty state forwards the `canAddLine` prop to the shared `LinesEmptyState` and switches the description key on it. Note: the manual "Añadir línea" interactions described in the previous bullet are therefore not reachable on this window — inline row editing (pencil) and row deletion (trash) still work on imported lines. Full pattern reference: `docs/ui-customization.md` section 11 (`window.maxDetailLines`).
- Header interaction: the header form exposes movement date, business partner, warehouse, dependent partner address, a read-only sales order field, tracking number, and notes.
- Line interaction: the child table and form expose line number, product, movement quantity, UOM, order quantity, and sales-order-line context.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record. It coexists with the row-preview panel's dedicated customer-receipt upload slot (see the ETP-4408 note below) — the two cover different needs (any supporting document vs. the specific customer-issued proof of return).

## Reactive behavior and dependencies

- The child lines depend on the header record through the standard detail relationship; generated data flow uses `parentId={id}` for child queries, so lines are scoped to the selected receipt.
- Partner address is explicitly dependent on the selected business partner. The generated form declares `dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' }`, so the available address choices should react to customer selection.
- The receipt depends on source sales-order context. The header includes a read-only `salesOrder` field, the line model includes `salesOrderLine`, and the related-documents tab resolves the linked sales order and navigates to `/sales-order/:id`.
- The window exposes status-driven actions. `documentAction` is the explicit process endpoint, and retained rules indicate the form should become read-only when the document is completed or voided.
- Retained business rules also indicate expected defaulting: changing business partner should auto-fill the delivery address, selecting an RMA should auto-fill lines, and selecting a product on a line should auto-fill the UOM.
- No current evidence shows visible totals, tax recalculation, discount recalculation, or other header-level monetary reactions in this window.
- Copy-link visibility (ETP-4721): in the grid selection bar, `Copy link` appears only when exactly one row is selected — hidden with 0 or 2+ rows selected. In the detail topbar, `Copy link` is visible whenever the record has a persisted `recordId` (not the unsaved `'new'` sentinel), with no selection gate since detail always represents a single record. Both copy `{origin}/{windowName}/{recordId}` to the clipboard, show a `Link copied` / `Enlace copiado` toast, and display a `Copy link` / `Copiar enlace` tooltip on hover. The legacy dead link icon previously shown in the idle-state (no-selection) grid toolbar is now hidden via the `hideLink` prop passed to `<ListView>`. The detail-topbar button is rendered as a sibling of `ConfirmWithCreditButtonBase` inside `ConfirmWithCreditButton.jsx`, so it stays visible even when the base component itself returns `null` outside DR/CO status.

## Gap assessment

- The header field that carries order context is labeled `RM order` and is read-only, but the current evidence does not show how the user sets or changes that source order in the UI. If the business flow requires choosing a sales order directly from the header, that interaction is not clearly evidenced.
- The kept rule `RMA_AutoFill_Lines` says line generation should happen when selecting an RMA, but the current generated form does not expose an RMA field by that name. This is an open ambiguity between business intent and observable UI.
- Actions such as `createLinesFrom`, `receiveMaterials`, `sendMaterials`, `generateTo`, and `processGoodsJava` suggest stock-impacting or line-generation reactions, but the repo evidence here does not show their runtime behavior or sequencing. Those effects should be treated as expected but unverified.
- The line selector for `salesOrderLine` is searchable, but there is no clear evidence that it is constrained by the header sales order or by the selected product. If that dependency matters for data integrity, it is a current gap in observable behavior.
- The related-documents tab clearly links back to the sales order, but no evidence here shows links to downstream inventory or accounting documents created from the receipt.
- **ETP-4408 — Confluence DF "Documento A — Albarán de Devolución" (space PYPI, page "Ventas"):** the row-preview panel the DF asks for (right panel with Editar, General/Mensajes/Historial tabs, Estado section with status badge + billing-status progress bar, Documentos Relacionados) **mostly already existed**, shipped since ETP-4034/ETP-4208 — `windows/custom/return-material-receipt/ReturnMaterialReceiptPreview.jsx` + `useReturnReceiptPdf.js`, wired via `rowQuickActions.documentPreview: true` + `renderPreview` in this window's `index.jsx`, reusing the same shared building blocks as `goods-shipment`/`return-to-vendor-shipment`.
  The billing-status progress bar was the one piece that was **not** actually wired despite the note above — added under ETP-4408: `invoiceStatus` is now exposed (`readOnly`, `columnType: "percent"`) as a list column (`ReturnMaterialReceiptTable.jsx`) and as an "Invoiced:" row using the same `PercentBar` shared with orders/invoices, rendered in `ReturnDocStatsPanel.jsx` (shared by this window and `return-to-vendor-shipment`). Backend support (`ReturnMaterialReceiptHeaderHandler`/`ReturnToVendorShipmentHeaderHandler` in `com.etendoerp.go`, via `ReturnShipmentUtils.fetchInvoiceStatuses`) computes the real percentage from `C_GETINVOICESTATUSFROMSHIPMENT` — without it every record showed 0%.
  The left-panel mismatch flagged earlier is now resolved: the panel no longer auto-shows the system-generated PDF. It's now the customer-supplied return receipt upload (PDF/JPG/PNG, optional — empty if the customer didn't provide one), wired via `GenericPreviewModal`'s `attachmentConfig` prop (`storeCondition: true, autoFetch: false`) — the exact same pattern `InvoicePreview.jsx` uses for purchase-invoice. The system-generated PDF still exists and is used by the "Enviar"/"Descargar PDF" actions; it's just no longer what the left panel shows by default. This window-specific choice does **not** apply to `return-to-vendor-shipment`, which keeps its system PDF in the left panel unchanged.
  Other change made under ETP-4408: discarded `etblkpAccountingstatus` (the sole field on this window's "Otros" form tab, also present on `goods-shipment`) — internal accounting-posting state, not part of the DF and not needed here.
  **Bug fixed under ETP-4408 (found while validating this window, pre-existing since 2026-03):** `businessPartner` (Contacto) stayed editable forever, even on completed receipts. Root cause: its AD rule (`@Processed@='Y' | @HAS_M_INOUTLINES@='Y'`) includes `@HAS_M_INOUTLINES@`, a session variable the pipeline's resolver can never turn into client-side JS (`evaluable: false` unconditionally) — no `decisions.json` setting can fix that half of the rule. Fixed by overriding `readOnlyLogic` with the simplified, client-evaluable `"@Processed@='Y'"` instead of leaving it unresolved. **Known residual gap:** the `HAS_M_INOUTLINES` half (lock the partner once the receipt already has lines, even while still in draft) is not enforced client-side; only "locked once completed" is.
  (`warehouse` and `partnerAddress` were investigated for the same symptom and found **not** actually broken — their `"readOnlyLogic": null` in `decisions.json` turned out to be an inert no-op due to a `resolve-curated.js` `||`-fallback bug that always falls through to AD's real value regardless of an explicit `null` override; both fields already locked correctly on `Processed`. Left untouched.)
  **Known gap (not fixed under ETP-4408, left for a follow-up):** `ConfirmWithCreditButtonBase.jsx` hides the "Crear factura de devolución" action once `hasReturnInvoice` is true (i.e. *any* return invoice exists), even when `invoiceStatus < 100`. A partially invoiced return (e.g. 83%) has no way to invoice the remainder from this UI. Pre-existing since 2026-05-27 (ETP-4033), not introduced here — just made visible by the new billing-status indicator.
  **ETP-4737 — "Crear Factura Rectificativa" rename:** the invoice created from this window is now the unified "Factura Rectificativa" doc type (see `sales-invoice.md`), not a separate credit-memo/return-invoice type. `return-material-receipt/ConfirmWithCreditButton.jsx` now overrides `cardTitle`/`cardDesc` with new window-scoped keys (`returnReceipt.createRectificativeInvoice` / `returnReceipt.createRectificativeInvoiceDescription`) instead of falling back to `ConfirmWithCreditButtonBase.jsx`'s generic `createReturnInvoice`/`createReturnInvoiceDescription` keys (left untouched — they are also the fallback for `return-to-vendor-shipment`, a different window, so renaming them directly would have leaked the sales-side "Factura Rectificativa" wording into the unrelated purchase-side flow). The confirm-modal body copy (`returnReceipt.confirmModal.infoRowPost`) and the post-creation result texts (`rmrInvoiceCreatedTitle`, `rmrReturnInvoiceDoc`, `rmrCreateInvoiceConfirmDesc`) were reworded from "factura de devolución" to "factura rectificativa" in all 3 locales. **Known residual gap:** the secondary CO-status pill button (shown when the receipt is already completed and has no return invoice yet — the "add an invoice after the fact" path, distinct from the primary DR-status confirm flow) still renders the generic, unrenamed `ui('createReturnInvoice')` label ("Crear Factura de Devolución") — `ConfirmWithCreditButtonBase.jsx` has no override prop for that specific button today. Left as-is to avoid touching the shared component mid-task; a follow-up could add an optional `createButtonLabel` prop (same pattern as `cardTitle`/`cardDesc`) so this window can override it too.
- **ETP-4857 — Bulk "Confirmar" action was missing for draft receipts:** the list selection bar had no way to complete multiple Borrador receipts at once, unlike the equivalent action already present on `goods-shipment`. Root cause: `ReturnMaterialReceiptBulkActions` (in this window's `index.jsx`) only rendered `CopyLinkButton` in its `bulkActions` slot — `BulkDocumentAction` had simply never been wired in here, even though the generic component and the plumbing through `ReturnWindowShell` (which forwards `bulkActions` via prop spread to the generated page, unchanged) both already supported it. Fixed by adding `BulkDocumentAction` (from `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx`) with `entity="returnMaterialReceipt"`, `buildActions={buildInOutActions}`, `labelKey="confirmBulk"` — the exact same wiring `goods-shipment` uses. `buildInOutActions` only offers the `CO` (confirm) action when a draft row is selected; per explicit scope decision for this ticket it does **not** offer `RE` (reactivate) for completed rows selected alongside drafts, unlike `BulkDocumentAction`'s own default `buildActions` — only `DR→CO` is in scope here. **Follow-up bug found and fixed in the same change:** the result toast (success/warning/error) did not appear after running the bulk action — it only showed up whenever some other window that calls `useBulkActionToast()` happened to mount next. Root cause: `BulkDocumentAction` persists its result to `sessionStorage` and does a full `window.location.reload()`, but reading that value back and showing the toast is `useBulkActionToast()`'s job, and neither return window (nor their shared `ReturnWindowShell.jsx`) ever called it. Fixed by adding the `useBulkActionToast()` call inside `ReturnWindowShell.jsx` itself, so both `return-material-receipt` and `return-to-vendor-shipment` get it without duplicating the call in each window's `index.jsx`.
- **ETP-4940 follow-up — Confirm silently discarded pending header edits:** clicking the primary DR-status confirm button (`ConfirmWithCreditButtonBase.jsx`'s "action-confirm-with-credit") fired its own `documentAction=CO` request (inside `ConfirmInOutModal.jsx`) without ever going through `DetailView.jsx`'s draftMode/kebab-menu save-before-confirm guards that ETP-4940 had already added elsewhere — an edit made without clicking Save first was silently discarded, and the record confirmed with the last-persisted value. Fixed by threading `onSave`/`isDirty` from `DetailView.jsx`'s `topbarRight` render through `ConfirmWithCreditButton.jsx` into `ConfirmWithCreditButtonBase.jsx`, which now calls the same `maybeSaveBeforeConfirm({ isDirty, handleSave: onSave })` helper before opening the confirm modal. See `docs/ui-customization.md`'s "Save-before-confirm contract for `topbarRight`" note.
- **ETP-4707 — localized posting action + accounting status UI:** the kebab menu showed the raw AD process button labeled "Bulk Posting" (untranslated) instead of a localized action, and there was no visible accounting-status indicator anywhere on the window. Root cause: `posted` was `visibility: discarded` in `decisions.json`, and `window.menuActions`/`window.statusPills` were absent, so the generator fell back to the raw `etblkpBulkposting` AD process button. Fixed by reclassifying `posted` as `readOnly`/`badge: true` (same pattern as `purchase-invoice`), adding a single `post` entry to `window.menuActions` (localized via the existing `post`/`documentPosted` i18n keys — no new keys needed), adding `window.statusPills` for the posted/not-posted pill on the form header, and excluding the raw `etblkpBulkposting` button via `window.processOverrides` (same mechanism already used for `"Process Receipt"`). The list "Contabilizado" column comes from the same `posted` field (`grid: true, gridOrder: 8`) and is filterable out of the box through the Advanced Filter builder (funnel icon): `resolveFilterMode()` in `gridQuery.js` auto-detects `type: 'boolean'` + `badgeLabels` as `booleanLabel` mode and offers "Contabilizado"/"Sin contabilizar" as the two filter values — no extra decisions.json flag needed beyond what's already set. Scope note: unlike `purchase-invoice`, no `reactivate` menu action was added — out of scope for this ticket per explicit human decision.

## Manual verification

1. Open `/return-material-receipt` and confirm the generated list view loads instead of a placeholder or error state.
2. Open an existing receipt or start a new one, set the business partner, and confirm the partner-address selector reacts to that customer.
3. Confirm the detail page shows a header plus child lines, and that line editing includes product, movement quantity, UOM, order quantity, and sales-order-line context.
4. On a draft receipt with no lines, confirm the empty state shows ONLY the "Importar desde envío" button (no "+ Añadir líneas" primary button) with the import-only description "Import the lines from the shipment to return". On a draft receipt WITH lines, confirm the "Importar desde envío" link renders below the lines table while no manual "+ Añadir línea" button or kebab menu appears, and that pencil/trash row editing still works; run an import from that link and note the page fully reloads afterwards. On a completed receipt, confirm the import link is gone.
5. Use **Create From** or another source-driven action and verify whether lines are generated from the source order or RMA context; if they are not, treat that as a functional gap.
6. Process the receipt with a document action and confirm whether the record becomes read-only in completed or voided states.
7. Open **Related Documents** and confirm the sales-order chip navigates back to the originating sales order.
8. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
9. Open the row-preview modal (right-panel eye icon) for a receipt with no customer proof uploaded yet — confirm the left panel shows the empty drop-zone state, not a PDF. Upload a PDF/JPG/PNG — confirm it renders in place, and that download/delete controls appear on it. Close and reopen the preview — confirm the uploaded file persists. Confirm the "Facturado" percentage row and badge in the right panel status card, plus the "Invoice Status" grid column, reflect the real invoiced percentage for that record (not always 0%).
10. In the list, select 0, then 1, then 2+ receipts and confirm `Copy link` appears in the selection bar only when exactly one row is selected. Click it and confirm a `Link copied` toast appears and the clipboard contains `{origin}/return-material-receipt/<id>`. Open a saved receipt and confirm the same `Copy link` action (with tooltip on hover) is available in the detail topbar.
11. **ETP-4737:** open a draft receipt and confirm the confirm-flow card reads **"Crear Factura Rectificativa"** (not "Crear Factura de Devolución") in the active locale. Confirm and generate the invoice, then confirm it lands under the sales-invoice "Facturas rectificativas" tab. On a completed receipt with no invoice yet and a partial invoice status, confirm the secondary pill button still reads the generic, unrenamed "Crear Factura de Devolución" label (known residual gap, not fixed here).
12. On the list view, confirm the "Contabilizado" column shows a green "Contabilizado" or orange "Sin contabilizar" pill per record, and that the Advanced Filter (funnel icon) offers "Contabilizado"/"Sin contabilizar" as selectable values for that column. On the detail header, confirm a status pill with the same labels is visible. In the kebab menu, confirm a localized "Contabilizar" action (not "Bulk Posting") appears only while the document is processed and not yet posted, and confirm no raw "Bulk Posting" button appears anywhere.
13. **ETP-4857:** select two or more Borrador receipts from the list and confirm the selection bar shows a `Confirmar (N)` button. Trigger it, confirm "Procesar"/`CO` is the only action offered, and click through to completion — verify all selected receipts move to completed status and a result toast appears without needing to navigate away first. Select a completed receipt together with a draft one and confirm the bulk action still only offers to confirm the draft (no reactivate option appears for the completed one).
14. **ETP-4940 follow-up:** open a draft receipt, edit a header field (e.g. notes) WITHOUT clicking Save, then click the primary confirm button. Confirm the edit is persisted (visible after reload / on the completed record), not discarded.

## Automated evidence

- `tools/app-shell/src/menu.json` exposes `return-material-receipt` in the Sales menu, and `tools/app-shell/src/windows/registry.js` maps it to the generated window loader.
- `artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage.jsx` renders a `DetailView` for `returnMaterialReceipt` with `returnMaterialReceiptLine` children and adds a `Related Documents` custom tab.
- `artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptForm.jsx` shows the dependent `partnerAddress` selector and the read-only `salesOrder` field.
- `artifacts/return-material-receipt/custom/RelatedDocuments.jsx` fetches the linked sales order and navigates to `/sales-order/${order.id}` from the related-documents chip.
- `artifacts/return-material-receipt/decisions.json` retains rules for processed-state read-only behavior, business-partner address defaulting, RMA-based line autofill, and product-to-UOM autofill, but these are source-level signals rather than browser-verified behavior.
- `artifacts/return-material-receipt/decisions.json` sets `window.maxDetailLines: 0`, and the generated `ReturnMaterialReceiptPage.jsx` passes `addLineGuard={(_, children) => children.length < 0}` to `DetailView` — the source-level evidence for the import-only lines behavior (ETP-4462). The import-only empty-state description key `linesImportOnlyFromShipment` exists in `en_US`, `es_ES`, and `es_AR` locale files. `ReturnMaterialReceiptBottomPanel.jsx` re-renders `ReturnReceiptLineActions` above `LinesBottomSection` when `props.lines.length > 0` on a draft with a business partner, keeping the import trigger available once lines exist (panel-rendered; refreshes via `window.location.reload()`).
- **ETP-4737** — `tools/app-shell/src/windows/custom/return-material-receipt/ConfirmWithCreditButton.jsx` proves the window-scoped `returnReceipt.createRectificativeInvoice`/`createRectificativeInvoiceDescription` label overrides on the shared `ConfirmWithCreditButtonBase.jsx`. `tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ConfirmWithCreditButton.spec.jsx` covers the DR/CO render-condition behavior (unaffected by the rename) but does not assert the specific wording; unlike `return-to-vendor-shipment`, there is no dedicated i18n wording-regression test for this window's rename.
- Beyond the posting-badge/status-pill coverage above, I did not find further dedicated browser automation for this window's other flows (import-only lines, invoice-status percent bar, related documents); shared route and generated-window loading evidence is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- The generated `ReturnMaterialReceiptPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_InOut` AD table.- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.
- **ETP-4728 — "Imprimir" button (`print-return-material-receipt`)**: `DocumentPrintDrawer.jsx` derives the reportId as `print-{windowName}` (`print-return-material-receipt`), but the matching artifact directory did not exist, so `POST /api/reports/print-return-material-receipt/render` 404'd on `report-contract.json` and the print action failed with a 500. Added `artifacts/print-return-material-receipt/{report-contract.json,template.hbs,helpers.js,mock-data.json}`, adapted from `print-goods-shipment` (same `M_InOut`/`M_InOutLine` header+lines shape, no pricing) with `category: "sales"` (matching this window's `window.category`) and the info-grid label kept as "Customer" since this window's business partner role is the customer returning goods. The lines query applies `ABS(iol.movementqty)` as a defensive display guard: the actual runtime writer for this window's lines (`ReturnShipmentUtils.buildAndSaveReturnLine`, in `com.etendoerp.go`) already persists `MovementQty` positive for `MovementType = 'C+'` — diverging from the Etendo core convention (`RMInOutPickEditLines.java` negates it) — so `ABS()` guards the report against either sign without affecting the already-positive values the app actually writes. No `M_InOut` record with `MovementType = 'C+'` existed in the local dev DB to smoke-test end to end, so the render pipeline (SQL joins + Handlebars template) was validated against an existing `M_InOut` record of a different movement type via `POST /api/reports/print-return-material-receipt/render` — HTML render returns 200 with header (doc type, document number, business partner, movement date, status) and lines correctly populated with positive quantities.
- **ETP-4721 — Copy link**: `tools/app-shell/src/hooks/useCopyLinkAction.js` implements `useCopyLinkAction` (grid selection-bar copy) and `useCopyRecordLinkAction` (detail-topbar copy); `tools/app-shell/src/components/contract-ui/CopyLinkButton.jsx` and `CopyRecordLinkButton.jsx` render the tooltip-wrapped buttons for each context. `tools/app-shell/src/windows/custom/return-material-receipt/index.jsx` wires the grid action into `bulkActions` and passes `hideLink` to `<ListView>`; `tools/app-shell/src/windows/custom/return-material-receipt/ConfirmWithCreditButton.jsx` (the `topbarRight` component for this window) wires `CopyRecordLinkButton` into the detail topbar, rendered as a sibling of `ConfirmWithCreditButtonBase` so it stays visible even when the base component returns `null`.
- **ETP-4707**: `artifacts/return-material-receipt/decisions.json` sets `entities.header.fields.posted` to `readOnly`/`badge: true` with `badgeLabels`/`badgeVariants`, adds `window.menuActions` (`post`) and `window.statusPills` (posted/not-posted), and excludes the raw `etblkpBulkposting` process via `window.processOverrides`. The generated `ReturnMaterialReceiptPage.jsx` shows an empty `processes` array (no more raw "Bulk Posting" button), a `post` entry rendered from `menuActions`, and `extraBadges` includes the `posted` status pill. New/updated field-level (`badge`/`badgeLabels`/`badgeVariants`) and window-level (`statusPills`) reference documentation lives in `docs/decisions-reference.md`.
- **ETP-4707 test coverage**: `e2e/tests/flows/posting-badge-status.mocked.spec.js` is the first automated (mocked) coverage of this pattern, and exercises **this window directly** (`return-material-receipt` is the representative pick over the sibling `return-to-vendor-shipment`, since both share byte-identical `decisions.json` shape, generator output, and shared rendering components — a second parametrized copy of the sibling would duplicate assertions without covering new code). It asserts the "Contabilizado"/"Sin contabilizar" list badge, the localized "Contabilizar" kebab item, and the accounting-status pill on the detail header. Renderer-level unit coverage for `badge`/`badgeLabels`/`badgeVariants` lives in `tools/app-shell/src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx`.
- **ETP-4857**: `tools/app-shell/src/windows/custom/return-material-receipt/index.jsx` wires `BulkDocumentAction` (`entity="returnMaterialReceipt"`, `buildActions={buildInOutActions}`, `labelKey="confirmBulk"`) into `ReturnMaterialReceiptBulkActions`, alongside the pre-existing `CopyLinkButton`. `tools/app-shell/src/windows/custom/return-material-receipt/__tests__/index.test.js` asserts that wiring (props on `BulkDocumentAction`, coexistence with `CopyLinkButton`). `tools/app-shell/src/windows/custom/shared/ReturnWindowShell.jsx` now calls `useBulkActionToast()` on mount (the toast-visibility fix, shared by both return windows), asserted in `tools/app-shell/src/windows/custom/shared/__tests__/ReturnWindowShell.vitest.jsx`. `buildInOutActions`'s DR-only/no-reactivate behavior is unit-tested at its source in `tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx` (shared by every window that uses it, `goods-shipment` included — not duplicated per window).

## Print button hidden in every status — ETP-4714 (superseded by ETP-5124, see below)

Per the ticket's corrected scope, this window (unlike its sibling
`return-to-vendor-shipment`) must hide "Imprimir" in every state, not just Borrador.
`artifacts/return-material-receipt/decisions.json` sets `window.hidePrintWhen: true` — the
literal unconditional match, same mechanism used by `purchase-invoice` and every other window
in this feature (see `docs/decisions-reference.md` — "Print Visibility"). It hides the generic
icon-only Print button rendered by `DetailView.jsx`, with no effect on the list view.

This window originally shipped a different fix: `ConfirmWithCreditButton.jsx` passed a
`hidePrintAlways` boolean to `ConfirmWithCreditButtonBase.jsx`, which back then rendered its
own inline "Imprimir" button. A separate, unrelated ticket (ETP-4728 — "print unification onto
the generic icon") removed that inline button from `ConfirmWithCreditButtonBase.jsx` outright:
printing for every window is now served exclusively by the generic `DetailView.jsx` icon. That
left the generic icon with no gate at all on this window until the `hidePrintWhen` entry above
was added — `hidePrintAlways` no longer exists anywhere in this window's custom components.

**Superseded by ETP-5124** — Print now shows once the document is Completado, matching the
sibling windows. See the section below.

## Print button now conditional, and a dead `HELPERS` bug fixed — ETP-5124

Two independent bugs, closed in the same change:

- **Print visibility.** `window.hidePrintWhen` was still `true` (Print unconditionally hidden,
  per the now-superseded ETP-4714 entry above). Changed to
  `{ "documentStatus": { "notEquals": "CO" } }`, so Print now shows only once the document is
  Completado — the same shape `sales-invoice`, `sales-order`, `purchase-order`,
  `return-to-vendor-shipment`, and `goods-shipment` already use (see
  `docs/decisions-reference.md` — "Print Visibility"). `make regen ONLY=return-material-receipt`
  regenerated `HeaderPage.jsx` with the new prop; `listViewOptions` stays undeclared (unchanged),
  so the list view's print buttons keep their existing, untouched behavior.
- **`HELPERS is not defined` ReferenceError.** `useReturnReceiptPdf.js`'s
  `generateReturnReceiptPdf`/`generateReturnReceiptHtml` — the functions
  `documentPdfRegistry.js` actually calls for detail-view Print, multi-select print, and
  list-view email — referenced a module-level `HELPERS` identifier that was never declared or
  imported; only `RETURN_DOC_HELPERS` was imported, and it was already used correctly by the
  `useReturnReceiptPdf` hook in the same file. Because `hidePrintWhen: true` kept Print
  unreachable for this window, the bug was dead code until this ticket's visibility fix would
  have exposed it. Fixed by replacing `HELPERS` with `RETURN_DOC_HELPERS` in both call sites.
  The identical bug was found and fixed at the same time in the sibling
  `return-to-vendor-shipment/useReturnToVendorPdf.js` (`generateReturnToVendorPdf`/
  `generateReturnToVendorHtml`), where it was live already (that window's Print was never
  unconditionally hidden).

## Final status reads "Completado", not "Registrado" — ETP-4913

`artifacts/return-material-receipt/decisions.json` declares `entities.header.fields.documentStatus.enumValues`,
redirecting **only** `CO` to the canonical `statusComplete` key while every other code keeps its
generator-derived `docStatus*` key — so exactly one rendered label changes.

Why the override is needed even though the Application Dictionary is correct: this window reads
`M_InOut.DocStatus`, whose AD reference (`131`, "All_Document Status") names `CO`
"Completed"/"Completado", and `contract.json` carried that name correctly. The corruption happens
when the i18n key is derived. `extract-labels.js` keys enum labels by **(column name, value
code)** rather than by AD reference, so `M_InOut.DocStatus/CO` ("Completed") and
`C_Order.DocStatus/CO` ("Booked") collide on a single global `docStatusCo` key; the
`ORDER BY rl.name COLLATE "C"` tie-break picks the alphabetically-first English name, so "Booked"
always won and the locales ended up with `docStatusCo` = "Registrado" / "Booked".
`statusLabel()` resolves `enumLabels` at step 0, ahead of the correct `statuses.CO.label`
("Completado"), so the label the user saw was "Registrado".

Every other document window escaped this because it declares its own `LIST_COLUMNS` in
`windows/custom/<window>/index.jsx` with no `enumLabels` at all, falling through to
`statuses.CO.label`. The two return-shipment windows render the **generated** table, which does
carry `enumLabels` — which is why only these two showed the wrong label. The fix covers all four
surfaces at once (grid cell badge, detail-view status pill, "Todos los estados" pill, advanced
filter value dropdown), since all of them resolve through `statusLabel()` with the same
`enumLabels`.

Two alternatives were rejected: renaming the shared `docStatusCo` value in the locale files is
reverted by the next `extract-labels` run (`mergeLocaleFile` spreads the extracted enum entries
over `genericLabels`) and would break the order/quotation windows, where "Registrado" is the
correct AD label; and making the generator key reference-scoped — the actual root fix — would
rename every `docStatus*` key and force a regeneration of every artifact, which is out of
proportion for this bug. That root fix stays documented as open in
`docs/decisions-reference.md`.

Landing this also required a generator fix in `schema_forge_core`
(`cli/src/resolve-curated.js`): `buildField` copies `enumValues` from decisions first and from
the raw AD schema second, and the raw copy overwrote unconditionally — so the documented
"decisions.json `enumValues` overrides the raw ones" behavior had never actually worked for a
field backed by a real AD List reference. It only appeared to work for fields with no raw
`enumValues` (the synthetic `YesNo` `processed` status of `goods-movements`, `amortization`,
`physical-inventory`), which is why the gap went unnoticed. Across the whole repo only these two
fields were affected by the precedence bug.

Evidence: `artifacts/__tests__/etp-4913-return-shipment-final-status.test.js` asserts the
declared map, its survival into `contract.json`, and the resolved label against the real
`es_ES`/`en_US` catalogs ("Completado"/"Completed"), plus that every other code's label is
unchanged. `schema_forge_core`'s `cli/test/resolve-curated-enum-values-precedence.test.js`
covers the precedence fix.

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.
