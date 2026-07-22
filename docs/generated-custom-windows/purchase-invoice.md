# Purchase Invoice

## Intent

Use this window to register supplier invoices, keep the payable document aligned with its invoice lines, and understand what is still owed before or after payments are registered. The current UI is oriented around three linked concerns: the invoice header, the invoice lines that build the commercial amount, and the payable state exposed through outstanding amounts, schedules, and related payment-out records.

## What this window should allow

- Create and edit a purchase invoice header with the supplier, invoice dates, payment terms, payment method, and the supplier invoice reference (`POReference`, displayed as "Document No." / "Nº documento") alongside the other payable-identifying fields used by this workflow.
- Add and review invoice lines so the document reflects what the supplier billed, including product, description, quantity, unit price, discount, tax, and line gross amount.
- Review invoice totals at document level, including net amount, gross amount, paid amount, and outstanding amount when those values are available from the header or payment schedule data.
- Inspect the invoice from the list without immediately leaving the list route, then move into full edit mode when needed.
- Understand the payable relationship to the originating purchase order, related goods receipts, and downstream payment-out records.
- Open payment detail flows when the invoice is completed and still has an amount pending.
- Complete multiple draft invoices at once from the list selection bar using the bulk action, labeled "Confirmar" (i18n key `confirmBulk`) for draft selections.

## Interaction model

- Route: `/purchase-invoice` for the list and `/purchase-invoice/:recordId` for create/edit detail.
- Visibility: visible from the Purchases menu.
- Implementation type: custom window override registered in `tools/app-shell/src/windows/registry.js`, combining generated header/detail scaffolding with custom list preview, topbar, line table, bottom panel, and related-documents behavior.
- Window shape: master-child. The master record is the invoice header and the main child dataset is invoice lines; the detail page also surfaces a custom related-documents tab instead of relying on the generated payment secondary tabs.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. FK fields in line rows (product, tax, account, project, cost center, asset, and dimension fields) use `InlineSearchCombo`: a text input with server-side search that lets the user filter by typing — for example, typing "IVA" filters all matching tax rates. The add-line button, related-documents panel, notes panel, and totals panel are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.
- List interaction: the list uses a custom `PurchaseInvoiceHeaderTable` component (`tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx`). The visible columns, in order, are: Invoice Date (no dot indicator), Document No. (`POReference`, relabeled through `window.labelOverrides`), Due Date (4-state dot computed from the row's `outstandingAmount` and shown as "—" when no due date exists on the row). The four states use the Etendo Figma tokens: **paid** (`outstandingAmount ≤ 0`, dot `green-600 #26A95F`) wins over any date-based state, **overdue** (dueDate before today and outstanding still pending, dot `red-500 #F53D6B` with the date text reinforced in `red-700 #D50B3E`), **soon** (dueDate within the next 7 days with outstanding pending, dot `yellow-600 #FAAF00`), and **ok** (anything further out, dot `gray-400 #8A8AA3`). Date-only invoice and due-date values are normalized as local calendar dates before rendering so same-day invoices do not shift backward because of timezone conversion, and the final rendered date follows the active app locale just like `Invoice Date`. Business Partner, Document Status, Total Gross Amount, **Pending Payment** (the AD `OutstandingAmt` column relabeled via `window.labelOverrides` from "Total Outstanding" to "Pending Payment" / "Pendiente de pago" so the grid reads in payment terms rather than ledger terms), and **Delivery Status** (a percent progress bar driven by the virtual AD column `em_etgo_delivery_status` on `c_invoice` — calculated server-side from `m_matchinv` + `m_matchsi` quantity-weighted against `qtyinvoiced`; 0% when no matching exists yet, 100% when fully matched, intermediate when partial) complete the list. When the fiscal profile enables SII for the organisation, an **SII Status** badge column is injected between Document Status and Total Gross Amount. The badge reads `row.aeatsiiEstado` directly from the list API response — no secondary fetch is needed (ETP-4125 eliminated the batch `useInvoiceListFiscalStatus` hook that previously caused HTTP 403 errors on large invoice lists due to nginx URL-length limits). The badge component is `FiscalStatusBadge` from the shared module. **Verifactu and TBAI are sales-only fiscal systems — they never appear as columns or badges in the purchase-invoice list.** Selecting a row opens a preview modal instead of navigating directly to the detail route.
- Detail interaction: the record page uses the generated header page with a custom lines table, a custom topbar, summary amounts, notes editing, footer totals, and related-document chips. The principal header section shows `POReference` as `Document No.` / `Nº documento`, placed right after `Business Partner`, while the internal AD `documentNo` field stays hidden in this custom workflow. `POReference` remains editable after completion here, matching the current Classic metadata for this field.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- A **SIF** tab (Suministro Inmediato de Facturación) is available in the detail tab strip when the organisation is configured for SII (TBAI and Verifactu are not shown for purchase invoices at all — see below). The tab is declared in `decisions.json → window.extraTabs` and rendered by the shared `tools/app-shell/src/windows/custom/shared/SifTab.jsx` component. For purchase invoices the SII panel uses the `aeatsiiClaveTipoFc` field and the purchase-specific invoice type options (F6 / LC / F5 / F1). **ETP-4401:** the per-invoice `tbaiIssent` field (and its sibling `tbaiSequence`/`tbaiInvoicenum`/`tbaiInvoiceseq` fields on the sales side) now carries an explicit `"visibility": "discarded"` override in `decisions.json` so it no longer reaches the frontend contract, because TBAI chaining sequences are now generated automatically per fiscal configuration by the `TbaiConfigSequenceHandler` NeoHandler instead of being tracked per invoice. When no fiscal target is active for the organisation, the SIF tab now disappears entirely from the detail tab strip instead of showing an empty-state message: `SifTab.jsx` reports its own visibility via the `onVisibilityChange` callback that `tools/app-shell/src/components/contract-ui/DetailView.jsx` passes to every `placement: 'tab'` custom tab, and the view redirects to the first remaining tab if the hidden tab was the active one. Editable fields are patched immediately on blur via `PATCH /sws/neo/purchase-invoice/header/{id}`.

## Reactive behavior and dependencies

- Header defaults are visible in the contract for invoice date and accounting date (`@#Date@`), document status (`DR`), currency, and zeroed payable amounts such as total paid and outstanding amount. Currency is editable on the header via the `CurrencyRatePicker` component (see "Currency and exchange rate — ETP-4029" below), not a read-only defaulted value.
- Unified document/accounting date (ETP-4531, redefined 2026-07-17): `accountingDate` (`DateAcct`) is `visibility: system` — fully hidden from the UI, not present in `frontendContract.entities.header.fields` at all. `invoiceDate` is the single visible date field. Per classic AD metadata, `C_Invoice.DateInvoiced` carries `AD_Column.AD_Callout_ID = com.etendoerp.sif.general.callouts.SifInvoiceOperationDateCallout`, which extends `org.openbravo.erpCommon.ad_callouts.SE_Invoice_AccountingDate` and auto-fills `dateAcct` from `dateInvoiced`. This cascade is now intentionally allowed to flow through untouched — the earlier `PurchaseInvoiceHeaderHandler#afterCallout` guard that stripped it (ETP-4531's original, now-superseded scope; see `docs/feedback.md`) has been removed on the `com.etendoerp.go` side, so saving the invoice writes the same date to both `invoiceDate` and `accountingDate` internally, and the accounting facts generated on posting reflect that unified value as the journal entry's accounting date.
- The `date` field in `AddPaymentModal.jsx` (the "New payment" popup triggered from the invoice detail) uses the generic `DateField` component (`tools/app-shell/src/components/ui/date-field.jsx`) — Figma-aligned calendar popover with always-visible calendar icon, month/year picker, and Etendo yellow hover on filled-black elements. These defaults matter because a new payable document starts as draft and incomplete before lines and payment activity exist.
- Partner address is a dependent selector filtered by the selected business partner. The business partner also drives header callouts, and the custom page blocks line creation until a business partner is present.
- The purchase order reference is part of the header contract and is used by the custom related-documents surface to show the linked purchase order and to fetch related goods receipts for the same order. The related-documents component fetches the full purchase order record via `fetchById('purchase-order', 'header', ...)` so the chip renders the formatted title (`Order #<documentNo>`), the grand total amount with currency symbol, and the document status — matching the same visual style used by the sales-invoice related-documents chip. The supplier invoice reference (`orderReference`, DB column `POReference`, displayed as `Document No.` / `Nº documento`) is a free-text header field surfaced in the detail form so the user can reconcile the invoice against the supplier's own paper document; it stays editable after completion in this instance because AD metadata does not define a read-only rule for it.
- The detail bottom panel (`PurchaseInvoiceBottomPanel`) delegates totals display to the generic `DocumentTotalsPanel`. It computes subtotal, discount, tax (as `grand total − net subtotal`), and total client-side from the saved lines plus the live add-row (`pendingLine`) and sidebar editing (`editingLine`), so amounts update in real time as the user types. The `etgoDiscount` column is always visible in the lines grid and the add-row — there is no toggle. "Subtotal sin descuento" and "Descuento por producto" rows auto-appear when `discountAmt > 0` (at least one existing or in-progress line carries a non-zero discount); both are read-only computed rows. A `+ Añadir descuento total` button appears below the totals when no total discount is active and at least one line exists; clicking it opens an interactive "Descuento total" section (checkbox + computed amount + percentage input). Unchecking the checkbox collapses the section and restores the button. On `onBlur`, `DetailView` fires `handleTotalDiscountChange(pct)` → `PATCH { etgoTotalDiscount: N }` → persists in `EM_Etgo_Total_Discount` on the `C_Invoice` header (best-effort, no reload). When the invoice is completed (`documentAction=CO`), `PurchaseInvoiceHeaderHandler` calls `TotalDiscountService.recalculate(headerId, isInvoice=true)` before the action reaches the CRUD layer: it deletes any existing `ETGO_DTO` discount lines, then creates one negative line per tax group (`GROUP BY c_tax_id`), proportional to each group's net subtotal — mirroring Classic `C_INVOICE_POST`. `InvoiceLineHandler` filters `ETGO_DTO` lines from all GET responses so they are never visible in the frontend. When the invoice is read-only (completed), `DocumentTotalsPanel` shows a static "Descuento total (X%) −Y€" row instead of the interactive panel.
- The line `tax` field is now a dropdown selector (Radix Select) instead of a free-text search input. The list of available taxes is loaded server-side via `GET /sws/neo/purchase-invoice/lines/selectors/C_Tax_ID` and is filtered by `IsSOTrx=N` (purchase taxes) and by the `VAL_Tax_IsSOTrx_Date` validation rule, which keeps only taxes whose `VALIDFROM` is on or before the invoice date (`COALESCE(@DateInvoiced@, @DateOrdered@)`). Previously this field rendered as a text search that always returned "Sin resultados" because the validation rule context was not populated. The tax rate percentage itself is not shown in the invoice line table; to inspect rate values navigate to the `/tax` catalog, where the `Rate` column uses a three-state tag: green `+N %` for positive rates, neutral `0 %` for zero, and red `−N %` for negative rates (withholdings).
- Line pricing follows `INVOICE_LINE_CONFIG` (see `docs/line-pricing-model.md`). The editable fields are `listPrice` (PriceList column) and `etgoDiscount` (`EM_Etgo_Discount`, a Number column added by `com.etendoerp.go`). `unitPrice` (PriceActual) is hidden; it is computed at POST/PATCH as `listPrice × (1 − etgoDiscount/100)`. The product selector provides the correct price-list price via `NeoSelectorService.enrichProductSelectorWithPrices`, which populates both the display-side fields and `_aux._PSTD/_PLIST` so `SL_Invoice_Product` returns the price-list price. Guard 1 in `DetailView.jsx` maps `standardPrice → listPrice` universally when `listPrice` is null or zero. Changing the product resets `etgoDiscount` to 0. `grossAmount` is computed client-side as `invoicedQuantity × listPrice × (1 − etgoDiscount/100) × taxFactor`. The `decisions.json` declares `lineEntityConfig: "invoice"`, which drives all of these behaviors via the generator and `DetailView.jsx`.
- The preview modal and the detail topbar both treat the invoice as a payable document. They read payment-plan and payment/payment-history data to show paid versus outstanding state, and they expose payment actions only when the invoice is completed and still has an outstanding balance.
- The detail topbar shows a payment-status pill only for completed invoices. The pill label and amount react to whether the invoice is fully paid or still pending, and clicking it opens the shared invoice payment modal.
- Two-step Pagos flow (ETP-4331/ETP-4342): the payment pill opens the history popup **"Pagos de la factura"** (`InvoicePaymentHistoryModal.jsx`, the unified component shared between sales and purchase invoice, `dir='out'`) — title + document-number badge header, a stats row (Proveedor · Importe total · Saldo pendiente), a table of registered payments (or an empty state), and a footer with the registered-count label and a **"+ Añadir pago"** pill button shown only while the invoice is `CO` with outstanding > 0. `InvoicePaymentModal.jsx` was removed — `InvoicePaymentHistoryModal.jsx` is now the single canonical component for both directions. It opens the **"Nuevo pago"** modal (`NewPaymentEntryModal.jsx`, step 2): *Importe*, *Fecha*, *Método de pago*, and *Cuenta* — all four marked required (red `*`) and gating **Guardar**/**Confirmar** until filled, where "Importe" is satisfied by the total applied (cash + used credit/abono), not the cash field alone, so a credit line covering 100% of the invoice (leaving cash at 0) still allows confirming — plus the conditional credit/abono section (AP credit memos only — no supplier credit accrual in it1) and the real-time balance summary with *Igualar*. Unlike collections, an **excess blocks Confirmar** with an inline "Exceso: …" error (no *Dar vuelto* / *Dejar a crédito* for payments in it1). **Guardar** → Borrador (draft), **Confirmar** → Depositado. On save/confirm the modal returns to the history popup, which refreshes both its own "Saldo pendiente" (refetches the payment plan, not just the payment list) and the invoking list's "Pendiente de pago" badge (`onDataMutated` callback into the list's data hook). Backend uses the same shared actions as sales (`invoicePaymentMethods`, `invoiceCreditSources`, extended `registerPayment` with `process`/`creditSources`, `confirmPayment`) via `RegisterPaymentOutHandler` → `PaymentRegistrationService` (isReceipt=false). The *Fecha* field is required (ETP-4005): clearing it disables **Confirmar**, and saving with an empty date surfaces the `paymentDateRequired` error and a red border on the field.
- Credit notes (AP CreditMemo / Nota de Crédito, negative totals): the detail topbar badge mirrors the grid's "Pendiente de pago" cell — green **"Aplicada"** once the note is fully consumed, else a purple clickable **"Saldo a favor · remaining"** badge that opens the same history popup as the grid (previously a static non-clickable "Crédito aplicado · total" pill). Inside the popup, the pending widget relabels to **"Saldo a favor"** with the remaining balance, each row shows how much of the note that payment consumed (`− appliedToInvoice` from the `invoicePayments` action, negative when consuming the note), and the **"+ Añadir pago"** button is hidden.
- Payment method / account defaults (ETP-4331) — mirrors Etendo Classic's `AddPaymentDefaultValuesHandler` priority instead of an arbitrary first-in-list pick: **Método de pago** defaults to the invoice's own configured method (falling back to the business partner's method if the invoice has none); **Cuenta** is filtered to only the accounts that support the selected method (and match the invoice currency), defaulting in priority order to (1) the business partner's preferred account for this direction (`pOFinancialAccount` for payments) when it supports the method, (2) the account flagged `default` on `FIN_Financial_Account_PaymentMethod` for that method, (3) the first account that supports the method. Changing **Método de pago** re-filters and, if needed, re-selects **Cuenta** using the same priority; clearing **Método de pago** never silently refills **Cuenta** (a prior bug where clearing the method after clearing the account caused the account to reappear on its own is fixed). Backend surfaces this via `paymentMethodIds`/`defaultForMethodIds` per account and `defaultMethodId`/`bpPreferredAccountId` on the `invoiceAccounts` response (`PaymentRegistrationService.java`).
- Topbar clone button: icon-only (no text label), styled as Secondary Outline (`#D1D4DB` border, `#FFFFFF` background, `#64748B` icon color, `0px 1px 2px 0px #1212170D` shadow). Hover shifts background to `#F1F5F9`. Implemented via the shared `tools/app-shell/src/windows/custom/shared/CloneButton.jsx` component, which is also used by `SalesInvoiceTopbar.jsx`.
- When the fiscal profile enables a manual fiscal target for purchase invoices, completed purchase invoices expose `Enviar a SIF` in both the detail topbar and the preview modal. The matrix is spec-specific: `sii` and `sii-navarra` show SII; `tbai` shows TicketBAI; `sii+tbai` shows only SII for purchases; `verifactu` shows no manual send button because Verifactu is sent automatically on completion.
- The detail bottom panel also includes the same SIF status block used by sales invoices, rendered below Related Documents and Notes. It shows SII/TBAI tabs depending on the org fiscal profile, exposes the current send status badges, and allows inline editing of the SII metadata fields that remain editable for the current document state.
- **Verifactu does not apply to purchase invoices.** The SIF bottom-panel block for purchases shows only SII and TBAI tabs according to the fiscal matrix; the `verifactu` profile shows no bottom-panel block for purchases because Verifactu is a sales-only fiscal system in Etendo.
- Related payment records are downstream dependencies, not free-form links. The custom related-documents component resolves payment-out documents through payment-plan and payment-detail relationships, then links users to `/payment-out/:id`.
- The preview modal has General, Messages, and History tabs, but only the General tab is backed by invoice/payment data in current evidence. Messages and History are present as empty states.
- The preview modal includes a document upload/drop area for purchase invoices backed by persistent file storage: uploaded files are sent to `POST /sws/neo/preview-file` and stored in `ETGO_PREVIEW_FILE` keyed by `(clientId, specName, recordId)`. On each subsequent open a `GET /sws/neo/preview-file` restores the cached file; if one exists the drop zone is replaced by a PDF/image viewer with a delete button. The delete button sends `DELETE /sws/neo/preview-file` and restores the drop zone.
- Save button dirty-state tracking: the "Save Draft" button is disabled whenever there are no pending unsaved changes (`isDirty = false`). Four independent sources make `isDirty` true: (1) any header field value differs from the last-saved record; (2) an add-row form is open on the primary lines tab; (3) an add-row form is open on a secondary child tab; (4) a sidebar line edit is open. The "Confirm" button is never blocked by dirty state — completing an invoice is always allowed regardless of whether header changes are pending. New records always have Save active because backend defaults populate the form immediately on open. After a successful save, the detail view refetches the saved header once so backend-populated fiscal defaults and callout results are reflected immediately, then the button disables automatically. Reverting a changed field back to its original value also disables the button. When a line is added, `refreshHeaderTotals` updates server-computed totals in `editing` without overwriting fields the user explicitly changed, so pending header edits survive line operations.

## Gap assessment

- The UI clearly presents payable amounts and payment registration entry points, but the exact accounting consequences of adding or updating payments are not documented in this window evidence. Treat downstream posting semantics as backend behavior, not confirmed UI behavior here.
- The `DocumentTotalsPanel` shows tax as `grandTotal − netSubtotal` (where `netSubtotal = Σ(qty × listPrice × (1 − discount/100))`). This is a display shortcut that correctly captures the aggregate tax for typical single-tax-rate invoices, but it does not surface per-line or multi-rate tax breakdowns even though the contract exposes tax-related entities.
- Payment-plan and payment-detail entities exist in the contract and power the custom payment views, but this window does not expose those datasets as first-class editable tabs. If users need schedule editing beyond the modal flows, that remains an open UX gap in current evidence.
- Messages, History, and email history are placeholders today. The business intent suggests traceability around supplier communications and payable events, but the current implementation does not show persisted conversation or activity feeds.
- The purchase-invoice preview now supports full file persistence: uploaded files are stored server-side in `ETGO_PREVIEW_FILE` and restored on each subsequent open. The drop zone, cached file view, and delete flow are automated and tested end-to-end in `e2e/tests/flows/invoice-preview-persistence.spec.js`.
- Dedicated automated coverage now exists for the purchase-invoice list/grid contract and for SIF button visibility under mocked fiscal profiles (`artifacts/purchase-invoice/__tests__/contract-integrity.test.js`, `e2e/tests/flows/sif-buttons-fiscal-config.spec.js`), but the broader payable flow still relies on manual verification for full end-to-end confidence.
- Label-override duplication is a known piece of technical debt. Because the custom list wrapper bypasses the generated `HeaderPage`, it has to carry its own `LABEL_OVERRIDES` constant and forward it into the `ListView`. The same labels are also declared in `decisions.json` for the generated surfaces when needed. Any label change has to be made in both places until the wrapper reuses the generated labels.
- Header-date format reformatting for the tax selector context lives in a generic component, `tools/app-shell/src/components/contract-ui/DetailView.jsx`, which converts the ISO `YYYY-MM-DD` invoice date into the `DD-MM-YYYY` form that Etendo Classic's PL/pgSQL `to_date()` expects before sending it as `DateInvoiced` in the selector context. This is technical debt to keep in mind: any future change to date handling has to consider both formats, because sending the raw ISO date triggers HTTP 500 with "date/time field value out of range".

## Manual verification

1. Open `/purchase-invoice` and confirm the list shows: Invoice Date (no dot), Document No. (the `POReference` value relabeled through `labelOverrides`), Due Date (green dot for `outstandingAmount ≤ 0` regardless of date, red dot + red date text for past-due rows that still have outstanding balance, yellow dot for rows due within the next 7 days with outstanding balance, gray dot for everything else, "—" when no due date exists), Business Partner, Document Status, Total Gross Amount, and Pending Payment in that exact column order. Pay particular attention to invoices that are past their due date but already paid — they must render with the green dot, not the red one. Also confirm date-only values keep their original calendar day when rendered.
15. Open a completed purchase invoice and verify that **Contacto** (`businessPartner`), **Dirección** (`partnerAddress`), **Método de pago** (`paymentMethod`), **Condiciones de pago** (`paymentTerms`), and **Tarifa** (`priceList`) fields are all disabled (read-only). Confirm that **Nº documento** (`orderReference`) remains editable.
2. Click a list row and confirm the preview modal opens instead of immediate navigation.
3. In the preview modal, verify the General tab shows total, due/payable state, and payment history, while Messages and History remain placeholder states.
4. Open `/purchase-invoice?filter=overdue` and confirm the quick filter keeps invoices with an outstanding amount.
5. Open a draft invoice detail and confirm adding a line is blocked until a business partner is selected.
6. On the detail page, confirm the custom lines table shows product, description, invoiced quantity, net unit price (`listPrice`), % discount (`etgoDiscount`), tax, and line gross amount in that exact column order, and that the footer shows subtotal, inferred tax, and total. Open a line for edit and confirm the `Impuesto`/`Tax` field opens a dropdown listing the configured purchase taxes (filtered by `IsSOTrx=N` and validity against the invoice date), not a free-text search that returns "Sin resultados". Confirm that selecting a product populates the net unit price field (`listPrice`, the PriceList value from the document's price list) and resets the discount to 0, and that typing a new quantity, price, or discount immediately updates the gross amount without a server round-trip. The net unit price field must be editable in the add-line row.
7. Open a completed invoice with pending balance and confirm the topbar payment-status pill appears, opens the payment modal, and reflects the invoice as pending or paid based on outstanding amount.
8. Under an org configured for `sii`, `sii-navarra`, `tbai`, or `sii+tbai`, open a completed purchase invoice and confirm `Enviar a SIF` appears in both the detail topbar and the preview modal only for the purchase-side target defined by the fiscal matrix: SII for `sii` / `sii-navarra`, TicketBAI for `tbai`, and SII only for `sii+tbai`. Trigger it and verify the confirmation text matches the pending target and successful sends refresh the invoice state.
9. From the detail footer or related-documents tab, confirm links are available to the source purchase order, related goods receipts, and downstream payment-out records when those relationships exist. The purchase order chip must show the formatted label (`Order #<documentNo>`), the grand total with currency symbol, and the document status pill — not the raw `_identifier` string (`documentNo - date - amount`).
10. Open a completed purchase invoice detail and confirm the kebab menu exposes **no document actions** (reactivation is not supported for this window; the kebab `menuActions` array is empty in `decisions.json`).
11. From the list, select multiple draft invoices and confirm the bulk action bar shows a `Confirmar (N)` button. Verify the expected status transition and a result toast.
12. Open an existing draft invoice without touching any field and confirm the "Save Draft" button is **disabled**. Change any header field and confirm it becomes enabled. Save and confirm it disables again. Revert the changed field to its original value without saving and confirm the button disables once more. Add a line: once the add-row is submitted, the button should disable again if no header changes remain pending. Confirm the "Confirm" button stays enabled throughout all these states.
13. Open a purchase invoice detail and confirm the bottom panel shows a `SIF` section below Documents and Notes whenever the fiscal profile enables a purchase-side fiscal target. Verify the visible tabs follow the fiscal matrix: SII for `sii` / `sii-navarra`, TicketBAI for `tbai`, SII only for `sii+tbai`, and Verifactu only for `verifactu`. Confirm the SII badge reflects `aeatsiiEstado`, the TBAI badge reflects `tbaiIssent`, the Verifactu badge reflects `etvfacInvoiceStatus`, and SII inline edits persist through `PATCH /sws/neo/purchase-invoice/header/{id}`.
14. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
16. Open "Nuevo pago" for an invoice whose business partner has a preferred `pOFinancialAccount` supporting the invoice's method and confirm both **Método de pago** and **Cuenta** preselect to those values; change **Método de pago** to one the preferred account does not support and confirm **Cuenta** re-filters to only the accounts supporting the new method, reselecting per the BP-preferred → `default`-flagged → first-supporting priority. Select a saldo a favor/crédito line that covers 100% of the outstanding amount (leaving Importe at 0,00 €) and confirm **Confirmar** is enabled, not disabled. From the invoice list, click **"Pendiente de pago"** to open the history popup, register a payment, and confirm both the popup's own **Saldo pendiente** and the list's **Pendiente de pago** column update immediately without a page reload.

## Automated evidence

- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-action component mounted in the purchase-invoice list selection bar, mounted with `labelKey="confirmBulk"` so the button renders as "Confirmar" / "Confirm". The `menuActions` array in `artifacts/purchase-invoice/decisions.json` is empty — no kebab document actions (including `Reactivate`) are declared for this window. Reactivation is not supported in the purchase-invoice detail view.
- `tools/app-shell/src/lib/__tests__/dateOnly.test.js`, `tools/app-shell/src/lib/__tests__/invoiceDueDate.test.js`, and `tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.test.js` provide source-level and helper-level regression coverage for due-date calendar normalization, locale formatting, max-installment selection, and the paid/overdue/soon/ok state derivation that drives the dot color and the red-text reinforcement on overdue rows in the purchase-invoice list.
- Shared shell and entity-loading behavior is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- Contract and UI evidence reviewed for this rewrite:
  - `tools/app-shell/src/menu.json`
  - `tools/app-shell/src/windows/registry.js`
  - `artifacts/purchase-invoice/contract.json`
  - `tools/app-shell/src/windows/custom/purchase-invoice/index.jsx`
  - `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx` — the payment-status pill (paid/pending amounts) formats monetary values using the org's configured currency via `useCurrency()` and `formatCurrency()`.
  - `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceBottomPanel.jsx` — subtotal, inferred tax, and total in the footer are formatted using the org's configured currency via `useCurrency()` and `formatCurrency()`.
  - `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` — wires `useInvoicePreview` data into `GenericPreviewModal`; drives the left-panel strategy (drop zone vs. cached file vs. spinner), the `attachmentConfig` prop, and the modal action buttons (Send, Add Payment, Download PDF, Edit).
  - `tools/app-shell/src/windows/custom/shared/GenericPreviewModal.jsx` — domain-agnostic slide-in preview shell. Receives `attachmentConfig` and manages the entire file-persistence lifecycle via `usePreviewAttachment`: GET on mount, drop zone when no file, POST on upload, DELETE on delete button. Emits `data-testid="generic-preview-modal"` and `data-testid="preview-drop-zone"`.
  - `tools/app-shell/src/windows/custom/shared/usePreviewAttachment.js` — GET/POST/DELETE against `/sws/neo/preview-file`. No-op when `storeCondition=false`. Manages the `storedFile` object URL lifecycle (revoke on unmount).
  - `tools/app-shell/src/windows/custom/purchase-invoice/InvoiceLineTableCustom.jsx` — hardcoded column list: product, description, invoiced quantity, net unit price (`key: 'listPrice'`, `column: 'PriceList'`, `type: 'amount'`), % discount (`key: 'etgoDiscount'`), tax, line gross amount. The editable price field is `listPrice` (PriceList column), not `unitPrice` (PriceActual). `etgoDiscount` (`EM_Etgo_Discount`) is the discount field for invoice lines. This aligns with `addLineFields.entry` in the generated `HeaderPage.jsx` and with the `INVOICE_LINE_CONFIG` used by `DetailView.jsx`.
  - `tools/app-shell/src/windows/custom/purchase-invoice/RelatedDocuments.jsx` — fetches the full purchase order via `fetchById` to render the order chip with formatted title, amount, currency, and status. Goods receipts are fetched via `fetchByCriteria('goods-receipt', ...)` on the same PO id. Payments are resolved through payment-plan → payment-detail → payment-out chain.
  - `tools/app-shell/src/windows/custom/shared/InvoicePaymentHistoryModal.jsx` — uses `useApiFetch()` for authenticated payment-plan, payment-history, financial-account, and register-payment requests instead of receiving token props; refetches the payment plan (not just the payment list) after a payment is registered so its own "Saldo pendiente" stays accurate within the same modal session.
  - `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx` — the list's payment badge cell; `onPaymentAdded` calls `props.onDataMutated` (wired by `ListView.jsx` to the list's data-refresh hook) so the "Pendiente de pago" column refreshes after registering a payment without a manual reload.
  - `tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx` / `usePaymentBalance.js` — the "Nuevo pago" form and its balancing hook; `balance.funds` (cash + used credit) gates the required-Importe check, not the cash amount alone.
- `tools/app-shell/src/hooks/__tests__/useEntity-dirty-state.test.js` verifies the `isDirtyHeader` computation (dirty when editing differs from selected, clean when they match, new-record initial state) and the `refreshHeaderTotals` selective merge (server-computed totals update while user-edited fields in `editing` are preserved using `userChangedKeysRef`).
- `tools/app-shell/src/components/contract-ui/__tests__/DetailView.dirtyState.test.js` guards the `isDirty` composite expression, the `additionalDirtyState` extension prop, and the save-button disabled conditions (new record always active, existing record gated by `!isDirty`, Confirm button never gated by dirty state).
- The generated `HeaderPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `C_Invoice` AD table.
- `e2e/tests/flows/invoice-preview-modal.spec.js` — 5 Playwright tests for `GenericPreviewModal` lifecycle in mock mode: row click opens the modal, X button dismisses it, backdrop click dismisses it, tabs are rendered and switching works, Edit navigates to the detail URL.
- `e2e/tests/flows/invoice-preview-persistence.spec.js` — 7 Playwright tests for file persistence in mock mode: drop zone visible when no file is cached, GET fires with correct `specName=purchase-invoice` and `recordId`, file upload triggers POST with correct body params, file view is shown when a cached file exists, delete button sends DELETE and restores the drop zone, completed sales invoice fires GET with `specName=sales-invoice`, draft sales invoice does NOT fire GET (storeCondition=false).

## Validation & Error Handling — ETP-4005

See [Shared validation & UX changes — ETP-4005](app-shell-functional-flows.md#shared-validation--ux-changes--etp-4005) for the full list: inline line min-value enforcement, payment modal date validation, single confirmation toast, and callout message sanitization.

## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; this window has no required header fields so the array is empty and there is no behavioral change.

## Import-from-order and import-from-receipt — ETP-3908

Two new line-import flows are now available on draft purchase invoices when a business partner is selected:

**Import from Purchase Order** (`artifacts/purchase-invoice/custom/ImportFromPurchaseOrderModal.jsx`):
- Lists confirmed purchase orders (`documentStatus=CO`) for the same supplier with `invoiceStatus < 100`.
- Expanding an order row lazy-loads its lines with product name, ordered quantity, unit price, and discount.
- Already-imported lines (matched via `salesOrderLine` / `C_OrderLine_ID` on existing invoice lines) are grayed and labeled "Ya importado".
- Each imported line is POSTed to `/purchase-invoice/lines` with `salesOrderLine`, `invoicedQuantity`, `unitPrice`, `listPrice`, `etgoDiscount`, `tax`, `uOM`, and `lineNo`.
- `afterImport`: if every imported order shares the same non-zero `etgoTotalDiscount`, a PATCH updates the invoice header with that discount so the `DocumentTotalsPanel` reflects it immediately.
- **Currency filter — ETP-4029:** the modal fetches the invoice's own header (`GET purchase-invoice/header/{id}`) and keeps only candidate orders whose `currency` matches the invoice's current header currency (purchase orders carry `currency` directly). Empty-state message when candidates exist but none match: `noPurchaseOrdersMatchCurrency`.

**Import from Goods Receipt** (`artifacts/purchase-invoice/custom/ImportFromGoodsReceiptModal.jsx`):
- Lists completed goods receipts (`documentStatus=CO`) for the same supplier with `invoiced !== true`.
- Each receipt row shows its backing purchase order number (`salesOrder$_identifier`) as the secondary label (right side of the row), not the line total.
- Receipt lines carry no price; prices are resolved via the `/purchase-invoice/lines/callout` cascade (same pattern as `ImportFromShipmentModal` on the sales side).
- Already-imported lines are detected via `goodsShipmentLine` / `M_InOutLine_ID` on existing invoice lines.
- The backing PO line (`salesOrderLine` on the receipt line) is looked up in `/purchase-order/lines/{id}` to carry the line-level discount into the invoice.
- POST body: `goodsShipmentLine`, `salesOrderLine`, `invoicedQuantity`, `unitPrice`, `listPrice`, `etgoDiscount`, `tax`, `uOM`, `lineNo`.
- **Currency filter — ETP-4029:** `M_InOut` (goods receipts) has no `C_Currency_ID` column, so currency is resolved through the receipt's linked purchase order; candidates whose linked order currency does not match the invoice's current header currency are excluded, and candidates with no linked order are never excluded. Empty-state message when candidates exist but none match: `noGoodsReceiptsMatchCurrency`. Both import modals share the `noCurrencyMatchMessageKey`/`excludedByCurrency` mechanism on the generic `ImportLinesModal.jsx`, and both re-read the invoice's current header currency on every fetch, so switching the header currency and reopening the modal re-filters immediately.

**`PurchaseInvoiceBottomPanel.jsx`** was rewritten to wire both modals:
- `PurchaseInvoiceLinesEmptyState`: shows "Importar desde envío" (receipt) and "Importar desde pedido" (order) buttons when `isDraft && canAddLine && bpId`. Receipt button is first (mirrors sales-invoice order).
- `PurchaseInvoiceLineActions` (forwardRef): exposes `openImportReceiptModal` and `openImportOrderModal` via `useImperativeHandle` for use from the "+ Añadir línea" dropdown.
- `PurchaseInvoiceBottomPanel.lineMenuActions`: returns `[{ key:'import-receipt', … }, { key:'import-order', … }]`.

**`DetailView.jsx` — `onRefresh` after import** now calls both `hook.fetchChildren` (lines) and `hook.fetchById` (header) so `etgoTotalDiscount` set by `afterImport` is immediately reflected in the `DocumentTotalsPanel` without requiring a manual page reload.

**`DetailView.jsx` — `handleTotalDiscountChange`** (saves `etgoTotalDiscount` on blur) now:
1. Shows `toast.success(ui('totalDiscountSaved'))` on a successful PATCH.
2. Shows `toast.error(...)` on failure instead of silently swallowing the error.
3. Calls `hook.handleChange('etgoTotalDiscount', pct)` to update the local editing state so a subsequent document save does not overwrite the freshly persisted discount with the stale header snapshot.

**`ImportLinesModal.jsx`** (`tools/app-shell/src/components/contract-ui/`) is now fully window-agnostic: the previously hardcoded `${base}/sales-invoice/lines` POST endpoint is replaced by a required `linesEndpoint` prop. A runtime guard (`throw new Error(...)`) prevents accidental omission. Existing sales-invoice wrappers pass `linesEndpoint="sales-invoice/lines"` explicitly.

**Automated evidence (ETP-3908)**:
- `e2e/tests/flows/purchase-invoice-import-from-order.mocked.spec.js` — 4 mocked Playwright tests: single line (asserts POST body fields), multiple lines (asserts 2 POSTs), line-level discount (asserts `etgoDiscount: 15` in POST), order-level discount (asserts header PATCH with `etgoTotalDiscount: 15`).
- `e2e/tests/flows/purchase-invoice-import-from-receipt.mocked.spec.js` — 3 mocked Playwright tests: single line with callout-resolved price (asserts `goodsShipmentLine` in POST), secondary label shows PO reference, already-imported lines show "ya importado" and are disabled.

**Automated evidence (ETP-4029 — currency filter on import modals)**:
- `artifacts/purchase-invoice/custom/__tests__/ImportFromPurchaseOrderModal.test.js` and `artifacts/purchase-invoice/custom/__tests__/ImportFromGoodsReceiptModal.test.js` provide source-level coverage for currency-match filtering (kept when currency matches, excluded on mismatch, never excluded when there is no linked order to compare against) and the correct `noCurrencyMatchMessageKey` per modal (`noPurchaseOrdersMatchCurrency` / `noGoodsReceiptsMatchCurrency`).
- `tools/app-shell/src/components/contract-ui/__tests__/ImportLinesModal.vitest.jsx` covers the shared `noCurrencyMatchMessageKey` prop and `excludedByCurrency` state consumed by both modals.
- `cli/test/etp4029-currency-filter-keys.test.js` is a dedicated i18n parity test asserting the 5 new currency-filter keys (including `noPurchaseOrdersMatchCurrency` and `noGoodsReceiptsMatchCurrency`) exist identically in both `en_US.json` and `es_ES.json`.

**Automated evidence (ETP-3995)**:
- `artifacts/purchase-invoice/decisions.json` — `window.extraTabs` declares the SIF tab (`key: 'sif'`, `labelKey: 'sifDataTabs.sectionTitle'`, `component: 'SifTab'`, `importFrom: '@/windows/custom/shared/SifTab.jsx'`).
- `artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx` — imports `SifTab` and includes `{ key: 'sif', labelKey: 'sifDataTabs.sectionTitle', Component: SifTab, placement: 'tab' }` in the `customTabs` prop.
- `artifacts/purchase-invoice/custom/PurchaseInvoiceBottomPanel.jsx` — `SifDataTabs` import and `notesExtra` prop removed; SIF data is now shown in the primary SIF tab instead.
- `tools/app-shell/src/windows/custom/purchase-invoice/index.jsx` — `customTabs` prop removed from the `<HeaderPage>` call so the generated `customTabs` (including the SIF tab) is not overridden.
- `cli/test/generate-frontend-extra-tabs.test.js` (18 source-reading tests) covers `decisions.json` declarations, generated import and `customTabs` entries, generator source patterns, and wrapper integrity for both purchase-invoice and sales-invoice.
- `e2e/tests/flows/sif-tab.mocked.spec.js` — mocked Playwright spec verifying the SIF tab button appears in the detail tab strip for both invoice windows.
- **ETP-3995 — Related Documents tab i18n**: The generated `HeaderPage.jsx` now uses `labelKey: 'relatedDocuments'` instead of the hardcoded `label: 'Related Documents'` string.
- `e2e/tests/flows/purchase-invoice-readonly-processed.mocked.spec.js` — mocked Playwright spec verifying that all principal header fields (`businessPartner`, `partnerAddress`, `paymentMethod`, `paymentTerms`, `priceList`) are disabled when `processed: true`; also verifies `orderReference` remains editable as a regression guard.

## Read-only enforcement on completed invoices — ETP-4012

### Problem

Three header fields — `businessPartner` (UI label "Contacto"), `partnerAddress` (UI label "Dirección"), and `userContact` — were remaining editable after an invoice was completed (i.e., after `processed` became `true`). All three had been given `"readOnlyLogic": null` in `decisions.json`, which silenced the original AD `readOnlyLogic` value and caused the generator to emit no `readOnlyLogic` function at all, leaving the fields permanently editable in the frontend.

### Root cause in detail

The original AD `readOnlyLogic` for `businessPartner` was:

```
@Processed@='Y' | @HAS_C_INVOICELINES@='Y'
```

When this was first restored in `decisions.json`, the generator parsed the expression and encountered `@HAS_C_INVOICELINES@`, which is a session variable rather than a regular record field. Because the generator could not map it to a record property, it marked the expression `evaluable: false` and emitted `readOnlySource: 'server'` with no JS function. Since the `evaluate-display` endpoint was not returning a value for this field, the frontend received no instruction to lock the field and it remained editable.

### Final fix

The expression was simplified to `"@Processed@='Y'"` for all three affected fields. This expression references only `processed`, a standard record field that the generator maps directly. The generator now emits:

```js
readOnlyLogic: (record) => record['processed'] === true
```

in `HeaderForm.jsx` for `businessPartner`, `partnerAddress`, and `userContact` — consistent with the pattern used by all other principal fields on this document (e.g. `paymentMethod`, `paymentTerms`, `priceList`). The `@HAS_C_INVOICELINES@` clause was intentionally dropped: its purpose (preventing partner changes once lines exist) is already enforced by the custom `index.jsx` component, which blocks line creation until a business partner is selected and disallows partner changes once lines are present.

### Fields fixed

| Field key | UI label | Old `readOnlyLogic` in `decisions.json` | New value |
|---|---|---|---|
| `businessPartner` | Contacto | `null` | `"@Processed@='Y'"` |
| `partnerAddress` | Dirección | `null` | `"@Processed@='Y'"` |
| `userContact` | Contacto (usuario) | `null` | `"@Processed@='Y'"` |

### `orderReference` — intentionally editable after completion

The `orderReference` field (DB column `POReference`, displayed as "Nº documento") does not carry a `readOnlyLogic` value in `decisions.json` and none is emitted in `HeaderForm.jsx`. This is intentional: the original AD metadata defines no read-only rule for this field, and the business requirement is that users can correct the supplier's document reference on a completed invoice without needing to reactivate it. Any future attempt to add a `readOnlyLogic` to `orderReference` must be treated as a regression.

### Regression test

`e2e/tests/flows/purchase-invoice-readonly-processed.mocked.spec.js` — mocked Playwright spec that opens a completed invoice (`processed: true`) and asserts:
- `businessPartner`, `partnerAddress`, `paymentMethod`, `paymentTerms`, and `priceList` inputs have the `disabled` attribute.
- `orderReference` input does **not** have the `disabled` attribute.

## Hidden delete button on completed invoices — ETP-4012

### Problem

The Delete button (trash icon) remained visible in the detail toolbar when a Purchase Invoice was in Completed (`CO`) status. Although the action failed with an error, the button should not be visible at all on a completed document — consistent with Sales Invoice, Purchase Order, Goods Shipment, and other document windows.

### Fix

Added `"hideDeleteWhenComplete": true` to `artifacts/purchase-invoice/decisions.json → window`. The generator emits this as the `hideDeleteWhenComplete` prop on `DetailView`, which uses `isDeleteVisibleForRecord` to hide the trash button whenever `documentStatus` is not in `['DR', 'RPAP']`.

### Manual verification

Open a completed purchase invoice (`✓ Completado` badge). Confirm the trash icon is **not** visible in the detail toolbar. Open a draft invoice and confirm the trash icon **is** visible.

## Currency and exchange rate on the header — ETP-4029

Purchase invoices carry the same currency/exchange-rate editing model already shipped for sales/purchase orders and quotations in ETP-4027: the invoice header currency is user-editable, a per-invoice rate override can be set, and that rate is kept in sync with the accounting-facing exchange-rate record as the invoice evolves. This is a header/business-logic layer distinct from (and a prerequisite for) the **Exchange Rates** secondary tab and completion guard documented in the "ETP-4030" section below.

### Header currency field and `CurrencyRatePicker`

- `header.currency` in `artifacts/purchase-invoice/decisions.json` is `visibility: "editable"`, `form: true`, `section: "principal"`, `readOnlyLogic: "@Processed@='Y'"` — editable while the invoice is draft, locked once completed. The field was already `editable` before ETP-4029, but hidden (`section: "other"`, `form: false`); ETP-4029 moved it into the visible principal section.
- A new hidden field, `eTGOCurrencyRate` (`visibility: "editable"`, `form: false`, `grid: false`), stores the per-invoice exchange-rate override (`C_INVOICE.EM_ETGO_Currency_Rate`, `NUMERIC(20,12)`, nullable — the same column, shared with sales-invoice, since both live on `C_INVOICE`). It is writable by NEO but not rendered as its own form field; `CurrencyRatePicker` reads/writes it as part of the currency selection.
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx` renders the `CurrencyRatePicker` component (searchable currency selector with an inline rate editor, shared with sales-order/purchase-order/sales-quotation/sales-invoice) instead of the plain `SelectorInput` whenever the field's column is `C_Currency_ID`, the entity is `header`, and the current URL matches `/(sales-order|purchase-order|sales-quotation|sales-invoice|purchase-invoice)(\/|$)/`. Selecting a currency calls the `currencyOptions` header action to list currencies reachable from the org currency (with their rates) and PATCHes `currency`, `currency$_identifier`, and `eTGOCurrencyRate` together.
- Unlike sales-invoice, `artifacts/purchase-invoice/decisions.json`'s `entities.lines` has no currency field declared at all (no `cCurrencyId` entry) — `C_InvoiceLine` has no `C_Currency_ID` column on either invoice direction, so there is nothing to expose or sync at the line level.

**Known field-order gap (not yet fixed, confirmed against live code):** the ticket behind ETP-4029 calls for "Currency, then Price List" order in the header form. `priceList` in `artifacts/purchase-invoice/decisions.json` carries an explicit `"seq": 70`, while `currency` has no `seq` at all. The generator's form-field sort (`generate-frontend.js`) always places a field that has *any* `seq` value before one that has none, regardless of the seq number — so **Price List currently renders before Currency** on the purchase-invoice header, the opposite of the intended order. (Sales-invoice does not have this problem: neither field has a `seq` there, so the natural DB-extraction order in `contract.json` — which already puts `currency` before `priceList` — applies.) Fixing this requires either giving `currency` a lower explicit `seq` than `70`, or removing `priceList`'s `seq` so natural order takes over — the exact fix must be validated against `contract.json`'s field order before applying it.

### Backend wiring

- `CurrencyOptionsHandler` (`@Named("currencyOptionsHandler")`) resolves the org/client/date context needed to list currency options. For invoice specs (`context.getSpecName()` containing `"invoice"`) it loads via `Invoice.class` and uses `getInvoiceDate()`; for order specs it uses `Order.class` and `getOrderDate()` as before. `PurchaseInvoiceHeaderHandler` `@Inject`s `CurrencyOptionsHandler` and passes it into `NeoHeaderActionRouter.dispatch(...)`, exposing `GET /sws/neo/purchase-invoice/header/{id}/action/currencyOptions`.
- `PurchaseInvoiceHeaderHandler` now implements `afterCallout()` (previously absent), calling `blockCalloutCurrencyUpdate` (strips any callout-pushed `currency` value so currency only ever changes by direct user selection) and `checkExchangeRateWarning` (appends a `WARNING` message when the user changes currency to one with no `C_Conversion_Rate` on the invoice date) — both implemented once on the shared `AbstractInvoiceHeaderHandler` base and called explicitly from the subclass, mirroring the order-side handlers from ETP-4027.
- `PurchaseInvoiceHeaderHandler.afterHandle()` calls `AbstractInvoiceHeaderHandler.autoCreateOrUpdateConversionRateDocument(context)` unconditionally as its first line, on every successful header POST/PATCH/PUT — before its existing method-gated logic (e.g. `persistOriginInvoice`, which is POST/PUT-only). It upserts the `C_Conversion_Rate_Document` row for the invoice whenever the invoice currency differs from the org currency and an `eTGOCurrencyRate` override is set, recomputing `foreign_amount = grandTotalAmount × (1 / eTGOCurrencyRate)` each time. This keeps the exchange-rate record in sync as the invoice's total changes while lines are added or edited. `InvoiceLineHandler.afterHandle()` calls the same upsert (via its `String`-based overload, resolving the parent invoice ID from the line save) on every line POST/PATCH/PUT, so the rate document also stays current as lines are added one at a time rather than only on header save.

### Rate inheritance when an invoice is created from an order

`InvoiceFromOrderSupport.propagateOrderRateToInvoice(order, invoice)` — already responsible for creating the initial `C_Conversion_Rate_Document` row when an invoice is generated from a source order that has `EM_ETGO_Currency_Rate` set — now also copies the rate onto the invoice's own column: `invoice.setETGOCurrencyRate(rate)`. This single method is shared by both `CreateDraftInvoiceHandler` (sales, invoked from quotations and sales orders) and `CreatePurchaseInvoiceHandler.createFromOrder()` (purchase, invoked when creating a purchase invoice directly from a purchase order), so `currency`, `priceList`, and `eTGOCurrencyRate` are all inherited together on that path.

**Confirmed gap — Goods Receipt → Purchase Invoice:** `CreatePurchaseInvoiceHandler.createFromReceipt()` (the path used when generating a purchase invoice from a goods receipt that itself carries a linked purchase order) copies `currency` and `priceList` from the linked order via the same `NeoCommercialDocumentFactory` method used by `createFromOrder()`, but it does **not** call `propagateOrderRateToInvoice(...)`. That call exists only in `createFromOrder()`. The net effect: an invoice created from a goods receipt linked to a non-org-currency purchase order gets the correct currency and price list, but not the exchange rate or the `C_Conversion_Rate_Document` row — the invoice is left as if the currency had just been set for the first time with no rate override, until the user opens `CurrencyRatePicker` and sets one manually. `createFromReceiptNoPo()` (a receipt with no linked order at all) is unaffected by this gap since there is no source rate to inherit in the first place — a newly created invoice without an inherited rate goes through the same unconditional `autoCreateOrUpdateConversionRateDocument` path as any other invoice once a rate is eventually set.

### Manual verification

1. Open a new purchase invoice and confirm the currency field renders as the searchable `CurrencyRatePicker` (not a plain dropdown), listing currencies reachable from the org currency with their rates. Note the current field-order gap: Tarifa currently renders before Moneda, the opposite of the intended order.
2. Select a non-org currency with a defined `C_Conversion_Rate`: confirm no warning appears and the field commits normally.
3. Select a non-org currency with no defined rate: confirm a warning message appears.
4. Save the invoice, add a line, and confirm the invoice's Exchange Rates tab (ETP-4030 section below) reflects an updated `foreignAmount` as the grand total changes — without needing to touch the exchange-rate row directly.
5. Create a purchase invoice directly from a completed purchase order that has a non-org currency and a set exchange rate; confirm the new invoice inherits currency, price list, and the same rate, and that a `C_Conversion_Rate_Document` row exists for it.
6. Create a purchase invoice from a goods receipt that is linked to a non-org-currency purchase order; confirm currency and price list are inherited but be aware the exchange rate is **not** currently inherited on this path (known gap above) — the invoice will show no rate until one is set manually.

### Automated evidence

- `artifacts/purchase-invoice/decisions.json` — `header.currency` (editable/principal/`readOnlyLogic`) and `eTGOCurrencyRate` (editable, hidden) field declarations.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/CurrencyOptionsHandler.java` — branches on `context.getSpecName()` to resolve via `Invoice.class`/`getInvoiceDate()` for invoice specs vs `Order.class`/`getOrderDate()` for orders.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractInvoiceHeaderHandler.java` — shared `blockCalloutCurrencyUpdate`, `checkExchangeRateWarning`, and `autoCreateOrUpdateConversionRateDocument` (both the `NeoContext` and `String` overloads) methods, called explicitly from each invoice header subclass.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/PurchaseInvoiceHeaderHandler.java` — injects `CurrencyOptionsHandler` into `NeoHeaderActionRouter.dispatch(...)`; `afterCallout()` calls `blockCalloutCurrencyUpdate`/`checkExchangeRateWarning`; `afterHandle()` calls `autoCreateOrUpdateConversionRateDocument(context)` unconditionally before its existing method-gated logic (e.g. `persistOriginInvoice`).
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InvoiceLineHandler.java` — calls the `String`-based `autoCreateOrUpdateConversionRateDocument` overload from `afterHandle()` on every line save.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InvoiceFromOrderSupport.java` — `propagateOrderRateToInvoice()` sets `invoice.setETGOCurrencyRate(rate)` in addition to creating the `C_Conversion_Rate_Document` row; called from `CreatePurchaseInvoiceHandler.createFromOrder()` (not from `createFromReceipt()` — see the confirmed gap above) and from `CreateDraftInvoiceHandler` (sales).
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx` — `isCurrencyRateSelectorField()` includes `sales-invoice|purchase-invoice` in its URL match regex.
- `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` — dual-currency computation via `useDocumentCurrency`/`useCurrencyPrecision`, feeding the shared `SummaryCard` component (same mechanism documented in `sales-invoice.md`); covered by `InvoicePreview.vitest.jsx` (`describe('dual-currency via useDocumentCurrency (ETP-4029)')`).
- `docs/plans/ETP-4029-currency-invoice.md` records the full implementation trace, including the Phase 7 gap analysis (the field-order fix needed on purchase-invoice, the BP-linked price-list fallback already working via the classic `SE_Invoice_BPartner` callout, and the receipt-path rate-inheritance gap detailed above).

## Exchange rates and completion currency guard — ETP-4030

When a purchase invoice is issued in a currency other than the organization's base currency, it needs a conversion rate so the document can be valued in the base currency. ETP-4030 adds an **Exchange Rates** secondary tab to enter/maintain that document-level rate, recomputes the rate ⇄ foreign-amount pair server-side, and blocks completion when no usable rate exists. The same behavior is shared with `sales-invoice.md`.

### Exchange Rates secondary tab

- Declared in `artifacts/purchase-invoice/decisions.json → window.secondaryTabs.exchangeRates` (`label: "Exchange Rates"`, `tabOrder: 50`) and resolved as the `exchangeRates` child entity (`javaQualifier: "invoiceExchangeRateHandler"`). The tab maps to the document conversion-rate records (`C_Conversion_Rate_Doc`) tied to the invoice header.
- **Visible columns:** Currency (derived from the document, `form: false`), To Currency, Rate, and Foreign Amount. The inline add-row exposes `addLineFields: ["toCurrency", "rate", "foreignAmount"]` — Currency is filled from the parent rather than typed.
- **`requireSavedRecord: true`** — the tab is only usable once the invoice header has been saved (a document rate needs a persisted invoice to attach to).
- **`readOnlyLogic: "@DocumentStatus@!='DR'"`** — rows are editable only while the invoice is in Draft (`DR`); once completed, the tab is read-only.

### Server-side rate ⇄ foreign-amount recompute

The `invoiceExchangeRateHandler` (`modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InvoiceExchangeRateHandler.java`) keeps `rate` and `foreignAmount` consistent against the invoice grand total so the user only ever has to type one side:

- **On create (POST):** defaults `currency` and `toCurrency`, then computes the missing side from the invoice grand total.
- **On edit (PATCH/PUT):** the inline editor submits **both** `rate` and `foreignAmount` (including the stale side), so the handler uses change-detection — it compares the incoming values against the persisted record and recomputes only the side that actually changed:
  - rate changed → `foreignAmount = grandTotal × rate`
  - foreignAmount changed → `rate = foreignAmount ÷ grandTotal` (scale `RATE_SCALE`, `HALF_UP`)
  - both unchanged, both supplied equal, or a zero grand total → no-op (returns `null`, default CRUD proceeds).

### Frontend live refresh

NEO wraps the saved row as `{ response: { data: [ … ] } }`. `tools/app-shell/src/components/contract-ui/DetailView.jsx` unwraps `updated?.response?.data?.[0]` on secondary-tab save (both the inline and form-save paths) and merges the server values back into the row and the grid, so the recomputed amount appears immediately — the user no longer has to leave the form and reopen the invoice to see it.

### Completion currency guard

`InvoiceExchangeRateValidator.checkRateForCompletion(invoice)` runs as a pre-hook from `PurchaseInvoiceHeaderHandler` and blocks completion when:

1. the document currency differs from the organization's base currency (`OBCurrencyUtils.getOrgCurrency`), **and**
2. there is no document-level rate (`C_Conversion_Rate_Doc` with a non-zero rate), **and**
3. there is no general rate for the pair on the invoice date (the `conversion-rates` window / AD `C_Conversion_Rate`, via `FinancialUtils.getConversionRate`).

The block surfaces the message `SMFCR_NoRateOnComplete` followed by the currency pair (e.g. `USD → EUR`). When the currencies match, or any rate is available, completion proceeds. See `conversion-rates.md` for the general-rate catalog this guard consults.

### Manual verification

1. Open a draft purchase invoice in a foreign currency and save it. Confirm the **Exchange Rates** tab appears (and is absent / disabled until the header is saved).
2. Add a row: set To Currency and type a Rate. Save and confirm Foreign Amount is computed = grand total × rate and shown without reopening the invoice.
3. Edit the row's Foreign Amount. Save and confirm Rate is recomputed = foreign amount ÷ grand total, live.
4. Complete the invoice with **no** rate present and no general rate for the pair: confirm completion is blocked with `SMFCR_NoRateOnComplete <FROM> → <TO>`.
5. Add the document rate (or a matching `conversion-rates` record) and confirm completion now succeeds.
6. On a completed invoice, confirm the Exchange Rates tab is read-only.

### Automated evidence

- `artifacts/purchase-invoice/decisions.json` declares `window.secondaryTabs.exchangeRates` and the `exchangeRates` entity (`javaQualifier: "invoiceExchangeRateHandler"`, `active` system-hidden, grid fields currency/toCurrency/rate/foreignAmount).
- `artifacts/purchase-invoice/generated/web/purchase-invoice/ExchangeRatesTable.jsx` and `ExchangeRatesForm.jsx` are the generated secondary-tab surfaces.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InvoiceExchangeRateHandler.java` implements the POST default/compute and PATCH change-detection recompute; `InvoiceExchangeRateValidator.java` implements `checkRateForCompletion` consumed by `PurchaseInvoiceHeaderHandler`. Source-level coverage in `modules/com.etendoerp.go/src-test/.../InvoiceExchangeRateHandlerTest.java` and `InvoiceExchangeRateValidatorTest.java`.
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

## Fiscal-status staleness fix in invoice preview — ETP-4391

`useFiscalStatus.js` (`tools/app-shell/src/windows/custom/shared/useFiscalStatus.js`) is
shared by the invoice preview modal's General tab across both `sales-invoice` and
`purchase-invoice`. The hook previously never re-fetched the SII/TBAI/Verifactu status
pills after a successful **Enviar a SIF** send performed inside the same open preview
session (its fetch effect had no dependency that changed as a result of the send), so the
SII status pill (the only one of the three that applies to purchase invoices — see
`purchase-invoice.md` "Reactive behavior and dependencies" above) could keep showing a
stale pre-send value. The fix and full root-cause writeup live in
[`sales-invoice.md` — "TBAI status staleness fix in invoice preview — ETP-4391"](sales-invoice.md#tbai-status-staleness-fix-in-invoice-preview--etp-4391);
only the spec name and which of the three panels apply differ between the two windows.

## Bank transfer (PIS) via Salt Edge — ETP-4406

Purchase invoices can now be paid by a **real bank transfer** initiated inline from the
"Añadir pago" modal (`NewPaymentEntryModal.jsx`), instead of only recording a manual payment.
The transfer is handed off to the existing PSD2 / Salt Edge **PIS** (Payment Initiation Service)
engine — this window contributes the glue, not a new integration.

### Visibility gate (frontend)

The PIS block (`data-testid="cp-pis-section"`) renders after the balance summary, before the
footer, only when **all** hold (mirrors the backend's own eligibility check, so it is deliberately
heuristic, not exhaustive):

- direction is **payment out** (`dir === 'out'` — purchase invoice), and
- the selected financial account is **PSD2-connected** (`psd2Connected`, sourced from the
  enriched `invoiceAccounts` action — same `EM_PSD2_Connection_Status='CO'` check as
  `FinancialAccountsPageHandler`), and
- the payment method looks like a transfer (name contains "transfer"/"transferencia"), and
- the account currency is **EUR** or **GBP** (`PIS_ELIGIBLE_CURRENCIES`).

The block offers a **payment template** select (`cpPisTemplateLabel` — SEPA / DOMESTIC / FPS,
from the AD "Template List for Bank Payments" ref-list, defaulting by currency: EUR→SEPA,
GBP→FPS) and a **destination IBAN** select (`cpPisIbanLabel`, the supplier's
`C_BP_BankAccount` IBANs, or a hand-typed one), plus an amber transfer summary and an SCA hint.
The primary footer button changes to **"Continuar al banco"** (`cpPisConfirmButton`).

### Confirm behavior

On confirm with `pis: true`, the `registerPayment` action creates and links the `FIN_Payment`
and **processes it to status `PPM`** ("Payment Made") — applied to the invoice but with **no
`FIN_Finacc_Transaction` yet**. The bank transaction is created only once Salt Edge confirms
execution, by the PSD2 module's own `PisPaymentCallback` → `PISTransactionUtils` (idempotent).
To keep config and runtime aligned, connecting an account to PSD2 **from Etendo Go** clears the
transfer method's **Automatic Withdrawn** flag (`FinancialAccountPsd2Handler`) — Payment OUT
only; Automatic Deposit is left untouched, since PIS only initiates outbound transfers.

The response carries `pisPaymentUrl` + `pisPaymentId`; the modal opens the Salt Edge SCA widget
in a popup and polls the `pisPaymentStatus` action every ~3s. The popup returns to Etendo Go's
own auto-closing SPA callback route (`financial-account/pis-callback`, `PisCallbackPage.jsx`),
which posts a `pis-completed` message to the opener and closes itself — the user never sees the
Classic-styled shared bank-auth result page. On `executed` the modal shows a success toast and
refreshes; on failure/cancel it returns to an editable draft (the `cancelPisPayment` action
reactivates + removes the unauthorized payment). The non-PIS path is byte-for-byte unchanged.

### Payment history badge

Payments that have a linked `PSD2_PIS_PAYMENT` row show a **"Realizado vía PSD2"** badge
(`cpPisViaLabel`) in the history modal. The flag comes from a direct `OBCriteria<PisPayment>`
query in the GO module (`PisPaymentService.hasLinkedPisPayment`), not a new PSD2-module method.

### Where the code lives

- Frontend: `NewPaymentEntryModal.jsx` (PIS block + polling), `PisCallbackPage.jsx` (callback route),
  `InvoicePaymentHistoryModal.jsx` (badge). All `cpPis*` keys are in both `es_ES.json` / `en_US.json`.
- Backend (`com.etendoerp.go`): `PaymentRegistrationService` (enriched `invoiceAccounts`, PIS branch
  of the advanced register flow), `PisPaymentService` (`pisPaymentStatus`, `cancelPisPayment`,
  `pisTemplates`, `pisSupplierAccounts`, `applyOverpaymentAndInitiatePis`), `PisPaymentBridge`
  (composes the public PSD2 `GenerateBankPayment` with Etendo Go's own `return_to`).

Scope v1: purchase invoices only, EUR (SEPA) / GBP (FPS). Out of scope: receipts, batch/multi-invoice
PIS, other currencies, scheduled payments.

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.
