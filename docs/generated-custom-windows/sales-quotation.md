# Sales Quotation

## Intent

Let a sales user prepare a customer quotation, review commercial terms before commitment, and turn an accepted quotation into a downstream sales document without re-entering the header and line data.

## What this window should allow

- Create and review quotation headers with customer, quotation date, validity date, address, price list, payment method, payment terms, notes, and read-only commercial totals.
- Add, edit, and remove quotation lines with product, description, quantity, Net List Price, discount, tax, and line gross amount.
- Render Net List Price in the quotation grid as a currency-formatted `amount` column backed by `PriceList`, instead of exposing the derived `unitPrice` (`PriceActual`) as the visible price column.
- Keep the quotation in draft while the commercial proposal is being prepared, then explicitly send that draft into an `Under Evaluation` state before final conversion.
- From `Under Evaluation`, create a downstream sales order and, in the current custom overlay, optionally create a draft sales invoice.
- Send the quotation document from the record view.
- Inspect related downstream sales orders and invoices from the quotation record when those documents exist.

## Interaction model

- Route: `/sales-quotation` for the list and `/sales-quotation/:recordId` for the record workspace.
- Visibility: visible from the Sales menu under the Commercial section.
- Implementation type: custom window wrapper over the generated quotation page.
- Window shape: master-child, with `quotation` as the header entity and `quotationLine` as the child entity.
- List interaction: the custom wrapper injects a `CustomQuotationTable` (with `dot: false` on the date column). The `DateOrdered` column label is renamed to "Quotation Date" / "Fecha de presupuesto" via `decisions.json → window.labelOverrides`, overriding the global locale label "Order Date" / "Fecha de pedido" for both the list grid and the detail form (the wrapper no longer ships a local `LABEL_OVERRIDES` map; the value flows from decisions through `QuotationPage.jsx`'s generated `labelOverrides` constant). The visible columns, in order, are: Fecha de presupuesto (no dot indicator), Document No., Business Partner, Document Status, Valid Until, and Total Gross Amount. `Valid Until` is placed between Document Status and Total Gross Amount on purpose, so the validity date is adjacent to the total and the user can triage each row by deciding whether the total is still actionable. The wrapper also enables clone-from-grid via the shared `CloneOrderModal` and feeds a `refreshTrigger` counter into the generated `ListView`, so when the user closes the clone result modal the list auto-refreshes and the new draft quotations show up without a manual reload.
- Record interaction: the detail page shows the quotation header form, a child lines table and line form, summary amounts, record status, top-bar actions, and a Related Documents tab.
- Lines tab layout: this window is the pilot for `window.linesLayout = "inlineEditable"`. The Lines tab uses `InlineLinesPanel` (40 px rows in Inter font, pencil + trash hover-action icons on the right). Pencil flips the row into inline edit; trash deletes. All columns are inline-editable. FK fields (product, tax) use `InlineSearchCombo`: a text input with server-side search so the user can filter by typing (e.g., "IVA" filters all IVA rates). Product is a lookup field that opens `ProductSearchDrawer`. The add-line button, related-documents panel, notes panel and totals panel are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.
- Available record-level affordances in current evidence: duplicate and cancel menu entries, a send-document button, and a draft-only confirmation button.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies

- Header dependency: `partnerAddress` is a dependent selector filtered by the selected `businessPartner`, so address choice should narrow after the customer changes.
- Header visibility changed in the merged code: `priceList`, `validUntil`, `paymentMethod`, and `paymentTerms` are now part of the visible quotation header form instead of remaining hidden or collapsed-only fields.
- User-touched field protection on the header form: when the user manually changes an FK field after a callout has already set it (typical case: `paymentTerms` set to "30 días" by the `businessPartner` callout, then changed by the user), follow-up callouts triggered by other fields cannot overwrite that value. The guard lives in `DetailView.jsx` (`userTouchedRef`) and resets when `recordId` changes, so each new or freshly loaded record starts clean. The current callout's trigger field still wins because it represents the user's most recent action.
- Persisted payment-term changes: the `etgo_sf_field` row for `paymentTerms` was historically marked `IsReadOnly=Y`, which made `NeoFieldFilter.filterWriteRequest` strip the field from PATCH bodies and silently drop user changes. The row is now `IsReadOnly=N` (kept in sync via `push-to-neo` and the exported XML in `com.etendoerp.go`), so editing `paymentTerms` on an existing draft quotation actually persists.
- POST-create cascade no longer overwrites user-set FK values: `NeoCrudHandler.executePostCreate` snapshots the keys submitted in the request body before `injectMandatoryDefaults` runs, and passes them as `protectedFields` into the post-create callout cascade. The cascade can still refine missing/derived fields, but it no longer flips `paymentTerms` (or any other user-set field) back to the business-partner default during the initial save.
- Header defaulting and callouts: the contract keeps business-partner, address, price-list, order-date, and valid-until callouts. Current evidence supports customer-driven address and price-list autofill expectations, and it also records an intended default of `validUntil = orderDate + 30 days` for new quotations.
- Pricing dependency: line product selection auto-fills `listPrice` (Net List Price), `tax`, `uOM`, `grossUnitPrice`, and `discount` from the active price list via the `SL_Order_Product` callout. The `forceCalloutFields: ["listPrice","unitPrice","tax","uOM","grossUnitPrice","discount"]` declaration on the `product` field bypasses the `touchedFieldsRef` guard so callout-returned values are applied even when the user has not directly touched those fields. `discount` is included because product/price-list callouts may return a customer- or product-specific discount on product selection. The Classic callout returns the price as `standardPrice` (PriceStd); `DetailView.jsx` maps it to `listPrice` when the callout zeroes out the `listPrice` field.
- Line recalculation — client-side model (ETP-3662): `orderedQuantity`, `listPrice`, and `discount` changes are computed entirely in the browser via `useLineGrossAmount` — no callout round-trip is fired for those fields. The formula is `lineGrossAmount = orderedQuantity × listPrice × (1 − discount/100) × taxFactor`, where `taxFactor` is resolved from (in priority order) the product callout response, the tax selector aux data, an in-memory cache, or a ratio derived from sibling lines. The `tax` field still fires a callout (to obtain `taxRate`), but `orderedQuantity`, `listPrice`, and `discount` are pure client-side. After save, `unitPrice = listPrice × (1 − discount/100)` is injected into the POST body as Classic's `priceActual`; `lineGrossAmount` is trusted by `NeoDefaultsService` and stored as-is. Saved lines trigger the `Line_Recalc_Totals` event handler to refresh header totals.
- Status-driven behavior: editable header fields become read-only when the quotation is processed, and the generated detail page hides delete/print affordances for completed records.
- Topbar button order: matches `sales-order` and `sales-invoice` — `Clonar` (icon-only, Secondary Outline style, `#D1D4DB` border, `#64748B` icon color, hover background `#F1F5F9`) and the send-document icon come from `QuotationTopbarActions` (the `topbarRight` slot), then the framework renders the trash icon and the kebab `⋮` menu, and finally the `Guardar` (outline) and `Confirmar` (primary) pair come from the framework's `draftMode` block. The previous layout rendered a hardcoded blue `Confirmar` at the start of the topbar; that button was removed and the same flow is now driven through `draftMode` so the visual order matches the rest of the sales windows. `decisions.json` declares `entities.header.draftMode.enabled = true` and `window.hideSaveStatuses = ["CA","ETGO_CI","CL","VO","CJ"]` so the save/confirm pair only renders in DR/UE and disappears once the quotation is closed.
- Confirm flow dispatch: the wrapper at `tools/app-shell/src/windows/custom/sales-quotation/index.jsx` overrides the generated `draftMode` with a `draftModeWithModal` whose `onConfirm` dispatches the DOM event `sales-quotation:open-confirm-modal`. `QuotationTopbarActions.jsx` listens for that event and routes to the right modal: `SendToEvaluationModal` when `documentStatus === 'DR'` (DR → UE), `QuotationConfirmModal` when `documentStatus === 'UE'` (UE → CA / ETGO_CI). This keeps the bespoke two-state flow without renouncing the standard sales-window topbar layout.
- Save/Confirm visibility during Under Evaluation: standard Etendo flips the `processed` flag to `Y` once the quotation transitions to `UE`, which would normally trigger the framework's `isDraftModeCompleted` shortcut (defined as `processed=Y || documentStatus='CO'`) and hide the Save/Confirm pair. Because the quotation must still expose `Confirmar` in `UE` to drive the convert-to-order/invoice modal, the window declares `entities.header.draftMode.completedStatuses = ["CA","ETGO_CI","CL","VO","CJ"]`. With that explicit list, `DetailView` only treats those terminal codes as completed and keeps Save/Confirm rendered for `DR` and `UE`. Generic windows that omit `completedStatuses` still get the original `processed=Y || CO` behavior — see `tools/app-shell/src/components/contract-ui/DetailView.jsx`.
- Reject flow (UE only): the kebab (⋮) on a quotation in `UE` exposes a `Reject` item with the `XCircle` icon (Figma redesign), declared in `decisions.json → window.menuActions[reject]` (`visibleWhenStatus: ["UE"]`). The wrapper at `tools/app-shell/src/windows/custom/sales-quotation/index.jsx` overrides the generated `menuActions` with a function so the `onClick` can dispatch the DOM event `sales-quotation:open-reject-modal` (decisions.json is JSON and cannot carry functions). `QuotationTopbarActions.jsx` listens for that event and renders `RejectQuotationModal` via portal. The modal exposes a search-typeahead — modelled after the `businessPartner` selector — that fetches the `C_Reject_Reason` list from `${apiBaseUrl}/quotation/selectors/C_Reject_Reason_ID`. A "+ Crear razón" button at the top of the dropdown opens `CreateRejectReasonModal`, which POSTs `{ name }` to `${apiBaseUrl}/quotation/{id}/action/createRejectReason` (handled by `CreateRejectReasonHandler` in `com.etendoerp.go`); on success the new row is appended to the typeahead cache and preselected. Confirming the parent modal POSTs to `${apiBaseUrl}/quotation/{id}/action/rejectQuotation` with `{ rejectReason: "<id>" }`. The `RejectQuotationHandler` flips DocStatus to `CJ`, persists `rejectReason`, and sets `processed = true`. After success the modal reloads the page; once the quotation is in `CJ`, `hideSaveStatuses` and `completedStatuses` both list `CJ`, so the Save/Confirm pair disappears, the `Reject` kebab item hides (its `visible` predicate excludes `CJ`), and the field-level `readOnlyLogic` (`@DocStatus@='CJ'|@DocStatus@='CA'`, inherited from the AD column rules) renders the form fully read-only.
- Reject reason visible on the form (ETP-3893 follow-up): once a quotation is in `CJ`, the `rejectReason` field surfaces in the principal section of the header form so the user can see WHY it was rejected. `decisions.json → entities.header.fields.rejectReason` declares `visibility: "readOnly"`, `form: true`, `section: "principal"`, and `displayLogic: "record.documentStatus === 'CJ'"` so the field renders only on rejected quotations and stays hidden in DR/UE/CO/CA/etc. The label is translated via `window.labelOverrides.C_Reject_Reason_ID` ("Razón de rechazo" / "Reject Reason") since the AD locale dictionary stores the raw column name. The `visibility: "readOnly"` classification is what locks the field from form input — the user only sets the value through the rejection action modal, never by typing into the form (ETP-4006: changed from `editable` to prevent the defaults endpoint from auto-picking the first reject reason on every new draft, which silently populated `C_Reject_Reason_ID` even though the field was hidden by displayLogic).
- Send Email recipient resolution: the Send Email modal (`SendDocumentModal`) pre-fills the `Para` field by fetching `GET /sws/neo/contacts/businessPartner/{businessPartner}` when the modal opens, reading `etgoEmail` (`C_BPartner.EM_Etgo_Email`) from the contacts spec. The field is left empty if no email is registered for the business partner. Sending posts only the contract command to the backend `sales-quotation-send` email contract; the backend resolves the final recipient and builds the default document payload (`document_type`, `document_number`, and `download_link`) instead of accepting recipient/template/provider fields from the browser. The modal title uses `useMenuLabel()` so it renders in the active UI language (e.g. "Factura de Venta" in Spanish instead of "Invoice").
- Preview panel behavior: clicking a row in the sales-quotation list opens a lateral `QuotationPreview` panel via `GenericPreviewModal`. The preview has three tabs: `General`, `Messages` (placeholder), and `History` (placeholder). The General tab stacks: `SummaryCard` (totals, status, contact, order date, valid-until), `EmailsCard` (placeholder), and `RelatedDocumentsCard`. The `RelatedDocumentsCard` fetches related sales orders via `fetchByCriteria('sales-order','header','quotation',id,...)`, showing each order's document number, total, and status as a clickable chip. A refresh button re-triggers the fetch. For non-draft quotations, the PDF is auto-cached on first open; drafts always regenerate live. The PDF includes conditional discount breakdown rows and uses `Precio tarifa` / `List Price` as the price column header. All numeric amounts use period as the decimal separator (`en-US` locale in the shared `fmt` Handlebars helper), consistent with the form view.
- Related downstream behavior: the Related Documents tab is intended to surface sales orders and invoices tied to the quotation so the user can navigate into fulfillment and billing from the quotation record.
- Line amount recalculation for `orderedQuantity`, `listPrice`, and `discount` is client-side and instantaneous — no server round-trip is required. The `tax` field change still fires a callout (to obtain `taxRate` and update `lineGrossAmount` via the same `useLineGrossAmount` hook), and product selection fires a callout to fill price, tax, and UOM. Header total fields (`summedLineAmount`, `grandTotalAmount`) refresh only after save, since they are computed server-side by the `Line_Recalc_Totals` event handler. The `DocumentTotalsPanel` in the detail footer aggregates from live lines plus the in-progress add-row in real time, so the user sees an accurate running total without saving — it does not read from the server-side totals.
- Discount panel: the `DocumentTotalsPanel` in the detail footer always keeps the `discount` column visible in the lines grid and add-row — there is no toggle. "Subtotal sin descuento" and "Descuento por producto" rows auto-appear when `discountAmt > 0` (at least one line has a non-zero discount); both are read-only computed rows. A `+ Añadir descuento total` button appears below the totals when no total discount is active and at least one line exists; clicking it opens an interactive "Descuento total" section with a checkbox, computed amount, and a percentage input. Unchecking the checkbox collapses the section and restores the button. On `onBlur`, `DetailView` fires `handleTotalDiscountChange(pct)` → `PATCH { etgoTotalDiscount: N }` → persists in `EM_Etgo_Total_Discount` on the `C_Order` header (best-effort, no reload). Total discount is synced on two paths: (1) `documentAction=CO` via CRUD or ACTION — `SalesQuotationHeaderHandler` calls `AbstractOrderHeaderHandler.applyTotalDiscountBeforeComplete()` which intercepts PATCH with `{ documentAction: "CO" }` or POST to `/action/documentAction`; (2) `DocAction` process button — `SendToEvaluationModal` sends `POST /action/DocAction { fieldValues: {} }` (the DR→UE path), intercepted by `AbstractOrderHeaderHandler.syncTotalDiscountOnDocAction()` called explicitly from `SalesQuotationHeaderHandler`. Both paths delegate to `TotalDiscountService.recalculate()`: it deletes any existing `ETGO_DTO` discount lines, then creates one negative line per tax group (`GROUP BY c_tax_id`), proportional to each group's net subtotal — mirroring Classic `C_ORDER_POST1`. `OrderLineHandler` filters `ETGO_DTO` lines from all GET responses so they are never visible in the frontend. When the quotation is read-only (completed/rejected), `DocumentTotalsPanel` shows a static "Descuento total (X%) −Y€" row instead of the interactive panel.
- Save button dirty-state tracking: the "Guardar" ("Save Draft") and "Confirmar" pair is managed by draftMode, but the Save button specifically is disabled whenever there are no pending unsaved changes (`isDirty = false`). Four independent sources make `isDirty` true: (1) any header field value differs from the last-saved record; (2) an add-row form is open on the primary lines tab; (3) an add-row form is open on a secondary child tab; (4) a sidebar line edit is open. The "Confirmar" button is never blocked by dirty state — sending a quotation to Under Evaluation or converting it is always allowed regardless of whether header changes are pending. New records always have Save active because backend defaults populate the form immediately on open. After a successful save, `selected` syncs to the server response and the button disables automatically. Reverting a changed field back to its original value also disables the button. When a line is added, `refreshHeaderTotals` updates server-computed totals in `editing` without overwriting fields the user explicitly changed, so pending header edits survive line operations.

## Invoice creation flow

The "Facturar directamente" action on the confirmation modal calls
`POST /sws/neo/sales-quotation/header/{id}/action/createDraftInvoice`, routed
to `CreateDraftInvoiceHandler` in `com.etendoerp.go`. The handler reuses the
sales-order code path: it copies the quotation header (business partner,
currency, payment terms, price list) and the lines (product, quantity, prices)
into a new sales invoice in `DR` (Draft) status via the native
`CreateInvoiceLinesFromProcess`.

The success state of `QuotationConfirmModal` displays the invoice doc number
followed by the formatted grand total and the quotation's currency identifier
(e.g. `Factura #10000083 · 48.40 EUR`). The order branch already rendered the
currency; the invoice branch was previously dropping the suffix.

After the invoice is persisted, the source quotation's DocStatus is set to
`ETGO_CI` ("Closed - Invoice Created") via a direct OBDal write. This mirrors
the standard Etendo pattern in `ConvertQuotationIntoOrder`, which sets DocStatus
to `CA` ("Closed - Order Created") when an order is generated from a
quotation. The transition is performed without invoking `C_Order_Post`, so it
is immune to the `@AlreadyPosted@` raised by that stored procedure regardless
of the quotation's `Processed` flag or prior status.

The line quantity invoiced is `orderedQuantity − invoicedQuantity` per line.
Lines whose pending is zero are skipped; if every line is fully invoiced, the
handler returns HTTP 400 with "No hay líneas a facturar en este pedido".

ETP-4006 (IV-11) extends the same handler to carry the discount surface
to the new invoice. `NeoCommercialDocumentFactory.createInvoiceFromOrderHeader`
copies `etgoTotalDiscount` from the quotation header to the invoice header.
`CreateDraftInvoiceHandler.copyLineDiscountsFromOrder` copies the standard
`OrderLine.discount` per line into the invoice line's `EM_Etgo_Discount`
field (the UI reads that column to display the discount percentage and
to render the totals breakdown). When the header carries a total discount,
`applyTotalDiscountIfPresent` delegates to `TotalDiscountService.recalculate`
to materialize the `ETGO_DTO` discount line on the invoice (one per tax
group) and then updates the existing `InvoiceTax` rows in place plus the
header `summedLineAmount` / `grandTotalAmount` from a JDBC aggregate of
the current lines — updates are in place rather than delete-and-recreate
to bypass the standard `CInvoiceTaxEventHandler` and avoid Hibernate
cascade-re-save errors. Source `ETGO_DTO` lines on the quotation are
filtered out of the line list sent to `CreateInvoiceLinesFromProcess`
because the matching invoice discount line is rebuilt fresh from the
header percentage. The materialization is skipped with a warning when
the `ETGO_DTO` product is missing (environments where the discount
product migration has not been applied).

`QuotationConfirmModal` renders the quotation's `grandTotalAmount` and
`summedLineAmount` as-is — it never multiplies by `(1 − etgoTotalDiscount/100)`
the way the order/purchase-order confirm modals do in DR, because by the
time the user reaches this modal the quotation is already in `UE` (after
the DR→UE transition driven by `SendToEvaluationModal` ran
`TotalDiscountService.recalculate`), so the server totals already reflect
the discount. The earlier client-side factor double-applied it.

## Gap assessment

- The kebab (⋮) menu now exposes only the `Reject` action (visible when `documentStatus === 'UE'`). Both the previous `Duplicate` entry (redundant with the topbar `Clonar` button) and the previous `Cancel` placeholder (wired to an empty `onClick` and never functional) were removed.
- The detail page includes a draft-only confirmation modal that can create an order or draft invoice. Quotation-to-order remains the documented core conversion rule kept in decisions; the quotation-to-draft-invoice path is implemented in `CreateDraftInvoiceHandler` (com.etendoerp.go) by mirroring the sales-order branch — see "Invoice creation flow" above.
- `lineGrossAmount` updates instantly in the grid on every `orderedQuantity`, `listPrice`, or `discount` keystroke (client-side). Header totals (`summedLineAmount`, `grandTotalAmount`) only refresh after a line save — that timing gap is expected and not a bug.
- The decisions file keeps a rule that should default `validUntil` from `orderDate`, but the generated form only shows `orderDate` with an explicit default value. The intended validity-date default is therefore not clearly evidenced in the current UI layer.
- Related documents are clearly enabled for orders, but invoice lookup currently queries sales invoices by `salesOrder` using the quotation record id. That may work only if backend linkage matches this assumption; otherwise invoice visibility from the quotation tab is an open ambiguity.
- The line form exposes discount and tax fields, but the current evidence does not show whether price-list changes on the header force existing lines to recalculate. If users expect quotation-wide repricing after changing the header price list, that behavior is not clearly evidenced.

## Manual verification

1. Open `/sales-quotation` and confirm the list exposes quotation-focused columns and filters rather than a generic placeholder workspace.
2. Create a draft quotation and verify that selecting a business partner narrows the partner-address selector to that customer.
3. Set or change the price list, add a line, choose a product, and verify that Net List Price and tax are auto-filled from the price list. Confirm `lineGrossAmount` appears immediately (before save) using `qty × listPrice × (1 − discount/100) × taxFactor`.
4. Change quantity, Net List Price, and discount on a line and verify that `lineGrossAmount` refreshes instantly in the grid without a server round-trip. Verify that header totals (`Subtotal`, `Tax`, `Total`) update only after saving the line.
5. While the quotation remains in draft, confirm the top bar shows the quotation confirmation action and the send-document action.
6. Use the confirmation flow to create a downstream document, then verify whether the resulting order or invoice opens in the expected status and whether the quotation remains usable afterward.
7. Open Related Documents after downstream conversion and verify that order chips appear, invoice chips appear when applicable, and each chip navigates to the correct route.
8. Open the kebab (⋮) menu on a quotation in `UE` and confirm only the destructive `Reject` action is listed (regression: `Duplicate` and `Cancel` placeholders used to appear there). On other statuses the kebab is empty / closed.
8b. From a quotation in `UE`, click `⋮ → Reject`. Verify the modal opens with title "Rechazar presupuesto"/"Reject quotation", a description, and a search input labeled `Razón de rechazo`/`Rejection reason`. Type in the search to filter — the dropdown lists matching reasons. Pick one and confirm: the page reloads, the status pill switches to red `Cerrado - Rechazado`/`Closed - Rejected`, the kebab is empty, and Save/Confirm disappear from the topbar. All header fields render as read-only placeholders, and the principal section now includes a read-only `Razón de rechazo`/`Reject Reason` field showing the picked reason — confirming the user can see WHY the quotation was rejected without reopening the modal. Open a different quotation in `DR` or `UE` and confirm the same field is NOT rendered there (displayLogic gating). Repeat in the alternate locale to confirm i18n.
8c. Inline-create flow: open the reject modal, click `+ Crear razón`/`+ Create reason`. The sub-modal pre-fills the input with the current search text, lets the user edit, and disables the confirm button until the name is non-blank. On confirm, the new reason appears in the parent dropdown, is preselected, and the parent confirm button is now enabled. Cancelling the sub-modal closes only the sub-modal, leaving the reject modal open. Repeat in the alternate locale.
9. From the list view, select one or more quotations, run `Clone`, close the result modal and confirm the cloned drafts appear in the list without manually pressing `Refresh`.
10. On a draft quotation with a business partner already chosen, change `Payment Terms` to a different value than the BP default and save. Reopen the record and confirm the chosen value persisted (regression: it used to revert to the BP default).
11. Open the Send Email modal from the topbar and confirm: the business partner's email registered in `EM_Etgo_Email` is proposed as an editable `To` chip (when none is registered, the To list starts empty); the proposed chip can be removed; additional To recipients and CC recipients (via the `Add CC` affordance) can be added; entering a syntactically invalid email shows an inline validation error and disables Send; Send is also disabled while the final To list is empty (even with CC entries) or when more than 10 recipients are entered across To and CC; and the modal title reads the translated document name in the active UI language.
12. Open an existing draft quotation without touching any field and confirm the "Guardar" (Save Draft) button is **disabled**. Change any header field and confirm it becomes enabled. Save and confirm it disables again. Revert the changed field to its original value without saving and confirm the button disables once more. Add a line: once the add-row is submitted, the button should disable again if no header changes remain pending. Confirm the "Confirmar" button stays enabled throughout all these states.
13. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Validation & Error Handling — ETP-4005

### Inline line validation (min: 0 constraint)

Fields with a `min: 0` constraint — `orderedQuantity` and `discount` — now show a red border when the user types a negative value during inline edit. The row remains open and the save/confirm path for that row is blocked until the value is corrected or the edit is cancelled. The constraint is enforced client-side by `InlineLinesPanel` using the `min` metadata from the contract field definition.

See [Shared validation & UX changes — ETP-4005](app-shell-functional-flows.md#shared-validation--ux-changes--etp-4005) for behaviors common to all document windows (required field validation, single confirmation toast, callout message sanitization).

## Automated evidence

- App-shell route loading for generated/custom windows is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- Menu visibility for Sales Quotation is grounded in `tools/app-shell/src/menu.json`.
- Window registration is grounded in `tools/app-shell/src/windows/registry.js`, where `sales-quotation` resolves to a custom wrapper over the generated window.
- Header/line fields, selectors, actions, related-documents enablement, and retained callout/process expectations are grounded in `artifacts/sales-quotation/contract.json` and `artifacts/sales-quotation/decisions.json`.
- Detail-page composition, including related-documents tab, top-bar actions, summary fields, hidden print/delete behavior, and currently empty duplicate/cancel handlers, is grounded in `artifacts/sales-quotation/generated/web/sales-quotation/QuotationPage.jsx`.
- Draft-only confirmation and send-document behavior are grounded in `artifacts/sales-quotation/custom/QuotationTopbarActions.jsx` and `artifacts/sales-quotation/custom/QuotationConfirmModal.jsx`.
- The only quotation-specific automated test evidence currently observed is source-shape coverage for the top-bar actions component in `artifacts/sales-quotation/custom/__tests__/QuotationTopbarActions.test.js`; no browser-level automation was found for pricing reactions, conversion flow, or related-documents navigation.
- `artifacts/sales-quotation/generated/web/sales-quotation/LinesTable.jsx` — the `unitPrice` column (`PriceActual`) uses `type: 'amount'` so the net unit price renders as a formatted currency value rather than a raw number.
- `artifacts/sales-quotation/custom/QuotationTopbarActions.jsx` proves the Send Email modal is wired with `bPartnerId`, `apiBaseUrl`, and `windowName="sales-quotation"` so the recipient email is resolved from the contacts spec at open time and proposed as an editable `To` chip (removable, with additional To/CC recipients supported per ETP-4226 — edits reach the backend only through the allowlisted `recipientEdits` command field), `documentType` is translated via `useMenuLabel()`, and backend delivery routes to the `sales-quotation-send` transactional email contract.
- `tools/app-shell/src/hooks/__tests__/useEntity-dirty-state.test.js` verifies the `isDirtyHeader` computation (dirty when editing differs from selected, clean when they match, new-record initial state) and the `refreshHeaderTotals` selective merge (server-computed totals update while user-edited fields in `editing` are preserved using `userChangedKeysRef`).
- `tools/app-shell/src/components/contract-ui/__tests__/DetailView.dirtyState.test.js` guards the `isDirty` composite expression, the `additionalDirtyState` extension prop, and the save-button disabled conditions (new record always active, existing record gated by `!isDirty`, Confirm button never gated by dirty state).
- `artifacts/sales-quotation/__tests__/contract-integrity.test.js` locks the rejectReason surface change for the CJ-form display: it asserts `form: true`, `section: 'principal'`, an evaluable `displayLogic.js` that gates on `documentStatus === 'CJ'`, the read-only logic still covers CJ and CA, and `window.labelOverrides.C_Reject_Reason_ID` carries both Spanish and English translations.
- `e2e/tests/flows/sales-quotation-reject-reason-field.spec.js` is a Playwright spec that mocks the quotation header endpoint with two synthetic records (CJ and DR) and verifies that `field-rejectReason` is visible, disabled, and shows the reason `_identifier` on the rejected quote, is absent on the draft quote, and renders before the Lines tab in the DOM.
- **ETP-3908 — Confirm and send-to-evaluation modal total display fix**: `artifacts/sales-quotation/custom/QuotationConfirmModal.jsx` and `SendToEvaluationModal.jsx` both now apply `etgoTotalDiscount` (a `discountFactor = 1 − pct/100`) to `grandTotalAmount` and `summedLineAmount` before rendering them in the modal's blue summary card. Previously both modals showed the backend's raw totals without the custom UI-level discount, so quotations with an active order-level discount displayed the wrong amount in both confirmation flows.
- **ETP-4017 — AEAT-compliant rounding in `SendToEvaluationModal`**: the previous formula `grandTotalAmount × discountFactor` produced a 1-cent drift versus the quotation's right-panel total when the exact total fell on a half-cent boundary (e.g. 40.9464 → modal showed 40.95 while the panel and Etendo Classic showed 40.94). The modal now computes `totalLines = round2(net × factor)` and `grandTotal = totalLines + round2(tax × factor)` so the displayed total equals the sum of the visible Subtotal and Tax rows — the AEAT/Modelo 303 invoice rule. `QuotationConfirmModal.jsx` was left untouched because it already reads `grandTotalAmount` directly from the server (no client-side factor applied), which by then has been materialized by `TotalDiscountService` and matches the panel. Source-reading regex assertions in `artifacts/sales-quotation/custom/__tests__/SendToEvaluationModal.test.js` lock the new formula so the regression cannot be re-introduced.
- The generated `QuotationPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `C_Order` AD table.
- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.
- `tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx` and `useQuotationPdf.js` prove the lateral preview panel with PDF generation (including `validUntil` conditional row), `RelatedDocumentsCard` wiring (related sales orders via quotation FK), and `!isDraft` caching strategy.
- **ETP-4096 — Restore `rejectReason` to `readOnly`**: commit `c4907e08` (ETP-4070 mass regen, 2026-05-22) accidentally reverted `decisions.json → entities.header.fields.rejectReason.visibility` from `"readOnly"` back to `"editable"`, re-introducing the regression that ETP-4006 had fixed. ETP-4096 restores it to `"readOnly"`, regenerates the contract and frontend, and updates the contract-integrity test assertion to match.

- **ETP-4103 — Generator fix (labelOverrides deduplication)**: `const labelOverrides` in the generated page now references `api.labelOverrides` instead of re-embedding the full object. No functional change — field labels and selectors behave identically.

## Currency selector and quotation-to-order conversion — ETP-4027

### CurrencyRatePicker on quotations

`EntityForm.jsx` wires `CurrencyRatePicker` for the `C_Currency_ID` field when
`entity === 'quotation'` and `apiBaseUrl` matches `/sales-quotation`. The
condition is:

```js
f.column === 'C_Currency_ID' &&
(entity === 'header' || entity === 'quotation') &&
/\/(sales-order|purchase-order|sales-quotation)(\/|$)/.test(apiBaseUrl || '')
```

The component (`tools/app-shell/src/components/contract-ui/CurrencyRatePicker.jsx`)
replaces the standard `SelectorInput` and:

- Renders each option as `{isoCode} — {rate}` (e.g. `USD — 1.1523`), where
  `rate` is the conversion from the org currency to that currency for the
  quotation's `dateOrdered`.
- Fetches options lazily from
  `GET {apiBaseUrl}/quotation/{id}/action/currencyOptions`
  when the user opens the dropdown. The entity path `'quotation'` is passed via
  the `entityPath` prop, so the URL differs from the sales-order equivalent
  (`header/{id}/action/currencyOptions`).
- Also fires an eager fetch when `hasRecord` becomes `true` (i.e., after the
  quotation is first saved and a real `id` is available), so the rate is
  immediately visible in the trigger without requiring the user to open the
  dropdown.
- Shows a pencil icon (`data-testid="currency-rate-pencil"`) when `value &&
  hasRecord`. Clicking it enters inline-edit mode with a numeric input
  (`data-testid="currency-rate-input"`). Enter confirms and calls
  `onChange('eTGOCurrencyRate', rate, 'EM_ETGO_Currency_Rate')` to stage the
  overridden rate. Escape cancels without change.
- The displayed rate is the staged `eTGOCurrencyRate` value (if present in
  `formData`) or the rate returned by `currencyOptions` for the currently
  selected currency.
- The field `eTGOCurrencyRate` is declared in `decisions.json` as
  `form: false, grid: false` — it is invisible to the user; only
  `CurrencyRatePicker` manages it.

The `currencyOptions` endpoint is the same one used by sales-order —
implemented in `CurrencyOptionsHandler.java` (`com.etendoerp.go`). It filters
by client and org, returns only currencies that have an active exchange rate for
the document date, and always includes the org currency with `rate: 1.0`.

### Convertquotation — preserved prices

`SalesQuotationHeaderHandler.handle()` intercepts the `Convertquotation` action
before it reaches NEO's generic button handler and calls:

```java
Order newOrder = convertQuotationProcess.convertQuotationIntoSalesOrder(false, quotationId);
```

The `false` parameter is `recalculatePrices`. Standard Etendo passes `true`
(re-fetches prices from the active price list), which overwrites the amounts
agreed in the quotation. With `false`, `ConvertQuotationIntoOrder.java` copies
lines directly without touching `PriceActual` or `ListPrice`. Returning a
non-null `NeoResponse` from `handle()` short-circuits the default NEO handler,
so the overriding parameter is guaranteed to take effect.

The backend action response body is `{ "salesOrderId": "<id>" }`. The frontend
(`QuotationConfirmModal.jsx`) does not read `salesOrderId` from this response —
instead it fires a follow-up
`GET {baseNeoUrl}/sales-order/header?criteria=[{fieldName:'quotation',operator:'equals',value:quotationId}]`
to resolve the created order and display its document number and total in the
success state. If the order was auto-completed (`documentStatus === 'CO'`), the
modal issues a best-effort `POST DocAction { docAction: 'RE' }` to reactivate it
to Draft before surfacing the result.

`afterHandle()` copies `EM_ETGO_Currency_Rate` from the quotation header to the
new order header via JDBC:

```java
UPDATE c_order SET em_etgo_currency_rate = ?
WHERE c_order_id = (
  SELECT c_order_id FROM c_order
  WHERE quotation_id = ? AND issotrx = 'Y' AND em_etgo_currency_rate IS NULL
  ORDER BY created DESC LIMIT 1
)
```

This ensures that an exchange rate agreed during the quotation stage is
carried forward to the resulting sales order without the user having to
re-enter it.

### Currency change on quotations

The behavior is identical to Sales Order — see
`docs/generated-custom-windows/sales-order.md` under "Currency change handling
(ETP-4027 functional model)". Briefly:

- The `currency` field is always editable on quotations in `DR` or `UE` status.
- When the user picks a new currency in the dropdown, `DetailView.jsx` validates
  exchange-rate availability via `validate-exchange-rate` before applying the
  change. If no rate exists, the dropdown reverts to the previous value and
  shows a toast.
- A `useEffect` in `DetailView.jsx` keeps `activeCurrencyConversionRef`
  synchronized with the saved currency/date so that newly added lines have their
  prices converted automatically from the pricelist currency to the order
  currency.

### Automated evidence

- `e2e/tests/flows/sales-quotation-convert-prices.mocked.spec.js` — Playwright
  mocked spec: modal selection, POST to `Convertquotation`, total display in the
  blue summary card, and success state showing the new order's `documentNo`.
- `e2e/tests/flows/sales-order-currency-rate-picker.mocked.spec.js` — covers
  `CurrencyRatePicker` behavior (rate display in the trigger, pencil-edit flow,
  rate confirm/cancel, currency change with and without an available rate). This
  spec targets the sales-order entity but the component is shared; the quotation
  path (`entityPath='quotation'`) is wired identically.

## PSD2 dependency — `EM_Psd2_Generate_Bank_Payment`

`com.etendoerp.go` now depends on the **PSD2** module, which adds the
`EM_Psd2_Generate_Bank_Payment` ("Generate Bank Payment") column to the shared
core table this window sits on (`C_Order` / `C_Invoice` / `FIN_Payment`). Because
Schema Forge extracts from AD, that column surfaces in this window's contract as a
**system field** — present in the backend contract but **not** rendered in the
frontend (there is no `AD_Field` for it on this window). No UI or behavior change;
this note only records why the contract was regenerated when the PSD2 dependency
was added. Full rationale: [`docs/plans/psd2-dependency-cross-domain.md`](../plans/psd2-dependency-cross-domain.md).
