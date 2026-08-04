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
- Send the shipment document by email from the detail view, once the shipment is completed.
- Complete multiple draft shipments at once from the list selection bar using the bulk action (labeled "Confirmar" / i18n key `confirmBulk`), which processes each shipment through the standard `documentAction=CO` endpoint.

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
- Single-shipment invoicing opens a preview modal that loads shipment lines, enriches them with unit prices from the related sales order lines, lets the user reduce quantities per line, warns when a draft invoice already exists, and posts to `createDraftInvoice`. The visible total in that modal is a preview derived from selected lines and prices, not a shipment-header total.
- Batch invoicing from the list is constrained by current UI logic: only completed shipments that are not fully invoiced are counted as invoiceable, and all selected invoiceable shipments must belong to the same business partner before `Create Invoice` is enabled. The batch modal lets the user include or exclude specific lines, adjust quantities per line, previews a derived total, checks for an existing draft invoice, and creates one draft invoice for the selected shipment set.
- Related documents currently react to the shipment's linked sales order. The tab fetches the sales order by `salesOrder`, then fetches sales invoices by the same order id, and renders navigation chips for both. Return receipts are only shown from an internal `_returnReceipts` payload if present.
- Send Email recipient resolution: the Send Email modal (`SendDocumentModal`) pre-fills the `Para` field by fetching `GET /sws/neo/contacts/businessPartner/{businessPartner}` when the modal opens, reading `etgoEmail` (`C_BPartner.EM_Etgo_Email`) from the contacts spec. The field is left empty if no email is registered for the business partner. The modal title uses `useMenuLabel()` so it renders in the active UI language (e.g. "Factura de Venta" in Spanish instead of "Invoice").
- Send Email editable subject/message (ETP-4717): the `Asunto` (subject, auto-derived as `${documentType} #${documentNo} — ${bpName}`) and `Mensaje` fields in the Send Email modal are editable text inputs, not read-only display fields. If the user leaves both untouched, the outgoing command is byte-identical to the legacy payload (no `messageEdits` key is sent). If either is changed, `SendDocumentModal` sends `messageEdits: { subject, message }` alongside the existing `recipientEdits`.
- Send status gating (ETP-4717): unlike sales-order, purchase-order, sales-invoice, and sales-quotation — all of which needed a code fix — `GoodsShipmentActions.jsx` already gated `SendDocumentButton` on `isCompleted` correctly before this ticket. `rowQuickActions.actions.email.visibleWhen: "@DocumentStatus@='CO'"` was newly declared in `decisions.json` to match, and `artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js` now locks the existing-correct gating in as a regression test so a future shared-logic refactor across the 5 windows cannot silently break this one.
- No explicit shipment-level tax, discount, or financial recalculation behavior is visible in the current evidence. The only observed financial reaction is invoice preview total calculation based on selected shipment lines and sales-order prices.

## Gap assessment

- The return workflow is not fully backed by stable observed behavior yet. `ReturnWizard.jsx` explicitly marks the `createReturn` endpoint as pending backend implementation, and the related-documents tab says return receipts are reserved for backend support. The business intent is clear, but end-to-end return creation should be treated as a gap until backend support is confirmed.
- Batch invoice creation is clearly implemented as a draft-invoice flow, but current evidence only proves source shape and endpoint usage, not a browser-tested logistics scenario. It should be treated as supported-by-code with limited automated proof.
- The documented shipment-to-invoice relationship is order-centric: the related-documents tab resolves invoices through the linked sales order, not by directly querying invoices from the shipment id. If the business expects shipment-specific invoice traceability independent of the order link, that remains an open ambiguity.
- The top-bar and list invoicing logic check a `completelyInvoiced` flag in custom components, while the contract and generated fields expose the frontend field as `invoiced` / `Iscompletelyinvoiced`. The runtime payload may normalize both names, but this is not explicit in current evidence, so the exact gating behavior for already invoiced shipments remains an implementation ambiguity.

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

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.
