# Goods Shipment

## Intent

Use this window to register and complete outbound customer shipments. The functional goal is to move goods out of inventory, confirm what was actually shipped line by line, and then continue into downstream commercial steps such as draft invoicing, customer returns, and shipment document sending.

## What this window should allow

- Create or review a shipment header with warehouse, customer, delivery address, movement date, status (rendered as a status badge, not a dot indicator), currency, and invoicing state.
- Maintain shipment lines that represent the delivered products and quantities for the selected shipment.
- Complete a draft shipment when it is ready to be executed.
- Create a draft sales invoice from one completed shipment or from multiple completed shipments when they are invoiceable together.
- Start a return flow from a completed shipment so the user can select shipped lines and quantities to send back through the return process.
- Open related downstream or upstream documents from the shipment, especially the linked sales order and the invoices created from that order.
- Send the shipment document by email from the detail view, once the shipment is completed.
- Complete multiple draft shipments at once from the list selection bar using the bulk action (labeled "Confirmar" / i18n key `confirmBulk`), which processes each shipment through the standard `documentAction=CO` endpoint.
- Copy a direct link to a record — from the list selection bar when exactly one row is selected, or from the record detail view once the record is saved.

## Interaction model

- Route: `/goods-shipment` and `/goods-shipment/:recordId`. The custom window wrapper reads `?DocStatus=<value>` from the URL and pre-applies it as a column filter (`documentStatus`) using the parsed `enumLabel` descriptor format required by `buildBackendFilter`. The dashboard card "Envíos pendientes" navigates here with `?DocStatus=DR` so the list starts filtered to draft shipments awaiting processing. The list `COLUMNS` definition has `dot: false` on `movementDate` (no red/green date dot) and `type: 'status'` on `documentStatus` (proper status badge, not a dot-prefixed display).
- Visibility: visible in the Sales menu and not marked hidden in `tools/app-shell/src/menu.json`.
- Implementation type: custom route entry in `tools/app-shell/src/windows/registry.js` that loads a generated `GoodsShipmentPage` plus shipment-specific custom actions (`GoodsShipmentActions`, `BulkInvoiceFromShipment`, `RelatedDocuments`).
- Window shape: master-child window. The header entity is `goodsShipment` and the child entity is `goodsShipmentLine`.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.

## Reactive behavior and dependencies

- The window is master-child: opening a shipment detail loads the header plus its child lines, and line creation/editing happens in the context of the current shipment.
- The partner address selector depends on the selected business partner. Current contract evidence shows `partnerAddress` as a dependent selector filtered by `businessPartner`.
- Header editability is status-driven. Core header fields such as warehouse, business partner, partner address, and movement date become read-only once the shipment is processed.
- Unified document/accounting date (ETP-4531, redefined 2026-07-17): `accountingDate` (`DateAcct`) is `visibility: system` — fully hidden from the UI, not present in `frontendContract.entities.goodsShipment.fields` at all. `movementDate` is the single visible date field. `M_InOut.MovementDate` (shared table with Goods Receipt) carries `AD_Column.AD_Callout_ID = org.openbravo.erpCommon.ad_callouts.SL_InOut_AccountingDate`, which auto-fills `dateAcct` from `movementDate`. This cascade is now intentionally allowed to flow through untouched — the earlier `GoodsShipmentHeaderHandler#afterCallout` guard that stripped it (ETP-4531's original, now-superseded scope; see `docs/feedback.md`) has been removed on the `com.etendoerp.go` side, so saving the shipment writes the same date to both `movementDate` and `accountingDate` internally, and the accounting facts generated on posting reflect that unified value as the journal entry's accounting date.
- Shipment lines react to processing state as well. Product and quantities become read-only after processing, and `orderQuantity` only appears when the UOM-related display logic evaluates true.
- Completing is the primary status-driven action exposed through the document action override: the UI labels the action as `Complete` when the shipment is in draft status.
- The detail top bar exposes shipment-specific downstream actions. `Create Invoice` appears only for completed shipments that are not considered fully invoiced by the current page logic; `Create Return` appears for completed shipments; `Send Document` (`SendDocumentButton` in `GoodsShipmentActions.jsx`) is gated by `isCompleted` — it does not render while the shipment is still `DR`.
- **Single unified kebab (ETP-4702, fixed 2026-08-04):** the detail top bar shows exactly one kebab (⋮) menu, containing Post/Unpost plus Download PDF for a completed shipment. Previously `GoodsShipmentActions.jsx` (the `topbarRight` component) rendered its own private "⋮" popover with only Download PDF, right next to the platform's generic kebab that already lists Post/Unpost — two separate dropdown buttons side by side after "Imprimir". Download PDF is now declared through `decisions.json → window.customComponents.moreMenuContent`, the platform's convention for an instant, no-confirmation kebab action (same pattern as `internal-consumption`'s Void and `physical-inventory`'s "Actualizar conteo de sistema") — it fires the download immediately on click, no dialog. See `docs/plans/2026-08-04-etp-4702-duplicate-kebab-menu.md` for the full diagnosis and decision trail (including why `menuActions[].component`, used for confirm-dialog actions like Close Year / New Sub-account, was ruled out in favor of `moreMenuContent`).
- **Currency (ETP-4028)**: header field `etgoCurrency` (`M_InOut.EM_Etgo_Currency_ID`, mandatory). Defaults to the organization's currency (`defaultExpr: "@C_Currency_ID@"`), editable while the shipment is in draft, and becomes read-only once the shipment is processed (`readOnlyLogic: "@Processed@='Y'"`). Changing the currency after lines already exist does **not** recalculate those existing lines' prices — it only applies to newly added lines going forward. When a shipment is created from a sales order (via `NeoCommercialDocumentFactory.createShipmentReceiptHeader`), it inherits the order's currency; other shipment-creation paths (from an invoice, return receipts) inherit the currency of their respective source document. There is deliberately **no** total/amount display that converts the shipment's currency into the organization's currency — `M_InOutLine` carries no monetary columns at all (a shipment is a pure goods movement), so no reliable "document total" exists to convert; this was scoped out of ETP-4028 and left as an open question on the ticket (see comment 2026-07-29).
- Currency filter on line import (ETP-4028): the shipment's own `etgoCurrency` value determines which source documents appear in **Import from Sales Order** and **Import from Sales Invoice**. Each modal's `fetchDocuments` self-fetches the current shipment header to read its currency, then filters candidates so only documents in the same currency are selectable; when the filter excludes all candidates, the modal shows a dedicated empty-state message (`noSalesOrdersMatchShipmentCurrency` / `noSalesInvoicesMatchShipmentCurrency`).
- Single-shipment invoicing opens a preview modal that loads shipment lines, enriches them with unit prices from the related sales order lines, lets the user reduce quantities per line, warns when a draft invoice already exists, and posts to `createDraftInvoice`. The visible total in that modal is a preview derived from selected lines and prices, not a shipment-header total. Since ETP-4028, confirming the invoice also requires an explicit **Tarifa** (price list) selection in `CreateInvoiceConfirmModal` — the shipment's currency is shown read-only (inherited, not editable) while the price list is a required, user-selectable dropdown; the chosen `priceListId` is sent to `createDraftInvoice` and applied to the generated invoice before its lines are created, so every line prices off that price list (if a product has no price there, its price field is left blank for the user to fill in).
- Batch invoicing from the list is constrained by current UI logic: only completed shipments that are not fully invoiced are counted as invoiceable, and all selected invoiceable shipments must belong to the same business partner before `Create Invoice` is enabled. Since ETP-4028, batch invoicing also requires all selected shipments to share the same currency (`currencyCheck` guard) — mixed-currency selections disable `Create Invoice` with an explanatory tooltip; a full price-list picker for this batch flow was not implemented (backend already accepts `priceListId` for the multi-shipment path if a future UI needs it). The batch modal lets the user include or exclude specific lines, adjust quantities per line, previews a derived total, checks for an existing draft invoice, and creates one draft invoice for the selected shipment set.
- Related documents currently react to the shipment's linked sales order. The tab fetches the sales order by `salesOrder`, then fetches sales invoices by the same order id, and renders navigation chips for both. Return receipts are only shown from an internal `_returnReceipts` payload if present.
- Send Email recipient resolution: the Send Email modal (`SendDocumentModal`) pre-fills the `Para` field by fetching `GET /sws/neo/contacts/businessPartner/{businessPartner}` when the modal opens, reading `etgoEmail` (`C_BPartner.EM_Etgo_Email`) from the contacts spec. The field is left empty if no email is registered for the business partner. The modal title uses `useMenuLabel()` so it renders in the active UI language (e.g. "Factura de Venta" in Spanish instead of "Invoice").
- Send Email editable subject/message (ETP-4717): the `Asunto` (subject, auto-derived as `${documentType} #${documentNo} — ${bpName}`) and `Mensaje` fields in the Send Email modal are editable text inputs, not read-only display fields. If the user leaves both untouched, the outgoing command is byte-identical to the legacy payload (no `messageEdits` key is sent). If either is changed, `SendDocumentModal` sends `messageEdits: { subject, message }` alongside the existing `recipientEdits`.
- Send status gating (ETP-4717): the Form-view topbar (`GoodsShipmentActions.jsx`) already gated `SendDocumentButton` on `isCompleted` correctly before this ticket — `artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js` locks that in as a regression test. The other two surfaces did NOT have this gate and needed a code fix, same as the other 4 windows: (1) the Grid row quick-action builds `rowQuickActions` by hand in `tools/app-shell/src/windows/custom/goods-shipment/index.jsx` (it bypasses the generated contract, so `decisions.json`'s `rowQuickActions.actions.email.visibleWhen: "@DocumentStatus@='CO'"` alone never reached it) — the same expression is now also set by hand in that file's `actions` object; (2) the row-click preview drawer `GoodsShipmentPreview.jsx` rendered its Send button and `EmailsCard` link unconditionally — both are now gated on `shipment.documentStatus === 'CO'`.
- Download PDF status gating (ETP-4789): `GoodsShipmentPreview.jsx`'s inline Download PDF button (this window renders its action buttons directly, not via the shared `PreviewActionButtons.jsx`) reuses the same `isSendable` variable already computed for Send just above (`documentStatus === 'CO'`) — previously it was gated only by `pdfBlob`, so a draft shipment with an already-generated preview PDF could still be downloaded. It is now `disabled={!pdfBlob || !isSendable}` / `onClick={pdfBlob && isSendable ? handleDownload : undefined}`. Locked in by `tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentPreview.vitest.jsx` (`Download PDF gating by documentStatus (ETP-4789)`).
- No explicit shipment-level tax, discount, or financial recalculation behavior is visible in the current evidence. The only observed financial reaction is invoice preview total calculation based on selected shipment lines and sales-order prices.
- Copy-link visibility (ETP-4721): in the grid selection bar, `Copy link` appears only when exactly one row is selected — hidden with 0 or 2+ rows selected. In the detail topbar, `Copy link` is visible whenever the record has a persisted `recordId` (not the unsaved `'new'` sentinel), with no selection gate since detail always represents a single record. Both copy `{origin}/{windowName}/{recordId}` to the clipboard, show a `Link copied` / `Enlace copiado` toast, and display a `Copy link` / `Copiar enlace` tooltip on hover. The legacy dead link icon previously shown in the idle-state (no-selection) grid toolbar is now hidden via the `hideLink` prop passed to `<ListView>`.

## Gap assessment

- The return workflow is not fully backed by stable observed behavior yet. `ReturnWizard.jsx` explicitly marks the `createReturn` endpoint as pending backend implementation, and the related-documents tab says return receipts are reserved for backend support. The business intent is clear, but end-to-end return creation should be treated as a gap until backend support is confirmed.
- Batch invoice creation is clearly implemented as a draft-invoice flow, but current evidence only proves source shape and endpoint usage, not a browser-tested logistics scenario. It should be treated as supported-by-code with limited automated proof.
- The documented shipment-to-invoice relationship is order-centric: the related-documents tab resolves invoices through the linked sales order, not by directly querying invoices from the shipment id. If the business expects shipment-specific invoice traceability independent of the order link, that remains an open ambiguity.
- The top-bar and list invoicing logic check a `completelyInvoiced` flag in custom components, while the contract and generated fields expose the frontend field as `invoiced` / `Iscompletelyinvoiced`. The runtime payload may normalize both names, but this is not explicit in current evidence, so the exact gating behavior for already invoiced shipments remains an implementation ambiguity.
- **ETP-4729 — Print action unified, custom print button removed**: the generic print icon is now available on both the list grid and the detail view. The bespoke "Imprimir"/"Descargar PDF" entry that used to live in `GoodsShipmentActions.jsx`'s `⋮` menu was removed, since it duplicated the unified print flow with a client-side-generated PDF.

## Manual verification

1. Open `/goods-shipment` and confirm the list shows shipment records with document number, movement date, status, and invoicing state.
2. Open `/goods-shipment?DocStatus=DR` and confirm the list starts filtered to draft shipments (the same state the dashboard "Envíos pendientes" card navigates to).
3. Open a shipment detail and verify it behaves as a master-child page with editable header fields in draft status and child shipment lines underneath.
4. Change the business partner on a draft shipment and confirm the partner-address selector reacts as a dependent field.
5. Open a draft shipment and confirm the top bar does **not** expose the Send/"Enviar" action, neither in the topbar nor as a row quick action in the list. Complete the shipment and confirm the top bar now exposes `Create Invoice`, `Create Return`, and the Send/"Enviar" action in both places.
6. Use `Create Invoice` on a completed shipment and confirm the preview loads shipment lines, allows quantity reduction, warns if a draft invoice already exists, and navigates to the created draft invoice when successful.
7. From the list, select multiple completed shipments for the same customer and confirm batch `Create Invoice` is enabled; repeat with different customers and confirm it stays disabled.
8. In the batch invoice modal, deselect some lines or reduce quantities and confirm the preview total changes before creation.
9. Open `Related Documents` on a shipment that came from a sales order and confirm the order chip and any invoice chips navigate to the expected records.
10. Attempt the return flow on a completed shipment and verify whether the backend actually completes the return creation; if it fails, record it as the current functional gap.
11. Select two or more draft shipments from the list and confirm the bulk action bar shows a `Confirmar (N)` button. Trigger it and verify all selected shipments move to completed status and a result toast appears.
12. Open the Send Email modal from the topbar and confirm: the business partner's email registered in `EM_Etgo_Email` is proposed as an editable `To` chip (when none is registered, the To list starts empty); the proposed chip can be removed; additional To recipients and CC recipients (via the `Add CC` affordance) can be added; entering a syntactically invalid email shows an inline validation error and disables Send; Send is also disabled while the final To list is empty (even with CC entries) or when more than 10 recipients are entered across To and CC; and the modal title reads the translated document name in the active UI language. Also confirm the `Asunto` and `Mensaje` fields are editable (not greyed-out/read-only), that they pre-fill with the auto-derived subject and an empty message, and that sending without touching either still succeeds normally.
13. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
14. In the list, select 0, then 1, then 2+ shipments and confirm `Copy link` appears in the selection bar only when exactly one row is selected. Click it and confirm a `Link copied` toast appears and the clipboard contains `{origin}/goods-shipment/<id>`. Open a saved shipment and confirm the same `Copy link` action (with tooltip on hover) is available in the detail topbar.
15. Create a shipment from a sales order confirmed in a non-org currency (e.g. USD, org in EUR) via "Manage Shipment" and confirm the new shipment's Currency field is pre-filled with USD, not the org's default.
16. On a draft shipment, confirm Currency defaults to the org's currency and is editable; confirm it becomes read-only once the shipment is completed.
17. On a draft shipment with existing lines, change Currency and add a new line; confirm the existing lines' prices/behavior are unaffected and only the new line reflects the new currency context.
18. On a shipment with Currency = USD, open **Import from Sales Order** / **Import from Sales Invoice** and confirm only USD-denominated source documents are listed, with EUR (or other-currency) documents excluded and an explanatory empty-state message shown when nothing matches.
19. Use `Create Invoice` on a completed shipment and confirm the confirmation popup shows Currency read-only (inherited from the shipment) and a required Tarifa (price list) selector; confirm the created invoice's lines price off the selected price list.
20. Select multiple completed shipments with different currencies from the list and confirm `Create Invoice` stays disabled with an explanatory tooltip; repeat with same-currency shipments and confirm it enables.

## Automated evidence

- `artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage.jsx` defines the master-child page, status-driven detail actions, related-documents tab, and list bulk-action entry point.
- `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` implements single-shipment draft invoice creation, shipment return launch, shipment sending, existing-draft warning, and quantity-based invoice preview.
- `artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx` implements batch draft invoice creation for completed shipments from the same customer, with per-line selection, quantity editing, draft-invoice checking, and preview totals.
- `artifacts/goods-shipment/custom/RelatedDocuments.jsx` shows that related-document navigation currently resolves the linked sales order and sales invoices, with return receipts left pending backend support.
- `artifacts/goods-shipment/custom/ReturnWizard.jsx` explicitly documents the pending backend dependency for `createReturn`.
- `artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js` provides source-shape coverage for the bulk invoice component, including invoiceable filtering, same-customer enforcement, line fetching, sales-order price enrichment, draft-invoice checking, and draft-invoice creation endpoint usage.
- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-complete component (CO only, via `buildInOutActions`) mounted in the list selection bar for goods shipments with `labelKey="confirmBulk"` so the button renders as "Confirmar" / "Confirm".
- There is no dedicated browser E2E or interaction test in the current worktree proving the full shipment execution, invoicing, or return flow end to end.
- `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` proves the Send Email modal is wired with `bPartnerId` and `apiBaseUrl` so the recipient email is resolved from the contacts spec at open time and proposed as an editable `To` chip (removable, with additional To/CC recipients supported per ETP-4226 — edits reach the backend only through the allowlisted `recipientEdits` command field), and `documentType` is translated via `useMenuLabel()`.
- **ETP-4717 — editable subject/message and status-gated Send:** `tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.vitest.jsx` and `documentEmailSend.vitest.js` cover the editable `Asunto`/`Mensaje` fields and the opt-in `messageEdits` command field (present only when the operator actually changes subject or message; omitted — byte-identical legacy payload — otherwise). `e2e/tests/flows/document-send-recipients.mocked.spec.js` adds browser-level coverage that a typed message reaches the backend as `messageEdits.message`. `artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js` adds a regression lock-in for the already-correct `isCompleted && <SendDocumentButton>` gating (this window needed no logic fix, unlike the other 4). `artifacts/__tests__/etp-4717-send-email-visibility.test.js` asserts `contract.json → frontendContract.window.rowQuickActions.actions.email.visibleWhen === "@DocumentStatus@='CO'"` so the grid row quick-action agrees with the Form-view topbar gate.
- The generated `GoodsShipmentPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_InOut` AD table.
- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.
- **ETP-4032 — Shared ConfirmResultModal**: `GoodsShipmentActions.jsx` now imports `ConfirmResultModal` from `@/components/contract-ui` instead of the former `@generated/sales-order/custom/OrderCreateInvoice` re-export. The modal's props API uses `cards` (array of document links) instead of the previous `docs` object — behavior is unchanged for the user.
- **ETP-4721 — Copy link**: `tools/app-shell/src/hooks/useCopyLinkAction.js` implements `useCopyLinkAction` (grid selection-bar copy) and `useCopyRecordLinkAction` (detail-topbar copy); `tools/app-shell/src/components/contract-ui/CopyLinkButton.jsx` and `CopyRecordLinkButton.jsx` render the tooltip-wrapped buttons for each context. `tools/app-shell/src/windows/custom/goods-shipment/index.jsx` wires the grid action into `bulkActions` and passes `hideLink` to `<ListView>`; `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` (the `topbarRight` component for this window) wires `CopyRecordLinkButton` into the detail topbar.
- **ETP-4028 — Currency field**: `modules/com.etendoerp.go/src-db/database/model/modifiedTables/M_INOUT.xml` adds `EM_ETGO_CURRENCY_ID` (mandatory, Search reference to `C_Currency`). `NeoCommercialDocumentFactory.java` sets `.setEtgoCurrency(...)` on every `ShipmentInOut` creation path (from a sales order, from another shipment, from an invoice). `artifacts/goods-shipment/decisions.json` declares `etgoCurrency` (editable, `defaultExpr: "@C_Currency_ID@"`, locked on `Processed='Y'`) plus `window.labelOverrides` for the field label.
- **ETP-4028 — Currency-filtered imports**: `artifacts/goods-shipment/custom/ImportFromSalesOrderModal.jsx` and `ImportFromSalesInvoiceModal.jsx` fetch the shipment header for `etgoCurrency` and filter candidate documents by matching currency, passing `noCurrencyMatchMessageKey` to the shared `ImportLinesModal`.
- **ETP-4028 — Price-list picker at invoice time**: `tools/app-shell/src/components/contract-ui/CreateInvoiceConfirmModal.jsx` (shared with goods-receipt, purchase-order, sales-order) gained `showPriceListPicker`/`isSOTrx` props, fetching `/price-list/priceList` and letting the user pick a price list before confirming; `GoodsShipmentActions.jsx` wires this in and forwards `priceListId` to `createDraftInvoice`. Backend: `CreateDraftInvoiceHandler.java`'s `createFromOrder`/`createFromShipments` gained a 3rd `priceListId` parameter and an `applyPriceListOverride` helper that sets `invoice.setPriceList(...)` before the native `CreateInvoiceLinesFromProcess` prices the lines.
- **ETP-4028 — Bulk-invoice currency guard**: `BulkInvoiceFromShipment.jsx` adds a `currencyCheck` that disables `Create Invoice` when the selected shipments don't share the same currency.
- **ETP-4702 — De-duplicated kebab menu**: `artifacts/goods-shipment/custom/GoodsShipmentMoreMenu.jsx` (new) is the `moreMenuContent` component wired via `decisions.json → window.customComponents.moreMenuContent`; it renders `null` unless `documentStatus === 'CO'`, otherwise a single "Download PDF" button that fetches the shipment PDF as a blob and triggers a browser download, then closes the shared kebab — no modal, no confirmation step. `GoodsShipmentActions.jsx` had its private "⋮" popover removed (the `menuOpen`/`menuRef` state, the outside-click handler, and the `handleDownload` function all moved into the new component); its `handlePrint`/"Imprimir" button is unrelated and was left untouched. The generated `GoodsShipmentPage.jsx` now passes `customMenuContent={GoodsShipmentMoreMenu}` to `<DetailView>`, alongside the existing `menuActions` prop (Post/Unpost) — both render inside the same dropdown.

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

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.
