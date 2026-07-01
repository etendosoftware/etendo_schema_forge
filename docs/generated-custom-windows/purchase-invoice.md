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
- A **SIF** tab (Suministro Inmediato de Facturación) is available in the detail tab strip when the organisation is configured for at least one fiscal target. The tab is declared in `decisions.json → window.extraTabs` and rendered by the shared `tools/app-shell/src/windows/custom/shared/SifTab.jsx` component. For purchase invoices the SII panel uses the `aeatsiiClaveTipoFc` field and the purchase-specific invoice type options (F6 / LC / F5 / F1); TBAI is not shown for purchase invoices; Verifactu is not shown for purchase invoices. When no fiscal target is active the tab body shows an empty-state message. Editable fields are patched immediately on blur via `PATCH /sws/neo/purchase-invoice/header/{id}`.

## Reactive behavior and dependencies

- Header defaults are visible in the contract for invoice date and accounting date (`@#Date@`), document status (`DR`), currency, and zeroed payable amounts such as total paid and outstanding amount.
- The `date` field in `AddPaymentModal.jsx` (the "New payment" popup triggered from the invoice detail) uses the generic `DateField` component (`tools/app-shell/src/components/ui/date-field.jsx`) — Figma-aligned calendar popover with always-visible calendar icon, month/year picker, and Etendo yellow hover on filled-black elements. These defaults matter because a new payable document starts as draft and incomplete before lines and payment activity exist.
- Partner address is a dependent selector filtered by the selected business partner. The business partner also drives header callouts, and the custom page blocks line creation until a business partner is present.
- The purchase order reference is part of the header contract and is used by the custom related-documents surface to show the linked purchase order and to fetch related goods receipts for the same order. The related-documents component fetches the full purchase order record via `fetchById('purchase-order', 'header', ...)` so the chip renders the formatted title (`Order #<documentNo>`), the grand total amount with currency symbol, and the document status — matching the same visual style used by the sales-invoice related-documents chip. The supplier invoice reference (`orderReference`, DB column `POReference`, displayed as `Document No.` / `Nº documento`) is a free-text header field surfaced in the detail form so the user can reconcile the invoice against the supplier's own paper document; it stays editable after completion in this instance because AD metadata does not define a read-only rule for it.
- The detail bottom panel (`PurchaseInvoiceBottomPanel`) delegates totals display to the generic `DocumentTotalsPanel`. It computes subtotal, discount, tax (as `grand total − net subtotal`), and total client-side from the saved lines plus the live add-row (`pendingLine`) and sidebar editing (`editingLine`), so amounts update in real time as the user types. The `etgoDiscount` column is always visible in the lines grid and the add-row — there is no toggle. "Subtotal sin descuento" and "Descuento por producto" rows auto-appear when `discountAmt > 0` (at least one existing or in-progress line carries a non-zero discount); both are read-only computed rows. A `+ Añadir descuento total` button appears below the totals when no total discount is active and at least one line exists; clicking it opens an interactive "Descuento total" section (checkbox + computed amount + percentage input). Unchecking the checkbox collapses the section and restores the button. On `onBlur`, `DetailView` fires `handleTotalDiscountChange(pct)` → `PATCH { etgoTotalDiscount: N }` → persists in `EM_Etgo_Total_Discount` on the `C_Invoice` header (best-effort, no reload). When the invoice is completed (`documentAction=CO`), `PurchaseInvoiceHeaderHandler` calls `TotalDiscountService.recalculate(headerId, isInvoice=true)` before the action reaches the CRUD layer: it deletes any existing `ETGO_DTO` discount lines, then creates one negative line per tax group (`GROUP BY c_tax_id`), proportional to each group's net subtotal — mirroring Classic `C_INVOICE_POST`. `InvoiceLineHandler` filters `ETGO_DTO` lines from all GET responses so they are never visible in the frontend. When the invoice is read-only (completed), `DocumentTotalsPanel` shows a static "Descuento total (X%) −Y€" row instead of the interactive panel.
- The line `tax` field is now a dropdown selector (Radix Select) instead of a free-text search input. The list of available taxes is loaded server-side via `GET /sws/neo/purchase-invoice/lines/selectors/C_Tax_ID` and is filtered by `IsSOTrx=N` (purchase taxes) and by the `VAL_Tax_IsSOTrx_Date` validation rule, which keeps only taxes whose `VALIDFROM` is on or before the invoice date (`COALESCE(@DateInvoiced@, @DateOrdered@)`). Previously this field rendered as a text search that always returned "Sin resultados" because the validation rule context was not populated. The tax rate percentage itself is not shown in the invoice line table; to inspect rate values navigate to the `/tax` catalog, where the `Rate` column uses a three-state tag: green `+N %` for positive rates, neutral `0 %` for zero, and red `−N %` for negative rates (withholdings).
- Line pricing follows `INVOICE_LINE_CONFIG` (see `docs/line-pricing-model.md`). The editable fields are `listPrice` (PriceList column) and `etgoDiscount` (`EM_Etgo_Discount`, a Number column added by `com.etendoerp.go`). `unitPrice` (PriceActual) is hidden; it is computed at POST/PATCH as `listPrice × (1 − etgoDiscount/100)`. The product selector provides the correct price-list price via `NeoSelectorService.enrichProductSelectorWithPrices`, which populates both the display-side fields and `_aux._PSTD/_PLIST` so `SL_Invoice_Product` returns the price-list price. Guard 1 in `DetailView.jsx` maps `standardPrice → listPrice` universally when `listPrice` is null or zero. Changing the product resets `etgoDiscount` to 0. `grossAmount` is computed client-side as `invoicedQuantity × listPrice × (1 − etgoDiscount/100) × taxFactor`. The `decisions.json` declares `lineEntityConfig: "invoice"`, which drives all of these behaviors via the generator and `DetailView.jsx`.
- The preview modal and the detail topbar both treat the invoice as a payable document. They read payment-plan and payment/payment-history data to show paid versus outstanding state, and they expose payment actions only when the invoice is completed and still has an outstanding balance.
- The detail topbar shows a payment-status pill only for completed invoices. The pill label and amount react to whether the invoice is fully paid or still pending, and clicking it opens the shared invoice payment modal.
- Two-step Pagos flow (ETP-4342): the payment pill opens the redesigned history popup **"Pagos de la factura"** (`InvoicePaymentModal.jsx`, step 1, `dir='out'`) — `DirBadge`, *Importe total* / *Saldo pendiente*, the list of registered payments (or an empty state), and a **"+ Añadir pago"** button shown only while the invoice is `CO` with outstanding > 0. It opens the **"Nuevo pago"** modal (`NewPaymentEntryModal.jsx`, step 2): *Cantidad*, *Fecha*, *Método de pago*, *Cuenta*, the conditional credit/abono section (AP credit memos only — no supplier credit accrual in it1), and the real-time balance summary with *Igualar*. Unlike collections, an **excess blocks Confirmar** with an inline "Exceso: …" error (no *Dar vuelto* / *Dejar a crédito* for payments in it1). **Guardar** → Borrador (draft), **Confirmar** → Depositado. Backend uses the same shared actions as sales (`invoicePaymentMethods`, `invoiceCreditSources`, extended `registerPayment` with `process`/`creditSources`, `confirmPayment`) via `RegisterPaymentOutHandler` → `PaymentRegistrationService` (isReceipt=false). The *Fecha* field is required (ETP-4005, carried into the two-step modal): clearing it disables **Confirmar**, and attempting to save with an empty date surfaces the `paymentDateRequired` error and a red border on the field.
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
  - `tools/app-shell/src/windows/custom/shared/InvoicePaymentModal.jsx` — uses `useApiFetch()` for authenticated payment-plan, payment-history, financial-account, and register-payment requests instead of receiving token props.
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

**Import from Goods Receipt** (`artifacts/purchase-invoice/custom/ImportFromGoodsReceiptModal.jsx`):
- Lists completed goods receipts (`documentStatus=CO`) for the same supplier with `invoiced !== true`.
- Each receipt row shows its backing purchase order number (`salesOrder$_identifier`) as the secondary label (right side of the row), not the line total.
- Receipt lines carry no price; prices are resolved via the `/purchase-invoice/lines/callout` cascade (same pattern as `ImportFromShipmentModal` on the sales side).
- Already-imported lines are detected via `goodsShipmentLine` / `M_InOutLine_ID` on existing invoice lines.
- The backing PO line (`salesOrderLine` on the receipt line) is looked up in `/purchase-order/lines/{id}` to carry the line-level discount into the invoice.
- POST body: `goodsShipmentLine`, `salesOrderLine`, `invoicedQuantity`, `unitPrice`, `listPrice`, `etgoDiscount`, `tax`, `uOM`, `lineNo`.

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
