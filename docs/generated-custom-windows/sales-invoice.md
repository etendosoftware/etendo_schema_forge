# Sales Invoice

## Intent

This window should let a user issue and follow customer invoices as billing documents that sit between upstream commercial documents and downstream collection activity. From one place, the user should be able to review invoice content, confirm commercial totals, understand whether the invoice is unpaid, partially paid, overdue, or fully paid, and move to the order, shipment, quotation, or original invoice records that explain how this invoice exists.

The current evidence shows a sales-invoice-specific workspace rather than a plain generated form. It keeps the invoice header and line editing flow, then adds invoice-oriented preview, payment-state, related-document, totals, note, and shipment-import behaviors around it.

## What this window should allow

A user should be able to:
- browse sales invoices by document number, invoice date, business partner, status, and gross total;
- open an invoice from the list into a lateral preview, then move into full record editing when needed;
- create or update a draft invoice header with at least business partner, partner address, invoice date, payment method, and payment terms;
- add invoice lines with product, invoiced quantity, net unit price, discount, tax, and resulting amounts, or import eligible lines from completed shipments or completed (not fully invoiced) sales orders for the same customer;
- review subtotal, derived tax, and total amounts from the invoice itself;
- inspect installment-level payment-plan data and open payment details from the payment-status badge or preview;
- register or review downstream customer payment activity from the invoice payment modal when payment actions are available;
- clone an invoice and navigate to the new invoice record;
- open upstream or downstream related documents, especially the originating quotation or sales order, linked shipments, and, for credit-note scenarios, the original invoices from the same order;
- reactivate a completed invoice back to draft from the detail view kebab menu when the invoice status is `CO`;
- complete multiple draft invoices or reactivate multiple completed invoices at once from the list selection bar using the bulk action, labeled "Confirmar" (i18n key `confirmBulk`) for draft selections.

## Interaction model

- Route: `/sales-invoice` for the list and `/sales-invoice/:recordId` for record detail.
- Visibility: visible from the `Sales` menu group in `tools/app-shell/src/menu.json`; not hidden.
- Implementation type: custom window wrapper in `tools/app-shell/src/windows/custom/sales-invoice/index.jsx` over the generated `sales-invoice` list/detail page, with a shared invoice preview modal reused from the purchase-invoice flow.
- Window shape: master-child. The primary entity is the invoice `header`, with editable `lines` plus an additional `paymentPlan` child surface.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. FK fields in line rows (product, tax) use `InlineSearchCombo`: a text input with server-side search that lets the user filter by typing — for example, typing "IVA" filters all matching tax rates. The add-line button, related-documents panel, notes panel, and totals panel are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.
- List behavior: the custom list now uses the richer `InvoiceHeaderTable` custom component (previously the list view used the plain generated `HeaderTable`). The visible columns, in order, are: Invoice Date (no dot indicator), Document No., Due Date (4-state dot computed from the row's `outstandingAmount` and the maximum `dueDate` across all payment-plan installments — fetched in parallel via `paymentPlan?parentId=` and shown as "—" when no payment plan exists). The four states use the Etendo Figma tokens: **paid** (`outstandingAmount ≤ 0`, dot `green-600 #26A95F`) wins over any date-based state, **overdue** (dueDate before today and outstanding still pending, dot `red-500 #F53D6B` with the date text reinforced in `red-700 #D50B3E`), **soon** (dueDate within the next 7 days with outstanding pending, dot `yellow-600 #FAAF00`), and **ok** (anything further out, dot `gray-400 #8A8AA3`). Date-only invoice and due-date values are normalized as local calendar dates before rendering so same-day invoices do not shift backward because of timezone conversion, and the final rendered date follows the active app locale just like `Invoice Date`. Business Partner, Document Status (pure AD `DocStatus` value rendered as a native status badge — DR/CO/VO/CL — not a payment-derived status), Total Gross Amount, **Pending Payment** (the AD `OutstandingAmt` column relabeled via `window.labelOverrides` from "Total Outstanding" to "Pending Payment" / "Pendiente de pago" so the grid reads in payment terms rather than ledger terms), and **Delivery Status** (a percent progress bar driven by the virtual AD column `em_etgo_delivery_status` on `c_invoice` — calculated server-side from `m_matchinv` + `m_matchsi` quantity-weighted against `qtyinvoiced`; 0% when no matching exists yet, 100% when fully matched, intermediate when partial) complete the grid. When the fiscal profile enables a given target for the organisation, fiscal status badge columns are injected between Document Status and Total Gross Amount: an **SII Status** column when SII is active (reads `row.aeatsiiEstado`), a **TBAI Status** column when TBAI is active (reads `row.tbaiSyncEstado`, injected server-side by `TbaiSyncStatusInjector` in `SalesInvoiceHeaderHandler.afterHandle()`), and a **Verifactu Status** column when Verifactu is active (reads `row.etvfacInvoiceStatus` and normalises short codes AC/AE/ER/IN/PE via `normalizeVerifactuStatus()`). All three statuses come directly from the list API response without any secondary batch fetch — the `useInvoiceListFiscalStatus` hook was eliminated in ETP-4125 to fix HTTP 403 errors on large lists caused by nginx URL-length limits. The grid opens rows into a lateral preview modal instead of immediately navigating away, supports cloning from the grid, accepts `?DocStatus=<status>` as a column pre-filter, and accepts `?filter=overdue` as a quick filter for invoices with remaining outstanding amount.
- Detail behavior: the detail route keeps the generated invoice page, adds a custom top bar, custom bottom totals/documents panel, a `Related Documents` tab, a business-partner guard before adding lines, and invoice-specific extra actions such as shipment import and clone.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- A **SIF** tab (Suministro Inmediato de Facturación) is available in the detail tab strip when the organisation is configured for SII or Verifactu; a TBAI-only fiscal configuration has nothing for this tab to show (see below). The tab is declared in `decisions.json → window.extraTabs` and rendered by the shared `tools/app-shell/src/windows/custom/shared/SifTab.jsx` component. Inside the tab, a left rail lists the active targets (one button per target: SII, Verifactu); clicking a rail button shows the corresponding panel. The SII panel exposes Operation Date (editable on draft), Invoice Type selector, SII Description, Exemption Cause, Authorization checkbox, SII Year, and SII Period, with a status badge (pending / accepted / accepted with errors / rejected / error / cancelled / dropped / not registrable). The Verifactu panel shows Operation Date (shared with SII), Invoice Type selector, Operation Description, Simplified Invoice (Art. 72/73) and No Recipient ID (Art. 61.d) checkboxes (mutually exclusive by invoice type), and a Corrective Invoice Type selector, with a status badge (accepted / accepted with errors / invalid / rejected / pending / not sent). Fields that may be edited on draft are patched immediately on blur or on select-change via `PATCH /sws/neo/sales-invoice/header/{id}`. **ETP-4401:** the TBAI panel (Chain Sequence, Invoice Series, Invoice Sequence) was removed from this tab entirely, and the per-invoice TBAI fields (`tbaiIssent`, `tbaiSequence`, `tbaiInvoicenum`, `tbaiInvoiceseq`) now carry explicit `"visibility": "discarded"` overrides in `artifacts/sales-invoice/decisions.json` so they no longer reach the frontend contract at all — TBAI chaining sequences are now generated automatically per fiscal configuration by the `TbaiConfigSequenceHandler` NeoHandler instead of being tracked per invoice. **When neither SII nor Verifactu applies to the current invoice (e.g. a TBAI-only fiscal configuration), the SIF tab now disappears entirely from the detail tab strip** instead of rendering an empty placeholder: `SifTab.jsx` reports this via the `onVisibilityChange` callback that `tools/app-shell/src/components/contract-ui/DetailView.jsx` passes to every `placement: 'tab'` custom tab (mirroring the existing `onCountChange` pattern), and if the previously active tab is the one that hides, the view automatically redirects to the first remaining tab instead of leaving an orphaned blank pane. **ETP-4390 (later cleanup):** the panel previously also rendered five always-read-only fields — RF Generation Date, CSV, Hash, QR URL, and Issue Detail — sourced from `etvfacDateIssue`, `cdigoCSV`, `etvfacHash`, `etvfacQRURL`, and `etvfacIssueDescription`. None of these ever reached the frontend contract (the four `etvfac*` ones are caught by the `EM_*` discard pattern in `decisions.json`, and `cdigoCSV` actually belongs to the fully-excluded `siiData` entity, not Verifactu — the field was misreferenced), so the rows always rendered empty. They were removed from `SifTab.jsx` and the five fields now carry explicit `"visibility": "discarded"` overrides in `artifacts/sales-invoice/decisions.json` (four under `entities.header.fields`, `cdigoCSV` under `entities.siiData.fields`) so they stay excluded even if the AD-level column classification changes later. When no fiscal target is active for the org the tab body shows an empty-state message.

## Reactive behavior and dependencies

- Header-to-line relationship: the record works as one invoice header with editable child lines. The detail route explicitly prevents adding lines until a business partner is present, and the line editor is the place where description, quantity, price, discount, and tax values feed the invoice amounts.
- Dependent selectors: `partnerAddress` is a dependent selector filtered by `businessPartner`, so billing-location choices react to the selected customer. The line import flow also depends on the chosen business partner because shipment import is only offered when the invoice is draft and already tied to a customer.
- Pricing, tax, and total reactions: line amounts are computed client-side as `invoicedQuantity × listPrice × (1 − etgoDiscount/100) × taxFactor` (see `docs/line-pricing-model.md`). The editable fields are `listPrice` and `etgoDiscount`; `unitPrice` (PriceActual) is hidden and derived at save time. Changing the product resets `etgoDiscount` to 0 and triggers the `SL_Invoice_Product` callout which sets price, tax, and UOM. The `tax` field fires a callout only to obtain the tax rate for the client-side formula. The bottom panel (`InvoiceBottomPanel`) now delegates totals display to the generic `DocumentTotalsPanel`, which aggregates `Σ(qty × listPrice)` for gross subtotal, applies per-line discount to derive net subtotal, and derives tax as `total − net subtotal` — all client-side from the live lines array.
- Discount panel in sales invoice: the `InvoiceBottomPanel` bottom-right column hosts the `DocumentTotalsPanel`. The `etgoDiscount` column is always visible in the lines grid and the add-row — there is no toggle. "Subtotal sin descuento" and "Descuento por producto" rows auto-appear when `discountAmt > 0` (at least one line carries a non-zero discount); both are read-only computed rows. A `+ Añadir descuento total` button appears below the totals when no total discount is active and at least one line exists; clicking it opens an interactive "Descuento total" section (checkbox + computed amount + percentage input). Unchecking the checkbox collapses the section. On `onBlur`, `DetailView` fires `handleTotalDiscountChange(pct)` → `PATCH { etgoTotalDiscount: N }` → persists in `EM_Etgo_Total_Discount` on the `C_Invoice` header (best-effort, no reload). When the invoice is completed (`documentAction=CO`), `SalesInvoiceHeaderHandler` calls `TotalDiscountService.recalculate(headerId, isInvoice=true)` before the action reaches the CRUD layer: it deletes any existing `ETGO_DTO` discount lines, then creates one negative line per tax group (`GROUP BY c_tax_id`), proportional to each group's net subtotal — mirroring Classic `C_INVOICE_POST`. `InvoiceLineHandler` filters `ETGO_DTO` lines from all GET responses so they are never visible in the frontend. When the invoice is read-only (completed), `DocumentTotalsPanel` shows a static "Descuento total (X%) −Y€" row instead of the interactive panel.
- Line tax selector: the line `tax` field is now a dropdown selector (Radix Select) instead of a free-text search input. The list of available taxes is loaded server-side via `GET /sws/neo/sales-invoice/lines/selectors/C_Tax_ID` and is filtered by `IsSOTrx=Y` (sales taxes) and by the `VAL_Tax_IsSOTrx_Date` validation rule, which keeps only taxes whose `VALIDFROM` is on or before the invoice date (`COALESCE(@DateInvoiced@, @DateOrdered@)`). Previously this field rendered as a text search that always returned "Sin resultados" because the validation rule context was not populated.
- Defaulting: the header defaults `invoiceDate` to the current date and `documentStatus` to draft. New line quantity defaults to `1`, and several monetary fields default to `0`. Currency is editable on the header (see "Currency and exchange rate — ETP-4029" below); it is no longer read-only.
- Unified document/accounting date (ETP-4531, redefined 2026-07-17): `accountingDate` (`DateAcct`) is `visibility: system` — fully hidden from the UI, not present in `frontendContract.entities.header.fields` at all. `invoiceDate` is the single visible date field. Per classic AD metadata, `C_Invoice.DateInvoiced` carries `AD_Column.AD_Callout_ID = com.etendoerp.sif.general.callouts.SifInvoiceOperationDateCallout`, which extends `org.openbravo.erpCommon.ad_callouts.SE_Invoice_AccountingDate` and auto-fills `dateAcct` from `dateInvoiced`. This cascade is now intentionally allowed to flow through untouched — the earlier `SalesInvoiceHeaderHandler#afterCallout` guard that stripped it (ETP-4531's original, now-superseded scope; see `docs/feedback.md`) has been removed on the `com.etendoerp.go` side, so saving the invoice writes the same date to both `invoiceDate` and `accountingDate` internally, and the accounting facts generated on posting reflect that unified value as the journal entry's accounting date.
- Payment-plan reactions: the custom top bar fetches `paymentPlan` installments and classifies the invoice as paid, partial, overdue, or pending based on installment `paidAmount`, `outstandingAmount`, and `daysOverdue`. The badge label changes from total paid to outstanding balance depending on installment state, and clicking the badge is the entry point to the payment modal. Each installment card in the modal shows the installment label, scheduled amount, due date, and status badge (Paid / Partial / Pending). The installment-weight percentage — previously displayed next to the amount — was removed because it represented the installment's share of the invoice total, not the amount collected; users consistently misread it as a payment-completion indicator, and the modal header already surfaces the aggregated paid and outstanding totals.
- Payment-state and payment registration dependencies: the shared invoice payment modal fetches both installment schedules and recorded payments. For sales invoices, payment registration uses `registerPayment` and available `invoiceAccounts` actions under the invoice header, so the invoice view depends on those backend actions to turn an outstanding installment into an actual `payment-in` event.
- Two-step Cobros flow (ETP-4331/ETP-4342): clicking the payment-status badge opens the history popup **"Cobros de la factura"** (`InvoicePaymentHistoryModal.jsx`, the unified component shared between sales and purchase invoice). The popup shows: title + document-number badge header, a single stats row with three columns (Cliente · Importe total · Saldo pendiente), a table with columns Nº documento / Fecha / Método (pill with icon) / Estado (deposited green or draft grey badge) / Importe (right-aligned, green +), and a footer with the registered-count label and **"+ Añadir cobro"** pill button (visible only while `CO` with outstanding > 0). `InvoicePaymentModal.jsx` was removed — `InvoicePaymentHistoryModal.jsx` is now the single canonical component for both directions. Clicking **"+ Añadir cobro"** opens the **"Nuevo cobro"** modal (`NewPaymentEntryModal.jsx`, step 2): editable *Cantidad* (es-ES), *Fecha*, *Método de pago*, *Cuenta*; a conditional **"Saldo a favor y crédito disponible"** section (rendered only when the BP has consumable credit/abono sources); a real-time balance summary (`Total factura · Dinero [+ Saldo a favor] = Aplicado · Falta/Sobra/Diferencia [Igualar]`); and an excess band. As of ETP-4504 the excess band offers a single resolution — **Generar crédito a favor** (leave-credit) — and only when the invoice is in the organization currency; the former **"Dar vuelto"** / refund option was removed entirely. On a foreign-currency collection the only excess resolution is **Ajustar importe** (the *Igualar* action). ETP-4504 also adds two conditional conversion fields (**Tasa de conversión** + **Importe en moneda de la cuenta**) shown only when the invoice currency differs from the selected account currency. See "Multi-currency support in the Cobros/Pagos modal — ETP-4504" below for the full behavior. **Guardar** creates the payment in Borrador (draft, not processed); **Confirmar** processes it to Depositado. On save/confirm the modal returns to the history popup, which refreshes. The balance/cuadre logic lives in the testable hook `usePaymentBalance.js`. The *Fecha* field is required (ETP-4005): clearing it disables **Confirmar**, and saving with an empty date surfaces the `paymentDateRequired` error and a red border on the field.
- New backend actions on the invoice header (handled by `RegisterPaymentHandler` → `PaymentRegistrationService`): `invoicePaymentMethods` (list valid methods), `invoiceCreditSources` (list consumable credit/abono of the BP), `registerPayment` extended with `fin_paymentmethod_id` + `process: 'draft'|'confirm'` + `creditSources[]` + `overpaymentAction: 'leave-credit'` (the former `'refund'`/"Dar vuelto" value was retired in ETP-4504) + `conversionRate` (sent only on a foreign-currency payment; ETP-4504), and `confirmPayment` (process a saved draft). The legacy single-step `registerPayment` (4 base fields) still works for other callers. Each `invoicePayments` row also carries `appliedToInvoice` — the net amount that payment applies against THIS invoice's schedules (negative when the payment consumed it as a credit note).
- Credit notes / returns (NC / DEV, negative totals): the detail topbar badge mirrors the grid's "Pendiente de pago" cell — green **"Aplicada"** once the note is fully consumed, else a purple clickable **"Saldo a favor · remaining"** badge that opens the same history popup as the grid (previously it was a static non-clickable "Crédito aplicado · total" pill). Inside the popup, the pending widget relabels to **"Saldo a favor"** with the remaining balance, each row shows how much of the note that payment consumed (`− appliedToInvoice`, e.g. a €38.40 payment that drew €10 from the note reads "− 10,00 €"), and the **"+ Añadir cobro"** button is hidden (a note's balance is consumed from other payments, never paid into).
- **Capability-gated `posted` field/status pill (ETP-4520):** the header `posted` field (rendered as a `Posted`/`Not posted` status pill on the detail header and as a `Posted` boolean badge column in the grid) carries `"visibleWhenCapability": "showAccountingFields"` in `artifacts/sales-invoice/decisions.json`. This is resolved against `capabilities.showAccountingFields`, fetched once at role-selection via `GET /sws/neo/windowaccessmap` (NEO pseudo-spec bridge) and exposed through `useAuth().capabilities` (see `docs/generated-custom-windows/app-shell-functional-flows.md` and `App.jsx`'s `fetchWindowAccess`). The field backs the `AD_Role.EM_ETGO_Show_Acct_Fields` ("Show Accounting Fields") checkbox — Etendo Classic-only for this MVP, no GO-app UI to toggle it — and the server resolves it with an Administrator bypass. Unlike a plain readOnly/disabled field, a role without the capability never sees the column or the pill at all: `DataTable.jsx` filters the column out of `visibleColumns` and `DetailView.jsx` returns `null` for the status pill before it renders, both via the shared `isCapabilityVisible()` helper (`tools/app-shell/src/lib/capabilityVisibility.js`) fed by `useCapabilitiesSafe()`. Administrator sessions always see the field regardless of the checkbox.
- Fiscal submission dependency: the custom `Send to SIF` topbar action calls the legacy sales-invoice button endpoints `POST /sws/neo/sales-invoice/header/{id}/action/Em_aeatsii_send` (SII) and `POST /sws/neo/sales-invoice/header/{id}/action/Em_Tbai_Xmlgenerator` (TBAI). In Etendo GO these requests are intercepted by the sales-invoice header `NeoHandler`: SII is routed to the server-side SII action handler `org.openbravo.module.sii.process.MultiEnvioFactura`, while TBAI is routed to `com.smf.ticketbai.process.XMLConvertionFromInvoice`.
- Fiscal target matrix for invoices is spec-specific. For sales invoices, `sii` and `sii-navarra` send only to SII, `tbai` sends only to TBAI, `sii+tbai` sends to both SII and TBAI, and `verifactu` shows only Verifactu status because sending is automatic on completion.
- Upstream/downstream document dependencies: the related-documents tab resolves the linked quotation or sales order from `salesOrder`, and, for credit notes, fetches sibling/original invoices from that same order. Linked shipments/returns are NOT derived from `salesOrder` — a DEV (return) invoice's `salesOrder` (when set) still points at the original order, whose own shipments are outgoing deliveries, not the return. Instead, the panel reads `data.linkedShipments`, injected server-side by `SalesInvoiceHeaderHandler#enrichLinkedShipments` from each invoice line's own `goodsShipmentLine` (M_InOutLine_ID); each entry's `isReturn` (a boolean derived server-side from a `C_DocType.IsReturn` join, exposed alongside the raw `movementType`) decides whether the chip renders as a Goods Shipment (`/goods-shipment/{id}`) or a Return Material Receipt (`/return-material-receipt/{id}`). When present, `data.sourceInvoice` (from `#enrichSourceInvoice`, only set when the return line carries `Canceled_Inoutline_ID`) adds a further chip for the original invoice this return-invoice reverses. (ETP-4534 — previously the panel fetched shipments via `goods-shipment` filtered by `salesOrder`, which is server-side scoped to `documentType.return=false` and could never resolve a return, so return invoices showed a misleading "Envío" chip linking to the wrong document. A follow-up ETP-4534 fix then replaced the `movementType === 'C+'` discriminator with `isReturn`, since `M_InOut.MovementType` — per the DB trigger `M_INOUT_TRG_PROV.xml` — only ever takes `'C-'` for every sales-side movement, shipments and returns alike, or `'V+'` for purchase-side, and can never distinguish a return; `'C+'` never occurs, so the original discriminator was always false and every linked document fell through to the "Envío" chip.)
- Shipment import dependency: the import-from-shipment modal loads completed goods shipments, existing invoice lines, invoice header data, and selector pricing data in parallel. It only keeps shipments for the same business partner that are not fully invoiced, then lets the user select shipment lines and quantities to create invoice lines. The modal is now thin glue over the shared `ImportLinesModal` generic component (header search + expandable document rows + per-line quantity editing) — shipment-specific behavior (fetching, line enrichment, line POST body) is injected as callbacks. When a row is expanded, the secondary header label (e.g. the originating order reference) takes precedence over the row total so the user keeps the document context visible while reviewing lines. A sibling `ImportFromReturnShipmentModal.jsx` offers the same import flow from a completed Customer Return (`return-from-customer`), for `DEV`-subtype (return) invoices; it detects already-invoiced return lines via `mInoutlineId` and posts negative `invoicedQuantity` lines (return-invoice lines must be negative or Etendo rejects completion).
  - **Currency filter — ETP-4029:** both shipment-based modals (`ImportFromShipmentModal.jsx`, `ImportFromReturnShipmentModal.jsx`) only offer source documents whose currency matches the invoice's *current* header currency. Since `M_InOut` (shipments and returns) has no `C_Currency_ID` column, currency is resolved through the document's linked sales order; candidates whose linked order currency does not match the invoice currency are excluded, and candidates with no linked order are never excluded (nothing to compare against). The filter re-reads the invoice's current currency on every fetch, so switching the header currency and reopening the modal re-filters immediately. When every candidate is excluded solely by the currency mismatch (as opposed to there being no candidates at all), the modal shows a currency-specific empty-state message (`noShipmentsMatchCurrency` / `noReturnShipmentsMatchCurrency`) instead of the generic "no documents" message, via the shared `ImportLinesModal`'s `noCurrencyMatchMessageKey` prop and `excludedByCurrency` state.
- Order import dependency: a sibling import-from-sales-order flow is offered next to the shipment-import affordance whenever the invoice is draft and tied to a business partner. The modal loads completed sales orders (`documentStatus = 'CO'`) for that customer where `invoiceStatus < 100` (not yet fully invoiced), filters out order lines that have already been imported into this invoice (`cOrderlineId` match against existing invoice lines), and posts new invoice lines carrying `cOrderlineId` to preserve traceability back to the order. Discount carry-over: after a successful import, if every imported order shares the same non-zero `etgoTotalDiscount`, that single value is PATCHed onto the invoice header so the document-level discount migrates with the lines. Mixed-discount or zero-discount sets do not trigger the PATCH.
  - **Currency filter — ETP-4029:** `ImportFromOrderModal.jsx` fetches the invoice's own header (`GET sales-invoice/header/{id}`) alongside the candidate orders and keeps only orders whose `currency` matches the invoice's current currency (orders carry `currency` directly, no order lookup needed). Empty-state message when candidates exist but none match: `noSalesOrdersMatchCurrency`.
- Send Email recipient resolution: the Send Email modal (`SendDocumentModal`) pre-fills the `Para` field by fetching `GET /sws/neo/contacts/businessPartner/{businessPartner}` when the modal opens, reading `etgoEmail` (`C_BPartner.EM_Etgo_Email`) from the contacts spec. The field is left empty if no email is registered for the business partner. The modal title uses `useMenuLabel()` so it renders in the active UI language (e.g. "Factura de Venta" in Spanish instead of "Invoice").
- Preview behavior: list preview for sales invoices uses a shared invoice preview modal with `General`, `Messages`, and `History` tabs. The General tab is evidence-backed and includes payment-plan plus payment-history fetching; the embedded PDF preview now expands the billing contact location using the full location record when available (`address1`, `address2`, `postal code + city`, `region + country`) instead of relying only on the summarized address identifier string. Messages and History currently remain placeholder states. The preview shell is now `GenericPreviewModal` (replacing the old `InvoicePreviewModal`), orchestrated by `InvoicePreview` and `useInvoicePreview`. For completed invoices the PDF is auto-cached on first open via `POST /sws/neo/preview-file` and served from `ETGO_PREVIEW_FILE` on subsequent opens (`autoFetch=true`, `storeCondition=isCompleted`). Draft invoices always regenerate the PDF from jsreport and never write to the cache (`storeCondition=false`). The embedded PDF now includes conditional discount breakdown rows when applicable: a `Subtotal without discount` row and `Discount per product` row appear when at least one line carries a non-zero discount (`grossAmount > netAmount`); a `Total discount (X%)` row appears when `etgoTotalDiscount > 0` on the header. These rows render in a muted smaller style (`.row.discount`) and are hidden when no discounts exist — documents with flat pricing show the original 3-row totals (subtotal, tax, grand total) unchanged. The price column in the PDF is labeled `Precio tarifa` / `List Price` (shared i18n key `invoicePdfColUnitPrice`) to match the form view column label.
- Save button dirty-state tracking: the "Save Draft" button is disabled whenever there are no pending unsaved changes (`isDirty = false`). Four independent sources make `isDirty` true: (1) any header field value differs from the last-saved record; (2) an add-row form is open on the primary lines tab; (3) an add-row form is open on a secondary child tab; (4) a sidebar line edit is open. The "Confirm" button is never blocked by dirty state — completing an invoice is always allowed regardless of whether header changes are pending. New records always have Save active because backend defaults populate the form immediately on open. After a successful save, `selected` syncs to the server response and the button disables automatically. Reverting a changed field back to its original value also disables the button. When a line is added, `refreshHeaderTotals` updates server-computed totals (subtotal, grand total) in `editing` without overwriting fields the user explicitly changed, so pending header edits survive line operations.

## Discount model

Sales invoices support two independent discount mechanisms that interact with both the web interface and the generated PDF.

### Line discount (`etgoDiscount`)

Each invoice line carries an `etgoDiscount` field (stored as `EM_Etgo_Discount` on `C_InvoiceLine`) that represents the per-line discount percentage. The editable fields in the line editor are `listPrice` (P. UNITARIO — the gross list price before discount) and `etgoDiscount`. The `unitPrice` field (`PriceActual`, the net-of-discount price) is hidden from the UI and derived at save time. Client-side line amounts use `qty × listPrice × (1 − etgoDiscount/100) × taxFactor`.

In the generated PDF (`useInvoicePdf.js`), each line row reads `l.etgoDiscount` for the DESC.% column and `l.listPrice ?? l.unitPrice` for the P. UNITARIO column — `listPrice` is preferred so the column always shows the gross price before any discount is applied, falling back to `unitPrice` only when `listPrice` is absent. The TOTAL column uses `l.grossAmount ?? l.lineNetAmount`, where `grossAmount` is the server-computed amount including tax.

### Total discount (`etgoTotalDiscount`)

The header field `etgoTotalDiscount` (stored as `EM_Etgo_Total_Discount` on `C_Invoice`) holds a document-level discount percentage applied on top of line subtotals. In the UI this is managed by the interactive section in `DocumentTotalsPanel` (see the `Reactive behavior and dependencies` section above).

#### Draft invoices

`c_invoice.grandtotal` in the database does **not** include the total discount until the invoice is confirmed, because `TotalDiscountService` only runs at completion time. To keep the list view and side panel totals accurate on draft invoices, `SalesInvoiceHeaderHandler.afterHandle()` intercepts every GET response for draft records (`processed = false`) where `etgoTotalDiscount > 0` and applies the discount factor to `grandTotalAmount` and `outstandingAmount` in the response payload. The DB is not modified — only the API response is adjusted.

#### Confirmed invoices

When a draft invoice is confirmed (`documentAction = CO`), `SalesInvoiceHeaderHandler` calls `TotalDiscountService.recalculate(headerId, isInvoice=true)` before the action reaches the CRUD layer. The service deletes any existing `ETGO_DTO` discount lines and creates one negative line per tax group (`GROUP BY c_tax_id`), proportional to each group's net subtotal — mirroring Classic `C_INVOICE_POST`. Because these negative lines are physically in the DB, the `grandtotal` value is already correct for confirmed invoices and `afterHandle()` skips the adjustment. `InvoiceLineHandler` filters `ETGO_DTO` lines from all GET responses so they are never visible in the frontend.

## Invoice PDF preview

The PDF generated by `useInvoicePdf.js` (used inside `GenericPreviewModal` / `InvoicePreview`) renders the following totals breakdown when the invoice carries discounts:

| Row | Condition | Value |
|-----|-----------|-------|
| Subtotal sin descuento | always | `Σ(qty × listPrice)` per line |
| Descuento por producto −X | `discountAmt > 0` (at least one line has `etgoDiscount > 0`) | sum of per-line discount amounts |
| Descuento total Y% −Z | `etgoTotalDiscount > 0` | header-level discount applied to net subtotal |
| Subtotal | always | net subtotal after all discounts |
| IVA | always | derived tax amount (`adjustedGrandTotal − netAmount`) |
| Total | always | `adjustedGrandTotal` (API-provided for drafts; DB for confirmed) |

The "Subtotal sin descuento" and "Descuento por producto" rows auto-appear when `discountAmt > 0`; both are hidden when no line carries a discount. The "Descuento total" row appears only when `etgoTotalDiscount > 0`. The CSS class `.inv-totals .row.discount` styles discount rows (muted color, dash prefix on the amount).

i18n keys added: `invoicePdfSubtotalNoDiscount`, `invoicePdfProductDiscount`, `invoicePdfTotalDiscount` — present in both `en_US.json` and `es_ES.json`.

## Known issues / Open bugs

| ID | Severity | Window | Description | Status |
|----|----------|--------|-------------|--------|
| JB-03 | Media | sales-invoice | Confirmed invoice lines do not display the line discount percentage (`etgoDiscount`) in the web interface. Investigation needed on whether `DiscountLineFilter` (or a similar filter applied when `processed=true`) strips the `etgoDiscount` field from confirmed line GET responses. Draft invoice lines are unaffected. | Open — not fixed in ETP-4007 |

## Gap assessment

- The `DocumentTotalsPanel` inside `InvoiceBottomPanel` computes subtotal, discount, tax, and total client-side from the saved lines plus the live add-row (`pendingLine`) and sidebar editing state (`editingLine`), so totals update in real time as the user types — without waiting for a server save. The panel is the source of truth for displayed amounts; it does not read from server-side header fields.
- The payment-plan entity exposes backend actions such as `updatePaymentPlan` and APRM payment-plan modification processes, but the current user-facing evidence does not clearly show how or whether those actions are surfaced to users in this window. Installment visibility is proven; installment maintenance is still an open ambiguity.
- The related-documents flow for original invoices is explicitly conditional on the current document looking like a credit note. If users expect every sales invoice to expose upstream invoice relationships, that broader behavior is not supported by the current evidence.
- The preview modal includes `Messages` and `History` tabs, but the shared invoice-preview implementation renders them as empty states today. If invoice communication history or audit history is expected here, that is a current functional gap.
- Browser E2E coverage now exists for the preview modal lifecycle and file-persistence behavior (`e2e/tests/flows/invoice-preview-modal.spec.js`, `e2e/tests/flows/invoice-preview-persistence.spec.js`). Full end-to-end invoice management semantics (line editing, payment registration, fiscal submission) still rely on manual verification for live-session confidence.
- List-column drift between `decisions.json` and `InvoiceHeaderTable.jsx` is a known piece of technical debt. The `decisions.json` file declares `gridOrder` values for `documentStatus` (index 4) and other fields, but `InvoiceHeaderTable.jsx` has a hardcoded `columns` array that ultimately drives what the list view renders. The status column visible in the list is the custom `_status` column with coloured `StatusTag` pills, not the raw `documentStatus` field. Any change to the list columns must be applied in both `decisions.json` and `InvoiceHeaderTable.jsx` until the custom table is refactored to consume the contract directly.
- Header-date format reformatting for the tax selector context lives in a generic component, `tools/app-shell/src/components/contract-ui/DetailView.jsx`, which converts the ISO `YYYY-MM-DD` invoice date into the `DD-MM-YYYY` form that Etendo Classic's PL/pgSQL `to_date()` expects before sending it as `DateInvoiced` in the selector context. This is technical debt to keep in mind: any future change to date handling has to consider both formats, because sending the raw ISO date triggers HTTP 500 with "date/time field value out of range".

## Manual verification

1. Open `/sales-invoice` and confirm the list shows exactly Invoice Date (no dot), Document No., Due Date (4-state dot driven by date plus `outstandingAmount`), Business Partner, Document Status (AD status badge only — no payment-derived pills), Total Gross Amount, and Total Outstanding in that order. For Due Date confirm: "—" when no payment plan exists; green dot for invoices with `outstandingAmount ≤ 0` regardless of how their date sits relative to today (an overdue but fully-paid invoice must render green, never red); red dot plus red date text for past-due rows that still carry an outstanding balance; yellow dot for rows due within the next 7 days with outstanding balance; gray dot for everything else. Also confirm date-only values such as an immediate-payment invoice created today render on the same calendar day instead of shifting backward by one day.
2. Open `/sales-invoice?filter=overdue` and confirm the list starts in the overdue-only quick filter.
3. Click a row from the list and confirm a lateral invoice preview opens instead of immediately navigating to `/sales-invoice/:recordId`. In that preview, confirm `General` is data-backed while `Messages` and `History` remain placeholder states, and for invoices with a billing contact location the embedded PDF shows the full address in postal order: first line, second line, postal code plus city, then region plus country.
4. From the preview, choose **Edit** and confirm navigation to `/sales-invoice/:recordId`.
5. Start or reopen a draft invoice and confirm a business partner is required before adding lines, partner address reacts to the chosen customer, and the line area offers manual entry plus shipment import and sales-order import when a customer is already selected. For shipment import, expanding a row must keep the originating sales-order reference visible in the row header (it should not be replaced by the computed shipment total).
6. Add or modify at least one line and confirm the line grid shows product, description, invoiced quantity, net unit price (`listPrice`), % discount (`etgoDiscount`), tax, and line gross amount in that order. Confirm the line editor exposes those same fields in the sidebar, and that changing the product resets the discount to 0. Verify whether subtotal, tax, and total visibly refresh after saving; if they do not, record that as current behavior. Confirm the `Impuesto`/`Tax` field opens a dropdown listing the configured sales taxes (filtered by `IsSOTrx=Y` and validity against the invoice date), not a free-text search that returns "Sin resultados".
7. Open the payment-status badge on a completed invoice and confirm the modal reflects installment-level payment-plan context rather than only the header total. If possible, register a payment and confirm the invoice payment summary updates.
8. Open the `Payment Plan` child surface and confirm due date, expected date, amount, paid amount, outstanding amount, currency, last payment date, days overdue, and number of payments are present for invoices that have installment data.
9. Use clone from either the grid or the detail top bar and confirm the app navigates to the new sales-invoice record.
10. Open `Related Documents` on an invoice tied to a commercial chain and confirm the user can navigate to the originating quotation or sales order, related goods shipments, and, for credit notes, the original invoice records when present.
11. Open a completed sales invoice detail and confirm the kebab menu exposes a `Reactivate` action. Trigger it and verify the document returns to draft status and a `sonner` toast notification appears with the message `Document reactivated` / `Documento reactivado` (i18n key `reactivated`).
12. From the list, select multiple draft invoices and confirm the bulk action bar shows a `Confirmar (N)` button; then select multiple completed invoices and confirm the bulk-reactivate action is available. Verify each produces the expected status transition and a result toast.
13. Open the Send Email modal from the topbar and from the invoice preview and confirm: the business partner's email registered in `EM_Etgo_Email` is proposed as an editable `To` chip (when none is registered, the To list starts empty); the proposed chip can be removed; additional To recipients and CC recipients (via the `Add CC` affordance) can be added; entering a syntactically invalid email shows an inline validation error and disables Send; Send is also disabled while the final To list is empty (even with CC entries) or when more than 10 recipients are entered across To and CC; and the modal title reads the translated document name in the active UI language.
14. Open an existing draft invoice without touching any field and confirm the "Save Draft" button is **disabled**. Change any header field and confirm it becomes enabled. Save and confirm it disables again. Revert the changed field to its original value without saving and confirm the button disables once more. Add a line: once the add-row is submitted, the button should disable again if no header changes remain pending. Confirm the "Confirm" button stays enabled throughout all these states.
15. Under an org configured for `sii+tbai`, open a completed sales invoice and confirm `Enviar a SIF` still appears after a partial send until both targets are sent. The confirmation copy must indicate both targets, and the result modal must attempt both `Em_aeatsii_send` and `Em_Tbai_Xmlgenerator` independently.
16. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
17. On a draft invoice tied to a customer that has at least one completed (not fully invoiced) sales order, open `Import from Sales Order` and confirm: only that customer's completed-and-not-fully-invoiced orders appear; expanding an order lists its lines with already-imported lines marked and disabled; submitting creates invoice lines that reference the source order (`cOrderlineId`). If every imported order carried the same non-zero `etgoTotalDiscount`, confirm the invoice header now shows that same total discount; if the imported orders carry different discounts (or none), the header discount is left untouched.

## Validation & Error Handling — ETP-4005

See [Shared validation & UX changes — ETP-4005](app-shell-functional-flows.md#shared-validation--ux-changes--etp-4005) for the full list: inline line min-value enforcement, payment modal date validation, single confirmation toast, and callout message sanitization. `etgoDiscount` keeps its `min: 0, max: 100` range.

## Negative quantity/price and price-list label — ETP-4567

- `invoicedQuantity` and `listPrice` no longer declare `min: 0` in `decisions.json`. Both the add-line row and inline grid edit now accept negative values — needed for credit/return-style adjustments modeled as negative-quantity or negative-price lines (see the negative-`invoicedQuantity` return-invoice flow described above). `etgoDiscount` is unaffected and keeps its `min: 0, max: 100` range.
- The `listPrice` (AD `PriceList` column) label is now overridden to **"Precio"** in Spanish via `window.labelOverrides.es_ES.PriceList` in `decisions.json` (English label unchanged). Same declarative mechanism already used for `OutstandingAmt`, `EM_Etgo_Due_Date`, `em_etgo_delivery_status`, and `C_DocTypeTarget_ID` on this window.

## Automated evidence

- `tools/app-shell/src/menu.json` shows `sales-invoice` is visible in the `Sales` menu.
- `tools/app-shell/src/windows/registry.js` registers `sales-invoice` as a custom app-shell window override.
- `tools/app-shell/src/windows/custom/sales-invoice/index.jsx` proves the custom list/detail wrapper, overdue quick filter, lateral preview modal, clone-from-grid flow, related-documents tab wiring, add-line guard, detail route composition, and the bulk-action component mounted in the list selection bar.
- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-action component supporting both CO and RE based on selected row statuses; mounted with `labelKey="confirmBulk"` so the button renders as "Confirmar" / "Confirm". The `Reactivate` kebab menu action in the detail view is declared in `artifacts/sales-invoice/decisions.json` with `visibleWhenStatus: "CO"` and `documentAction: "RE"`.
- `tools/app-shell/src/windows/custom/sales-invoice/SalesInvoiceTopbar.jsx` proves clone-from-detail behavior and the use of the custom payment-status topbar component. The clone button is icon-only, styled as Secondary Outline, and delegates to the shared `CloneButton` component (`tools/app-shell/src/windows/custom/shared/CloneButton.jsx`).
- `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` and `tools/app-shell/src/windows/custom/shared/useInvoicePreview.js` prove that sales invoices use the shared invoice preview shell with a PDF preview, `General | Messages | History` tabs, payment-plan fetching, payment-history fetching, edit/send actions, and placeholder `Messages`/`History` states. `GenericPreviewModal` manages the left panel: for completed invoices it auto-caches the generated PDF on first open (`autoFetch=true`, `storeCondition=isCompleted`) and serves it from `ETGO_PREVIEW_FILE` on subsequent opens; for draft invoices it passes the live PDF viewer through without caching (`storeCondition=false`).
- `tools/app-shell/src/windows/custom/shared/useInvoicePdf.js`, `tools/app-shell/src/lib/locationAddress.js`, `tools/app-shell/src/windows/custom/shared/__tests__/useInvoicePdf.test.js`, and `tools/app-shell/src/lib/__tests__/locationAddress.test.js` prove that the embedded PDF expands the billing contact address from the full contact location record instead of rendering only the summarized location identifier string. The hook now computes discount breakdown fields (`grossAmount`, `discountPerProduct`, `etgoTotalDiscount`, `totalDiscountAmt`) from raw line data, passing `null` for each when no discount is present so the shared `documentPdf.js` template conditionally renders discount rows only when needed.
- `artifacts/sales-invoice/contract.json` proves the default-layout invoice contract, `relatedDocuments: true`, required header fields, dependent `partnerAddress`, default values, summary fields, line-level `SL_Invoice_Amt` callouts, and the presence of the `paymentPlan` child entity plus payment-plan action endpoints.
- **ETP-4520** — `artifacts/sales-invoice/decisions.json`, `artifacts/sales-invoice/contract.json`, and the generated `HeaderPage.jsx`/`HeaderTable.jsx` all carry `"visibleWhenCapability": "showAccountingFields"` on the `posted` field. `tools/app-shell/src/lib/capabilityVisibility.js`, `tools/app-shell/src/hooks/useCapabilitiesSafe.js`, `tools/app-shell/src/components/contract-ui/DataTable.jsx`, and `tools/app-shell/src/components/contract-ui/DetailView.jsx` prove the shared omit-not-disable gating mechanism, with source-reading coverage in `tools/app-shell/src/lib/__tests__/capabilityVisibility.test.js`, `tools/app-shell/src/hooks/__tests__/useCapabilitiesSafe.vitest.jsx`, `tools/app-shell/src/components/contract-ui/__tests__/DataTable.capabilityVisibility.vitest.jsx`, and `tools/app-shell/src/components/contract-ui/__tests__/DetailView.capabilityVisibility.vitest.jsx`.
- `artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx` proves the combined docs/notes/totals footer, derived tax display, and shipment-import affordances on draft invoices.
- `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx` proves installment-aware payment-status classification, the badge-to-payment-modal entry flow, the four-state badge derivation (paid / partial / overdue / pending), and the fallback badge path when no installment data is available. The badge click opens the shared `InvoicePaymentModal` (with `specName="sales-invoice"` and `onPaymentAdded={fetchInstallments}` so the badge refreshes after a payment is registered); the component no longer contains a local `PaymentRegisterForm` or `ViewPaymentsModal`.
- `tools/app-shell/src/windows/custom/shared/InvoicePaymentModal.jsx` proves the shared installment payment modal used across sales-invoice and purchase-invoice flows: per-installment card rendering with label, amount, due date, and status badge; payment history per installment; payment registration form with amount validation, date picker, financial account selection, and the generic `DateField` component (`tools/app-shell/src/components/ui/date-field.jsx`); authenticated API calls through `useApiFetch()` rather than token props; and payment-direction routing to `payment-in` for sales and `payment-out` for purchases.
- `artifacts/sales-invoice/custom/RelatedDocuments.jsx` proves related-document resolution for quotation or sales order, linked shipments/returns (read from `data.linkedShipments`, server-enriched from each invoice line's `goodsShipmentLine`, classified via the server-provided `isReturn` flag — not `movementType`), the `sourceInvoice` chip for return invoices, and original invoices for credit-note scenarios.
- `artifacts/sales-invoice/custom/ImportFromShipmentModal.jsx` proves shipment-based line import limited to completed, same-customer, not-fully-invoiced shipments. Implemented as a thin adapter that injects shipment-specific fetchers and `buildLineBody` into the shared `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx` component.
- `artifacts/sales-invoice/custom/ImportFromReturnShipmentModal.jsx` proves the customer-return import flow for `DEV`-subtype invoices: completed returns for the same business partner, already-invoiced-elsewhere exclusion, and negative-quantity line construction, built on the same `ImportLinesModal` generic. The invoice's own line field is `goodsShipmentLine` (C_InvoiceLine.M_InOutLine_ID, renamed from `mInoutlineId` in the backend contract — see `contract-changelog.json` 0.28.0→0.29.0); the source `return-from-customer/customerReturnLine` record (built on `C_OrderLine`) carries this same physical M_InOutLine link under its own field, `mInoutlineId` (C_OrderLine.M_InOutLine_ID) — the two entities' field names are unrelated to each other despite the naming overlap, and `buildLineBody` must read the return line's `mInoutlineId` to populate the new invoice line's `goodsShipmentLine`. (ETP-4534 — this file had not been updated after the sales-invoice `lines` contract rename, so new return-invoice lines never persisted their `goodsShipmentLine`, which silently broke the Related Documents panel and the already-invoiced-elsewhere exclusion for every return imported since.)
- `artifacts/sales-invoice/custom/ImportFromOrderModal.jsx` proves the sibling sales-order import flow built on the same `ImportLinesModal` generic: completed orders for the same business partner with `invoiceStatus < 100`, filtering of order lines already linked to invoice lines via `cOrderlineId`, and the header `etgoTotalDiscount` PATCH carry-over when every imported order shares a single non-zero discount.
- `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx` is the shared generic import modal (search input, document-row expand, per-line checkbox + quantity editing, optional price/amount columns) consumed by both invoice import flows and reusable from other windows. **ETP-4029:** extended with a `noCurrencyMatchMessageKey` prop and `excludedByCurrency` state so callers can show a currency-specific empty-state message when all documents were filtered out by the currency match rather than by the base query.
- `artifacts/sales-invoice/custom/__tests__/ImportFromShipmentModal.test.js` provides source-level coverage for shipment fetching, same-customer filtering, duplicate-line avoidance, shipment-line expansion, invoice-line POST creation, and (ETP-4029) currency-match filtering via the linked sales order.
- `artifacts/sales-invoice/custom/__tests__/ImportFromReturnShipmentModal.test.js` and `artifacts/sales-invoice/custom/__tests__/ImportFromOrderModal.test.js` (ETP-4029) provide source-level coverage for the same currency-match/exclusion logic in the return-shipment and sales-order import flows, respectively. `tools/app-shell/src/components/contract-ui/__tests__/ImportLinesModal.vitest.jsx` covers the shared `noCurrencyMatchMessageKey`/`excludedByCurrency` mechanism. `cli/test/etp4029-currency-filter-keys.test.js` is a dedicated i18n parity test asserting the 5 new currency-filter keys (`noSalesOrdersMatchCurrency`, `noPurchaseOrdersMatchCurrency`, `noShipmentsMatchCurrency`, `noReturnShipmentsMatchCurrency`, `noGoodsReceiptsMatchCurrency`) exist identically in both `en_US.json` and `es_ES.json`.
- `artifacts/sales-invoice/custom/__tests__/InvoiceHeaderTable.test.js`, `tools/app-shell/src/lib/__tests__/dateOnly.test.js`, and `tools/app-shell/src/lib/__tests__/invoiceDueDate.test.js` provide source-level and helper-level regression coverage for due-date calendar normalization, locale formatting, max-installment selection, and the paid/overdue/soon/ok state derivation that drives the dot color and the red-text reinforcement on overdue rows in the sales-invoice list.
- `artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js` provides source-level coverage for installment classification, badge derivation, draft-only send-button behavior, `InvoicePaymentModal` wiring (including `specName="sales-invoice"` and `onPaymentAdded={fetchInstallments}`), send modal auto-open after Confirm, and the absence of the installment-weight percentage.
- `artifacts/sales-invoice/custom/__tests__/PaymentPlanBlock.test.js` provides source-level coverage for the 2-installment guard, installment label, due-date rendering, paid/partial/pending classification, ascending sort, and the absence of the percentage display.
- `tools/app-shell/src/windows/custom/shared/__tests__/InvoicePaymentModal.test.js` provides source-level coverage for both exports (`InvoicePaymentModal` default, `PaymentRegisterForm` named), centralized authenticated fetching without token props, the `onPaymentAdded` optional callback, installment label, payment-plan and payment-history endpoints, status classification, payment routing by spec name, register-payment POST, amount validation, account-selection via `invoiceAccounts` action, and the absence of the installment-weight percentage.
- `tools/app-shell/src/windows/custom/sales-invoice/SalesInvoiceLinesTable.jsx` proves the custom lines table used by the detail route: it enriches each line row with `currency$_identifier` from `useCurrency()` when the API response omits it, so the `unitPrice` column renders a formatted amount with currency symbol (e.g. `23,00 €`) rather than the raw number. The component is passed as `DetailTable` from `index.jsx` so it overrides the generated `LinesTable`.
- `tools/app-shell/src/windows/custom/sales-invoice/__tests__/SalesInvoiceLinesTable.test.js` provides source-level coverage for the default export, `DataTable` usage, `type: 'amount'` on the `unitPrice` column, `useCurrency` import, `currency$_identifier` enrichment, and the enriched-data prop handoff.
- `artifacts/sales-invoice/custom/RelatedDocuments.jsx` uses `fetchByCriteria` (LIST query) for quotation resolution instead of `fetchById`, so the `DocSubTypeSO='ON'` WHERE clause is applied server-side. This prevents a Sales Order from being misclassified as a Quotation when both share the same `salesOrder` foreign-key on the invoice header.
- Shared automated evidence also exists for app-shell window registration and generic entity behavior: `tools/app-shell/src/windows/__tests__/registry.test.js`, `tools/app-shell/src/hooks/__tests__/useEntity-defaults.test.js`, and `tools/app-shell/src/hooks/__tests__/useEntity-pagination.test.js`.
- `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx` and `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` prove the Send Email modal is wired with `bPartnerId` and `apiBaseUrl` so the recipient email is resolved from the contacts spec at open time and proposed as an editable `To` chip (removable, with additional To/CC recipients supported per ETP-4226 — edits reach the backend only through the allowlisted `recipientEdits` command field), and `documentType` is translated via `useMenuLabel()`.
- `tools/app-shell/src/hooks/__tests__/useEntity-dirty-state.test.js` verifies the `isDirtyHeader` computation (dirty when editing differs from selected, clean when they match, new-record initial state) and the `refreshHeaderTotals` selective merge (server-computed totals update while user-edited fields in `editing` are preserved using `userChangedKeysRef`).
- `tools/app-shell/src/components/contract-ui/__tests__/DetailView.dirtyState.test.js` guards the `isDirty` composite expression, the `additionalDirtyState` extension prop, and the save-button disabled conditions (new record always active, existing record gated by `!isDirty`, Confirm button never gated by dirty state).
- `artifacts/sales-invoice/custom/ImportFromShipmentModal.jsx` — `listPrice` (Net List Price) is now extracted from the callout price response and included in the line POST payload when importing from shipments. Previously the field was absent, causing imported lines to show 0.00€ Net List Price. The fallback is `unitPrice` when no list price is returned by the callout.
- **ETP-3908 — `ImportLinesModal` generic endpoint**: `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx` no longer hardcodes `${base}/sales-invoice/lines` as the POST target. The endpoint is now a required `linesEndpoint` prop. Both `ImportFromShipmentModal` and `ImportFromOrderModal` pass `linesEndpoint="sales-invoice/lines"` explicitly, preserving existing behavior while enabling reuse from purchase-invoice and future windows.
- **ETP-3908 — `onRefresh` header reload**: `DetailView.jsx` — the `onRefresh` callback passed to `LinesEmptyState` and `DetailExtraActions` now calls both `hook.fetchChildren` (to show imported lines) and `hook.fetchById` (to reload the header) so `etgoTotalDiscount` applied by `afterImport` is immediately reflected in `DocumentTotalsPanel` after import.
- The generated `HeaderPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `C_Invoice` AD table.
- **ETP-3995 — SIF tab**: The generated `HeaderPage.jsx` now also includes `SifTab` in `customTabs` with `placement: 'tab'`, declared via `decisions.json → window.extraTabs`. The tab key is `sif`; the label is driven by `labelKey: 'sifDataTabs.sectionTitle'`. `tools/app-shell/src/windows/custom/shared/SifTab.jsx` implements the shared SIF tab component used by both sales-invoice and purchase-invoice. `tools/app-shell/src/windows/custom/shared/fiscalTargets.js` — pure function `getInvoiceFiscalTargets(specName, profile)` decides which panels are visible based on org fiscal config profile; for sales-invoice, SII is active on `sii` and `sii-navarra` profiles, TBAI on `tbai` and `sii+tbai`, and Verifactu on `verifactu`. `tools/app-shell/src/components/contract-ui/DetailView.jsx` — `TAB_ICONS` map extended with `'custom:sif': Shield` so the SIF tab strip button renders a shield icon. `artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx` — `SifDataTabs` import and `notesExtra={SifDataTabs}` prop removed; SIF data is now shown in the primary SIF tab instead. `tools/app-shell/src/windows/custom/sales-invoice/index.jsx` — `customTabs` prop removed from the `<HeaderPage>` call so the generated `customTabs` (including the SIF tab) is not overridden. Unit tests: `tools/app-shell/src/windows/custom/shared/__tests__/SifTab.vitest.jsx` (49 tests covering empty state, SII/TBAI/Verifactu panels, rail switching, PATCH on blur, status badges, and edge cases). Source-reading tests: `cli/test/generate-frontend-extra-tabs.test.js` (18 tests covering `decisions.json` declarations, generated import and customTabs entries, generator source patterns, and wrapper integrity). E2E: `e2e/tests/flows/sif-tab.mocked.spec.js` — mocked Playwright spec for both invoice windows verifying the SIF tab button appears in the detail tab strip.
- **ETP-3995 — Related Documents tab i18n**: The generated `HeaderPage.jsx` now uses `labelKey: 'relatedDocuments'` instead of the hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language.
- `e2e/tests/flows/invoice-preview-modal.spec.js` — 5 Playwright tests for `GenericPreviewModal` lifecycle in mock mode using a purchase invoice row: row click opens the modal, X button dismisses it, backdrop click dismisses it, tabs render and switching works, Edit navigates to the detail URL.
- `e2e/tests/flows/invoice-preview-persistence.spec.js` — 7 Playwright tests covering completed and draft sales invoice cases in mock mode: completed invoice fires `GET /sws/neo/preview-file` with `specName=sales-invoice`, draft invoice does NOT fire the GET (storeCondition=false).
- **ETP-4125 — Fiscal status inline in list (nginx URL-length fix)**: Eliminated the `useInvoiceListFiscalStatus` batch-fetch hook that was making large GET requests with many invoice IDs in the `inSet` query parameter, causing HTTP 403 errors on lists of 53+ invoices (nginx URL-length limit). SII (`aeatsiiEstado`) and Verifactu (`etvfacInvoiceStatus`) statuses now come from the list API response as inline fields. TBAI (`tbaiSyncEstado`) is injected server-side by `TbaiSyncStatusInjector.inject()` called from `SalesInvoiceHeaderHandler.afterHandle()` using a single `ROW_NUMBER() OVER (PARTITION BY c_invoice_id ORDER BY created DESC)` query (Oracle + PostgreSQL portable). `FiscalStatusBadge` was extended with BA and NR SII codes and the `vf_pending` Verifactu entry; `normalizeVerifactuStatus()` was exported to map raw Verifactu short codes (AC/AE/ER/IN/PE) to badge config keys. Normalized SII and TBAI i18n labels (CO→Aceptado, IN→Rechazado, etc.) were aligned across both locales. Fiscal status badges are sales-only for TBAI and Verifactu; purchase invoices only show an SII badge.
- **ETP-4391 — Fix `tbaiSyncEstado` never injected (`TbaiSyncStatusInjector` Hibernate misuse)**: Since ETP-4125, `TbaiSyncStatusInjector.fetchLatestByInvoice()` called `session.createNativeQuery(sql, Object[].class)`. In Hibernate 5.6 that two-argument overload is JPA-style and treats the `Class` argument as an *entity* to map results onto (`addEntity(alias, resultClass.getName())` under the hood) — `Object[]` is not a mapped entity, so every call threw a `MappingException`, silently swallowed by `inject()`'s generic `catch (Exception e)`. Net effect: `tbaiSyncEstado` was never added to ANY GET response (list or detail), for ANY invoice, regardless of real data in `tbai_syncinvoice` — the TicketBAI status column always fell back to "Pendiente" client-side, even for invoices actually sent and accepted. Fixed by switching to the single-argument `createNativeQuery(sql)` idiom already used by every other multi-column native query in `com.etendoerp.go.schemaforge`. Regression coverage added in `TbaiSyncStatusInjectorIntegrationTest` (DB-backed, exercises the real `tbai_syncinvoice` table via `OBBaseTest`) alongside the existing DB-free `TbaiSyncStatusInjectorTest`. This is unrelated to (and shipped alongside) the client-side fix in `useFiscalStatus.js` that refetches fiscal status after a successful "Enviar a SIF" send within the same session.
- **ETP-4007 — Discount display fixes in PDF and server-side totals**: `tools/app-shell/src/windows/custom/shared/useInvoicePdf.js` was corrected to read `l.etgoDiscount` (not `l.discount`) for the DESC.% column, `l.listPrice ?? l.unitPrice` for P. UNITARIO (list price before discount, not net price), and `l.grossAmount ?? l.lineNetAmount` for TOTAL (gross amount including tax). The tax amount in the totals section now uses `adjustedGrand − netAmount` instead of the previous `bruto × factor` formula. Discount breakdown rows ("Subtotal sin descuento", "Descuento por producto −X", "Descuento total Y% −Z") were added to the PDF totals section with conditional rendering and the `.inv-totals .row.discount` CSS style. `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/SalesInvoiceHeaderHandler.java` was extended with an `afterHandle()` implementation that adjusts `grandTotalAmount` and `outstandingAmount` in GET responses for **draft** invoices with `etgoTotalDiscount > 0`, so the list view and side panel show the discounted total before DB confirmation. Confirmed invoices (where `TotalDiscountService` already created negative ETGO_DTO lines at completion time) are left untouched.

## Currency and exchange rate on the header — ETP-4029

Sales invoices carry the same currency/exchange-rate editing model already shipped for sales orders and quotations in ETP-4027: the invoice header currency is user-editable, a per-invoice rate override can be set, and that rate is kept in sync with the accounting-facing exchange-rate record as the invoice evolves. This is a header/business-logic layer distinct from (and a prerequisite for) the **Exchange Rates** secondary tab and completion guard documented in the "ETP-4030" section below.

### Header currency field and `CurrencyRatePicker`

- `header.currency` in `artifacts/sales-invoice/decisions.json` is `visibility: "editable"`, `form: true`, `section: "principal"`, `readOnlyLogic: "@Processed@='Y'"` — editable while the invoice is draft, locked once completed. Previously it was `readOnly`/hidden in the `summary` section.
- A new hidden field, `eTGOCurrencyRate` (`visibility: "editable"`, `form: false`, `grid: false`), stores the per-invoice exchange-rate override (`C_INVOICE.EM_ETGO_Currency_Rate`, `NUMERIC(20,12)`, nullable — same column shape as `C_ORDER.EM_ETGO_Currency_Rate` from ETP-4027). It is writable by NEO but not rendered as its own form field; `CurrencyRatePicker` reads/writes it as part of the currency selection.
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx` renders the `CurrencyRatePicker` component (searchable currency selector with an inline rate editor, shared with sales-order/purchase-order/sales-quotation) instead of the plain `SelectorInput` whenever the field's column is `C_Currency_ID`, the entity is `header`, and the current URL matches `/(sales-order|purchase-order|sales-quotation|sales-invoice|purchase-invoice)(\/|$)/`. Selecting a currency calls the `currencyOptions` header action to list currencies reachable from the org currency (with their rates) and PATCHes `currency`, `currency$_identifier`, and `eTGOCurrencyRate` together.
- `lines.cCurrencyId` remains `visibility: "system"` on sales-invoice — unlike orders, invoice lines (`C_InvoiceLine`) have no `C_Currency_ID` column at all, so there is no line-level currency to sync; the field in the contract is a derived/context value, not a real column.

### Backend wiring

- `CurrencyOptionsHandler` (`@Named("currencyOptionsHandler")`) resolves the org/client/date context needed to list currency options. For invoice specs (`context.getSpecName()` containing `"invoice"`) it loads via `Invoice.class` and uses `getInvoiceDate()`; for order specs it uses `Order.class` and `getOrderDate()` as before. `SalesInvoiceHeaderHandler` `@Inject`s `CurrencyOptionsHandler` and passes it into `NeoHeaderActionRouter.dispatch(...)`, exposing `GET /sws/neo/sales-invoice/header/{id}/action/currencyOptions`.
- `SalesInvoiceHeaderHandler` now implements `afterCallout()` (previously absent), calling `blockCalloutCurrencyUpdate` (strips any callout-pushed `currency` value so currency only ever changes by direct user selection) and `checkExchangeRateWarning` (appends a `WARNING` message when the user changes currency to one with no `C_Conversion_Rate` on the invoice date) — both implemented once on the shared `AbstractInvoiceHeaderHandler` base and called explicitly from the subclass, mirroring the order-side handlers from ETP-4027.
- `SalesInvoiceHeaderHandler.afterHandle()` calls `AbstractInvoiceHeaderHandler.autoCreateOrUpdateConversionRateDocument(context)` unconditionally as its first line, on every successful header POST/PATCH/PUT — not gated to GET, and not gated to requests that touch `currency`/`eTGOCurrencyRate`. It upserts the `C_Conversion_Rate_Document` row for the invoice whenever the invoice currency differs from the org currency and an `eTGOCurrencyRate` override is set, recomputing `foreign_amount = grandTotalAmount × (1 / eTGOCurrencyRate)` each time. This keeps the exchange-rate record in sync as the invoice's total changes while lines are added or edited, including for invoices that had zero lines when the currency was first selected. `InvoiceLineHandler.afterHandle()` calls the same upsert (via its `String`-based overload, resolving the parent invoice ID from the line save) on every line POST/PATCH/PUT, so the rate document also stays current as lines are added one at a time rather than only on header save.

### Rate inheritance when an invoice is created from an order

`InvoiceFromOrderSupport.propagateOrderRateToInvoice(order, invoice)` — already responsible for creating the initial `C_Conversion_Rate_Document` row when an invoice is generated from a source order that has `EM_ETGO_Currency_Rate` set — now also copies the rate onto the invoice's own column: `invoice.setETGOCurrencyRate(rate)`. This method is shared by both the sales path (invoked when creating a draft invoice from a quotation or sales order) and the purchase path (invoked when creating a purchase invoice from a purchase order), so both `currency`, `priceList`, and `eTGOCurrencyRate` are inherited together whenever an invoice is generated from an order or quotation.

Live-verified (see `docs/plans/ETP-4029-currency-invoice.md` §7.4): creating a draft invoice from a completed USD sales order (rate 1.16, price list "Lista de venta (sin impuestos)") produced an invoice with matching `currency`, `priceList`, and `eTGOCurrencyRate`, plus a `C_Conversion_Rate_Document` row with the correct doc→org rate and foreign amount.

**Known gap (not yet fixed):** when a purchase invoice is created from a goods receipt that is itself linked to a purchase order (`CreatePurchaseInvoiceHandler.createFromReceipt()`), currency and price list are inherited from the linked order, but `propagateOrderRateToInvoice` is not called on that path — so the exchange rate and `C_Conversion_Rate_Document` row are not inherited for receipt-originated purchase invoices, unlike invoices created directly from the order. See `purchase-invoice.md` for the purchase-side detail.

### Dual-currency display in the preview modal

`tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` now computes a document-vs-org-currency comparison via `useDocumentCurrency()` and `useCurrencyPrecision()`, mirroring `OrderPreview.jsx`. When the invoice currency differs from the org currency, it prefers the invoice's own `eTGOCurrencyRate` (used directly as the org→doc multiplier) over the system `C_Conversion_Rate`, and passes `orgCurrencyCode`/`exchangeRate`/`orgGrandTotal` into the shared `SummaryCard` component, which renders the document total together with the parenthesized rate and the equivalent organization-currency total (e.g. a USD invoice under a EUR org shows the USD total plus "(1.16) €<org-equivalent>").

### Manual verification

1. Open a new sales invoice and confirm the currency field renders as the searchable `CurrencyRatePicker` (not a plain dropdown), listing currencies reachable from the org currency with their rates.
2. Select a non-org currency with a defined `C_Conversion_Rate`: confirm no warning appears and the field commits normally.
3. Select a non-org currency with no defined rate: confirm a warning message appears (the field is not reverted here — compare with the stricter order-side behavior in ETP-4027 if validating both windows in the same session).
4. Save the invoice, add a line, and confirm the invoice's Exchange Rates tab (ETP-4030 section below) reflects an updated `foreignAmount` as the grand total changes — without needing to touch the exchange-rate row directly.
5. Create a draft invoice from a completed sales order or quotation that has a non-org currency and a set exchange rate; confirm the new invoice inherits currency, price list, and the same rate, and that a `C_Conversion_Rate_Document` row exists for it.
6. Open the list/preview of a non-org-currency invoice and confirm the preview modal shows both the document-currency total and the organization-currency equivalent with the rate in parentheses.

### Automated evidence

- `artifacts/sales-invoice/decisions.json` — `header.currency` (editable/principal/`readOnlyLogic`) and `eTGOCurrencyRate` (editable, hidden) field declarations.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/CurrencyOptionsHandler.java` — branches on `context.getSpecName()` to resolve via `Invoice.class`/`getInvoiceDate()` for invoice specs vs `Order.class`/`getOrderDate()` for orders.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractInvoiceHeaderHandler.java` — shared `blockCalloutCurrencyUpdate`, `checkExchangeRateWarning`, and `autoCreateOrUpdateConversionRateDocument` (both the `NeoContext` and `String` overloads) methods, called explicitly from each invoice header subclass.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/SalesInvoiceHeaderHandler.java` — injects `CurrencyOptionsHandler` into `NeoHeaderActionRouter.dispatch(...)`; `afterCallout()` calls `blockCalloutCurrencyUpdate`/`checkExchangeRateWarning`; `afterHandle()` calls `autoCreateOrUpdateConversionRateDocument(context)` unconditionally before its existing GET-only enrichment logic.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InvoiceLineHandler.java` — calls the `String`-based `autoCreateOrUpdateConversionRateDocument` overload from `afterHandle()` on every line save.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InvoiceFromOrderSupport.java` — `propagateOrderRateToInvoice()` sets `invoice.setETGOCurrencyRate(rate)` in addition to creating the `C_Conversion_Rate_Document` row; shared by both `CreateDraftInvoiceHandler` (sales) and `CreatePurchaseInvoiceHandler` (purchase).
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx` — `isCurrencyRateSelectorField()` includes `sales-invoice|purchase-invoice` in its URL match regex.
- `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` — dual-currency computation via `useDocumentCurrency`/`useCurrencyPrecision`, feeding the shared `SummaryCard` component; covered by `InvoicePreview.vitest.jsx` (`describe('dual-currency via useDocumentCurrency (ETP-4029)')`).
- `docs/plans/ETP-4029-currency-invoice.md` records the full implementation trace, including the Phase 7 gap analysis (field-order fix needed only on purchase-invoice, BP-linked price-list fallback already working via the classic `SE_Invoice_BPartner` callout, and the receipt-path rate-inheritance gap noted above).

## Exchange rates and completion currency guard — ETP-4030

When a sales invoice is issued in a currency other than the organization's base currency, it needs a conversion rate so the document can be valued in the base currency. ETP-4030 adds an **Exchange Rates** secondary tab to enter/maintain that document-level rate, recomputes the rate ⇄ foreign-amount pair server-side, and blocks completion when no usable rate exists. The behavior is identical to the purchase-invoice flow — see `purchase-invoice.md` for the shared handler/validator detail; only the spec name and header handler differ.

### Exchange Rates secondary tab

- Declared in `artifacts/sales-invoice/decisions.json → window.secondaryTabs.exchangeRates` (`label: "Exchange Rates"`, `tabOrder: 50`) and resolved as the `exchangeRates` child entity (`javaQualifier: "invoiceExchangeRateHandler"`), mapping to the document conversion-rate records (`C_Conversion_Rate_Doc`) tied to the invoice header.
- **Visible columns:** Currency (derived from the document, `form: false`), To Currency, Rate, and Foreign Amount. The inline add-row exposes `addLineFields: ["toCurrency", "rate", "foreignAmount"]`.
- **`requireSavedRecord: true`** — usable only after the invoice header is saved.
- **`readOnlyLogic: "@DocumentStatus@!='DR'"`** — editable only while the invoice is in Draft (`DR`); read-only once completed.

### Server-side rate ⇄ foreign-amount recompute

The `invoiceExchangeRateHandler` (`modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InvoiceExchangeRateHandler.java`) keeps both sides consistent against the invoice grand total:

- **On create (POST):** defaults `currency`/`toCurrency`, then computes the missing side from the grand total.
- **On edit (PATCH/PUT):** the inline editor submits **both** values, so the handler uses change-detection against the persisted record — rate changed → `foreignAmount = grandTotal × rate`; foreignAmount changed → `rate = foreignAmount ÷ grandTotal`; otherwise no-op.

### Frontend live refresh

`tools/app-shell/src/components/contract-ui/DetailView.jsx` unwraps the NEO `{ response: { data: [ … ] } }` envelope (`updated?.response?.data?.[0]`) on secondary-tab save and merges the server values back into the row and grid, so the recomputed amount appears immediately without reopening the invoice.

### Completion currency guard

`InvoiceExchangeRateValidator.checkRateForCompletion(invoice)` runs as a pre-hook from `SalesInvoiceHeaderHandler` and blocks completion when the document currency differs from the organization's base currency **and** neither a document-level rate (`C_Conversion_Rate_Doc`) nor a general rate (the `conversion-rates` window / AD `C_Conversion_Rate`) exists for the pair on the invoice date. The block surfaces `SMFCR_NoRateOnComplete` followed by the currency pair (e.g. `USD → EUR`). See `conversion-rates.md` for the general-rate catalog.

### Manual verification

1. Open a draft sales invoice in a foreign currency and save it. Confirm the **Exchange Rates** tab appears (disabled/absent until the header is saved).
2. Add a row: set To Currency and type a Rate. Save and confirm Foreign Amount = grand total × rate, shown live.
3. Edit Foreign Amount. Save and confirm Rate = foreign amount ÷ grand total, live.
4. Complete with no rate present and no general rate: confirm the block `SMFCR_NoRateOnComplete <FROM> → <TO>`.
5. Add the rate and confirm completion succeeds; on a completed invoice confirm the tab is read-only.

### Automated evidence

- `artifacts/sales-invoice/decisions.json` declares `window.secondaryTabs.exchangeRates` and the `exchangeRates` entity (`javaQualifier: "invoiceExchangeRateHandler"`).
- `artifacts/sales-invoice/contract.json` resolves the `exchangeRates` secondary entity and its currency/toCurrency/rate/foreignAmount fields.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InvoiceExchangeRateHandler.java` (POST default/compute + PATCH change-detection) and `InvoiceExchangeRateValidator.java` (`checkRateForCompletion`, consumed by `SalesInvoiceHeaderHandler`), with source-level coverage in `modules/com.etendoerp.go/src-test/.../InvoiceExchangeRateHandlerTest.java` and `InvoiceExchangeRateValidatorTest.java`.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` unwraps the NEO `{response:{data:[…]}}` envelope on secondary-tab save for live refresh.

## Generator fix (labelOverrides deduplication) — ETP-4103

`const labelOverrides` in the generated page now references `api.labelOverrides` instead of re-embedding the full object. No functional change — field labels and selectors behave identically.

## PSD2 dependency — `EM_Psd2_Generate_Bank_Payment`

`com.etendoerp.go` now depends on the **PSD2** module, which adds the
`EM_Psd2_Generate_Bank_Payment` ("Generate Bank Payment") column to the shared
core table this window sits on (`C_Order` / `C_Invoice` / `FIN_Payment`). Because
Schema Forge extracts from AD, that column surfaces in this window's contract as a
**system field** — present in the backend contract but **not** rendered in the
frontend (there is no `AD_Field` for it on this window). No UI or behavior change;
this note only records why the contract was regenerated when the PSD2 dependency
was added. Full rationale: [`docs/plans/psd2-dependency-cross-domain.md`](../plans/psd2-dependency-cross-domain.md).

## TBAI status staleness fix in invoice preview — ETP-4391

**Symptom:** after sending a completed invoice to TicketBAI via **Enviar a SIF**, the
"Estado TicketBAI" row shown in the invoice preview modal's **General** tab (i18n key
`invoicePreview.fiscalStatus.tbai`) never left "Pendiente", even though the send itself
succeeded.

**Root cause — confirmed, not a backend/persistence bug.** Direct DB inspection during
investigation confirmed `com.smf.ticketbai`'s send flow (`XMLConvertionFromInvoice` →
`SynchronizeUtils`) reliably writes `C_Invoice.EM_Tbai_Issent = 'Y'` and creates a
matching `tbai_syncinvoice` row for every invoice successfully sent through Etendo GO —
including through the NEO Headless path — and `TbaiSyncStatusInjector` (which powers the
**list** column's `tbaiSyncEstado` field) reads that data correctly on every header GET.
The bug was isolated to a *second*, independent status source: `useFiscalStatus.js`
(`tools/app-shell/src/windows/custom/shared/useFiscalStatus.js`), which the invoice
**preview modal's General tab** uses to query the `sii-monitor` / `tbai-facturas-enviadas`
/ `monitor-verifactu` specs directly by invoice ID (a mechanism separate from the list's
`tbaiSyncEstado` injection). Its data-fetching `useEffect` was keyed only by
`[invoiceId, specName, profile, apiBaseUrl, apiFetch, orgId]` — none of which change when
the user sends the invoice from within the same open preview modal, so the hook never
re-ran its fetch after a successful send. The pill kept showing its pre-send snapshot
(`tbai: null` → "Pendiente" fallback) for the rest of that preview session, regardless of
how many times the user re-sent or re-checked without closing and reopening the modal.

**Fix:** `useFiscalStatus` now also listens for the same `${specName}:invoice-updated`
window event that `useInvoicePreview.js`'s `refetchInvoice()` already dispatches after a
successful SIF send (the identical event `SalesInvoiceTopbar.jsx` /
`PurchaseInvoiceTopbar.jsx` already consume via the shared `useInvoiceUpdatedListener`
hook — no second event mechanism was introduced), via a `refreshTick` state bumped by
`useInvoiceUpdatedListener(specName, invoiceId, ...)` and added to the fetch effect's
dependency array. A successful send now triggers a real re-fetch of all three fiscal
statuses (SII, TBAI, Verifactu) inside the same open preview modal.

**Scope:** shared hook fix — applies identically to both `sales-invoice` and
`purchase-invoice` (both consume `useFiscalStatus` through the same `InvoicePreview.jsx`).
The list column's `tbaiSyncEstado` (server-injected, `TbaiSyncStatusInjector`) was not
affected and required no change.

Regression coverage:
`tools/app-shell/src/windows/custom/shared/__tests__/useFiscalStatus.vitest.jsx`.

## Accounting dimension visibility per section — ETP-4529

Per-entity, per-section visibility for the four accounting dimensions (Contacto/`businessPartner`,
Producto/`product`, Proyecto/`project`, Centro de costo/`costcenter`) now follows the ETP-4529
matrix:

| Field | Header | Lines |
| --- | --- | --- |
| `businessPartner` | **Siempre** — `displayLogic: null` override, always shown regardless of the client's accounting-dimension configuration | **Nunca** — discarded |
| `product` | *(no such field on the header)* | **Siempre** — no dimension gating (raw AD display logic is an unrelated `@Financial_Invoice_Line@` rule, already bypassed) |
| `project` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` passthrough (`section: "other"`) | **Por config** — same passthrough |
| `costcenter` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` passthrough (`section: "other"`) | **Por config** — same passthrough |

"Por config" means the field's visibility is resolved server-side at runtime via
`POST /sws/neo/sales-invoice/{entity}/evaluate-display`, which expands
`@ACCT_DIMENSION_DISPLAY@` through `DimensionDisplayUtility.computeAccountingDimensionDisplayLogic()`
against the client's `AD_Client` per-dimension configuration (`Project_Acctdim_Header`, etc.).

### Runtime evaluator — fixed (ETP-4529 follow-up)

Three bugs made this mechanism a near-total no-op at runtime, found and fixed in this
same ticket (generic fixes — they apply to every window, not only the ones in the
ETP-4529 matrix):

1. **`EntityForm.jsx`'s visibility filter never actually consulted the evaluate-display
   result.** `generate-frontend.js` emits non-evaluable ("Por config") fields with
   `visible: null, visibilitySource: 'server', displayLogicReason: '...'` — but **no**
   `displayLogic` property. `EntityForm.jsx`'s filter read `!f.displayLogic` as "this field
   has a static visibility decision, never override it" — true for every server-macro
   field, since none of them ever carry a `displayLogic` property. The filter's OR-chain
   short-circuited before ever reaching the real `visibility[key] !== false` check, so
   **no field was ever hidden by evaluate-display, on any window, ever** — this was the
   root cause, more fundamental than the two gaps below. Fixed: the filter now also checks
   `f.visibilitySource === 'server'` before falling back to "always visible".
2. **The `principal` form section hardcoded `visibility: {}`** in `DetailView.jsx`'s `Form`
   call (~line 3609), discarding whatever `useDisplayLogic` actually resolved. Fixed: it
   now passes the real `displayLogic` object through, same as the `other`/`collapsed`
   sections.
3. **No `useDisplayLogic` call existed for the lines/detail entity at all.** Added a second
   hook call, `lineDisplayLogic = useDisplayLogic(detailEntity, hook.editing, ...)`, and
   wired its `visibility` map into the `DetailForm` (generated `LinesForm.jsx`) call as
   `displayLogic={{ readOnly: {}, visibility: lineDisplayLogic.visibility }}` (`readOnly`
   stays `{}` there deliberately — each line field's own `readOnlyLogic` already handles
   per-row read-only state against the correct record; only `visibility` needed a source).
   Dimension-macro visibility doesn't depend on which specific line record is open, so one
   evaluate-display call (scoped to the lines entity, using the header record as a
   representative context) correctly covers every row.

### Non-grid line fields under inlineEditable — resolved (ETP-4543)

Filed while implementing ETP-4529 and explicitly left out of scope for it (Jira ETP-4543 /
GitHub `etendosoftware/etendo_schema_forge#895`, "Non-grid line fields invisible under
inlineEditable line layout"): this window uses `window.linesLayout = "inlineEditable"`. For
inlineEditable windows, `DetailForm`/`LinesForm.jsx` is never rendered at all
(`shouldShowDetailFormSidebar` returns `false` whenever `linesLayout === 'inlineEditable'`),
so a `grid: false` line field (which `project`/`costcenter` were, being form-only) had no
inline-table column and no sidebar to render in either — a total rendering-surface gap,
independent of whether the ETP-4529 evaluator fix said the field should be visible.

**Fix:** rather than build the larger "expandable per-row detail" feature the original
investigation floated, `project`/`costcenter` are now declared as regular grid columns
(`InvoiceLinesTable.jsx`, the hand-written line table shared by `sales-invoice` and
`purchase-invoice`, hardcodes them — this component does not read `decisions.json`'s `grid`
flag, so no decisions change was needed here) and dynamic visibility was wired through two
generic components so the "Por config" toggle still governs whether the columns actually show:

1. `InlineLinesPanel.jsx` gained a `hiddenColumns = []` prop, filtered the same way
   `DataTable.jsx` already did (`columns.filter(c => !c.hidden && !hiddenColumns.includes(c.key))`).
2. `DetailView.jsx`'s primary `<DetailTable>` call — previously hardcoded to
   `hiddenColumns={[]}` — now passes a memoized list of every key whose
   `lineDisplayLogic.visibility[key]` resolves to exactly `false` (the same live map
   already threaded into the secondary `DetailForm`'s `displayLogic` prop).

Net effect: with the client's Proyecto/Centro de costo dimension toggles OFF, `project`/
`costcenter` do not render as columns in this window's line grid; with them ON, both columns
appear and behave like any other inline-editable selector column. **Applies to:**
`sales-invoice`, `purchase-invoice`, `goods-shipment`, `goods-receipt` — the four
`inlineEditable` windows that actually carry `lines.project`/`lines.costcenter` as real,
non-discarded fields (verified against each window's `decisions.json`). For `goods-shipment`/
`goods-receipt` the columns are pipeline-generated (`decisions.json`'s `lines.project.grid`/
`lines.costcenter.grid` flipped `false → true`, then `make regen`), since their line tables
are fully generated rather than hand-written. `physical-inventory` and `goods-movements` also
use `linesLayout: "inlineEditable"` but were never affected by this gap in the first place:
neither `M_InventoryLine` nor `M_MovementLine` has a `project`/`costCenter` column at all (no
such field exists in their `lines` entity — see each window's own doc, "N/A"/"Nunca"), so
there was nothing to make visible. Windows using the classic `linesLayout`
(`simple-g-l-journal`) were already fully covered by the evaluator fix above — their line
dimension fields render through `LinesForm.jsx`'s sidebar and were already correctly
config-gated before this ticket.

The generic `hiddenColumns` mechanism on `InlineLinesPanel`/`DetailView` is not
window-specific — it applies to every window that uses the primary inline lines grid.

### Regression — product/listPrice/grossAmount vanished from the Lines grid (ETP-4530)

The paragraph above ("any other line field ... will now also be hidden as a column") was an
acknowledged risk when ETP-4543 shipped, and it materialized for real: live manual testing on
this window found `product`, `listPrice` (List Price), and `grossAmount` (Line Gross Amount)
missing entirely from the Lines grid for a saved line, alongside the expected
`project`/`costcenter` gating.

**Root cause:** `lineDisplayLogic = useDisplayLogic(detailEntity, hook.editing, ...)`
evaluates the lines tab's `evaluate-display` against the HEADER record snapshot as a
"representative" line — valid ONLY for `@ACCT_DIMENSION_DISPLAY@`, since its expansion
(`DimensionDisplayUtility.computeAccountingDimensionDisplayLogic()`) depends solely on the
client's dimension config, never on record field values. `NeoDisplayLogicHandler`
(`com.etendoerp.go`), however, evaluates **every** active `AD_Field.displaylogic` on the tab,
not just the dimension macro. On the Sales Invoice Lines tab, three real AD fields carry
genuine, record-dependent `displayLogic` (confirmed via direct DB query against
`ad_field`/`ad_column`):

| Field | Raw `AD_Field.displaylogic` | Dependency |
| --- | --- | --- |
| Product (`M_Product_ID`) | `@Financial_Invoice_Line@='N'` | a sibling per-line field (`Financial_Invoice_Line`) |
| List Price (`PriceList`) | `@GROSSPRICE@='N'` | `GROSSPRICE`, an `AD_AuxiliaryInput` (`SELECT istaxincluded FROM m_pricelist WHERE m_pricelist_id = @M_PRICELIST_ID@`) |
| Line Gross Amount (`Line_Gross_Amount`) | `@GROSSPRICE@='Y'` | same `GROSSPRICE` auxiliary input |

Neither the sibling field nor the auxiliary-input SQL result exists in the header-record
snapshot sent as `fieldValues`. `NeoDisplayLogicHandler.buildEvalContext()` only special-cases
`$Element_*` dimension preferences — it never executes `AD_AuxiliaryInput` SQL and never
carries per-line field values. `DynamicExpressionParser` compiles both references to plain
property/context lookups (`OB.Utilities.getValue(currentValues, 'financialInvoiceLine')` and
`context.GROSSPRICE`), which resolve to `undefined` against missing keys — a property access
on a defined object, not a `ReferenceError`, so it never hits the evaluator's `catch` block
(whose fail-open default is "visible"). The `'N'`/`'Y'` string comparison against `undefined`
just silently evaluates to `false`, indistinguishable at the JSON level from a legitimate
"hide this column" signal. `decisions.json` had in fact explicitly nullified `product`'s and
`grossAmount`'s `displayLogic` (`"displayLogic": null`, per the ETP-4529 "Siempre" decision in
the matrix above) — but that override only affects `contract.json`/generated JS; the NEO
evaluate-display endpoint reads `AD_Field.displaylogic` straight from the database and has no
notion of Schema Forge's contract-level override.

**Fix:** `lineHiddenColumns` (`DetailView.jsx`) now only trusts the visibility map for the
field keys the representative-header-record trick was actually built for —
`project`/`costcenter`/`businessPartner` (`DIMENSION_MACRO_KEYS`, a module-level allowlist next
to `DetailView.jsx`'s existing `WINDOW_DELETE_ACTIONS` constant) — instead of blindly hiding
every key resolving to `false`. Any other field's spurious `false` from this evaluator's known
representative-context limitation is now ignored, matching the fail-open design already in
place for absent/`true` keys. Generic, not window-specific: applies to every window that
consumes `lineHiddenColumns` (the same four `inlineEditable` windows above), and regression
coverage was added directly against the reported symptom (visibility map with
`product/listPrice/grossAmount/project/costcenter` all `false` — asserts only the dimension
keys get hidden) in
`tools/app-shell/src/components/contract-ui/__tests__/DetailView.lineHiddenColumns.vitest.jsx`.

### Header section placement fix (ETP-4529 follow-up)

`header.project`/`header.costcenter` had `"section": "other"` (the secondary/collapsed area)
instead of `"section": "principal"` (the main visible form) — this made them appear as
missing blank space rather than as visible fields, even after the runtime-evaluator and
`hiddenColumns` fixes above made their config-gated visibility resolve correctly. Fixed by
changing `section` to `"principal"` in `decisions.json` and regenerating; confirmed in
`contract.json` (`section: "principal"`) and in the generated `HeaderForm.jsx`.

### Plain grid columns superseded by the "Dimensiones contables" expand panel (ETP-4529)

The `project`/`costcenter` plain grid columns added by ETP-4543 (just above) were a stopgap.
After reviewing the live app, the user asked for the same expand-row "Dimensiones contables"
UX Amortización already has instead of two permanently-visible columns — a plain column reads
as a field the client always has, even with no accounting-dimension config at all.
`InvoiceLinesTable.jsx` now declares one `type: 'dimensionsPanel'` column instead (see
`docs/ui-customization.md` §14b for the column shape), driven by the exact same `hiddenColumns`
this fix introduced (filtering `DIMENSION_FIELD_CANDIDATES_BASE` down to visible fields instead
of hiding a whole plain column). Full write-up, including a **wiring gap discovered while doing
this**: `InvoiceLinesTable.jsx` is not currently reachable from the running sales-invoice
window at all (`HeaderPage.jsx` renders the plain generated `LinesTable.jsx` via
`DetailTable={LinesTable}`, not `InvoiceLinesTable.jsx` via `CustomLines` — neither window's
`decisions.json` sets `window.customLinesComponent`) — see `docs/feedback.md`'s ETP-4543
supersession note.

### Generator support closes the reachability gap (ETP-4529 follow-up)

Since `InvoiceLinesTable.jsx` is dead code for this window (the point above), the fix is at the
generator level, not in that component: `generate-frontend.js`'s `generateTableComponent`
(`schema_forge_core`) now emits the `dimensionsPanel` column directly from `decisions.json` for
ANY pipeline-generated lines table. `lines.project.dimensionsPanel` and
`lines.costcenter.dimensionsPanel` are `true` (grid stays `false`); the actually-rendered
generated `LinesTable.jsx` now declares the synthetic column, so the "Dimensiones contables"
panel renders for real on this window regardless of the `InvoiceLinesTable.jsx` gap above. See
`docs/decisions-reference.md` (`dimensionsPanel`) and `docs/ui-customization.md` §14b.

### "Añadir dimensiones" moved to a hover action, column no longer shown (ETP-4610)

The "Dimensiones contables" grid column described above no longer renders at all — `InlineLinesPanel`
filters the `dimensionsPanel` column type out of the grid unconditionally. The "Añadir dimensiones"
trigger moved into the line's hover-action strip (next to Edit/Delete), shown only when at least one
dimension field is currently visible; the leading expand-chevron column is unchanged and still opens
the same expand-row. The label/icon is adaptive: "Añadir dimensiones" while the line has no dimension
values set, "Editar dimensiones" once at least one is filled. See `docs/ui-customization.md` §14b/§14c
and `docs/feedback.md`'s ETP-4610 entry.

Regenerated cleanly (`make regen ONLY=sales-invoice,purchase-invoice SKIP_EXTRACT=1 LOCAL_CORE=1`,
`sf-validate-pipeline` clean, committed) as part of validating this window's `dimensionsPanel`
flags — see `docs/feedback.md`'s ETP-4610 entry for the full regen log across all five in-scope
windows.

## Multi-currency support in the Cobros/Pagos modal — ETP-4504

The two-step Cobros/Pagos modal (`NewPaymentEntryModal.jsx`, launched from the invoice
payment-history popup) was originally **single-currency**: it assumed the payment amount was
in the invoice currency and never reconciled it against the financial account's currency.
ETP-4504 lifts that restriction for collections (`dir='in'`, sales invoice) and payments
(`dir='out'`, purchase invoice). This section documents the sales-invoice (collection) side;
the payment side is documented identically in
[`purchase-invoice.md`](purchase-invoice.md#multi-currency-support-in-the-cobrospagos-modal--etp-4504).

### F1 — Conversion fields (invoice currency ≠ account currency)

When the invoice currency differs from the currency of the selected financial account, the
**"Nuevo cobro"** modal reveals two extra fields, rendered below the amount/method/account row
and before the credit section:

| Field | i18n key | Behavior |
|-------|----------|----------|
| **Tasa de conversión** (Conversion rate) | `cpConversionRate` | Editable numeric input. Prefilled from the system exchange rate for the *invoice → account* currency pair via the `GET {base}/validate-exchange-rate` endpoint, wrapped by the new `useConversionRate` hook (`tools/app-shell/src/windows/custom/shared/useConversionRate.js`). Accepts `0.92` or `0,92`. |
| **Importe en moneda de la cuenta** (Amount in account currency) | `cpAmountInAccount` | Read-only. Computed as `amount × rate` and recomputed live whenever the amount or the rate changes. Rendered with `formatCurrency(accountCurrency, …)` so the account currency shows next to the value. |

Both fields are **hidden whenever the currencies match** (the common case), so single-currency
collections are visually unchanged. The prefilled rate field is cleared automatically when the
user switches to an account whose currency pair has no stored DB rate, so a stale rate never
silently carries across currency pairs; the user can then type a rate manually.

**Foreign-currency guard.** On a foreign-currency collection a **positive rate ≠ 1 is
required**: a blank/non-positive rate, or a rate of exactly `1`, disables both **Guardar** and
**Confirmar**. A blank/non-positive rate additionally surfaces the `cpConversionRateRequired`
inline error under the field (`cpConversionRateInvalid` is the "must differ from 1" copy).
This mirrors the backend,
which rejects a foreign payment carrying a `1:1` rate (it would otherwise silently post the wrong
ledger amount). The rate is sent to the backend as `conversionRate` on the `registerPayment`
body; the backend recomputes the account-currency amount authoritatively from it.

### F2 — Credit filtered by invoice currency

The **"Saldo a favor y crédito disponible"** section now lists only credit notes / returns /
accumulated credit **in the invoice's currency**. This is enforced server-side (an HQL currency
predicate in `PaymentCreditSourcesService`, keyed to the invoice being collected); the frontend
renders whatever the backend returns, so no client-side filtering was added.

### F3 — Credit-generation restriction on excess

When a collection exceeds the outstanding amount, the excess band's behavior now depends on the
invoice currency (org currency resolved via `useDocumentCurrency`):

- **Invoice in the organization currency** → the excess band offers **Generar crédito a favor**
  (leave the excess as customer credit). This is the only radio; selecting it resolves the
  excess and enables **Confirmar**.
- **Foreign-currency invoice** → **no credit-generation option is offered**. The band shows the
  red inline "Exceso: …" guidance and the only resolution is **Ajustar importe** (the *Igualar*
  action, which sets the cash amount so cash + credit exactly covers the invoice). The excess
  blocks **Confirmar** until adjusted.

The former **"Dar vuelto"** / refund excess option has been **removed entirely** for both
currencies. In `usePaymentBalance.js` the excess mode collapses to `'credit' | null`, and
`overpaymentActionFor` returns only `'leave-credit'` (or `undefined`). Payments (`dir='out'`)
never generate credit — any payment excess blocks confirmation and must be adjusted (unchanged
from the two-step flow's original behavior).

> **Product decision pending functional confirmation.** The removal of the "Dar vuelto" / refund
> path is a product decision made when implementing ETP-4504 (the functional spec's excess table
> lists only "Generar crédito a favor" + "Ajustar importe"). It drops a previously available
> resolution and should be confirmed by the functional team as intended and not a regression.

### Known display-only limitation

The **Importe en moneda de la cuenta** value is rounded to **2 decimals in the UI**
(`round2(amount × rate)`), while the backend books the financial-transaction amount at the
**account currency's own precision**. For currencies whose standard precision is not 2 decimals
(e.g. JPY, which has 0), the amount shown in the modal can differ from the amount actually
posted. This is a display-only discrepancy — the backend recomputes and books authoritatively
from the submitted `conversionRate`.

### Evidence

- `tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx` — conversion fields,
  `isForeign` gating, `rateMissing`/`rateIsOne` guard, `conversionRate` on the submit body,
  currency-gated `ExcessBand` (`canLeaveCredit = isReceipt && invoiceInOrgCurrency`).
- `tools/app-shell/src/windows/custom/shared/useConversionRate.js` — exchange-rate prefill hook.
- `tools/app-shell/src/windows/custom/shared/usePaymentBalance.js` — `canLeaveCredit` gating of
  `excessUnresolved`/`canConfirm`; refund path removed.
- Backend (`com.etendoerp.go`): `PaymentRegistrationService` (rate threading, currency-match
  restriction lifted) and `PaymentCreditSourcesService` (F2 currency filter) — documented in that
  repo's own `docs/`.
- i18n keys `cpConversionRate` / `cpAmountInAccount` / `cpConversionRateRequired` added under
  `genericLabels` in `en_US.json`, `es_ES.json`, and `es_AR.json`.

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.

## MCP document actions (agents)

The header's `documentAction` button is what an AI agent uses to move this invoice through its
workflow over MCP. `neo_schema` returns it with `invokeVia: "neo_action"`, `actionValues` (the
active AD list of the `C_Invoice.DocAction` reference — note `CO` is labelled **Complete** here,
not Book) and `actionParameter: "docAction"`; its `agentPrompt` — defined in `decisions.json` ->
`entities.header.fields.documentAction.agentPrompt` — states which transitions are legal and
their preconditions.

Completing a draft invoice over MCP:

    neo_action { spec: "sales-invoice", entity: "header", id: "<invoiceId>",
                 action: "documentAction", parameters: { docAction: "CO" } }

Flow encoded in the prompt: `DR -> CO` completes (assigns the final document number, computes
taxes/totals, creates the payment plan), `DR -> VO` voids, `CO -> RE` reactivates and **unposts
first** when the invoice was already posted (the Reactivate menu action carries
`preUnpost: true`), `CO -> CL` closes. Posting is a **separate** action on this window
(`menuActions` key `post`, gated on `processed && !posted`) and is **not** a `documentAction`
value — the prompt explicitly tells the agent never to send `PO` here.

This runs `SalesInvoiceHeaderHandler` exactly as the UI does — including the `ProcessInvoiceHook`
routing on completion — because `neo_action` executes the entity's `NeoHandler` hooks
(ETP-4285). If you change this window's workflow rules, update the `agentPrompt` in the same
change: it is the only thing telling the agent what is legal.
