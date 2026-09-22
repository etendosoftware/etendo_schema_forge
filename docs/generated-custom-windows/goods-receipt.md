# Goods Receipt

## Intent

This window should let a purchasing user acknowledge that a vendor delivery has physically arrived, capture what was actually received, and complete the receipt so downstream purchasing documents can reflect that intake.

The current evidence shows a receipt header on `M_InOut` plus a child line dataset on `M_InOutLine`, with custom behavior focused on adding received lines, importing pending purchase-order lines, and navigating to linked purchasing documents. The list view uses a custom `HEADER_COLUMNS` array that suppresses the red/green date dot on Movement Date (`dot: false`).

## What this window should allow

A user should be able to:

- create or continue a draft goods receipt for a vendor delivery
- set the operational header context needed to receive stock, including warehouse, vendor, vendor address, movement date, currency, and order reference
- add receipt lines manually when the delivery needs to be keyed in line by line
- import pending lines from completed purchase orders for the same vendor into the current receipt
- review received-line essentials such as product, received quantity, UOM, storage bin, and invoiced quantity
- confirm the receipt from draft so the document moves out of intake mode
- open linked purchasing documents to understand where the receipt came from and whether invoices already exist for the same order
- complete multiple draft receipts at once from the list selection bar using the bulk action (labeled "Procesar" / i18n key `process`), whose dialog offers a single document action — **Confirmar** / **Confirm** (`CO`) — processing each receipt through the standard `documentAction=CO` endpoint
- post ("Contabilizar") or unpost a completed receipt from the detail-view kebab menu, gated on document status/posted state
- post ("Contabilizar") a completed, not-yet-posted receipt directly from the list — via the row-hover kebab menu for a single record, or via the dedicated "Contabilizar" bulk action in the list selection bar for multiple selected records — without needing to open the record in form view first (ETP-5209)
- unpost ("Descontabilizar") posted receipts in bulk from the list selection bar, via a dedicated button that appears only when at least one selected row is posted (ETP-5302) — the list counterpart of the *Descontabilizar* entry this window's detail kebab already offered
- run any of those bulk actions without losing the page: the list **refetches in place** instead of reloading the browser, so scroll position and active filters survive (ETP-5302)
- preview a completed receipt by selecting a row, and create a purchase invoice directly from that preview panel (the row hover eye quick-action was removed — see ETP-4729 note below)
- preview a completed receipt from the list row quick-action or by selecting a row, and create a purchase invoice directly from that preview panel
- copy a direct link to a record — from the list selection bar when exactly one row is selected, or from the record detail view once the record is saved

## Interaction model

- Route: `/goods-receipt`, `/goods-receipt/:recordId`. The custom window wrapper reads `?DocStatus=<value>` from the URL and pre-applies it as a column filter (`documentStatus`) using the parsed `enumLabel` descriptor format required by `buildBackendFilter`. The dashboard card "Recepciones pendientes" navigates here with `?DocStatus=DR` so the list starts filtered to draft receipts awaiting processing.
- Visibility: visible from the Purchases menu under Operations
- Implementation type: custom window override registered in `tools/app-shell/src/windows/registry.js`, built on top of the generated goods-receipt window
- Window shape: master-child window with a header record (`goodsReceipt`) and child received lines (`goodsReceiptLine`).
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Create a product from the line's product selector (ETP-5254):** the product lookup drawer opened from a line shows a pinned `+ Crear producto` row at the top. It opens a popup that **mounts the Products window itself** — its own form, its own primary tabs and its own **Precio / Costo / Contabilidad / Adjuntos** strip — on a private memory router inside this page, with the app chrome dropped. Nothing is reimplemented, so a tab or field added to the Products window appears here with no change. Saving happens with the window's own `Guardar`; `Completado` then closes the popup and selects the new product in the line. Cancelling before saving leaves the receipt untouched, and Escape closes only the popup — the drawer comes back with the search intact. The line still arrives at **price 0** unless a price is set for the document's tariff, in which case the user types it on the line. The popup creates no cost line: that rule belongs to the Products window, which states and enforces it there (ETP-5245), so a stockable product created here still needs its cost set. The create row is reachable by pointer and Tab, not through the arrow-key ring. Full mechanism, why nesting a router is legal, the seven in-scope specs and the known limitations: `docs/ui-customization.md` section 19.
- **Preview panel** (`GoodsReceiptPreview.jsx`): rendered via `renderPreview` prop on the generated app. Opens from row selection. Shows document header, a General tab with receipt stats (BP, warehouse, PO link, invoice %, date), a Messages tab, and a History tab. Completed receipts show a Create Invoice action that opens `ReceiptInvoicePreview`. The PO identifier in the stats panel is a clickable link that closes the preview and navigates to `/purchase-order/:id`. This window does **not** expose any document-email / "send by email" access — the send-document feature is intentionally disabled (`window.sendDocument.enabled = false` in `decisions.json`), so no email action appears on rows, in the preview panel, or in the form action bar (ETP-4372).
- **ETP-4729 — Eye row quick-action removed**: `tools/app-shell/src/windows/custom/goods-receipt/index.jsx` sets `hideEyeCount` on the list wrapper, so the preview no longer opens from a hover "eye" icon on the row. Goods Receipt is out of scope for the ETP-4729 unified printable-documents work, so its preview remains reachable only by selecting/opening the row, not via that quick-action icon.
- **Invoice preview before creation** (`ReceiptInvoicePreview`, built inside `GoodsReceiptPreview.jsx`): when the user clicks "Create Invoice" from a completed receipt preview, a confirmation/preview modal appears showing the receipt summary and a "Confirm" button that calls the purchase-invoice creation endpoint and then displays the result via `ConfirmResultModal`.
- **Topbar invoice-status pill** (`GoodsReceiptTopbar.jsx`): renders an `InvoiceStatusPill` in the form topbar for completed receipts, showing the invoice percentage with color coding (gray = 0%, amber = partial, green = 100%). Hidden for draft receipts.
- **Button order (ETP-5260) — the "worst case" of the migration:** Copy link → Clone render to the LEFT of Save/Confirm via `GoodsReceiptSecondaryActions.jsx` (wired as `topbarSecondary`); `GoodsReceiptActions.jsx` (`topbarRight`) keeps only the PRIMARY "Crear devolución"/"Crear factura" actions, to the RIGHT of Save/Confirm — before this fix the two classes were fully INTERCALATED inside `GoodsReceiptActions.jsx`. No Send button in either slot (this window never had one — send-document is disabled for goods-receipt, ETP-4372). Clone is **not** delegated to `DocumentSecondaryActions`' generic `clone` config: goods-receipt clones through its own bespoke `CloneReceiptModal` (fetches receipt lines, then POSTs `cloneRecord` — a different shape than the generic `CloneOrderModal`), now exported from `GoodsReceiptActions.jsx` and rendered inside `GoodsReceiptSecondaryActions.jsx` via `DocumentSecondaryActions`' `children` extension point. See `docs/ui-customization.md` §3b for the general slot-classification rule.
- **Draft status chips** (`GoodsReceiptDraftChips.jsx`): custom chip set shown in the draft-mode banner, providing at-a-glance receipt progress indicators while the document is in draft.
- **Purchase Return Wizard** (`PurchaseReturnWizard.jsx`): 2-step wizard for initiating a purchase return from a completed receipt, launched from the primary "Crear devolución" topbar button (see the Button order entry above — NOT a menu action, correcting a stale claim here). Since ETP-5429 it is a thin wrapper around the shared `tools/app-shell/src/components/contract-ui/CreateReturnWizard.jsx` (unified with `ReturnWizard.jsx` on goods-shipment); `createPurchaseReturn` is a confirmed-working live action, verified end-to-end.

In practice, the header behaves like the receipt execution record and the child area behaves like the intake workspace. The custom implementation narrows the visible line table to receipt-focused columns and adds receipt-specific actions for line import and related-document navigation.


## Reactive behavior and dependencies

Observed reactive behavior:

- Vendor-dependent address selection is explicit in the contract: `partnerAddress` is a dependent selector filtered by the chosen `businessPartner`.
- **`partnerAddress` is visible in the header form (`section: "principal"`, `seq: 50`), not only referenced as the dependent selector above.** It is a mandatory FK (`required: true`); a hidden-but-mandatory field left the document unsavable whenever the selected Business Partner had no configured address, with no visible field on the screen to add or fix one. Made visible in the header to close that gap (ETP-5397), mirroring `goods-shipment`, whose `partnerAddress` was already configured this way.
- Inline contact creation (ETP-5404): `index.jsx` wraps the window in `CreateContactContext.Provider`, backed by `useCreateContactModal({ apiBaseUrl, token, documentType: 'purchase' })`, so the Contacto (`businessPartner`) selector offers a "create new contact" option without leaving the receipt — the same `CreateContactContext`/`useCreateContactModal`/`CreateContactModal` wiring `purchase-order` and `goods-shipment` already use.
- Warehouse, vendor, and movement date each declare callouts in the contract, so the business intent clearly expects server-side reactions when those values change, even though the exact returned effects are not shown in this document set.
- Movement date and accounting date default to the current date in the contract, and draft status defaults to `DR`.
- Unified document/accounting date (ETP-4531, redefined 2026-07-17): `accountingDate` (`DateAcct`) is `visibility: system` — fully hidden from the UI, not present in `frontendContract.entities.goodsReceipt.fields` at all. `movementDate` is the single visible date field. `M_InOut.MovementDate` carries `AD_Column.AD_Callout_ID = org.openbravo.erpCommon.ad_callouts.SL_InOut_AccountingDate`, which auto-fills `dateAcct` from `movementDate`. This cascade is now intentionally allowed to flow through untouched — the earlier `GoodsReceiptHeaderHandler#afterCallout` guard that stripped it (ETP-4531's original, now-superseded scope; see `docs/feedback.md`) has been removed on the `com.etendoerp.go` side, so saving the receipt writes the same date to both `movementDate` and `accountingDate` internally, and the accounting facts generated on posting reflect that unified value as the journal entry's accounting date.
- Draft processing is explicit: the header contract enables draft mode through `documentAction=CO`, and the custom UI only exposes the receipt-specific import affordances while `documentStatus === 'DR'`.
- The empty line area shows both **Add Lines** and **Import from Purchase Order** only for draft receipts, and the import affordance remains available as an extra action after lines already exist.
- Purchase-order import is vendor-scoped and receipt-aware. The modal loads completed purchase orders for the current vendor, loads existing receipt lines for the current receipt, computes what is still available per order line, preselects selectable lines, and prevents importing more than the modal-calculated available quantity.
- Imported lines post directly into `goodsReceiptLine` with `parentId`, product, movement quantity, UOM, source purchase-order line, description, and the next line number.
- Related-document behavior is custom rather than contract-declared: the window adds a **Related Documents** tab that links back to the purchase order from the header and forward to purchase invoices fetched by that order reference.
- **Currency (ETP-4028)**: header field `etgoCurrency` (`M_InOut.EM_Etgo_Currency_ID`, mandatory). Defaults to the organization's currency (`defaultExpr: "@C_Currency_ID@"`), editable while the receipt is in draft, and becomes read-only once the receipt is processed (`readOnlyLogic: "@Processed@='Y'"`). Changing the currency after lines already exist does **not** recalculate those existing lines' prices — only new lines are affected. A receipt created from a purchase order inherits that order's currency; return receipts inherit the currency of the original receipt being returned. As with Goods Shipment, no total/amount conversion display was implemented — `M_InOutLine` has no monetary columns, so there is no reliable receipt "total" to convert (scoped out of ETP-4028, open question left on the ticket).
- Currency filter on line import (ETP-4028): the receipt's own `etgoCurrency` value determines which source documents appear in **Import from Purchase Order** / **Import from Purchase Invoice**. Each modal self-fetches the current receipt header to read its currency and filters candidates to matching-currency documents only, showing a dedicated empty-state message (`noPurchaseOrdersMatchReceiptCurrency` / `noPurchaseInvoicesMatchReceiptCurrency`) when nothing matches.
- Invoice creation from a completed receipt (via `ReceiptInvoicePreview`, action `createPurchaseInvoice`) now presents the same `CreateInvoiceConfirmModal` price-list picker used by Goods Shipment: Currency shown read-only (inherited from the receipt), Tarifa (price list) required and user-selectable. `CreatePurchaseInvoiceHandler.java` applies the chosen `priceListId` to the invoice (both the linked-PO path and the no-PO fallback path, which otherwise defaults to the vendor's purchase price list) before invoice lines are priced. Since ETP-5381 that same request also **completes** the invoice, so this flow no longer produces a draft — see "Invoice is created and confirmed in one step, and guards P3a/P3b — ETP-5381" below.
- **`orderReference` (`M_InOut.POReference`, "Nº documento") — editable and saveable regardless of document status (ETP-4839).** See the dedicated section below.

No current evidence shows:

- header-level totals, discounts, or tax recalculation behavior
- child-to-header financial rollups on this window
- status-driven actions beyond draft-only intake actions and draft completion
- visible parent-child reactions that automatically default line values from the header during manual line entry, aside from normal `parentId` linkage and contract defaults

Copy-link visibility (ETP-4721): in the grid selection bar, `Copy link` appears only when exactly one row is selected — hidden with 0 or 2+ rows selected. In the detail topbar, `Copy link` is visible whenever the record has a persisted `recordId` (not the unsaved `'new'` sentinel), with no selection gate since detail always represents a single record. Both copy `{origin}/{windowName}/{recordId}` to the clipboard, show a `Link copied` / `Enlace copiado` toast, and display a `Copy link` / `Copiar enlace` tooltip on hover. The legacy dead link icon previously shown in the idle-state (no-selection) grid toolbar is now hidden via the `hideLink` prop passed to `<ListView>`.

## Gap assessment

- The business semantics suggest that confirming a goods receipt should finalize vendor delivery intake, but the current evidence only proves draft processing is wired through `documentAction=CO`; it does not prove the exact status transitions, stock effects, or downstream accounting effects after confirmation.
- The import modal prevents over-receiving relative to undelivered purchase-order quantities, but the current evidence does not show equivalent validation for manual line entry. If manual entry is supposed to enforce purchase-order or availability constraints, that is a gap or at least an open ambiguity in the visible implementation.
- The line table exposes `invoicedQuantity`, which suggests receipt-versus-invoice tracking matters, but no visible behavior explains how that field reacts after receipt confirmation or invoice creation.
- The contract includes line-level fields such as operative quantity, operative UOM, storage bin defaulting, and additional accounting dimensions, but the custom receipt view intentionally hides most of them. If users are expected to review or adjust those values during receipt execution, that expectation is not clearly supported by the current visible UI.
- Related documents are available through custom code even though the contract does not advertise `relatedDocuments: true`. That means the linkage is real in the current SPA, but it is a customization-specific behavior rather than a generic contract guarantee.
- There is no dedicated automated UI test proving the receipt confirmation flow, the import flow, or the received-line behavior end to end.
- **ETP-4839:** no automated regression test yet proves `orderReference` stays editable/saveable on a Completed receipt, that "Confirmar" never reappears once completed, or that "Guardar" correctly disables when a non-allowlisted field is dirty alongside it (`draftMode.keepSaveWhenCompletedFields`). See the dedicated section above.

## Manual verification

1. Open `/goods-receipt/:recordId` on a draft receipt and confirm the visible line columns are product, movement quantity, UOM, storage bin, and invoiced quantity.
2. Set a business partner and confirm the partner-address selector is restricted to addresses for that vendor.
3. Use a draft receipt with a selected business partner but no lines and confirm the empty state offers both **Add Lines** and **Import from Purchase Order**.
4. Open the import modal and confirm it only lists completed purchase orders for the current vendor.
5. Expand a purchase order in the modal and confirm each line shows pending quantity, import quantity, and non-selectable fully received lines.
6. Import selected lines and confirm new receipt lines are created under the current receipt, including purchase-order line linkage and incremented line numbers.
7. With lines already present, confirm the line-area extra action still exposes **Import from Purchase Order** while the receipt remains in draft.
8. Confirm the receipt and verify the document leaves draft status and the draft-only import affordances disappear. Confirm with the "Crear Factura de Compra" toggle left OFF (`goodsReceipt.confirmModal.createInvoiceTitle` — the label no longer carries the "en borrador" suffix this step used to quote; or use a receipt that is already fully invoiced, where the confirm popup only offers registering the movement) and verify **no** result modal appears — instead an auto-dismissing green `sonner` toast reads `goodsReceipt.confirmModal.confirmedTitle` ("Albarán de compra confirmado" / "Goods receipt confirmed") and the page refreshes (ETP-5063). Repeat with the toggle ON and confirm the result modal still appears, listing the created invoice.
9. Open **Related Documents** and confirm the purchase-order chip routes to `/purchase-order/:id` and invoice chips route to `/purchase-invoice/:id`.
10. Select two or more draft goods receipts from the list and confirm the bulk action bar shows a `Procesar (N)` button. Open it, confirm the document-action dropdown offers **Confirmar** (`CO`) as its only entry, trigger it, and verify all selected receipts move to completed status and a result toast appears.
11. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
12. Confirm there is **no** document-email access anywhere in this window: no envelope action on a list row hover, no "Enviar" button in the preview panel header, and no email envelope in the form-view action bar. The send-document feature is disabled for this window (ETP-4372).
13. In the list, select 0, then 1, then 2+ receipts and confirm `Copy link` appears in the selection bar only when exactly one row is selected. Click it and confirm a `Link copied` toast appears and the clipboard contains `{origin}/goods-receipt/<id>`. Open a saved receipt and confirm the same `Copy link` action (with tooltip on hover) is available in the detail topbar.
14. Create a receipt from a purchase order confirmed in a non-org currency via the "Manage Receipt" action and confirm the new receipt's Currency field is pre-filled from the order, not the org default.
15. On a draft receipt, confirm Currency defaults to the org's currency, is editable, and becomes read-only once the receipt is completed.
16. On a draft receipt with existing lines, change Currency and add a new line; confirm existing lines are unaffected.
17. On a receipt with a non-default Currency, open **Import from Purchase Order** / **Import from Purchase Invoice** and confirm only matching-currency source documents are listed, with a dedicated empty-state message when none match.
18. From a completed receipt's preview, use **Create Invoice** and confirm the popup shows Currency read-only (inherited) and a required Tarifa selector; confirm the generated invoice's lines price off the selected price list.
19. **ETP-4839:** open a Completed (`DocStatus='CO'`) receipt and confirm: the "Confirmar" button is **not** rendered; the "Nº documento" (`orderReference`) input is enabled (not disabled) while every other principal field (Warehouse, Contacto, Fecha de movimiento, etc.) remains disabled as before; "Guardar" is visible and enabled while only `orderReference` is dirty, and editing+saving it persists the change without reactivating the receipt; then edit `orderReference` together with another field (e.g. Description) and confirm "Guardar" becomes disabled with an explanatory tooltip instead of silently saving a subset.
20. **ETP-5302 — bulk "Descontabilizar".** Select one or more posted receipts and confirm a `Descontabilizar` button appears in the selection bar; run it and verify each row's Posted state clears and a result toast appears. With only not-posted rows selected the button must not render at all. With a mixed selection, confirm the not-posted rows are reported as omitted with the `bulkRowNotPosted` message rather than counted as failures. Confirm the dialog's confirm button reads **Aceptar** / **Accept**, not "Completado".
21. **ETP-5302 — no page reload.** Scroll down a long receipt list, apply a filter, then run any bulk action ("Procesar", "Contabilizar", "Descontabilizar"). The filter and the scroll position must survive, only the rows refetch, and the result toast must appear immediately rather than after a full SPA reboot.

## Automated evidence

- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-complete component (CO only, via `buildInOutActions`) mounted in the list selection bar for goods receipts with `labelKey="process"` so the button renders as "Procesar" / "Process"; the single `CO` entry in its dropdown renders as "Confirmar" / "Confirm" (`labelKey: 'confirm'`).
- **ETP-5302 — selection-bar button renamed to "Procesar", dropdown option renamed to "Confirmar"**: the floating selection-bar button is now mounted with `labelKey="process"` ("Procesar" / "Process") — the `confirmBulk` key it used before was deleted from `en_US.json`, `es_ES.json` and `es_AR.json`. In the same move, `BulkDocumentAction`'s `CO` entry (in both `buildInOutActions` and the default `buildActions`) switched from `labelKey: 'book'` to `labelKey: 'confirm'`, so the dropdown option that completes the document now reads "Confirmar" / "Confirm". The `RE` entry keeps `labelKey: 'reactivate'`. Labels only — the dialog, the per-row `Promise.allSettled` loop, the `documentAction=CO` call and the result toast are untouched. The second selection-bar button added by ETP-5209 (`labelKey="post"`, "Contabilizar") is unaffected.
- **ETP-5209 — Post reachable from the list, not just form view**: `tools/app-shell/src/windows/custom/goods-receipt/index.jsx`'s `rowQuickActions.menuActions` adds a `{ neoAction: 'post' }` entry to the row-hover kebab, gated on `!posted && processed` (the same gate `menuActionsForForm` already applies to the detail-view kebab). A successful post refreshes the list (`onMenuActionExecuted` bumps `refreshKey`). For bulk, `GoodsReceiptBulkAction` renders a second `BulkDocumentAction` instance (`entity="goodsReceipt"`, `actionMode="neoAction"`, `buildActions={buildPostActions}`, `rowFilter={postRowFilter}`, `labelKey="post"`) alongside the existing CO-only one — `buildPostActions`/`postRowFilter` are exported from `BulkDocumentAction.jsx` and shared across purchase-invoice, sales-invoice, goods-receipt, and goods-shipment. `postRowFilter` is a plain `(row, action, ui) => ...` function (not a `createPostRowFilter(ui)` factory), so it is passed by reference — the `ui` translator is supplied by `BulkDocumentAction`'s own `handleDone` at call time, not by the window wrapper. A row already posted, or not yet processed (completed), is excluded from the bulk run with a translated rejection message (`bulkRowAlreadyPosted` / `bulkRowNotCompleted`). Note: `menuActionsForForm` (passed explicitly to `GeneratedApp`) already overrides whatever `artifacts/goods-receipt/decisions.json → window.menuActions` declares for the form-view kebab — the decisions.json array is not the live source for this window's Post/Unpost gate.
- **ETP-5302 — bulk "Descontabilizar"**: `GoodsReceiptBulkAction` in `tools/app-shell/src/windows/custom/goods-receipt/index.jsx` now mounts a *third* `BulkDocumentAction` instance (`entity="goodsReceipt"`, `actionMode="neoAction"`, `buildActions={buildUnpostActions}`, `rowFilter={unpostRowFilter}`, `labelKey="unpost"`). `buildUnpostActions(rows)` — exported from `BulkDocumentAction.jsx` — offers `{ value: 'unpost', labelKey: 'unpost' }` only when at least one selected row is posted, so the button does not render otherwise; `unpostRowFilter(row, action, ui)` blocks a not-posted row with `ui('bulkRowNotPosted')`. No backend or i18n work was required: the per-row call is `POST …/{id}/action/unpost` served by `DocumentPostingService`, the same endpoint this window's detail kebab already used, and the `unpost`, `bulkRowNotPosted` and `documentUnposted` keys already existed in all three locale files.
  - **Why a separate pair from `buildPostActions`/`postRowFilter`:** `sales-invoice` and `purchase-invoice` mount the post pair too and must **not** offer a standalone unpost — on an invoice, reversing the accounting is a step inside Reactivate (`preUnpost`), never an action of its own. Only `goods-receipt` and `goods-shipment`, whose detail kebab already exposes *Descontabilizar*, mount the unpost pair.
  - **Why its own button rather than a second option inside "Contabilizar":** the dropdown sits under a button whose label *is* the action, so *Descontabilizar* offered there would appear under a button reading "Contabilizar" — named as the opposite of what it does. In practice the two buttons are rarely on screen together, since one needs a posted row and the other a processed-not-posted one.
- **ETP-5302 — bulk actions refetch in place instead of reloading the page**: `ListView.jsx` now hands `refresh` (a stable in-place refetch) to the `bulkActions` slot context, and `BulkDocumentAction` ends with `clearSelection()` → toast → `refresh()`. The old `sessionStorage` + `window.location.reload()` path survives only as a fallback for a host mounted outside `ListView`'s slot. Full contract: `docs/ui-customization.md` §9e.
- **ETP-5302 — dialog confirm button reads "Aceptar"**: `BulkDocumentAction`'s dialog footer now calls `ui('accept')` instead of `ui('done')`. `done` translates to "Completado", the name of a document *state* shown in this very list's status column, so the button read as though it would mark the documents completed. `accept` is a new key in `en_US.json`, `es_ES.json` and `es_AR.json`; `done` was deliberately left in place because `RecordCreateModal.jsx` still uses it.
- `tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx` — Vitest unit tests for the main window wrapper (row quick actions, clone, delete; the email row quick action is intentionally absent per ETP-4372).
- `tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptPreview.vitest.jsx` — Vitest unit tests for the preview panel: null guard, title, PO navigation, tab rendering (no email/send action — removed per ETP-4372).
- `tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptTopbar.vitest.jsx` — Vitest unit tests for the invoice-status pill: null guard for missing data / non-CO status, correct % display for 0/partial/full cases.
- `tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptActions.vitest.jsx` — Vitest unit tests for window actions.
- `tools/app-shell/src/windows/custom/goods-receipt/__tests__/ImportFromPurchaseOrderModal.vitest.jsx` — Vitest unit tests for the import modal.
- Shared route loading, authenticated shell behavior, and generic entity behavior are documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- Source evidence for this document:
  - `tools/app-shell/src/menu.json`
  - `tools/app-shell/src/windows/registry.js`
  - `artifacts/goods-receipt/contract.json`
  - `tools/app-shell/src/windows/custom/goods-receipt/index.jsx`
  - `tools/app-shell/src/windows/custom/goods-receipt/GoodsReceiptPreview.jsx`
  - `tools/app-shell/src/windows/custom/goods-receipt/GoodsReceiptBottomPanel.jsx`
  - `tools/app-shell/src/windows/custom/goods-receipt/ImportFromPurchaseOrderModal.jsx` — order totals shown in the import modal are formatted using the org's configured currency via `useCurrency()` and `formatCurrency()`.
  - `tools/app-shell/src/windows/custom/goods-receipt/RelatedDocuments.jsx`
  - `artifacts/goods-receipt/custom/GoodsReceiptTopbar.jsx`
  - `artifacts/goods-receipt/custom/GoodsReceiptDraftChips.jsx`
  - `artifacts/goods-receipt/custom/PurchaseReturnWizard.jsx`
  - `tools/app-shell/src/components/contract-ui/ConfirmResultModal.jsx` — shared result modal used after invoice creation from receipt
- The generated `GoodsReceiptPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_InOut` AD table.
- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.
- **ETP-4032 — Receipt invoice preview modal**: `GoodsReceiptPreview.jsx` now exposes a "Create Invoice" action for completed receipts. `GoodsReceiptTopbar.jsx` shows an invoice-status pill. `ConfirmResultModal` was extracted to `tools/app-shell/src/components/contract-ui/` and is now shared across goods-receipt, goods-shipment, purchase-order, and sales-order.
- **ETP-4721 — Copy link**: `tools/app-shell/src/hooks/useCopyLinkAction.js` implements `useCopyLinkAction` (grid selection-bar copy) and `useCopyRecordLinkAction` (detail-topbar copy); `tools/app-shell/src/components/contract-ui/CopyLinkButton.jsx` and `CopyRecordLinkButton.jsx` render the tooltip-wrapped buttons for each context. `tools/app-shell/src/windows/custom/goods-receipt/index.jsx` wires the grid action into `bulkActions` and passes `hideLink` to `<ListView>`. **Since ETP-5260**, the detail-topbar Copy link button no longer lives in `GoodsReceiptActions.jsx` (`topbarRight`) — it moved to `GoodsReceiptSecondaryActions.jsx` (`topbarSecondary`), left of Save/Confirm, alongside Clone.
- **ETP-4028 — Currency field**: same `EM_ETGO_CURRENCY_ID` column on `M_InOut` as goods-shipment (shared table). `NeoCommercialDocumentFactory.java` and `CreatePurchaseReturnHandler.java` set `.setEtgoCurrency(...)` on every receipt-creation path. `artifacts/goods-receipt/decisions.json` declares `etgoCurrency` (editable, `defaultExpr: "@C_Currency_ID@"`, locked on `Processed='Y'`) plus `window.labelOverrides`.
- **ETP-4028 — Currency-filtered imports**: `artifacts/goods-receipt/custom/ImportFromPurchaseOrderModal.jsx` and `ImportFromPurchaseInvoiceModal.jsx` fetch the receipt header for `etgoCurrency` and filter candidate documents by matching currency, computing `statusAndBpCandidates` first and then narrowing by currency (so the "excluded by currency" empty state only fires when status/BP-eligible documents exist but none match the currency).
- **ETP-5178 — Free-typing quantity field in import modals**: the shared `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx` per-line quantity input (used here by `ImportFromPurchaseOrderModal.jsx` / `ImportFromPurchaseInvoiceModal.jsx`) no longer clamps the value on every keystroke — typing, select-all, delete, and decimal entry all work freely. Range/validity (numeric, non-zero, magnitude ≤ the line's available quantity, i.e. the modal-calculated remaining-to-receive amount described above) is checked only on `onBlur`: an invalid value reverts to the last committed value and shows a `toast.error`, either `qtyMaxAllowed` ("The maximum allowed is {max}" / "El máximo permitido es {max}") when it exceeds the available quantity, or `qtyMustBePositive` ("The quantity must be greater than 0" / "La cantidad debe ser mayor a 0") for zero/negative/empty/non-numeric input. Fixed once in the shared component; applies identically across sales-invoice, purchase-invoice, and goods-shipment.
- **ETP-4028 — Price-list picker at invoice time**: `GoodsReceiptActions.jsx` wires the shared `CreateInvoiceConfirmModal` (`showPriceListPicker`, `isSOTrx={false}`) and forwards `priceListId` to the `createPurchaseInvoice` endpoint. `CreatePurchaseInvoiceHandler.java` gained `applyPriceListOverride`/`resolvePriceListOverride` helpers, applied in the linked-PO path (before `createInvoiceLinesFromDocumentLines`) and threaded through the no-PO fallback (`createFromReceiptNoPo`, now 3-arg, with a backward-compatible 2-arg overload), where it takes precedence over the vendor's default purchase price list when provided.
- **ETP-4706 QA follow-up — posting cost-message fallback**: core Etendo can return `InvalidCostWhichProduct` as the raw English text `There is no cost defined for the product: @Product@ on @Date@` with unresolved placeholders. The SPA maps that exact backend literal through `tools/app-shell/src/lib/backendErrors.js` to the existing user-facing `backendError.costNotCalculated` message, so Spanish users see the friendly retry guidance instead of costing-rule internals. The same follow-up retires the old R18 Average-cost data-fix and replaces it with a Standard-cost anchor data-fix for current Etendo Go tenants.
- **ETP-5291 (follow-up) — "Descargar PDF" kebab item removed**: unlike goods-shipment (declarative `decisions.json → window.customComponents.moreMenuContent`), this window wires the kebab menu by hand — `tools/app-shell/src/windows/custom/goods-receipt/index.jsx`'s `menuActionsForForm` callback built the `downloadPdf` entry directly, dispatching a `goods-receipt:download-pdf` `CustomEvent` on click. That entry was removed from the array; the `post`/`unpost` ("Contabilizar"/"Descontabilizar") entries are unaffected. The event was consumed by a `useEffect` in `artifacts/goods-receipt/custom/GoodsReceiptActions.jsx` that programmatically clicked a hidden `downloadLinkRef` anchor — with the dispatch gone, that listener had no remaining caller (repo-wide grep for `goods-receipt:download-pdf` confirms only test files reference it now) and was removed as dead code. The download-icon `<a ref={downloadLinkRef} download>` control itself (rendered next to the other action buttons for a completed receipt with a stored attachment) was **left untouched** — it is a self-contained, directly clickable link driven by `useMainAttachment`, independent of the removed event wiring, so the download capability is still reachable, just no longer duplicated in the kebab. Unlike goods-shipment, goods-receipt has **no** entry in `documentPdfRegistry.js` (`DOCUMENT_PDF_REGISTRY`) — it never had a client-side jsreport PDF generator; the anchor simply re-downloads the already-stored main attachment, so no generation function needed to be preserved for another entry point. Two existing tests now assert the removed behavior and need a Tester follow-up: `tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx` ("`menuActionsForForm downloadPdf action dispatches goods-receipt:download-pdf CustomEvent`" — the kebab no longer has this entry, so the event is never dispatched) and `tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptActions.vitest.jsx` (`describe('goods-receipt:download-pdf event', ...)`, both cases — the listener that used to click the anchor programmatically no longer exists).

## `orderReference` — editable and saveable regardless of completion, "Confirmar" never reappears (ETP-4839)

### Problem

`orderReference` (DB column `POReference`, labeled "Nº documento" in the UI) is the **vendor's own
document reference** — not the internal AD document number — and users occasionally need to correct
it after the receipt has already been confirmed. Before this fix, `artifacts/goods-receipt/decisions.json`
carried an explicit field-level override:

```json
"orderReference": { "readOnlyLogic": "@Processed@='Y'" }
```

This locked the field hard once the receipt reached `DocStatus='CO'` — no amount of re-editing was
possible without reactivating the document, which was the exact symptom reported in ETP-4839: *"el
campo N° documento queda directamente bloqueado en solo lectura"*. On top of that, even a field
without its own lock would have hit a second, window-level barrier: the generic `getDraftModeCompleted()`
default hides the WHOLE Save/Confirm button pair once the document is completed, so there was no Save
action available on a completed receipt at all, regardless of any single field's own state.

### Fix

Two changes, both in `artifacts/goods-receipt/decisions.json` (plus the matching custom-wrapper
override — see below), nothing in `contract.json` or generated output directly:

1. **`entities.header.fields.orderReference.readOnlyLogic`**: `"@Processed@='Y'"` → `null`. The raw
   AD metadata for `M_InOut.POReference` (`schema-raw.json`) carries no `readOnlyLogic` of its own,
   so the field now has none at all — always editable, matching `purchase-invoice`'s intent for its
   own `orderReference` field (see `docs/generated-custom-windows/purchase-invoice.md`). No
   SII-equivalent business gate exists for Goods Receipt today, so no replacement lock was added.
2. **`window.draftMode.keepSaveWhenCompletedFields`**: `["orderReference"]`. This is a per-field
   allowlist (see `docs/decisions-reference.md`'s `keepSaveWhenCompletedFields` entry): once the
   receipt is Completed, the plain "Guardar" button stays visible — but it is only **enabled** while
   every currently-dirty header field is in this list; if the user has any other field dirty at the
   same time, Save is disabled with an explanatory tooltip (fails closed, never a silent partial or
   full save). The "Confirmar" ("Save & Confirm") button, which is the one that actually resends
   `documentAction=CO`, is **never** re-exposed once the receipt is Completed, regardless of this
   list — that decision is unconditional and window-independent (see next section).

**Two places needed this config, not one.** `tools/app-shell/src/windows/custom/goods-receipt/index.jsx`
passes its own hand-built `draftMode` object straight to the generated app, which shadows whatever
`decisions.json`/`contract.json` would otherwise produce — the same pattern already known from
`purchase-invoice/index.jsx`. Missing this the first time meant the `decisions.json` fix alone had zero
effect in the running app (caught in manual browser testing, `make dev`, before this was closed) — the
custom wrapper's literal `draftMode` object needed the identical
`keepSaveWhenCompletedFields: ['orderReference']` key added alongside its existing `onConfirm` callback:

```js
draftMode={{
  enabled: true,
  processField: 'documentAction',
  processValue: 'CO',
  label: ui('confirm'),
  keepSaveWhenCompletedFields: ['orderReference'],
  onConfirm: () => window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal')),
}}
```
`keepSaveWhenCompletedFields` is orthogonal to `onConfirm` — `getDraftModeCompleted()` only reads the
former, and `onConfirm` is only consulted by the Confirm button's own click handler — so this change
does not affect the custom confirm-modal flow at all.

**Any window with a hand-built `draftMode` override in its `windows/custom/{window}/index.jsx` needs
this key applied in BOTH places** (`decisions.json` for the generated fallback, and the custom
override for what actually renders) — check `git grep -n "draftMode={{" tools/app-shell/src/windows/custom/`
before assuming a `decisions.json`-only fix is enough.

### Why the design changed from a per-window `completedStatuses` exception to a unified per-field allowlist

An earlier iteration of this fix used `window.draftMode.completedStatuses: ["CL", "RE", "VO"]`
(excluding `"CO"`) to keep the **entire** Save/Confirm pair visible on a Completed receipt, reasoning
that `M_INOUT_POST.xml`'s completion branch is gated on `DocStatus='DR'` (confirmed via direct reading
of the procedure: it only ever assigns `DocStatus='CO'` or `'VO'` to an `M_InOut` record, and a resent
`documentAction=CO` on an already-`CO` receipt matches no branch and silently no-ops) — unlike
`C_INVOICE_POST.xml` (Purchase Invoice), whose `AP`/`CO` branch (~line 1169) has no such gate and would
re-run an unconditional discount-line insertion loop, creating duplicate lines on a resent `CO`.

That made Goods Receipt's backend safe to re-expose "Confirmar" on a Completed document, while Purchase
Invoice's was not — but the human decided **not** to ship a per-window exception that depends on one
specific stored procedure staying idempotent forever. The unified design instead never re-exposes
"Confirmar" on ANY completed document, in ANY window, and solves the "user needs to fix one specific
field" need with the narrower, always-safe `keepSaveWhenCompletedFields` allowlist — "Guardar" alone
(a plain field PATCH, `hook.handleSave`, which never sends `processField`/`processValue`) can never
re-trigger `ProcessInvoiceUtil.process()`/`C_INVOICE_POST`/`M_INOUT_POST` regardless of which stored
procedure backs the window. `purchase-invoice` uses the exact same mechanism for the exact same field
(`keepSaveWhenCompletedFields: ["orderReference"]`) — see `docs/generated-custom-windows/purchase-invoice.md`.

### Regression tests

None yet — see Gap assessment below. A future Playwright/Vitest addition should assert: on a Completed
(`DocStatus='CO'`) receipt, "Confirmar" is never rendered, "Guardar" is visible and enabled while only
`orderReference` is dirty, "Guardar" becomes disabled (with the `saveBlockedFieldsNotAllowedWhenCompleted`
tooltip) if any other field is also dirty at the same time, and editing+saving `orderReference` alone
persists without reactivating the document.

## Accounting dimension visibility per section — ETP-4529

This window had the known `DISPLAY_Dimensions_WhenEnabled` gap referenced in ETP-4529: the rule
catalog declared "Accounting dimensions shown only when accounting dimension display is enabled"
(decision: Keep) but every dimension field actually carried `"form": false"` plus explicit
`"readOnlyLogic": null, "displayLogic": null"` overrides — hidden unconditionally, with the raw AD
display logic AND read-only logic both silenced. Fixed as part of ETP-4529:

| Field | Header | Lines |
| --- | --- | --- |
| `businessPartner` (Contacto) | **Nunca** — the header's `businessPartner` is the receipt's core Vendor field (raw AD display logic is `None`, not a dimension), unaffected | **Nunca** — now explicit `visibility: "discarded"` (previously `form: false` with nulled logic; same effect, now unambiguous) |
| `product` | *(no such field on the header)* | **Siempre** — core line field, no dimension gating |
| `project` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` now passes through (`section: "other"`, `form: false`/nulled logic removed) | **Por config** — same fix (`grid: true` as of ETP-4543, `form: false`/nulled logic removed) |
| `costcenter` | **Por config** — same fix as `project` | **Por config** — same fix as `project` |

The `readOnlyLogic: null` overrides removed alongside `displayLogic: null` were also silencing the
raw `@Posted@='Y'` rule — these dimension fields are now correctly locked once the receipt is
posted, in addition to being visible again.

**Runtime evaluator — fixed (ETP-4529 follow-up).**
Three generic bugs (the `EntityForm.jsx` visibility filter never actually consulting the
evaluate-display result, the `principal` section hardcoding empty visibility, and no
lines-scoped `useDisplayLogic` call existing at all) were found and fixed — full write-up in
`sales-invoice.md`. `header.project`/`header.costcenter` are now genuinely config-gated at
runtime.

**Non-grid line fields under inlineEditable — resolved (ETP-4543).** `lines.project`/
`lines.costcenter` are correctly evaluated, but this window uses
`window.linesLayout = "inlineEditable"`, under which `LinesForm.jsx` never mounts at all — so
the two fields had no UI surface to render on (Jira ETP-4543 / GitHub
`etendosoftware/etendo_schema_forge#895`). Fixed by flipping `lines.project.grid` and
`lines.costcenter.grid` from `false` to `true` in `decisions.json` (this window's line table,
`GoodsReceiptLineTable.jsx`, is pipeline-generated, so the pipeline-generated
`@sf-generated-start columns` block now includes both fields once `grid: true`) and wiring
dynamic column visibility through `InlineLinesPanel.jsx`'s new `hiddenColumns` prop and
`DetailView.jsx`'s memoized `lineHiddenColumns`. With the client's Proyecto/Centro de costo
dimension toggles OFF, the columns do not render as grid columns; with them ON, they do. See
`sales-invoice.md` for the full write-up (including the verified list of which windows
actually hit this gap).

### Header section fix, and the plain grid columns above were reverted (ETP-4529 follow-up)

`header.project`/`header.costcenter` moved from `"section": "other"` to `"section": "principal"`
so they render in the main visible form area — same fix as `sales-invoice.md`.

Separately: the `lines.project.grid`/`lines.costcenter.grid` flags flipped `false → true` just
above (ETP-4543) were **flipped back to `false`**, for the same reason as `goods-shipment.md`:
the user asked for the expand-row "Dimensiones contables" UX instead of plain columns (see
`docs/ui-customization.md` §14b), but this window's `GoodsReceiptLineTable.jsx` is fully
pipeline-generated with no override mechanism that fits the new `dimensionsPanel` column type
— only the heavier, fully self-fetching `customLinesComponent`/`CustomLines` contract exists.
Back to pre-ETP-4543 state pending a coordinator decision — see `docs/feedback.md`'s ETP-4543
supersession note.

**Resolved (ETP-4529 generator support):** `generate-frontend.js`'s `generateTableComponent`
(`schema_forge_core`) now emits a synthetic `dimensionsPanel` column directly from
`decisions.json` — no custom override needed. `lines.project.dimensionsPanel` and
`lines.costcenter.dimensionsPanel` are now `true` (grid stays `false`); the pipeline-generated
`GoodsReceiptLineTable.jsx` renders the expand-row "Dimensiones contables" panel for existing
rows. See `docs/decisions-reference.md` (`dimensionsPanel`) and `docs/ui-customization.md` §14b.

### Regen gap closed + "Añadir dimensiones" moved to a hover action (ETP-4610)

While validating ETP-4610, `contract.json`/`GoodsReceiptLineTable.jsx` were found to have **never
actually picked up** the `dimensionsPanel: true` flags above — likely lost across the
`epic/ETP-3504` merges preceding this branch, despite the ETP-4529 note claiming this window was
already regenerated. Re-ran `make regen ONLY=goods-receipt SKIP_EXTRACT=1 LOCAL_CORE=1`; confirmed
clean (`sf-validate-pipeline`, 0 violations, additive version bump). Separately, `InlineLinesPanel`
no longer renders the `dimensionsPanel` type as a grid column at all — "Añadir dimensiones" is now
a hover action next to Edit/Delete, gated on at least one visible dimension field, with the
expand-chevron column unchanged. The label/icon is adaptive: "Añadir dimensiones" while the line has
no dimension values, "Editar dimensiones" once at least one is set. See `docs/ui-customization.md`
§14b/§14c and `docs/feedback.md`'s ETP-4610 entry.

## Print button — confirmed always hidden — ETP-4714

Listed in this ticket's "Ocultar botón siempre" scope. No change was needed: `window.hidePrint:
true` was already set in `decisions.json`, and `GoodsReceiptActions.jsx` (the `topbarRight`
component) has never rendered a print button of its own. Documented here only so the audit
trail for ETP-4714 is complete across every window it named.

## Related Documents auto-refresh — ETP-4779

Generating a Purchase Invoice or a return-to-vendor shipment from `GoodsReceiptActions.jsx`
(the `topbarRight` component) used to close the result modal with a full
`window.location.reload()` — a visible flash, slower than a data refetch, and it discarded any
other in-memory client state (scroll position, other open panels). `GoodsReceiptActions` now
accepts the `onRefresh` prop `DetailView.jsx`'s topbar slot already passes it (`() =>
hook.fetchById(recordId)`) and calls that instead, in both `ConfirmResultModal.onClose` handlers
(invoice creation and purchase-return creation) — only when the user closed the modal without
navigating to the new document (`resultNavigatedRef.current === false`). The **Related
Documents** tab (`tools/app-shell/src/windows/custom/goods-receipt/RelatedDocuments.jsx`) needs
no separate refetch of its own: it derives its chips straight from `data.linkedOrders` /
`linkedInvoices` / `linkedReturns`, which `GoodsReceiptHeaderHandler.afterHandle` enriches on
every header GET — so refreshing the header via `onRefresh` is sufficient to update it.

## "Crear Factura" modal closed with no loading feedback — ETP-5333

On a **completed** receipt with no invoice yet, "Crear Factura" opens the shared
`CreateInvoiceConfirmModal.jsx` ("Gestionar documentos"). Before this fix, clicking "Crear →"
closed the modal **synchronously** in `handleCreateInvoice` (`GoodsReceiptActions.jsx`) via
`onConfirm={(priceListId) => { setShowInvoiceConfirm(false); handleCreateInvoice(priceListId); }}`
— the request then ran with no visible UI, and the "Factura de compra creada" result modal only
appeared once it resolved. `CreateInvoiceConfirmModal.jsx` already accepted a `loading` prop and
rendered a spinner + "Procesando…" on its primary button (`loading={creatingInvoice}` was
already passed here), but it was dead code: the modal unmounted before the loading state could
ever render.

Fixed by moving `setShowInvoiceConfirm(false)` into `handleCreateInvoice`'s success branch,
right before `setConfirmedDocs({...})`, so `onConfirm` is now just
`onConfirm={handleCreateInvoice}`. On failure the modal stays open (the existing `toast.error`
fires) so the user can retry, matching the draft-status confirm flow
(`ConfirmGoodsReceiptModal.jsx` → `ConfirmInOutModal.jsx`), which never had this defect because
it owns its own `loading` state. The identical defect and fix were applied to
`return-to-vendor-shipment`/`return-material-receipt` (`ConfirmWithCreditButtonBase.jsx`) and to
`goods-shipment` (`GoodsShipmentActions.jsx`), all of which share `CreateInvoiceConfirmModal.jsx`.

Also hardened while in flight: the modal's backdrop click and × button previously still closed
it even while `loading` was `true` (only the "Cancelar" footer button was disabled) — fixed with
a `dismiss = loading ? undefined : onClose` guard in `CreateInvoiceConfirmModal.jsx`.

## Confirming an already fully-invoiced receipt (ETP-5265)

A receipt whose `invoiceStatus` is already >= 100 used to open an intermediate "already
invoiced" confirmation popup on `Confirm`. ETP-5265 removed that popup: `Confirm` now calls
the canonical `documentAction` endpoint directly (`useDocumentAction`, `documentAction=CO`),
then takes the same success path the popup used to trigger (`setConfirmedDocs({ invoice: null })` -> the
`goodsReceipt.confirmModal.confirmedTitle` success toast + refresh), or shows
`toast.error` on failure. The non-fully-invoiced flow still opens `ConfirmGoodsReceiptModal` and is untouched.

**In-flight feedback lives in the Confirm button, not in a toast (ETP-5265 QA follow-up).**
The first cut showed a floating `toast.loading` card while the POST was in flight; QA rejected
it, because every other document (invoices in particular) spins inside the `Confirm` button
itself. The mechanism:

1. `GoodsReceiptActions.jsx` publishes the in-flight promise on the event object:
   `e.detail.promise = handleConfirmFullyInvoiced()`. The modal branch deliberately leaves
   `detail.promise` unset — opening a modal is instantaneous and must not spin the button.
2. The window's `draftMode.onConfirm` (`dispatchConfirmModalEvent` in the window's
   `index.jsx`) dispatches `goods-receipt:open-confirm-modal` with a mutable `detail` object and returns
   `detail.promise`.
3. The core awaits it: `runDraftModeConfirm` in
   `tools/app-shell/src/components/contract-ui/saveActions.jsx` wraps `await
   draftMode.onConfirm()` in `DraftModeConfirmButton`'s local `customConfirmBusy` state
   (try/finally), which drives the button's `Loader2` spinner and its `disabled`.

This is additive for every other `draftMode.onConfirm` window: an `onConfirm` that returns
nothing makes `await undefined` settle on the next microtask, so the button never renders a
spinner and its DOM is unchanged.

**The busy window spans the refetch, not just the POST (ETP-5265 QA follow-up 2).** The
first version of the mechanism above resolved as soon as the `documentAction` POST came
back (~150-300 ms locally) and the spinner was imperceptible: the record refresh happened
afterwards, out of band, through the `setConfirmedDocs` effect. `handleConfirmFullyInvoiced`
therefore awaits the refetch as well, so the busy state runs unbroken from the click until
the refreshed record is on screen. Three consequences:

- `useEntity.fetchById` now **returns** its `runQuery` promise (`useEntity.js`, one added
  `return`). DetailView's `onRefresh` prop is literally
  `() => hook.fetchById?.(id, { force: true })`, so without it the caller awaited
  `undefined`. No other caller reads the return value and the chain still ends in `.catch`,
  so this is behaviour-preserving.
- **Two failure domains, kept apart.** A failed POST is a failed confirmation:
  `toast.error`, no success toast, no refresh. A failed *refresh* is not — the document is
  confirmed and only the screen is stale, so the rejection is swallowed rather than
  reported as a failed confirm.
- This branch **no longer routes through `setConfirmedDocs({ invoice: null })`**. That
  setter's effect both toasts and refreshes but cannot be awaited, so it could not hold the
  button busy; the success toast (`goodsReceipt.confirmModal.confirmedTitle`) is emitted
  inline instead, at the same point the native draftMode path emits its own — right after
  the action POST succeeds and **before** the refetch (see `handleSaveAndProcess` in
  `useEntity.js`). The effect is still live and still owns the `ConfirmGoodsReceiptModal`
  path, which is why the two branches read differently in `GoodsReceiptActions.jsx`.

Known divergence from the native path: `hook.isSaving` only covers the save PATCH inside
`handleSaveAndProcess`, not its process POST or its refetch, so a fully-invoiced albarán now
spins for at least as long as — and usually longer than — an invoice does. That is the
behaviour the acceptance bar asked for (busy until the record is back); unifying the native
path to the same span would be a core change affecting every `draftMode` window.

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.

## Invoice is created and confirmed in one step, and guards P3a/P3b — ETP-5381

Both invoicing paths on this window — the "Crear Factura de Compra" toggle in the
confirm popup, and `Create Invoice` from a completed receipt's preview panel —
used to leave a **draft** purchase invoice. A draft reserves nothing:
`m_inoutline.isinvoiced` is only written when the invoice is completed, so the
same receipt could be invoiced repeatedly, and the topbar `InvoiceStatusPill`
stayed at 0% (gray) because `invoiceStatus` filters
`docstatus NOT IN ('VO','CL','DR')`.

`createPurchaseInvoice` now creates **and completes** the invoice in one atomic
request. The endpoint name is unchanged; only the outcome is. Completion runs the
`CO` document action through core `ProcessInvoiceUtil` via
`InvoiceCompletionService` (`InvoiceCompletionService.java:110`, `:167`) rather
than `C_Invoice_Post0` directly, so the `ProcessInvoiceHook` CDI chain fires. The
response now also carries `documentStatus`, which the frontend needs to render the
result. Rollback is all-or-nothing: the handler only `flush()`es and
`ProcessInvoiceUtil` owns the commit, so a failed completion leaves no orphan
draft and no burned document number
(`CreatePurchaseInvoiceHandler.java:113-126`).

### The latent bug this exposed — `resolveReceiptLineQty`

Making the invoice real made a pre-existing defect unsafe, so it was fixed in the
same ticket. `resolveReceiptLineQty`
(`CreatePurchaseInvoiceHandler.java:576-581`) falls back to the line's **full
`movementQuantity`** whenever the caller sends no explicit per-line quantities —
and the UI *never* sends them, it posts only `priceListId`. Its own javadoc
already promised the map came from `computePendingQtyPerLine`; that was simply
never wired up. The result: every invoicing run billed the entire receipt again,
from scratch.

The caller now seeds the map before calling it
(`CreatePurchaseInvoiceHandler.java:434-439`):

- **P3a** — when `parseLineOverrides(body)` is empty, `qtyOverrides` is filled
  from `NeoInvoiceSupport.computePendingQtyPerLineOrThrow(receiptId, true)`, so
  only lines with something pending are invoiced, and only for their pending
  quantity. `includeDrafts=true` counts pre-existing drafts.
- **P3b** — if that map is *also* empty, there is genuinely nothing left, which
  means a duplicate request: `AlreadyInvoicedException` with the literal
  **"This goods receipt has already been fully invoiced."**, surfaced as
  **HTTP 409** by the catch at `CreatePurchaseInvoiceHandler.java:138-140`.

The *throwing* variant is used deliberately so a DB failure surfaces as a 500
rather than being mistaken for "fully invoiced".

`backendErrors.js` maps the literal to `backendError.receiptAlreadyInvoiced`
("Este albarán de compra ya está totalmente facturado." / "This goods receipt has
already been fully invoiced."). Note the HTTP-status convention this ticket
establishes: **409 means "already invoiced" (a duplicate); 400 means "nothing to
invoice" or a missing datum** — the pre-existing price-list 400 is unaffected.

**To modify a generated invoice**, the user reactivates it: `purchase-invoice`
exposes a `reactivate` menu action (`documentAction: 'RE'`, `preUnpost: true`,
visible at `DocStatus='CO'`), now the only route back to `DR`.

### Manual verification

1. On a completed receipt that has never been invoiced, use `Create Invoice` from
   the preview panel and verify the resulting invoice opens in **Confirmado**, and
   that the topbar `InvoiceStatusPill` turns green (100%) instead of staying gray.
2. Trigger `Create Invoice` again on that receipt and verify it is rejected with
   the translated 409 ("Este albarán de compra ya está totalmente facturado.") and
   that no second invoice is created. **This is the regression this ticket fixes**
   — before it, the second run silently produced a full duplicate invoice.
3. On a **partially** invoiced receipt (invoice one PO line, leave another
   pending), run `Create Invoice` again and verify the new invoice carries only
   the pending quantities, not the full `movementQuantity` of every line.
4. Confirm a draft receipt with the invoice toggle ON and verify the result modal
   lists the invoice as confirmed.
5. Force the completion to fail and verify nothing is persisted — no draft
   invoice, and the next successful attempt reuses the same document number.

### Automated evidence

- `{etendo_root}/modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/InvoiceCompletionServiceTest.java` (new) covers the extracted completion path.
- `CreatePurchaseInvoiceHandlerTest.java` was extended for the create-and-confirm flow and for guards P3a/P3b, including the pending-quantity seeding that replaces the `movementQuantity` fallback.
- `NeoInvoiceSupportTest.java` covers `computePendingQtyPerLineOrThrow`, whose throwing behavior is what keeps a DB failure from being read as "fully invoiced".
- No frontend test covers the preview panel's handling of the new `documentStatus` field in the response.
