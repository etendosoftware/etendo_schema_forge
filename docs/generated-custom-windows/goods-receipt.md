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
- complete multiple draft receipts at once from the list selection bar using the bulk action (labeled "Confirmar" / i18n key `confirmBulk`), which processes each receipt through the standard `documentAction=CO` endpoint
- preview a completed receipt from the list row quick-action or by selecting a row, and create a purchase invoice directly from that preview panel

## Interaction model

- Route: `/goods-receipt`, `/goods-receipt/:recordId`. The custom window wrapper reads `?DocStatus=<value>` from the URL and pre-applies it as a column filter (`documentStatus`) using the parsed `enumLabel` descriptor format required by `buildBackendFilter`. The dashboard card "Recepciones pendientes" navigates here with `?DocStatus=DR` so the list starts filtered to draft receipts awaiting processing.
- Visibility: visible from the Purchases menu under Operations
- Implementation type: custom window override registered in `tools/app-shell/src/windows/registry.js`, built on top of the generated goods-receipt window
- Window shape: master-child window with a header record (`goodsReceipt`) and child received lines (`goodsReceiptLine`).
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Preview panel** (`GoodsReceiptPreview.jsx`): rendered via `renderPreview` prop on the generated app. Opens from a list row hover action or row selection. Shows document header, a General tab with receipt stats (BP, warehouse, PO link, invoice %, date), a Messages tab, and a History tab. Completed receipts show a Create Invoice action that opens `ReceiptInvoicePreview`. The PO identifier in the stats panel is a clickable link that closes the preview and navigates to `/purchase-order/:id`. This window does **not** expose any document-email / "send by email" access — the send-document feature is intentionally disabled (`window.sendDocument.enabled = false` in `decisions.json`), so no email action appears on rows, in the preview panel, or in the form action bar (ETP-4372).
- **Invoice preview before creation** (`ReceiptInvoicePreview`, built inside `GoodsReceiptPreview.jsx`): when the user clicks "Create Invoice" from a completed receipt preview, a confirmation/preview modal appears showing the receipt summary and a "Confirm" button that calls the purchase-invoice creation endpoint and then displays the result via `ConfirmResultModal`.
- **Topbar invoice-status pill** (`GoodsReceiptTopbar.jsx`): renders an `InvoiceStatusPill` in the form topbar for completed receipts, showing the invoice percentage with color coding (gray = 0%, amber = partial, green = 100%). Hidden for draft receipts.
- **Draft status chips** (`GoodsReceiptDraftChips.jsx`): custom chip set shown in the draft-mode banner, providing at-a-glance receipt progress indicators while the document is in draft.
- **Purchase Return Wizard** (`PurchaseReturnWizard.jsx`): wizard component available for initiating a purchase return from a completed receipt. Accessed via menu action.

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
10. Select two or more draft goods receipts from the list and confirm the bulk action bar shows a `Confirmar (N)` button. Trigger it and verify all selected receipts move to completed status and a result toast appears.
11. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
12. Confirm there is **no** document-email access anywhere in this window: no envelope action on a list row hover, no "Enviar" button in the preview panel header, and no email envelope in the form-view action bar. The send-document feature is disabled for this window (ETP-4372).

## Automated evidence

- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-complete component (CO only, via `buildInOutActions`) mounted in the list selection bar for goods receipts with `labelKey="confirmBulk"` so the button renders as "Confirmar" / "Confirm".
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
