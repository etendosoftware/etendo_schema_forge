# Goods Shipment

## Intent

Use this window to register and complete outbound customer shipments. The functional goal is to move goods out of inventory, confirm what was actually shipped line by line, and then continue into downstream commercial steps such as draft invoicing, customer returns, and shipment document sending.

## What this window should allow

- Create or review a shipment header with warehouse, customer, delivery address, movement date, status (rendered as a status badge, not a dot indicator), currency, and invoicing state.
- Maintain shipment lines that represent the delivered products and quantities for the selected shipment.
- Complete a draft shipment when it is ready to be executed.
- Create a sales invoice from one completed shipment or from multiple completed shipments when they are invoiceable together. Since ETP-5381 that invoice is created **and confirmed** in one step — it is never left in Borrador.
- Start a return flow from a completed shipment so the user can select shipped lines and quantities to send back through the return process.
- Open related downstream or upstream documents from the shipment, especially the linked sales order and the invoices created from that order.
- Send the shipment document by email from the detail view, once the shipment is completed.
- Complete multiple draft shipments at once from the list selection bar using the bulk action (labeled "Procesar" / i18n key `process`). Its dialog offers a single document action, **Confirmar** / **Confirm** (`CO`), which processes each shipment through the standard `documentAction=CO` endpoint.
- Post ("Contabilizar") or unpost a completed shipment from the detail-view kebab menu, gated on posted/processed state.
- Post ("Contabilizar") a completed, not-yet-posted shipment directly from the list — via the row-hover kebab menu for a single record, or via the dedicated "Contabilizar" bulk action in the list selection bar for multiple selected records — without needing to open the record in form view first (ETP-5209).
- Unpost ("Descontabilizar") posted shipments in bulk from the list selection bar, via a dedicated button that appears only when at least one selected row is posted (ETP-5302). It is the list counterpart of the *Descontabilizar* entry this window's detail kebab already offered.
- Every bulk action in this window's selection bar — "Procesar", "Contabilizar", "Descontabilizar" and "Crear Factura" — now **refetches the list in place** instead of reloading the browser page, so scroll position and active filters survive (ETP-5302).
- Copy a direct link to a record — from the list selection bar when exactly one row is selected, or from the record detail view once the record is saved.

## Interaction model

- Route: `/goods-shipment` and `/goods-shipment/:recordId`. The custom window wrapper reads `?DocStatus=<value>` from the URL and pre-applies it as a column filter (`documentStatus`) using the parsed `enumLabel` descriptor format required by `buildBackendFilter`. The dashboard card "Envíos pendientes" navigates here with `?DocStatus=DR` so the list starts filtered to draft shipments awaiting processing. The list `COLUMNS` definition has `dot: false` on `movementDate` (no red/green date dot) and `type: 'status'` on `documentStatus` (proper status badge, not a dot-prefixed display).
- Visibility: visible in the Sales menu and not marked hidden in `tools/app-shell/src/menu.json`.
- Implementation type: custom route entry in `tools/app-shell/src/windows/registry.js` that loads a generated `GoodsShipmentPage` plus shipment-specific custom actions (`GoodsShipmentActions`, `BulkInvoiceFromShipment`, `RelatedDocuments`).
- Window shape: master-child window. The header entity is `goodsShipment` and the child entity is `goodsShipmentLine`.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Create a product from the line's product selector (ETP-5254):** the product lookup drawer opened from a line shows a pinned `+ Crear producto` row at the top. It opens a popup that **mounts the Products window itself** — its own form, its own primary tabs and its own **Precio / Costo / Contabilidad / Adjuntos** strip — on a private memory router inside this page, with the app chrome dropped. Nothing is reimplemented, so a tab or field added to the Products window appears here with no change. Saving happens with the window's own `Guardar`; `Completado` then closes the popup and selects the new product in the line. Cancelling before saving leaves the shipment untouched, and Escape closes only the popup — the drawer comes back with the search intact. The line still arrives at **price 0** unless a price is set for the document's tariff, in which case the user types it on the line. The popup creates no cost line: that rule belongs to the Products window, which states and enforces it there (ETP-5245), so a stockable product created here still needs its cost set. The create row is reachable by pointer and Tab, not through the arrow-key ring. Full mechanism, why nesting a router is legal, the seven in-scope specs and the known limitations: `docs/ui-customization.md` section 19.

## Reactive behavior and dependencies

- The window is master-child: opening a shipment detail loads the header plus its child lines, and line creation/editing happens in the context of the current shipment.
- The partner address selector depends on the selected business partner. Current contract evidence shows `partnerAddress` as a dependent selector filtered by `businessPartner`.
- Header editability is status-driven. Core header fields such as warehouse, business partner, partner address, and movement date become read-only once the shipment is processed.
- Unified document/accounting date (ETP-4531, redefined 2026-07-17): `accountingDate` (`DateAcct`) is `visibility: system` — fully hidden from the UI, not present in `frontendContract.entities.goodsShipment.fields` at all. `movementDate` is the single visible date field. `M_InOut.MovementDate` (shared table with Goods Receipt) carries `AD_Column.AD_Callout_ID = org.openbravo.erpCommon.ad_callouts.SL_InOut_AccountingDate`, which auto-fills `dateAcct` from `movementDate`. This cascade is now intentionally allowed to flow through untouched — the earlier `GoodsShipmentHeaderHandler#afterCallout` guard that stripped it (ETP-4531's original, now-superseded scope; see `docs/feedback.md`) has been removed on the `com.etendoerp.go` side, so saving the shipment writes the same date to both `movementDate` and `accountingDate` internally, and the accounting facts generated on posting reflect that unified value as the journal entry's accounting date.
- Shipment lines react to processing state as well. Product and quantities become read-only after processing, and `orderQuantity` only appears when the UOM-related display logic evaluates true.
- Completing is the primary status-driven action exposed through the document action override: the UI labels the action as `Complete` when the shipment is in draft status.
- **Complete confirmation popup's invoice price-list picker (ETP-4942)**: the popup opened by the `Confirm` button (`GoodsShipmentConfirmModal` → the generic `ConfirmInOutModal`) already showed a "Crear factura de venta en borrador" toggle. When that toggle is ON, a **Tarifa** (price list) selector now also appears — the exact same fetch/filter/default-selection behavior `CreateInvoiceConfirmModal` already offered on the post-completion `Create Invoice` button (ETP-4028), extracted into a shared `usePriceListPicker`/`PriceListSelectField` pair (`tools/app-shell/src/components/contract-ui/PriceListPicker.jsx`) so both modals fetch `/price-list/priceList` once, not twice. The selector is **required** (blocks "Confirmar y crear factura") when the shipment has no linked sales order (`data.linkedOrders` empty) — without an order, the backend's `createInvoiceHeaderFromShipment` falls back to the Business Partner's own price list, which is frequently unset and previously crashed with an unguarded 500. It is **optional/pre-filled** when the shipment does have a linked order, since the backend already derives the tariff from it. Backend: `CreateDraftInvoiceHandler.createFromShipments` calls the new `ensurePriceListResolved` right after `applyPriceListOverride`, turning that crash into a clear 400 (`backendError.shipmentPriceListRequired` on the frontend, via `translateBackendError`).
- The detail top bar exposes shipment-specific downstream actions. `Create Invoice` appears only for completed shipments that are not considered fully invoiced by the current page logic; `Create Return` appears for completed shipments; `Send Document` (`SendDocumentButton` in `GoodsShipmentActions.jsx`) is gated by `isCompleted` — it does not render while the shipment is still `DR`.
- **Single unified kebab (ETP-4702, fixed 2026-08-04):** the detail top bar shows exactly one kebab (⋮) menu, containing Post/Unpost plus Download PDF for a completed shipment. Previously `GoodsShipmentActions.jsx` (the `topbarRight` component) rendered its own private "⋮" popover with only Download PDF, right next to the platform's generic kebab that already lists Post/Unpost — two separate dropdown buttons side by side after "Imprimir". Download PDF is now declared through `decisions.json → window.customComponents.moreMenuContent`, the platform's convention for an instant, no-confirmation kebab action (same pattern as `internal-consumption`'s Void and `physical-inventory`'s "Actualizar conteo de sistema") — it fires the download immediately on click, no dialog. See `docs/plans/2026-08-04-etp-4702-duplicate-kebab-menu.md` for the full diagnosis and decision trail (including why `menuActions[].component`, used for confirm-dialog actions like Close Year / New Sub-account, was ruled out in favor of `moreMenuContent`).
- **Currency (ETP-4028)**: header field `etgoCurrency` (`M_InOut.EM_Etgo_Currency_ID`, mandatory). Defaults to the organization's currency (`defaultExpr: "@C_Currency_ID@"`), editable while the shipment is in draft, and becomes read-only once the shipment is processed (`readOnlyLogic: "@Processed@='Y'"`). Changing the currency after lines already exist does **not** recalculate those existing lines' prices — it only applies to newly added lines going forward. When a shipment is created from a sales order (via `NeoCommercialDocumentFactory.createShipmentReceiptHeader`), it inherits the order's currency; other shipment-creation paths (from an invoice, return receipts) inherit the currency of their respective source document. There is deliberately **no** total/amount display that converts the shipment's currency into the organization's currency — `M_InOutLine` carries no monetary columns at all (a shipment is a pure goods movement), so no reliable "document total" exists to convert; this was scoped out of ETP-4028 and left as an open question on the ticket (see comment 2026-07-29).
- Currency filter on line import (ETP-4028): the shipment's own `etgoCurrency` value determines which source documents appear in **Import from Sales Order** and **Import from Sales Invoice**. Each modal's `fetchDocuments` self-fetches the current shipment header to read its currency, then filters candidates so only documents in the same currency are selectable; when the filter excludes all candidates, the modal shows a dedicated empty-state message (`noSalesOrdersMatchShipmentCurrency` / `noSalesInvoicesMatchShipmentCurrency`).
- Single-shipment invoicing opens a preview modal that loads shipment lines, enriches them with unit prices from the related sales order lines, lets the user reduce quantities per line, warns when a draft invoice already exists (a hand-made one — generated invoices are no longer drafts, see ETP-5381 below), and posts to `createDraftInvoice`, which since ETP-5381 creates and confirms the invoice in the same request. The visible total in that modal is a preview derived from selected lines and prices, not a shipment-header total. Since ETP-4028, confirming the invoice also requires an explicit **Tarifa** (price list) selection in `CreateInvoiceConfirmModal` — the shipment's currency is shown read-only (inherited, not editable) while the price list is a required, user-selectable dropdown; the chosen `priceListId` is sent to `createDraftInvoice` and applied to the generated invoice before its lines are created, so every line prices off that price list (if a product has no price there, its price field is left blank for the user to fill in).
- Batch invoicing from the list is constrained by current UI logic: only completed shipments that are not fully invoiced are counted as invoiceable, and all selected invoiceable shipments must belong to the same business partner before `Create Invoice` is enabled. Since ETP-4028, batch invoicing also requires all selected shipments to share the same currency (`currencyCheck` guard) — mixed-currency selections disable `Create Invoice` with an explanatory tooltip; a full price-list picker for this batch flow was not implemented (backend already accepts `priceListId` for the multi-shipment path if a future UI needs it). The batch modal lets the user include or exclude specific lines, adjust quantities per line, previews a derived total, checks for an existing draft invoice, and creates one invoice — confirmed on creation since ETP-5381 — for the selected shipment set.
- Related documents currently react to the shipment's linked sales order. The tab fetches the sales order by `salesOrder`, then fetches sales invoices by the same order id, and renders navigation chips for both. Return receipts are only shown from an internal `_returnReceipts` payload if present.
- Send Email recipient resolution: the Send Email modal (`SendDocumentModal`) pre-fills the `Para` field by fetching `GET /sws/neo/contacts/businessPartner/{businessPartner}` when the modal opens, reading `etgoEmail` (`C_BPartner.EM_Etgo_Email`) from the contacts spec. The field is left empty if no email is registered for the business partner. The modal title uses `useMenuLabel()` so it renders in the active UI language (e.g. "Factura de Venta" in Spanish instead of "Invoice").
- Send Email editable subject/message (ETP-4717): the `Asunto` (subject, auto-derived as `${documentType} #${documentNo} — ${bpName}`) and `Mensaje` fields in the Send Email modal are editable text inputs, not read-only display fields. If the user leaves both untouched, the outgoing command is byte-identical to the legacy payload (no `messageEdits` key is sent). If either is changed, `SendDocumentModal` sends `messageEdits: { subject, message }` alongside the existing `recipientEdits`.
- Email history card (ETP-5069): the `EmailsCard` in the preview panel's General tab is no longer a static placeholder. It reads the document's real send history from `GET /sws/neo/documentemailhistory?recordId=<documentId>` (payload `{ result: "<JSON string>" }` — `result` is a STRING the client parses — or `{ error: "<message>" }`), through `useApiFetch` like every other request. Rows are listed newest first with the send timestamp (locale-aware `toLocaleString`), the To recipients, the subject and a `StatusTag`; clicking a row expands CC, sender, message body, the error message and a Download attachment link. Only `SENT` and `DUPLICATE` count as successful (there is no `DELIVERY_FAILED`); every other status renders in the destructive tone and is never presented as sent. `previewCardNoEmailHistory` is kept for the genuinely-empty case and a separate `previewCardEmailHistoryError` copy covers a transport/backend failure, so "nothing was ever sent" and "we could not find out" no longer look alike. A successful send in the panel's own `SendDocumentModal` fires the new optional `onSent` callback (success only, unlike `onClose`, which a plain cancel also triggers) and the panel bumps `refreshSignal`, so the card refetches instead of showing its pre-send state. The `onSend` link keeps its fail-closed contract: with no `onSend` the card exposes no clickable send trigger at all.
- **Button order (ETP-5260):** Copy link → Clone → Send render to the LEFT of Save/Confirm via `GoodsShipmentSecondaryActions.jsx` (wired as `topbarSecondary`, a thin adapter around the shared `DocumentSecondaryActions`); `GoodsShipmentActions.jsx` (`topbarRight`) keeps only the PRIMARY Create Invoice/Create Return actions, to the RIGHT of Save/Confirm. Clone keeps its own "review then click through" UX — `headerEntity: 'goodsShipment'` + `routePrefix: '/goods-shipment/'` (`CloneOrderModal`'s "State 2": a list of cloned documents with internal navigation, not auto-navigate) — deliberately different from purchase-order/sales-order/sales-quotation's auto-navigate clone. Send stays gated to `isCompleted`; clicking it dispatches a `goods-shipment:open-send-modal` window event that `GoodsShipmentActions.jsx` listens for, since only that component carries the client-rendered delivery-note PDF context `SendDocumentModal` needs. See `docs/ui-customization.md` §3b for the general slot-classification rule.
- Send status gating (ETP-4717): the Form-view topbar (`GoodsShipmentActions.jsx`) already gated `SendDocumentButton` on `isCompleted` correctly before this ticket — `artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js` locks that in as a regression test. The other two surfaces did NOT have this gate and needed a code fix, same as the other 4 windows: (1) the Grid row quick-action builds `rowQuickActions` by hand in `tools/app-shell/src/windows/custom/goods-shipment/index.jsx` (it bypasses the generated contract, so `decisions.json`'s `rowQuickActions.actions.email.visibleWhen: "@DocumentStatus@='CO'"` alone never reached it) — the same expression is now also set by hand in that file's `actions` object; (2) the row-click preview drawer `GoodsShipmentPreview.jsx` rendered its Send button and `EmailsCard` link unconditionally — both are now gated on `shipment.documentStatus === 'CO'`.
- Download PDF status gating (ETP-4789): `GoodsShipmentPreview.jsx`'s inline Download PDF button (this window renders its action buttons directly, not via the shared `PreviewActionButtons.jsx`) reuses the same `isSendable` variable already computed for Send just above (`documentStatus === 'CO'`) — previously it was gated only by `pdfBlob`, so a draft shipment with an already-generated preview PDF could still be downloaded. It is now `disabled={!pdfBlob || !isSendable}` / `onClick={pdfBlob && isSendable ? handleDownload : undefined}`. Locked in by `tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentPreview.vitest.jsx` (`Download PDF gating by documentStatus (ETP-4789)`).
- No explicit shipment-level tax, discount, or financial recalculation behavior is visible in the current evidence. The only observed financial reaction is invoice preview total calculation based on selected shipment lines and sales-order prices.
- Copy-link visibility (ETP-4721): in the grid selection bar, `Copy link` appears only when exactly one row is selected — hidden with 0 or 2+ rows selected. In the detail topbar, `Copy link` is visible whenever the record has a persisted `recordId` (not the unsaved `'new'` sentinel), with no selection gate since detail always represents a single record. Both copy `{origin}/{windowName}/{recordId}` to the clipboard, show a `Link copied` / `Enlace copiado` toast, and display a `Copy link` / `Copiar enlace` tooltip on hover. The legacy dead link icon previously shown in the idle-state (no-selection) grid toolbar is now hidden via the `hideLink` prop passed to `<ListView>`.

## Gap assessment

- **Resolved by ETP-5429** — the return workflow is fully backed by stable observed behavior: `createReturn` (called from the now-shared `tools/app-shell/src/components/contract-ui/CreateReturnWizard.jsx`, wrapped by `ReturnWizard.jsx`) creates a real `return-material-receipt` document end-to-end, verified live including amount-column pricing (sourced from the linked sales order via a `fetchPrices` call) and a genuine backend 409 conflict ("A return already exists for shipment: ...") when a second return is attempted on an already-returned shipment. The related-documents tab also correctly surfaces the created return receipt back on the source shipment (`RelatedDocuments.jsx`'s `returnReceipts` chip, confirmed populated by the backend). No longer a gap.
- Batch invoice creation posts to the same `createDraftInvoice` endpoint as the single-shipment flow and, since ETP-5381, produces a confirmed invoice rather than a draft. Current evidence only proves source shape and endpoint usage, not a browser-tested logistics scenario. It should be treated as supported-by-code with limited automated proof.
- The documented shipment-to-invoice relationship is order-centric: the related-documents tab resolves invoices through the linked sales order, not by directly querying invoices from the shipment id. If the business expects shipment-specific invoice traceability independent of the order link, that remains an open ambiguity.
- The top-bar and list invoicing logic check a `completelyInvoiced` flag in custom components, while the contract and generated fields expose the frontend field as `invoiced` / `Iscompletelyinvoiced`. The runtime payload may normalize both names, but this is not explicit in current evidence, so the exact gating behavior for already invoiced shipments remains an implementation ambiguity.
- **ETP-4729 — Print action unified, custom print button removed**: the generic print icon is now available on both the list grid and the detail view. The bespoke "Imprimir"/"Descargar PDF" entry that used to live in `GoodsShipmentActions.jsx`'s `⋮` menu was removed, since it duplicated the unified print flow with a client-side-generated PDF.

## Manual verification

1. Open `/goods-shipment` and confirm the list shows shipment records with document number, movement date, status, and invoicing state.
2. Open `/goods-shipment?DocStatus=DR` and confirm the list starts filtered to draft shipments (the same state the dashboard "Envíos pendientes" card navigates to).
3. Open a shipment detail and verify it behaves as a master-child page with editable header fields in draft status and child shipment lines underneath.
4. Change the business partner on a draft shipment and confirm the partner-address selector reacts as a dependent field.
5. Open a draft shipment and confirm the top bar does **not** expose the Send/"Enviar" action, neither in the topbar nor as a row quick action in the list. Complete the shipment and confirm the top bar now exposes `Create Invoice`, `Create Return`, and the Send/"Enviar" action in both places.
6. Use `Create Invoice` on a completed shipment and confirm the preview loads shipment lines, allows quantity reduction, warns if a hand-made draft invoice already exists, and navigates to the created invoice when successful — which since ETP-5381 opens in **Confirmado**, not Borrador.
7. From the list, select multiple completed shipments for the same customer and confirm batch `Create Invoice` is enabled; repeat with different customers and confirm it stays disabled.
8. In the batch invoice modal, deselect some lines or reduce quantities and confirm the preview total changes before creation.
9. Open `Related Documents` on a shipment that came from a sales order and confirm the order chip and any invoice chips navigate to the expected records.
10. Attempt the return flow on a completed shipment and verify whether the backend actually completes the return creation; if it fails, record it as the current functional gap.
11. Select two or more draft shipments from the list and confirm the bulk action bar shows a `Procesar (N)` button. Open it, confirm the document-action dropdown offers **Confirmar** (`CO`) as its only entry, trigger it, and verify all selected shipments move to completed status and a result toast appears.
12. Open the Send Email modal from the topbar and confirm: the business partner's email registered in `EM_Etgo_Email` is proposed as an editable `To` chip (when none is registered, the To list starts empty); the proposed chip can be removed; additional To recipients and CC recipients (via the `Add CC` affordance) can be added; entering a syntactically invalid email shows an inline validation error and disables Send; Send is also disabled while the final To list is empty (even with CC entries) or when more than 10 recipients are entered across To and CC; and the modal title reads the translated document name in the active UI language. Also confirm the `Asunto` and `Mensaje` fields are editable (not greyed-out/read-only), that they pre-fill with the auto-derived subject and an empty message, and that sending without touching either still succeeds normally.
13. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
14. In the list, select 0, then 1, then 2+ shipments and confirm `Copy link` appears in the selection bar only when exactly one row is selected. Click it and confirm a `Link copied` toast appears and the clipboard contains `{origin}/goods-shipment/<id>`. Open a saved shipment and confirm the same `Copy link` action (with tooltip on hover) is available in the detail topbar.
15. Create a shipment from a sales order confirmed in a non-org currency (e.g. USD, org in EUR) via "Manage Shipment" and confirm the new shipment's Currency field is pre-filled with USD, not the org's default.
16. On a draft shipment, confirm Currency defaults to the org's currency and is editable; confirm it becomes read-only once the shipment is completed.
17. On a draft shipment with existing lines, change Currency and add a new line; confirm the existing lines' prices/behavior are unaffected and only the new line reflects the new currency context.
18. On a shipment with Currency = USD, open **Import from Sales Order** / **Import from Sales Invoice** and confirm only USD-denominated source documents are listed, with EUR (or other-currency) documents excluded and an explanatory empty-state message shown when nothing matches.
19. Use `Create Invoice` on a completed shipment and confirm the confirmation popup shows Currency read-only (inherited from the shipment) and a required Tarifa (price list) selector; confirm the created invoice's lines price off the selected price list.
20. Select multiple completed shipments with different currencies from the list and confirm `Create Invoice` stays disabled with an explanatory tooltip; repeat with same-currency shipments and confirm it enables.
21. Create a draft shipment with **no** linked sales order (not created "from" an order), open the `Confirm` popup, leave the "Crear factura de venta" toggle ON (`goodsShipment.confirmModal.createInvoiceTitle` — the label no longer carries the "en borrador" suffix this step used to quote), and confirm a **Tarifa** selector appears and blocks "Confirmar y crear factura" until a price list is chosen; choosing one and confirming must succeed and create the invoice with that price list — in **Confirmado** since ETP-5381 — never a 500. Repeat on a shipment that **does** have a linked order and confirm the selector still appears (pre-filled) but does **not** block confirming even if left untouched. Then confirm a shipment with the "Crear factura de venta" toggle OFF (no invoice created) and verify **no** result modal appears — instead an auto-dismissing green `sonner` toast reads `goodsShipment.confirmModal.confirmedTitle` ("Albarán de venta confirmado" / "Goods shipment confirmed") and the page refreshes (ETP-5063). Confirm the result modal still appears, listing the created invoice, when the toggle is ON and an invoice is created.
22. **ETP-5302 — bulk "Descontabilizar".** Select one or more posted shipments and confirm a `Descontabilizar` button appears in the selection bar; run it and verify each row's Posted state clears and a result toast appears. With only not-posted rows selected the button must not render at all. With a mixed selection, confirm the not-posted rows are reported as omitted with the `bulkRowNotPosted` message rather than counted as failures. Confirm the dialog's confirm button reads **Aceptar** / **Accept**, not "Completado".
23. **ETP-5302 — no page reload.** Scroll down a long shipment list, apply a filter, then run any bulk action ("Procesar", "Contabilizar", "Descontabilizar", "Crear Factura"). The filter and the scroll position must survive, only the rows refetch, and the result toast must appear immediately (not after an SPA reboot). For "Crear Factura" specifically, confirm the invoiced rows now show their updated invoicing status — before this fix that action neither reloaded nor refreshed, leaving the rows visibly stale with no hint they were out of date.

## Automated evidence

- `artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage.jsx` defines the master-child page, status-driven detail actions, related-documents tab, and list bulk-action entry point.
- `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` implements single-shipment invoice creation (confirmed on creation since ETP-5381), shipment return launch, shipment sending, existing-draft warning, and quantity-based invoice preview.
- `artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx` implements batch invoice creation for completed shipments from the same customer, with per-line selection, quantity editing, draft-invoice checking, and preview totals. Since ETP-5381 it reads `documentStatus` off the response and labels the created document "creada y confirmada" / "created and confirmed" instead of the unconditional "creada como Borrador".
- `artifacts/goods-shipment/custom/RelatedDocuments.jsx` resolves the linked sales order, sales invoices, AND return receipts (`data.returnReceipts`, rendered via `docChipProps({ type: 'return-material-receipt', ... })`) — confirmed live (ETP-5429): creating a return from a shipment makes it appear back on that shipment's Documentos section immediately.
- `artifacts/goods-shipment/custom/ReturnWizard.jsx` is now a thin wrapper around the shared `tools/app-shell/src/components/contract-ui/CreateReturnWizard.jsx` (ETP-5429, unifying it with `PurchaseReturnWizard.jsx` on goods-receipt) — `createReturn` is a confirmed-working live action, not a pending dependency.
- `artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js` provides source-shape coverage for the bulk invoice component, including invoiceable filtering, same-customer enforcement, line fetching, sales-order price enrichment, draft-invoice checking, and draft-invoice creation endpoint usage.
- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-complete component (CO only, via `buildInOutActions`) mounted in the list selection bar for goods shipments with `labelKey="process"` so the button renders as "Procesar" / "Process"; the single `CO` entry in its dropdown renders as "Confirmar" / "Confirm" (`labelKey: 'confirm'`).
- **ETP-5302 — selection-bar button renamed to "Procesar", dropdown option renamed to "Confirmar"**: the floating selection-bar button is now mounted with `labelKey="process"` ("Procesar" / "Process") — the `confirmBulk` key it used before was deleted from `en_US.json`, `es_ES.json` and `es_AR.json`. In the same move, `BulkDocumentAction`'s `CO` entry (in both `buildInOutActions` and the default `buildActions`) switched from `labelKey: 'book'` to `labelKey: 'confirm'`, so the dropdown option that completes the document now reads "Confirmar" / "Confirm". The `RE` entry keeps `labelKey: 'reactivate'`. Labels only — the dialog, the per-row `Promise.allSettled` loop, the `documentAction=CO` call and the result toast are untouched. The second selection-bar button added by ETP-5209 (`labelKey="post"`, "Contabilizar") is unaffected.
- **ETP-5209 — Post reachable from the list, not just form view**: `tools/app-shell/src/windows/custom/goods-shipment/index.jsx`'s `rowQuickActions.menuActions` adds a `{ neoAction: 'post' }` entry to the row-hover kebab, gated on `!posted && processed` — the same gate `GoodsShipmentPage.jsx`'s decisions-derived form-view `menuActions` already applies (that one IS live for this window's detail branch, since the wrapper does not override `menuActions` there). A successful post refreshes the list (`onMenuActionExecuted` bumps `refreshKey`). For bulk, `GoodsShipmentBulkActions` renders a third component alongside `BulkInvoiceFromShipment` and the existing CO-only `BulkDocumentAction`: a `BulkDocumentAction` instance (`entity="goodsShipment"`, `actionMode="neoAction"`, `buildActions={buildPostActions}`, `rowFilter={postRowFilter}`, `labelKey="post"`) — `buildPostActions`/`postRowFilter` are exported from `BulkDocumentAction.jsx` and shared across purchase-invoice, sales-invoice, goods-receipt, and goods-shipment. `postRowFilter` is a plain `(row, action, ui) => ...` function (not a `createPostRowFilter(ui)` factory), so it is passed by reference — the `ui` translator is supplied by `BulkDocumentAction`'s own `handleDone` at call time, not by the window wrapper. `BulkInvoiceFromShipment.jsx` itself is untouched — the single `customComponents.bulkActions`-shaped slot in this hand-rolled window is not a single-component constraint in practice, since `GoodsShipmentBulkActions` already stacks multiple bulk components side by side. A row already posted, or not yet processed (completed), is excluded from the bulk post run with a translated rejection message (`bulkRowAlreadyPosted` / `bulkRowNotCompleted`).
- **ETP-5302 — bulk "Descontabilizar"**: `GoodsShipmentBulkActions` in `tools/app-shell/src/windows/custom/goods-shipment/index.jsx` now mounts a *third* `BulkDocumentAction` instance (`entity="goodsShipment"`, `actionMode="neoAction"`, `buildActions={buildUnpostActions}`, `rowFilter={unpostRowFilter}`, `labelKey="unpost"`). `buildUnpostActions(rows)` — exported from `BulkDocumentAction.jsx` — offers `{ value: 'unpost', labelKey: 'unpost' }` only when at least one selected row is posted, so the button does not render otherwise; `unpostRowFilter(row, action, ui)` blocks a not-posted row with `ui('bulkRowNotPosted')`. No backend or i18n work was required: the per-row call is `POST …/{id}/action/unpost` served by `DocumentPostingService`, the same endpoint this window's detail kebab already used, and the `unpost`, `bulkRowNotPosted` and `documentUnposted` keys already existed in all three locale files.
  - **Why a separate pair from `buildPostActions`/`postRowFilter`:** `sales-invoice` and `purchase-invoice` mount the post pair too and must **not** offer a standalone unpost — on an invoice, reversing the accounting is a step inside Reactivate (`preUnpost`), never an action of its own. Only `goods-receipt` and `goods-shipment`, whose detail kebab already exposes *Descontabilizar*, mount the unpost pair.
  - **Why its own button rather than a second option inside "Contabilizar":** the dropdown sits under a button whose label *is* the action, so *Descontabilizar* offered there would appear under a button reading "Contabilizar" — named as the opposite of what it does. In practice the two buttons are rarely on screen together, since one needs a posted row and the other a processed-not-posted one.
- **ETP-5302 — bulk actions refetch in place instead of reloading the page**: `ListView.jsx` now hands `refresh` (a stable in-place refetch) to the `bulkActions` slot context, and every bulk host in this window's bar consumes it. `BulkDocumentAction` ends with `clearSelection()` → toast → `refresh()`; `artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx` accepts `refresh` and calls it from `onSuccess`. That last one is the behaviour change users will notice most: "Crear Factura" previously neither reloaded nor refreshed, so the rows it had just invoiced kept showing a stale invoicing status with nothing on screen hinting they were out of date. The old `sessionStorage` + `window.location.reload()` path survives only as a fallback for a host mounted outside `ListView`'s slot. Full contract: `docs/ui-customization.md` §9e.
- **ETP-5302 — dialog confirm button reads "Aceptar"**: `BulkDocumentAction`'s dialog footer now calls `ui('accept')` instead of `ui('done')`. `done` translates to "Completado", the name of a document *state* shown in this very list's status column, so the button read as though it would mark the documents completed. `accept` is a new key in `en_US.json`, `es_ES.json` and `es_AR.json`; `done` was deliberately left in place because `RecordCreateModal.jsx` still uses it.
- There is no dedicated browser E2E or interaction test in the current worktree proving the full shipment execution, invoicing, or return flow end to end.
- `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` proves the Send Email modal is wired with `bPartnerId` and `apiBaseUrl` so the recipient email is resolved from the contacts spec at open time and proposed as an editable `To` chip (removable, with additional To/CC recipients supported per ETP-4226 — edits reach the backend only through the allowlisted `recipientEdits` command field), and `documentType` is translated via `useMenuLabel()`.
- **ETP-4717 — editable subject/message and status-gated Send:** `tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.vitest.jsx` and `documentEmailSend.vitest.js` cover the editable `Asunto`/`Mensaje` fields and the opt-in `messageEdits` command field (present only when the operator actually changes subject or message; omitted — byte-identical legacy payload — otherwise). `e2e/tests/flows/document-send-recipients.mocked.spec.js` adds browser-level coverage that a typed message reaches the backend as `messageEdits.message`. `artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js` adds a regression lock-in for the already-correct `isCompleted && <SendDocumentButton>` gating (this window needed no logic fix, unlike the other 4). `artifacts/__tests__/etp-4717-send-email-visibility.test.js` asserts `contract.json → frontendContract.window.rowQuickActions.actions.email.visibleWhen === "@DocumentStatus@='CO'"` so the grid row quick-action agrees with the Form-view topbar gate.
- The generated `GoodsShipmentPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_InOut` AD table.
- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.
- **ETP-4032 — Shared ConfirmResultModal**: `GoodsShipmentActions.jsx` now imports `ConfirmResultModal` from `@/components/contract-ui` instead of the former `@generated/sales-order/custom/OrderCreateInvoice` re-export. The modal's props API uses `cards` (array of document links) instead of the previous `docs` object — behavior is unchanged for the user.
- **ETP-4721 — Copy link**: `tools/app-shell/src/hooks/useCopyLinkAction.js` implements `useCopyLinkAction` (grid selection-bar copy) and `useCopyRecordLinkAction` (detail-topbar copy); `tools/app-shell/src/components/contract-ui/CopyLinkButton.jsx` and `CopyRecordLinkButton.jsx` render the tooltip-wrapped buttons for each context. `tools/app-shell/src/windows/custom/goods-shipment/index.jsx` wires the grid action into `bulkActions` and passes `hideLink` to `<ListView>`. **Since ETP-5260**, the detail-topbar Copy link button no longer lives in `GoodsShipmentActions.jsx` (`topbarRight`) — it moved to `GoodsShipmentSecondaryActions.jsx` (`topbarSecondary`), left of Save/Confirm, alongside Clone and Send.
- **ETP-4028 — Currency field**: `modules/com.etendoerp.go/src-db/database/model/modifiedTables/M_INOUT.xml` adds `EM_ETGO_CURRENCY_ID` (mandatory, Search reference to `C_Currency`). `NeoCommercialDocumentFactory.java` sets `.setEtgoCurrency(...)` on every `ShipmentInOut` creation path (from a sales order, from another shipment, from an invoice). `artifacts/goods-shipment/decisions.json` declares `etgoCurrency` (editable, `defaultExpr: "@C_Currency_ID@"`, locked on `Processed='Y'`) plus `window.labelOverrides` for the field label.
- **ETP-4028 — Currency-filtered imports**: `artifacts/goods-shipment/custom/ImportFromSalesOrderModal.jsx` and `ImportFromSalesInvoiceModal.jsx` fetch the shipment header for `etgoCurrency` and filter candidate documents by matching currency, passing `noCurrencyMatchMessageKey` to the shared `ImportLinesModal`.
- **ETP-5178 — Free-typing quantity field in import modals**: the shared `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx` per-line quantity input (used here by `ImportFromSalesOrderModal.jsx` / `ImportFromSalesInvoiceModal.jsx`) no longer clamps the value on every keystroke — typing, select-all, delete, and decimal entry all work freely. Range/validity (numeric, non-zero, magnitude ≤ the line's available quantity) is checked only on `onBlur`: an invalid value reverts to the last committed value and shows a `toast.error`, either `qtyMaxAllowed` ("The maximum allowed is {max}" / "El máximo permitido es {max}") when it exceeds the available quantity, or `qtyMustBePositive` ("The quantity must be greater than 0" / "La cantidad debe ser mayor a 0") for zero/negative/empty/non-numeric input. Fixed once in the shared component; applies identically across sales-invoice, purchase-invoice, and goods-receipt.
- **ETP-4028 — Price-list picker at invoice time**: `tools/app-shell/src/components/contract-ui/CreateInvoiceConfirmModal.jsx` (shared with goods-receipt, purchase-order, sales-order) gained `showPriceListPicker`/`isSOTrx` props, fetching `/price-list/priceList` and letting the user pick a price list before confirming; `GoodsShipmentActions.jsx` wires this in and forwards `priceListId` to `createDraftInvoice`. Backend: `CreateDraftInvoiceHandler.java`'s `createFromOrder`/`createFromShipments` gained a 3rd `priceListId` parameter and an `applyPriceListOverride` helper that sets `invoice.setPriceList(...)` before the native `CreateInvoiceLinesFromProcess` prices the lines.
- **ETP-4028 — Bulk-invoice currency guard**: `BulkInvoiceFromShipment.jsx` adds a `currencyCheck` that disables `Create Invoice` when the selected shipments don't share the same currency.
- **ETP-4702 — De-duplicated kebab menu**: `artifacts/goods-shipment/custom/GoodsShipmentMoreMenu.jsx` (new) is the `moreMenuContent` component wired via `decisions.json → window.customComponents.moreMenuContent`; it renders `null` unless `documentStatus === 'CO'`, otherwise a single "Download PDF" button that fetches the shipment PDF as a blob and triggers a browser download, then closes the shared kebab — no modal, no confirmation step. `GoodsShipmentActions.jsx` had its private "⋮" popover removed (the `menuOpen`/`menuRef` state, the outside-click handler, and the `handleDownload` function all moved into the new component); its `handlePrint`/"Imprimir" button is unrelated and was left untouched. The generated `GoodsShipmentPage.jsx` now passes `customMenuContent={GoodsShipmentMoreMenu}` to `<DetailView>`, alongside the existing `menuActions` prop (Post/Unpost) — both render inside the same dropdown.
- **ETP-5291 — "Download PDF" kebab item removed**: `decisions.json → window.customComponents.moreMenuContent` (`"GoodsShipmentMoreMenu"`) was removed and the window regenerated, so the shared kebab now renders only the `menuActions` Post/Unpost entries — the ETP-4702 "Download PDF" item is gone from the detail-view kebab. `generateShipmentPdf`/`getShipmentPdfLabels` (`tools/app-shell/src/windows/custom/goods-shipment/useShipmentPdf.js`) are **not** dead code — they still back the Print entry point (`documentPdfRegistry.js`'s `'goods-shipment'` movement builder, row #5 of the printables table), so they were left untouched. `artifacts/goods-shipment/custom/GoodsShipmentMoreMenu.jsx` and its dedicated test files (`GoodsShipmentMoreMenu.vitest.jsx`, `DetailView.goodsShipmentKebabMenu.vitest.jsx`) are now orphaned (no longer referenced by any generated page) but were left in place — deleting source files that active test suites import is a test-authoring change, out of scope for this fix per the repo's mandatory test-delegation rule; a follow-up should route that cleanup through Tester. The printer-icon Print button (`hidePrintWhen`) and the "Descontabilizar" (Post/Unpost) `menuActions` entries are unaffected. Note: goods-receipt never had this kebab item (`decisions.json` has no `moreMenuContent` there and `hidePrint: true`), so no change was needed on that window.
- **ETP-4942 — Price-list picker in the complete-confirmation popup**: fixes the 500 hit when completing a shipment with no linked sales order while "Crear factura de venta en borrador" is ON — `createInvoiceHeaderFromShipment` fell back to the Business Partner's price list (often unset), leaving `Invoice.getPriceList()` null when the native `UpdatePricesAndAmounts` hook needed it. `tools/app-shell/src/components/contract-ui/PriceListPicker.jsx` (new) extracts `usePriceListPicker`/`PriceListSelectField` out of `CreateInvoiceConfirmModal.jsx` so `ConfirmInOutModal.jsx` can show the same tariff selector via new `showPriceListPicker`/`isSOTrx`/`hasLinkedOrder` props (all default `false`/`true`/`false` — goods-receipt and return-receipt, the modal's other two callers, are unaffected). `artifacts/goods-shipment/custom/GoodsShipmentConfirmModal.jsx` is the only caller that turns it on, computing `hasLinkedOrder` from `data.linkedOrders`. Backend: `CreateDraftInvoiceHandler.createFromShipments` gained `ensurePriceListResolved(invoice)`, called right after `applyPriceListOverride` — throws a 400 `OBException` instead of letting a null price list reach the pricing hook. `tools/app-shell/src/lib/backendErrors.js` maps the new literal to `backendError.shipmentPriceListRequired` (both locales); `ConfirmInOutModal.jsx` now also runs every error message through `translateBackendError` before displaying it (previously untranslated raw backend text).

## Accounting dimension visibility per section — ETP-4529

| Field | Header | Lines |
| --- | --- | --- |
| `businessPartner` (Contacto) | **Nunca** — no separate dimension field exists (the header's `businessPartner` is the shipment's core Customer field, not a dimension pick; raw AD carries no display-logic gating on it) | **Nunca** — the raw AD `businessPartner` field on lines carries `@ACCT_DIMENSION_DISPLAY@` but was never added to `decisions.json`, so it is absent from the generated contract by default (already matches Nunca) |
| `product` | *(no such field on the header)* | **Siempre** — core line field, no dimension gating |
| `project` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` passthrough (`section: "other"`, previously discarded) | **Por config** — same passthrough (previously discarded) |
| `costcenter` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` passthrough (`section: "other"`, previously discarded) | **Por config** — same passthrough (previously discarded) |

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
`GoodsShipmentLineTable.jsx`, is pipeline-generated, so the pipeline-generated
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
above (ETP-4543) were **flipped back to `false`**. The user asked for the same expand-row
"Dimensiones contables" UX Amortización has instead of plain always-rendered columns (see
`docs/ui-customization.md` §14b for the new `dimensionsPanel` `InlineLinesPanel` column type),
but this window's `GoodsShipmentLineTable.jsx` is fully pipeline-generated with no override
mechanism that fits that column type — the only existing lines-tab override point,
`window.customLinesComponent`/`CustomLines`, replaces the entire lines tab with a fully
self-fetching component (own fetch, own add/delete — matching `AmortizationLinesTable.jsx`'s
contract), not a drop-in for the `columns`-array contract this generated table uses. This
window is back to its pre-ETP-4543 state (no project/costcenter on the lines grid) pending a
coordinator decision on how to add that override point — see `docs/feedback.md`'s ETP-4543
supersession note for the full reasoning.

**Resolved (ETP-4529 generator support):** `generate-frontend.js`'s `generateTableComponent`
(`schema_forge_core`) now emits a synthetic `dimensionsPanel` column directly from
`decisions.json` — no custom override needed. `lines.project.dimensionsPanel` and
`lines.costcenter.dimensionsPanel` are now `true` (grid stays `false`); the pipeline-generated
`GoodsShipmentLineTable.jsx` renders the expand-row "Dimensiones contables" panel for existing
rows. See `docs/decisions-reference.md` (`dimensionsPanel`) and `docs/ui-customization.md` §14b.

### "Añadir dimensiones" moves to a hover action, column no longer shown (ETP-4610)

Same intent as `sales-invoice.md`/`purchase-invoice.md`: `InlineLinesPanel` no longer renders the
`dimensionsPanel` type as a grid column at all — "Añadir dimensiones" is now a hover action next
to Edit/Delete, gated on at least one visible dimension field, with the expand-chevron column
unchanged. The label/icon is adaptive: "Añadir dimensiones" while the line has no dimension values,
"Editar dimensiones" once at least one is set.

**Regen history on this window:** two `make regen` attempts against the local sandbox's LIVE DB
both hit the already-documented `AD_Ref_List_Trl` es_ES translation-stripping issue (see
`docs/feedback.md`'s "`make regen` Silently Strips es_ES Enum Labels..." entry) on this window's
`etblkpAccountingstatus` field, and were reverted rather than committed with a translation
regression. The window was ultimately regenerated cleanly by the **pre-push hook's own
offline/cached-AD-snapshot pipeline run** (the CI-parity "UI / contract drift" check, which
regenerates from a frozen cached snapshot rather than the incomplete local sandbox DB) —
that run hit no translation loss at all, confirming the earlier failures were purely a local-DB
data gap, not a real blocker. `contract.json`, `contract.mcp.json`, and
`GoodsShipmentLineTable.jsx` are now regenerated and validated (`sf-validate-pipeline`: OK) —
see `docs/feedback.md`'s ETP-4610 entry for the full trail.

## Print button visible only in Completado — ETP-4714

`artifacts/goods-shipment/decisions.json` sets
`window.hidePrintWhen: { "documentStatus": { "notEquals": "CO" } }` — the same generic
mechanism used by `sales-invoice`/`sales-order`/`purchase-order`/`return-to-vendor-shipment`
(see `docs/decisions-reference.md` — "Print Visibility"). It hides the generic icon-only Print
button rendered by `DetailView.jsx` unless the record is Completado, with no effect on the
list view.

This window originally shipped a different fix: the custom "Imprimir" button in
`artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` (the `topbarRight` component),
wrapped in `{isCompleted && (...)}` to close the bug the ticket reported (visible in Borrador
too). A separate, unrelated ticket (ETP-4729 — "print unification onto the generic icon")
removed that custom button from `GoodsShipmentActions.jsx` outright: printing for every window
is now served exclusively by the generic `DetailView.jsx` icon. That left the generic icon
with no gate at all on this window until the `hidePrintWhen` entry above was added.

## Related Documents auto-refresh — ETP-4779

Generating a Sales Invoice from `GoodsShipmentActions.jsx` (the `topbarRight` component) used to
close the result modal with a full `window.location.reload()`. `GoodsShipmentActions` now
accepts the `onRefresh` prop `DetailView.jsx`'s topbar slot already passes it (`() =>
hook.fetchById(recordId)`) and calls that instead — in the invoice-result `ConfirmResultModal`'s
`onClose` (skipped when the user navigated to the new invoice instead) and as the `ReturnWizard`
`onSuccess` fallback when the created return has no id to navigate to. The **Related Documents**
tab (`artifacts/goods-shipment/custom/RelatedDocuments.jsx`) needs no separate refetch: it
derives its chips straight from `data.linkedOrders` / `linkedInvoices` / `returnReceipts`, so
refreshing the header via `onRefresh` is sufficient to update it — no manual reload required.

## "Crear Factura" modal closed with no loading feedback — ETP-5333

Same defect and same fix as `goods-receipt.md`'s equivalent note. On a **completed** shipment
with no invoice yet, "Crear Factura" opens the shared `CreateInvoiceConfirmModal.jsx`
("Gestionar documentos"); clicking "Crear →" used to close it synchronously in
`GoodsShipmentActions.jsx`'s `onConfirm` before `handleCreateInvoice`'s request even started,
so the `loading={creatingInvoice}` prop already passed to the modal never got a chance to
render its spinner/"Procesando…" state.

Fixed by moving `setShowInvoiceConfirm(false)` into `handleCreateInvoice`'s success branch,
right before `setInvoiceResult({...})`, so `onConfirm` is now just
`onConfirm={handleCreateInvoice}`. On failure the modal stays open (the existing `toast.error`
fires). The draft-status confirm flow (`GoodsShipmentConfirmModal.jsx` → `ConfirmInOutModal.jsx`)
never had this defect — it owns its own `loading` state and is unaffected by this change.
`CreateInvoiceConfirmModal.jsx` was also hardened so its backdrop/× no longer close it while
`loading` is `true` (previously only the "Cancelar" footer button was disabled).

## Confirming an already fully-invoiced shipment (ETP-5265)

A shipment whose `invoiceStatus` is already >= 100 used to open an intermediate "already
invoiced" confirmation popup on `Confirm`. ETP-5265 removed that popup: `Confirm` now calls
the canonical `documentAction` endpoint directly (`useDocumentAction`, `documentAction=CO`),
then takes the same success path the popup used to trigger (`setInvoiceResult({ invoice: null })` -> the
`goodsShipment.confirmModal.confirmedTitle` success toast + refresh), or shows
`toast.error` on failure. The non-fully-invoiced flow still opens `GoodsShipmentConfirmModal` and is untouched.

**In-flight feedback lives in the Confirm button, not in a toast (ETP-5265 QA follow-up).**
The first cut showed a floating `toast.loading` card while the POST was in flight; QA rejected
it, because every other document (invoices in particular) spins inside the `Confirm` button
itself. The mechanism:

1. `GoodsShipmentActions.jsx` publishes the in-flight promise on the event object:
   `e.detail.promise = handleConfirmFullyInvoiced()`. The modal branch deliberately leaves
   `detail.promise` unset — opening a modal is instantaneous and must not spin the button.
2. The window's `draftMode.onConfirm` (`dispatchConfirmModalEvent` in the window's
   `index.jsx`) dispatches `goods-shipment:open-confirm-modal` with a mutable `detail` object and returns
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
afterwards, out of band, through the `setInvoiceResult` effect. `handleConfirmFullyInvoiced`
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
- This branch **no longer routes through `setInvoiceResult({ invoice: null })`**. That
  setter's effect both toasts and refreshes but cannot be awaited, so it could not hold the
  button busy; the success toast (`goodsShipment.confirmModal.confirmedTitle`) is emitted
  inline instead, at the same point the native draftMode path emits its own — right after
  the action POST succeeds and **before** the refetch (see `handleSaveAndProcess` in
  `useEntity.js`). The effect is still live and still owns the `GoodsShipmentConfirmModal`
  path, which is why the two branches read differently in `GoodsShipmentActions.jsx`.

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

## Invoice is created and confirmed in one step, and guard P2 — ETP-5381

Both invoicing paths on this window — the "Crear factura de venta" toggle in the
`Confirm` popup, and `Create Invoice` on a completed shipment (single or batch) —
used to leave a **draft** sales invoice. A draft reserves nothing:
`m_inoutline.isinvoiced` is only written when the invoice is completed, so the
same shipment could be invoiced over and over, and `invoiceStatus` (which filters
`docstatus NOT IN ('VO','CL','DR')`) stayed at 0%, blinding the
`completelyInvoiced` gating described under "Gap assessment".

`createDraftInvoice` now creates **and completes** the invoice in one atomic
request. The endpoint name is unchanged; only the outcome is. Completion runs the
`CO` document action through core `ProcessInvoiceUtil` via
`InvoiceCompletionService` (`InvoiceCompletionService.java:110`, `:167`) rather
than `C_Invoice_Post0` directly, so the `ProcessInvoiceHook` CDI chain
(Verifactu / TBAI) fires — it never did through NEO's generic process dispatch.
Rollback is all-or-nothing: the handler only `flush()`es and `ProcessInvoiceUtil`
owns the commit, so a failed completion reverts the header, its lines and the
document-number sequence advance together — no orphan draft, no burned number.

### Guard P2 — 409 on a shipment with nothing left to invoice

`CreateDraftInvoiceHandler.assertShipmentsHavePending`
(`CreateDraftInvoiceHandler.java:917-927`, called at `:206` before
`createFromShipments`) throws `AlreadyInvoicedException` with the literal
**"This shipment has already been fully invoiced."**, surfaced as **HTTP 409** by
the catch at `:254-256`. The condition is that
`NeoInvoiceSupport.computePendingQtyPerLineOrThrow(shipmentId, true)` is empty for
*every* selected shipment — one shipment with pending lines is enough to pass, so
a mixed batch is not blocked.

The hole it closes: `createFromShipments` delegates to `createFromOrder` for the
single-shipment-with-order case, and `capShipmentLineOverrides` returns the
overrides map untouched when it is empty — which it always is, because the UI
posts only `priceListId`. The *throwing* variant of the pending computation is
used deliberately so a DB failure surfaces as a 500 instead of being mistaken for
"already fully invoiced".

`backendErrors.js` maps the literal to `backendError.shipmentAlreadyInvoiced`
("Este albarán ya está totalmente facturado." / "This shipment has already been
fully invoiced."). Note the HTTP-status convention introduced by this ticket:
**409 means "already invoiced" (a duplicate); 400 means "nothing to invoice" or a
missing datum** — the pre-existing `shipmentPriceListRequired` 400 from ETP-4942
is unaffected.

**To modify a generated invoice**, the user reactivates it: `sales-invoice`
exposes a `reactivate` menu action (`documentAction: 'RE'`, `preUnpost: true`,
visible at `DocStatus='CO'`), now the only route back to `DR`.

**Known residual gap (UI copy, not behavior):** `BulkInvoiceFromShipment.jsx`'s
fallback toast still reads `invoiceCreatedAsDraftToast` ("Factura creada como
Borrador" / "Invoice created as Draft") when the response carries no
`documentStatus`. The in-modal result line was updated (`createdAsDraft` →
`invoiceCreatedAndConfirmed` when `documentStatus === 'CO'`, with the "Revisar
antes de confirmar" subline hidden in that case), but the toast key was not.

### Manual verification

1. On a completed shipment that has never been invoiced, use `Create Invoice` and
   verify the resulting invoice opens in **Confirmado**, and that the shipment's
   "Facturado" percentage moves off 0% immediately.
2. Trigger `Create Invoice` again on that same shipment and verify it is rejected
   with the translated 409 ("Este albarán ya está totalmente facturado.") and that
   no second invoice is created.
3. Repeat from the batch flow with a selection mixing one fully-invoiced shipment
   and one with pending lines, and verify the run is **not** blocked — P2 only
   fires when every selected shipment is exhausted.
4. Confirm a draft shipment with the invoice toggle ON and verify the result modal
   lists the invoice as confirmed; then verify the in-modal line reads "creada y
   confirmada" rather than "creada como Borrador".
5. Force the completion to fail and verify nothing is persisted — no draft
   invoice, and the next successful attempt reuses the same document number.

### Automated evidence

- `{etendo_root}/modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/InvoiceCompletionServiceTest.java` (new) covers the extracted completion path.
- `CreateDraftInvoiceHandlerTest.java` and `NeoInvoiceSupportTest.java` were extended for the create-and-confirm flow and guard P2 (including `computePendingQtyPerLineOrThrow`'s throwing behavior).
- `artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js` gained a `success toast copy follows the returned documentStatus (ETP-5381)` block: it asserts `confirmed` is derived from the response `documentStatus === 'CO'` (read from the create response, not from the selected shipment rows), that the headline switches between `invoiceCreatedAndConfirmed` and `createdAsDraft`, that the `reviewBeforeConfirming` subtitle is hidden once the invoice is confirmed and is never rendered unconditionally, and that neither string is hardcoded Draft/Borrador copy.
