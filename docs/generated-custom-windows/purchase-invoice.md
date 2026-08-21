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
- Copy a direct link to a record — from the list selection bar when exactly one row is selected, or from the record detail view once the record is saved.

## Interaction model

- Route: `/purchase-invoice` for the list and `/purchase-invoice/:recordId` for create/edit detail.
- Visibility: visible from the Purchases menu.
- Implementation type: custom window override registered in `tools/app-shell/src/windows/registry.js`, combining generated header/detail scaffolding with custom list preview, topbar, line table, bottom panel, and related-documents behavior.
- Window shape: master-child. The master record is the invoice header and the main child dataset is invoice lines; the detail page also surfaces a custom related-documents tab instead of relying on the generated payment secondary tabs.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. FK fields in line rows (product, tax, account, project, cost center, asset, and dimension fields) use `InlineSearchCombo`: a text input with server-side search that lets the user filter by typing — for example, typing "IVA" filters all matching tax rates. The add-line button, related-documents panel, notes panel, and totals panel are unchanged from the classic layout. See `docs/ui-customization.md` section 13 for the full reference.
- List interaction: the list uses a custom `PurchaseInvoiceHeaderTable` component (`tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx`). The visible columns, in order, are: Invoice Date (no dot indicator), Document No. (`POReference`, relabeled through `window.labelOverrides`), Due Date (4-state dot computed from the row's `outstandingAmount` and shown as "—" when no due date exists on the row). The four states use the Etendo Figma tokens: **paid** (`outstandingAmount ≤ 0`, dot `green-600 #26A95F`) wins over any date-based state, **overdue** (dueDate before today and outstanding still pending, dot `red-500 #F53D6B` with the date text reinforced in `red-700 #D50B3E`), **soon** (dueDate within the next 7 days with outstanding pending, dot `yellow-600 #FAAF00`), and **ok** (anything further out, dot `gray-400 #8A8AA3`). Date-only invoice and due-date values are normalized as local calendar dates before rendering so same-day invoices do not shift backward because of timezone conversion, and the final rendered date follows the active app locale just like `Invoice Date`. Business Partner, Document Status, Total Gross Amount, **Pending Payment** (the AD `OutstandingAmt` column relabeled via `window.labelOverrides` from "Total Outstanding" to "Pending Payment" / "Pendiente de pago" so the grid reads in payment terms rather than ledger terms), and **Delivery Status** (a percent progress bar driven by the virtual AD column `em_etgo_delivery_status` on `c_invoice` — calculated server-side from `m_matchinv` + `m_matchsi` quantity-weighted against `qtyinvoiced`; 0% when no matching exists yet, 100% when fully matched, intermediate when partial) complete the list. When the fiscal profile enables SII for the organisation, an **SII Status** badge column is injected between Document Status and Total Gross Amount. The badge reads `row.aeatsiiEstado` directly from the list API response — no secondary fetch is needed (ETP-4125 eliminated the batch `useInvoiceListFiscalStatus` hook that previously caused HTTP 403 errors on large invoice lists due to nginx URL-length limits). The badge component is `FiscalStatusBadge` from the shared module. **Verifactu and TBAI are sales-only fiscal systems — they never appear as columns or badges in the purchase-invoice list.** Selecting a row opens a preview modal instead of navigating directly to the detail route. **ETP-4833:** the doc-type badge and the four `outstandingAmount` badges/buttons (`Aplicada`, `Saldo a favor · X €`, `Pagada`, and the pending-payment button) all declare `whiteSpace: 'nowrap'` (plus `flexShrink: 0` on the four flex-based ones, via the shared `NOWRAP_FLEX` style const) so two-word labels and amount+icon content never wrap onto a second line when the grid's column width shrinks.
- Detail interaction: the record page uses the generated header page with a custom lines table, a custom topbar, summary amounts, notes editing, footer totals, and related-document chips. The principal header section shows `POReference` as `Document No.` / `Nº documento`, placed right after `Business Partner`, while the internal AD `documentNo` field stays hidden in this custom workflow. `POReference` remains editable after completion here, matching the current Classic metadata for this field.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.
- A **SIF** tab (Suministro Inmediato de Facturación) is available in the detail tab strip when the organisation is configured for SII (TBAI and Verifactu are not shown for purchase invoices at all — see below). The tab is declared in `decisions.json → window.extraTabs` and rendered by the shared `tools/app-shell/src/windows/custom/shared/SifTab.jsx` component. For purchase invoices the SII panel uses the `aeatsiiClaveTipoFc` field and the purchase-specific invoice type options (F6 / LC / F5 / F1). **ETP-4401:** the per-invoice `tbaiIssent` field (and its sibling `tbaiSequence`/`tbaiInvoicenum`/`tbaiInvoiceseq` fields on the sales side) now carries an explicit `"visibility": "discarded"` override in `decisions.json` so it no longer reaches the frontend contract, because TBAI chaining sequences are now generated automatically per fiscal configuration by the `TbaiConfigSequenceHandler` NeoHandler instead of being tracked per invoice. When no fiscal target is active for the organisation, the SIF tab now disappears entirely from the detail tab strip instead of showing an empty-state message: `SifTab.jsx` reports its own visibility via the `onVisibilityChange` callback that `tools/app-shell/src/components/contract-ui/DetailView.jsx` passes to every `placement: 'tab'` custom tab, and the view redirects to the first remaining tab if the hidden tab was the active one. Editable fields are patched immediately on blur via `PATCH /sws/neo/purchase-invoice/header/{id}`.
- **Line-level "tax needs SIF configuration" shortcut (ETP-4888 point 5):** on the lines grid's `tax` cell, an amber warning-color badge (`text-status-warning-foreground`) renders inline right next to the tax value itself (`InlineLinesPanel`'s `cellBadges` slot, `docs/ui-customization.md` §14e) ONLY when the selected tax is missing its TBAI/Verifactu key — never for SII, which has nothing to configure at tax level (its equivalent, `aeatsiiCauseExemption`, lives on the invoice header and is handled by the SIF tab above, unaffected by this feature). Clicking it opens `TaxSifModal.jsx` — a standalone dialog shared with sales-invoice (own vertical layout: tax-name pill, single-line label, `EnumSearchSelect` code+description picker, caption, footer — see `docs/ui-design-guidelines.md`), that reuses `TaxSifField.jsx`'s pure `selectSifFields()` to show the same 0–2 applicable fields the Tax window's own header form would, and saves the fix directly without leaving the invoice. Gated by `decisions.json → window.lineTaxSifTrigger` (see `docs/decisions-reference.md`); the "missing" check is driven by a backend selector enrichment (`InvoiceLineTaxSifSelectorPolicy`, `com.etendoerp.go`) that projects the relevant `C_Tax` columns onto the tax selector's response, scoped to this window and sales-invoice only — see `docs/ui-customization.md` §14e for the full mechanism.

## Reactive behavior and dependencies

- Header defaults are visible in the contract for invoice date and accounting date (`@#Date@`), document status (`DR`), currency, and zeroed payable amounts such as total paid and outstanding amount. Currency is editable on the header via the `CurrencyRatePicker` component (see "Currency and exchange rate — ETP-4029" below), not a read-only defaulted value.
- **Capability-gated `posted` field/status pill (ETP-4520):** the header `posted` field (rendered as a `Posted`/`Not posted` status pill on the detail header and as a `Posted` boolean badge column in the grid) carries `"visibleWhenCapability": "showAccountingFields"` in `artifacts/purchase-invoice/decisions.json`, mirroring the sales-invoice implementation. This is resolved against `capabilities.showAccountingFields`, fetched once at role-selection via `GET /sws/neo/windowaccessmap` (NEO pseudo-spec bridge) and exposed through `useAuth().capabilities`. The field backs the `AD_Role.EM_ETGO_Show_Acct_Fields` ("Show Accounting Fields") checkbox — Etendo Classic-only for this MVP, no GO-app UI to toggle it — and the server resolves it with an Administrator bypass. A role without the capability never sees the column or the pill at all (the field is omitted, not disabled/hidden): `DataTable.jsx` filters the column out of `visibleColumns` and `DetailView.jsx` returns `null` for the status pill before it renders, both via the shared `isCapabilityVisible()` helper (`tools/app-shell/src/lib/capabilityVisibility.js`) fed by `useCapabilitiesSafe()`. Administrator sessions always see the field regardless of the checkbox.
- Unified document/accounting date (ETP-4531, redefined 2026-07-17): `accountingDate` (`DateAcct`) is `visibility: system` — fully hidden from the UI, not present in `frontendContract.entities.header.fields` at all. `invoiceDate` is the single visible date field. Per classic AD metadata, `C_Invoice.DateInvoiced` carries `AD_Column.AD_Callout_ID = com.etendoerp.sif.general.callouts.SifInvoiceOperationDateCallout`, which extends `org.openbravo.erpCommon.ad_callouts.SE_Invoice_AccountingDate` and auto-fills `dateAcct` from `dateInvoiced`. This cascade is now intentionally allowed to flow through untouched — the earlier `PurchaseInvoiceHeaderHandler#afterCallout` guard that stripped it (ETP-4531's original, now-superseded scope; see `docs/feedback.md`) has been removed on the `com.etendoerp.go` side, so saving the invoice writes the same date to both `invoiceDate` and `accountingDate` internally, and the accounting facts generated on posting reflect that unified value as the journal entry's accounting date.
- The `date` field in `AddPaymentModal.jsx` (the "New payment" popup triggered from the invoice detail) uses the generic `DateField` component (`tools/app-shell/src/components/ui/date-field.jsx`) — Figma-aligned calendar popover with always-visible calendar icon, month/year picker, and Etendo yellow hover on filled-black elements. These defaults matter because a new payable document starts as draft and incomplete before lines and payment activity exist.
- Partner address is a dependent selector filtered by the selected business partner. The business partner also drives header callouts, and the custom page blocks line creation until a business partner is present.
- The purchase order reference is part of the header contract and is used by the custom related-documents surface to show the linked purchase order and to fetch related goods receipts for the same order. The related-documents component fetches the full purchase order record via `fetchById('purchase-order', 'header', ...)` so the chip renders the formatted title (`Order #<documentNo>`), the grand total amount with currency symbol, and the document status — matching the same visual style used by the sales-invoice related-documents chip. The supplier invoice reference (`orderReference`, DB column `POReference`, displayed as `Document No.` / `Nº documento`) is a free-text header field surfaced in the detail form so the user can reconcile the invoice against the supplier's own paper document; it stays editable after completion in this instance because AD metadata does not define a read-only rule for it.
- The detail bottom panel (`PurchaseInvoiceBottomPanel`) delegates totals display to the generic `DocumentTotalsPanel`. It computes subtotal, discount, tax (as `grand total − net subtotal`), and total client-side from the saved lines plus the live add-row (`pendingLine`) and sidebar editing (`editingLine`), so amounts update in real time as the user types. The `etgoDiscount` column is always visible in the lines grid and the add-row — there is no toggle. "Subtotal sin descuento" and "Descuento por producto" rows auto-appear when `discountAmt > 0` (at least one existing or in-progress line carries a non-zero discount); both are read-only computed rows. A `+ Añadir descuento total` button appears below the totals when no total discount is active and at least one line exists; clicking it opens an interactive "Descuento total" section (checkbox + computed amount + percentage input). Unchecking the checkbox collapses the section and restores the button. On `onBlur`, `DetailView` fires `handleTotalDiscountChange(pct)` → `PATCH { etgoTotalDiscount: N }` → persists in `EM_Etgo_Total_Discount` on the `C_Invoice` header (best-effort, no reload). When the invoice is completed (`documentAction=CO`), `PurchaseInvoiceHeaderHandler` calls `TotalDiscountService.recalculate(headerId, isInvoice=true)` before the action reaches the CRUD layer: it deletes any existing `ETGO_DTO` discount lines, then creates one negative line per tax group (`GROUP BY c_tax_id`), proportional to each group's net subtotal — mirroring Classic `C_INVOICE_POST`. `InvoiceLineHandler` filters `ETGO_DTO` lines from all GET responses so they are never visible in the frontend. When the invoice is read-only (completed), `DocumentTotalsPanel` shows a static "Descuento total (X%) −Y€" row instead of the interactive panel.
- The line `tax` field is now a dropdown selector (Radix Select) instead of a free-text search input. The list of available taxes is loaded server-side via `GET /sws/neo/purchase-invoice/lines/selectors/C_Tax_ID` and is filtered by `IsSOTrx=N` (purchase taxes) and by the `VAL_Tax_IsSOTrx_Date` validation rule, which keeps only taxes whose `VALIDFROM` is on or before the invoice date (`COALESCE(@DateInvoiced@, @DateOrdered@)`). Previously this field rendered as a text search that always returned "Sin resultados" because the validation rule context was not populated. The tax rate percentage itself is not shown in the invoice line table; to inspect rate values navigate to the `/tax` catalog, where the `Rate` column uses a three-state tag: green `+N %` for positive rates, neutral `0 %` for zero, and red `−N %` for negative rates (withholdings).
- Line pricing follows `INVOICE_LINE_CONFIG` (see `docs/line-pricing-model.md`). The editable fields are `listPrice` (PriceList column) and `etgoDiscount` (`EM_Etgo_Discount`, a Number column added by `com.etendoerp.go`). `unitPrice` (PriceActual) is hidden; it is computed at POST/PATCH as `listPrice × (1 − etgoDiscount/100)`. The product selector provides the correct price-list price via `NeoSelectorService.enrichProductSelectorWithPrices`, which populates both the display-side fields and `_aux._PSTD/_PLIST` so `SL_Invoice_Product` returns the price-list price. Guard 1 in `DetailView.jsx` maps `standardPrice → listPrice` universally when `listPrice` is null or zero. Changing the product resets `etgoDiscount` to 0. `grossAmount` is computed client-side as `invoicedQuantity × listPrice × (1 − etgoDiscount/100) × taxFactor`. The `decisions.json` declares `lineEntityConfig: "invoice"`, which drives all of these behaviors via the generator and `DetailView.jsx`.
- The preview modal and the detail topbar both treat the invoice as a payable document. They read payment-plan and payment/payment-history data to show paid versus outstanding state, and they expose payment actions only when the invoice is completed and still has an outstanding balance.
- The detail topbar shows a payment-status pill only for completed invoices. The pill label and amount react to whether the invoice is fully paid or still pending, and clicking it opens the shared invoice payment modal.
- Two-step Pagos flow (ETP-4331/ETP-4342): the payment pill opens the history popup **"Pagos de la factura"** (`InvoicePaymentHistoryModal.jsx`, the unified component shared between sales and purchase invoice, `dir='out'`) — title + document-number badge header, a stats row (Proveedor · Importe total · Saldo pendiente), a table of registered payments (or an empty state), and a footer with the registered-count label and a **"+ Añadir pago"** pill button shown only while the invoice is `CO` with outstanding > 0. `InvoicePaymentModal.jsx` was removed — `InvoicePaymentHistoryModal.jsx` is now the single canonical component for both directions. It opens the **"Nuevo pago"** modal (`NewPaymentEntryModal.jsx`, step 2): *Importe*, *Fecha*, *Método de pago*, and *Cuenta* — all four marked required (red `*`) and gating **Guardar**/**Confirmar** until filled, where "Importe" is satisfied by the total applied (cash + used credit/abono), not the cash field alone, so a credit line covering 100% of the invoice (leaving cash at 0) still allows confirming — plus the conditional credit/abono section (Facturas Rectificativas de Compra with a negative total only, ETP-4738 — no supplier credit accrual in it1; see "Saldo a favor restricted to Facturas Rectificativas — ETP-4738" below) and the real-time balance summary with *Igualar*. Unlike collections, an **excess blocks Confirmar** with an inline "Exceso: …" error (payments never generate credit, so there is no leave-credit option; the former *Dar vuelto* / refund option was removed for both directions in ETP-4504). ETP-4504 also adds two conditional conversion fields (**Tasa de conversión** + **Importe en moneda de la cuenta**) shown only when the invoice currency differs from the selected account currency — see "Multi-currency support in the Cobros/Pagos modal — ETP-4504" below. **Guardar** → Borrador (draft), **Confirmar** → Depositado. On save/confirm the modal returns to the history popup, which refreshes both its own "Saldo pendiente" (refetches the payment plan, not just the payment list) and the invoking list's "Pendiente de pago" badge (`onDataMutated` callback into the list's data hook). Backend uses the same shared actions as sales (`invoicePaymentMethods`, `invoiceCreditSources`, extended `registerPayment` with `process`/`creditSources`, `confirmPayment`) via `RegisterPaymentOutHandler` → `PaymentRegistrationService` (isReceipt=false). The *Fecha* field is required (ETP-4005): clearing it disables **Confirmar**, and saving with an empty date surfaces the `paymentDateRequired` error and a red border on the field.
- Drafts reserve what they are going to pay (ETP-4895): a draft payment does not lower the invoice's outstanding, so both the history popup's **"+ Añadir pago"** button and the preview modal's **Registrar pago** action offer only what the drafts left free — `outstanding − Σ|amount|` over the non-processed payments. When the drafts already reserve the whole outstanding the button stays visible but **disabled**, with the `cpAddPaymentBlockedByDraft` tooltip ("Ya hay un borrador que cubre el total pendiente…"); it re-enables as soon as the draft is deleted or confirmed. When a draft covers only part of the invoice (e.g. 10 on a 26,62 invoice) a new payment is still allowed and **"Nuevo pago"** opens defaulted to the remainder, not to the full outstanding. Editing an existing draft excludes that draft from the reservation, so it can still be raised up to the full outstanding. Implemented in `InvoicePaymentHistoryModal.jsx` (`freeToAllocate`) and `useInvoicePreview.js` (`freeToAllocate` / `addPaymentBlockedByDraft`, consumed by `InvoicePreview.jsx` and `preview-cards/PaymentsCard.jsx`).
- Rectificative invoices (RECTIFICATIVA subtype — see "Factura Rectificativa — ETP-4737" below — with a negative total, ETP-4738; the retired "AP CreditMemo" / "AP Credit Memo" types are deactivated, covered under ETP-4737): the detail topbar badge mirrors the grid's "Pendiente de pago" cell — green **"Aplicada"** once the rectificativa is fully consumed, else a purple clickable **"Saldo a favor · remaining"** badge that opens the same history popup as the grid (previously a static non-clickable "Crédito aplicado · total" pill). Inside the popup, the pending widget relabels to **"Saldo a favor"** with the remaining balance, each row shows how much of the rectificativa that payment consumed (`− appliedToInvoice` from the `invoicePayments` action, negative when consuming it), and the **"+ Añadir pago"** button is hidden.
- Payment method / account defaults (ETP-4331) — mirrors Etendo Classic's `AddPaymentDefaultValuesHandler` priority instead of an arbitrary first-in-list pick: **Método de pago** defaults to the invoice's own configured method (falling back to the business partner's method if the invoice has none); **Cuenta** is filtered to only the accounts that support the selected method (and match the invoice currency), defaulting in priority order to (1) the business partner's preferred account for this direction (`pOFinancialAccount` for payments) when it supports the method, (2) the account flagged `default` on `FIN_Financial_Account_PaymentMethod` for that method, (3) the first account that supports the method. Changing **Método de pago** re-filters and, if needed, re-selects **Cuenta** using the same priority; clearing **Método de pago** never silently refills **Cuenta** (a prior bug where clearing the method after clearing the account caused the account to reappear on its own is fixed). Backend surfaces this via `paymentMethodIds`/`defaultForMethodIds` per account and `defaultMethodId`/`bpPreferredAccountId` on the `invoiceAccounts` response (`PaymentRegistrationService.java`).
- Topbar clone button: icon-only (no text label), styled as Secondary Outline (`#D1D4DB` border, `#FFFFFF` background, `#64748B` icon color, `0px 1px 2px 0px #1212170D` shadow). Hover shifts background to `#F1F5F9`. Implemented via the shared `tools/app-shell/src/windows/custom/shared/CloneButton.jsx` component, which is also used by `SalesInvoiceTopbar.jsx`.
- When the fiscal profile enables a manual fiscal target for purchase invoices, completed purchase invoices expose `Enviar a SIF` in both the detail topbar and the preview modal. The matrix is spec-specific: `sii` and `sii-navarra` show SII; `tbai` shows TicketBAI; `sii+tbai` shows only SII for purchases; `verifactu` shows no manual send button because Verifactu is sent automatically on completion.
- The detail bottom panel also includes the same SIF status block used by sales invoices, rendered below Related Documents and Notes. It shows SII/TBAI tabs depending on the org fiscal profile, exposes the current send status badges, and allows inline editing of the SII metadata fields that remain editable for the current document state.
- **Verifactu does not apply to purchase invoices.** The SIF bottom-panel block for purchases shows only SII and TBAI tabs according to the fiscal matrix; the `verifactu` profile shows no bottom-panel block for purchases because Verifactu is a sales-only fiscal system in Etendo.
- Related payment records are downstream dependencies, not free-form links. The custom related-documents component resolves payment-out documents through payment-plan and payment-detail relationships, then links users to `/payment-out/:id`.
- The preview modal has General, Messages, and History tabs, but only the General tab is backed by invoice/payment data in current evidence. Messages and History are present as empty states.
- The preview modal includes a document upload/drop area for purchase invoices backed by persistent file storage: uploaded files are sent to `POST /sws/neo/preview-file` and stored in `ETGO_PREVIEW_FILE` keyed by `(clientId, specName, recordId)`. On each subsequent open a `GET /sws/neo/preview-file` restores the cached file; if one exists the drop zone is replaced by a PDF/image viewer with a delete button. The delete button sends `DELETE /sws/neo/preview-file` and restores the drop zone.
- Save button dirty-state tracking: the "Save Draft" button is disabled whenever there are no pending unsaved changes (`isDirty = false`). Four independent sources make `isDirty` true: (1) any header field value differs from the last-saved record; (2) an add-row form is open on the primary lines tab; (3) an add-row form is open on a secondary child tab; (4) a sidebar line edit is open. The "Confirm" button is never blocked by dirty state — completing an invoice is always allowed regardless of whether header changes are pending. New records always have Save active because backend defaults populate the form immediately on open. After a successful save, the detail view refetches the saved header once so backend-populated fiscal defaults and callout results are reflected immediately, then the button disables automatically. Reverting a changed field back to its original value also disables the button. When a line is added, `refreshHeaderTotals` updates server-computed totals in `editing` without overwriting fields the user explicitly changed, so pending header edits survive line operations.
- Copy-link visibility (ETP-4721): in the grid selection bar, `Copy link` appears only when exactly one row is selected — hidden with 0 or 2+ rows selected. In the detail topbar, `Copy link` is visible whenever the record has a persisted `recordId` (not the unsaved `'new'` sentinel), with no selection gate since detail always represents a single record. Both copy `{origin}/{windowName}/{recordId}` to the clipboard, show a `Link copied` / `Enlace copiado` toast, and display a `Copy link` / `Copiar enlace` tooltip on hover. The legacy dead link icon previously shown in the idle-state (no-selection) grid toolbar is now hidden via the `hideLink` prop passed to `<ListView>`.

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
1a. **ETP-4833 (manual-only check):** with a row whose `Nº documento` (`POReference`) value is very long, scroll the list and confirm the `Factura rectificativa` doc-type badge and the `Saldo a favor · X €` / `Aplicada` / `Pagada` / pending-payment badges never wrap onto a second line, even as the browser's table auto-layout squeezes their column. This depends on real browser layout metrics that the automated Vitest coverage (which asserts the `whiteSpace`/`flexShrink` style properties directly) cannot reproduce in jsdom, so it stays a manual check.
15. Open a completed purchase invoice and verify that **Contacto** (`businessPartner`), **Dirección** (`partnerAddress`), **Método de pago** (`paymentMethod`), **Condiciones de pago** (`paymentTerms`), and **Tarifa** (`priceList`) fields are all disabled (read-only). Confirm that **Nº documento** (`orderReference`) remains editable.
2. Click a list row and confirm the preview modal opens instead of immediate navigation.
3. In the preview modal, verify the General tab shows total, due/payable state, and payment history, while Messages and History remain placeholder states.
4. Open `/purchase-invoice?filter=overdue` and confirm the quick filter keeps invoices with an outstanding amount. Open the **Filtros** funnel (badge "2") and confirm the second preloaded condition reads `Y | Pendiente de pago | Mayor que | 0` — the operator must be visible (not the placeholder) and its value box must be a numeric input. Also confirm **Imp. total** offers numeric operators and **Vencimiento** offers `Es / Antes de / Después de / Entre` with a date picker (ETP-4681).
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
17. In the list, select 0, then 1, then 2+ invoices and confirm `Copy link` appears in the selection bar only when exactly one row is selected. Click it and confirm a `Link copied` toast appears and the clipboard contains `{origin}/purchase-invoice/<id>`. Open a saved invoice and confirm the same `Copy link` action (with tooltip on hover) is available in the detail topbar.

## Automated evidence

- `tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx` provides the bulk-action component mounted in the purchase-invoice list selection bar, mounted with `labelKey="confirmBulk"` so the button renders as "Confirmar" / "Confirm". The `menuActions` array in `artifacts/purchase-invoice/decisions.json` is empty — no kebab document actions (including `Reactivate`) are declared for this window. Reactivation is not supported in the purchase-invoice detail view.
- `tools/app-shell/src/lib/__tests__/dateOnly.test.js`, `tools/app-shell/src/lib/__tests__/invoiceDueDate.test.js`, and `tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.test.js` provide source-level and helper-level regression coverage for due-date calendar normalization, locale formatting, max-installment selection, and the paid/overdue/soon/ok state derivation that drives the dot color and the red-text reinforcement on overdue rows in the purchase-invoice list.
- Shared shell and entity-loading behavior is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- **ETP-4520** — `artifacts/purchase-invoice/decisions.json`, `artifacts/purchase-invoice/contract.json`, and the generated `HeaderPage.jsx`/`HeaderTable.jsx` all carry `"visibleWhenCapability": "showAccountingFields"` on the `posted` field. `tools/app-shell/src/lib/capabilityVisibility.js`, `tools/app-shell/src/hooks/useCapabilitiesSafe.js`, `tools/app-shell/src/components/contract-ui/DataTable.jsx`, and `tools/app-shell/src/components/contract-ui/DetailView.jsx` prove the shared omit-not-disable gating mechanism, with source-reading coverage in `tools/app-shell/src/lib/__tests__/capabilityVisibility.test.js`, `tools/app-shell/src/hooks/__tests__/useCapabilitiesSafe.vitest.jsx`, `tools/app-shell/src/components/contract-ui/__tests__/DataTable.capabilityVisibility.vitest.jsx`, and `tools/app-shell/src/components/contract-ui/__tests__/DetailView.capabilityVisibility.vitest.jsx`.
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
- **ETP-4721 — Copy link**: `tools/app-shell/src/hooks/useCopyLinkAction.js` implements `useCopyLinkAction` (grid selection-bar copy) and `useCopyRecordLinkAction` (detail-topbar copy); `tools/app-shell/src/components/contract-ui/CopyLinkButton.jsx` and `CopyRecordLinkButton.jsx` render the tooltip-wrapped buttons for each context. `tools/app-shell/src/windows/custom/purchase-invoice/index.jsx` wires the grid action into `bulkActions` and passes `hideLink` to `<ListView>`; `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx` (the `topbarRight` component for this window) wires `CopyRecordLinkButton` into the detail topbar.

## Validation & Error Handling — ETP-4005

See [Shared validation & UX changes — ETP-4005](app-shell-functional-flows.md#shared-validation--ux-changes--etp-4005) for the full list: inline line min-value enforcement, payment modal date validation, single confirmation toast, and callout message sanitization. `etgoDiscount` keeps its `min: 0, max: 100` range.

## Negative quantity/price and price-list label — ETP-4567

- `invoicedQuantity` and `listPrice` no longer declare `min: 0` in `decisions.json`. Both the add-line row and inline grid edit now accept negative values — needed for credit/return-style adjustments modeled as negative-quantity or negative-price lines. `etgoDiscount` is unaffected and keeps its `min: 0, max: 100` range.
- The `listPrice` (AD `PriceList` column) label is now overridden to **"Precio"** in Spanish via `window.labelOverrides.es_ES.PriceList` in `decisions.json` (English label unchanged). Same declarative mechanism already used for `POReference`, `OutstandingAmt`, `EM_Etgo_Due_Date`, `em_etgo_delivery_status`, and `C_DocTypeTarget_ID` on this window.

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
- **Save-remount modal-type gotcha — ETP-4583:** clicking either import button on a brand-new (unsaved) invoice calls `onSave('order'|'receipt')`, which auto-saves and navigates to the persisted record, remounting `PurchaseInvoiceBottomPanel`. The remount resets the local `pendingModal` ref to its default, so the just-clicked button's modal type would otherwise be lost. Both `PurchaseInvoiceLinesEmptyState` and `PurchaseInvoiceLineActions` now pass the modal type explicitly into `onSave(...)` (never a bare `onSave()`), and the post-remount effect trusts the `forceOpen` prop — carried through `location.state.openImportModal` — over `pendingModal.current` when both are present. Identical fix already landed on the sibling `sales-invoice`'s `InvoiceBottomPanel.jsx` (ETP-4459); the two components are separate copies (not shared code), so the same latent bug had to be fixed independently here. Any future window with an import/action button that can trigger a save-and-navigate on an unsaved record must carry its explicit type through navigation state rather than a component-local ref, since that ref does not survive the remount.

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
  - **ETP-4838:** `checkExchangeRateWarning` resolves rate availability through `NeoExchangeRateService.hasRate(...)`, the same lookup behind `GET /sws/neo/validate-exchange-rate` — client-or-system scoped, with the inverse-direction fallback. It previously ran a private query filtered by the current client alone, which stopped seeing the System-level rates once ETP-4474 centralised them there and warned in false on every manual currency change. Full write-up: `sales-order.md` § "`NeoExchangeRateService.hasRate` — the single source of truth".
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
- **Tab-level `readOnlyLogic: "@Processed@='Y' | @Posted@='Y' | @HASREVERSEDINVOICESO@='Y' | @HASREVERSEDINVOICEPO@='Y'"` — ETP-4837:** this is the ONLY place that actually locks the tab at runtime. It is compiled by `resolveSecondaryTabDefs()`/`convertLogicToJs()` against the **header entity's own column map** and evaluated by `evalTabReadOnly(tab, props.hook.selected)` in `DetailView.jsx` — i.e. against the **invoice header record**, not the exchange-rate row. This is what suppresses the row's edit/delete affordances entirely (`InlineLinesPanel`/`DataTable` receive `isDocumentReadOnly={tabReadOnly}`) once the invoice is Completed (`Processed='Y'`) or Posted (`Posted='Y'`), matching the backend guard in `ConversionRateDocLockObserver` (module `com.smf.currency.conversionrate`), which already rejects the save with `SMFCR_CannotModifyRateNonDraft` for any non-Draft document status.
  - **Gotcha (root cause of a shipped regression):** a *field-level* `readOnlyLogic` set on `entities.exchangeRates.fields.rate` in decisions.json is a no-op for this purpose — per-field `readOnlyLogic` on a secondary-tab field is evaluated against the **line's own record** (the `C_Conversion_Rate_Document` row), which carries no `Processed`/`Posted`/`HASREVERSEDINVOICE*` columns of its own, so the condition always resolves to `false` and the field stays editable. The first ETP-4837 pass added the condition there by mistake; it looked correct (the pipeline validator and contract inspection passed) but never took effect against the live app because it was reachable only via the unused `ExchangeRatesForm.jsx` sidebar (`inlineEditable` layout never renders it). The fix moved the `Processed` condition into the **tab-level** `readOnlyLogic` above instead. Do not reintroduce a field-level override on `rate`/`foreignAmount` for header-derived flags — extend the tab-level expression.

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
- the selected financial account is **bank-connected** (`bankConnected`, sourced from the
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

On confirm with `pis: true`, **no `FIN_Payment` is created** (ETP-4895). The intent — invoice,
amount, credits, method, account, date, rate, write-off — is snapshotted as JSON into
`PSD2_PIS_PAYMENT.EM_ETGO_Payment_Intent`, and only the Salt Edge order is placed. The payment is
created from that snapshot once the bank commits to the transfer, so a transfer the user abandons
or the bank rejects leaves the invoice untouched with nothing to undo.

| Salt Edge status | Etendo Go |
| --- | --- |
| `requested`, `initiated`, `initiated_info_required`, `authorizing` | nothing exists yet |
| `authorized` | payment created and processed to **`PPM`** — "Pago en progreso" |
| `executed`, `settled` | payment created if needed + `FIN_Finacc_Transaction` → **`PWNC`**, "Pago depositado" |
| `failed` **before** `authorized` | nothing is created; the modal reports it and the user retries |
| `failed` **after** `authorized` | the payment already exists → flagged **`ETGOERR`** ("Error"), kept processed, offered for retry |

To keep config and runtime aligned, connecting an account to its bank **from Etendo Go** clears the
transfer method's **Automatic Withdrawn** flag (`FinancialAccountBankConnectionHandler`) — Payment OUT
only; Automatic Deposit is left untouched, since PIS only initiates outbound transfers. That flag is
what makes `PPM` mean "confirmed but not withdrawn": the bank transaction appears only when Salt Edge
reports execution, via the PSD2 module's own `PisPaymentCallback` → `PISTransactionUtils` (idempotent).

The response carries `pisPaymentUrl` + `pisPaymentId`; the modal opens the Salt Edge SCA widget
in a popup, locks its own form (`inert`) so the values in flight cannot be edited, and polls the
`pisPaymentStatus` action every ~3s. The popup returns to Etendo Go's own auto-closing SPA callback
route (`financial-account/pis-callback`, `PisCallbackPage.jsx`), which posts a `pis-completed`
message to the opener and closes itself — the user never sees the Classic-styled shared bank-auth
result page. Polling gives up after 10 minutes and **only** once the bank window is gone (a user
mid-authentication legitimately takes minutes); giving up closes the modal with an "in progress"
notice, never an error. "Reabrir ventana" starts a **new** order via `retryPisPayment`, because a
Salt Edge widget session is single-use. The non-PIS path is byte-for-byte unchanged.

### A transfer rejected after the bank committed to it

`authorized` creates the payment, so a rejection arriving later — via the SPA poll, the PSD2
module's periodic refresh or the Salt Edge webhook — finds one already there. Leaving it in `PPM`
would show the transfer as still in progress for something the bank has definitively refused, so
`reconcile` flags it **`ETGOERR`** instead (`markPaymentAsFailed`).

It is deliberately **not reactivated**. Staying processed keeps it holding the invoice's
installment and any credit it consumed, which is what lets the retry reuse this very payment rather
than register a second one — the only shape that cannot pay the invoice twice.

**Known gap:** while flagged, the payment is still applied, so the invoice keeps reading as paid
(Pendiente 0) even though the money never moved. The errored row is the only signal. It resolves
itself when the retry succeeds.

**How the rejection is noticed.** The SPA's poll stops the moment the modal closes, which for this
case is right after `authorized`. Every writer that can record the later rejection — PSD2's
scheduled refresh, its manual "Refresh Payment Status" button, the Salt Edge webhook — lives in the
PSD2 module and knows nothing about Etendo Go's payment.

So the flag is applied by **`PisRejectedPaymentHandler`**, an `EntityUpdateEvent` observer on the
`PSD2_PIS_PAYMENT` row those writers save. That inverts the dependency: PSD2 keeps doing exactly
what it did, Etendo Go reacts, and no scheduled process of our own is needed. The observer only
sets one field on an already-managed entity and never flushes — the difference from the
payment-creating observer this design deliberately rejected, which would have recursed into PSD2's
own flush.

`reconcileAttemptsFor` repeats the same check when the invoice's payment list is fetched and when
the payment window is opened, acting on the stored status with no Salt Edge call. It is the net for
anything that changed outside a DAL flush, and it also closes the older gap where a transfer that
resolved after the modal gave up waiting was never registered at all.

Retrying is offered in two places — the invoice's payment list and the Payment Out window
(`PaymentRetryTransferButton` in the topbar slot) — and both post the same `retryPisPayment`
action. The payment-window route goes through `ReactivatePaymentHandler`, which also injects
`pisPaymentId` into the payment's single-record GET so the button knows which attempt to replay.
`handleRetryPisPayment` then places a fresh Salt Edge order against the existing payment and moves
it back to `PPM` ("en progreso") while the new attempt is in flight. No intent snapshot is involved:
it is cleared the moment the payment is created, and the payment itself carries everything the bank
needs.

Each attempt gets its own `end_to_end_id` (`documentNo-2`, `-3`, …). PSD2 keeps that reference only
inside its payment-attributes JSON and leaves the column empty, so Etendo Go now persists it on
`PSD2_PIS_PAYMENT.END_TO_END_ID` — without that the attempt counter never saw a previous try and
every retry reused the same reference, which is exactly the duplicate the suffix exists to avoid.

### The invoice list stops claiming to be paid — ETP-4895

A payment that is in progress or was rejected is **applied** either way, so the invoice's
outstanding is zero and the "Pendiente de pago" column read **"Pagada"** for money that never
moved — while the payment itself read "Pago en progreso" or "Pago con error". Same fact, two
screens, opposite answers.

The column now shows the **state** instead, as a clickable pill:

| Payment state on the invoice | Outstanding | Column shows | Tone |
| --- | --- | --- | --- |
| any payment in `ETGOERR` | any | **Pago con error** | destructive |
| else any payment in `PPM` | 0 | **Pago en progreso** | warning |
| else any payment in `PPM` | > 0 | the remaining amount + "+" | as before |
| neither | any | Pagada / amount + "+", as before | as before |

**The pill replaces the amount only when the amount would be a lie.** With a transfer in flight
covering the whole invoice the outstanding is zero, so a figure would read "Pagada" for money that
never moved. But a *partial* transfer leaves a real remainder — 6,05 invoiced with 3,00 in flight
still owes 3,05 — and that figure is exactly what the user can act on, so it stays. The transfer's
own state is one click away in the payments modal.

**A rejection is announced either way.** Unlike an in-flight transfer, it is a problem that needs
attention regardless of how much is still owed, so the pill wins even with a remainder. The amount
is then visible inside the modal.

Both pills open the payments modal, which carries the real figures (`Saldo pendiente`) and where
each row navigates to its own payment — including the Retry action on a rejected one.

**Worst-first when payments disagree.** A rejection asks the user to act; an in-flight transfer only
asks them to wait. So an invoice paid in two attempts — one failed, one in progress — reports the
failure, which is what gets it noticed instead of buried.

**Where it comes from.** `PisDeferredPaymentService.transferStateByInvoice` resolves the whole page
in one query and `PurchaseInvoiceHeaderHandler.afterHandle` emits `pisPaymentState` per row.
Deliberately keyed on the payment's own `FIN_Payment.status`, not on whether it went through PIS, so
the invoice cannot disagree with the payment badges by construction. `resolveInvoicePaymentBadge`
reads the field and returns `transfer-error` / `transfer-in-progress` ahead of the amount branches;
sales invoices never receive the field, so they are untouched.

### Payment state across the four surfaces

`PPM` ("Payment Made") means confirmed but **not yet withdrawn** from the account, so it reads
**"Pago en progreso"** — never "depositado" — in the invoice payment modal, the invoice preview
card, the Pagos grid and the Payment Out window's status pill and activity timeline. One shared rule
(`paymentDisplayState` in `windows/custom/shared/paymentStatuses.js`) backs all four; each used to
carry its own copy of the status list, which is how the same transfer once read "Pago en progreso"
in the modal and "Pago depositado" in the payment window at the same time (ETP-4895).

Where the backend serves it, `pisPending` is preferred over the status: the invoice payment-list
action (`paymentListItem`) computes it exactly as processed + initiated over PIS + no bank
transaction. Elsewhere the `PPM` status answers the same question on its own.

### Where the code lives

- Frontend: `NewPaymentEntryModal.jsx` (PIS block, polling, form lock), `PisCallbackPage.jsx`
  (callback route), `paymentStatuses.js` (shared state rule) and its four consumers —
  `InvoicePaymentHistoryModal.jsx`, `preview-cards/PaymentsCard.jsx`, `PaymentHeaderTableBase.jsx`,
  `PaymentDetailSidebarBase.jsx` — plus `statusEnumLabels` in `payment-out`'s `decisions.json`
  (payments out only; `PPM` is an outbound status, so Payment In is untouched). All `cpPis*` keys are in both `es_ES.json` / `en_US.json`.
- Backend (`com.etendoerp.go`): `PaymentRegistrationService` (enriched `invoiceAccounts`, PIS branch
  of the advanced register flow), `PisDeferredPaymentService` (deferred creation, status
  reconciliation, `retryPisPayment`), `PisPaymentService` (`pisPaymentStatus`, `cancelPisPayment`,
  `pisTemplates`, `pisSupplierAccounts`), `PisPaymentBridge` (composes the public PSD2
  `GenerateBankPayment` with Etendo Go's own `return_to`).

Scope v1: purchase invoices only, EUR (SEPA) / GBP (FPS). Out of scope: receipts, batch/multi-invoice
PIS, other currencies, scheduled payments.

## Accounting dimension visibility per section — ETP-4529

| Field | Header | Lines |
| --- | --- | --- |
| `businessPartner` | **Siempre** — `displayLogic: null` override | **Nunca** — discarded |
| `product` | *(no such field on the header)* | **Siempre** — no dimension gating |
| `project` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` passthrough (`section: "other"`) | **Por config** — same passthrough |
| `costcenter` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` passthrough (`section: "other"`) | **Por config** — same passthrough |

**Fixed a pre-existing gap:** `header.project`, `header.costcenter`, `lines.project`, and
`lines.costcenter` previously carried `"form": false, "readOnlyLogic": null, "displayLogic": null`
in `decisions.json`, which both hid the fields unconditionally AND silenced their raw
`@Posted@='Y'` read-only rule. Both are now restored: the fields render (gated by the
accounting-dimension macro) and are correctly locked once the invoice is posted.

**Runtime evaluator — fixed (ETP-4529 follow-up).**
Three generic bugs (the `EntityForm.jsx` visibility filter never actually consulting the
evaluate-display result, the `principal` section hardcoding empty visibility, and no
lines-scoped `useDisplayLogic` call existing at all) were found and fixed — full write-up in
`sales-invoice.md`. `header.project`/`header.costcenter` are now genuinely config-gated at
runtime.

**Non-grid line fields under inlineEditable — resolved (ETP-4543).** `lines.project`/
`lines.costcenter` carry correct contract metadata and are correctly evaluated, but this
window uses `window.linesLayout = "inlineEditable"`, under which `LinesForm.jsx` (the sidebar
that would otherwise render them) never mounts — so the two fields had no UI surface at all,
evaluator fix notwithstanding (Jira ETP-4543 / GitHub `etendosoftware/etendo_schema_forge#895`).
Fixed by adding `project`/`costcenter` as columns to `InvoiceLinesTable.jsx` (the shared,
hand-written line table used by both `sales-invoice` and `purchase-invoice`) and wiring
dynamic column visibility through `InlineLinesPanel.jsx`'s new `hiddenColumns` prop and
`DetailView.jsx`'s memoized `lineHiddenColumns`. With the client's Proyecto/Centro de costo
dimension toggles OFF, the columns do not render; with them ON, they do. See `sales-invoice.md`
for the full write-up (including the verified list of which windows actually hit this gap).

### Header section placement fix + expand-panel supersession (ETP-4529 follow-up)

`header.project`/`header.costcenter` moved from `"section": "other"` to `"section": "principal"`
so they render in the main visible form area instead of the secondary/collapsed one — same fix
as `sales-invoice.md`. Separately, the plain `project`/`costcenter` grid columns added above
were superseded by a single `type: 'dimensionsPanel'` column on `InvoiceLinesTable.jsx` (the
same shared component both windows use) — full write-up, including a wiring gap discovered
while doing this (`InvoiceLinesTable.jsx` is not currently reachable from either window's
running app), in `sales-invoice.md` and `docs/feedback.md`'s ETP-4543 supersession note.

**Resolved (ETP-4529 generator support):** since `InvoiceLinesTable.jsx` doesn't actually render
for this window either, `generate-frontend.js`'s `generateTableComponent` (`schema_forge_core`)
now emits the `dimensionsPanel` column directly from `decisions.json`. `lines.project.dimensionsPanel`
and `lines.costcenter.dimensionsPanel` are `true` (grid stays `false`); the actually-rendered
generated `LinesTable.jsx` declares the synthetic column, so the panel renders for real — see
`sales-invoice.md`'s matching note, `docs/decisions-reference.md` (`dimensionsPanel`), and
`docs/ui-customization.md` §14b.

### "Añadir dimensiones" moved to a hover action, column no longer shown (ETP-4610)

Same change as `sales-invoice.md`: the "Dimensiones contables" grid column no longer renders.
"Añadir dimensiones" moved into the line's hover-action strip next to Edit/Delete, gated on at
least one visible dimension field; the expand-chevron column is unchanged. Label/icon is adaptive
("Añadir dimensiones" → "Editar dimensiones" once the line has a dimension value set). See
`docs/ui-customization.md` §14b/§14c and `docs/feedback.md`'s ETP-4610 entry.

Regenerated cleanly (`make regen ONLY=sales-invoice,purchase-invoice SKIP_EXTRACT=1 LOCAL_CORE=1`,
`sf-validate-pipeline` clean, committed) as part of validating this window's `dimensionsPanel`
flags — see `docs/feedback.md`'s ETP-4610 entry for the full regen log across all five in-scope
windows.

## Multi-currency support in the Cobros/Pagos modal — ETP-4504

The two-step Cobros/Pagos modal (`NewPaymentEntryModal.jsx`) was originally single-currency.
ETP-4504 lifts that restriction for both directions; this is the payment side (`dir='out'`,
purchase invoice). The mechanics are identical to the collection side, documented in full in
[`sales-invoice.md`](sales-invoice.md#multi-currency-support-in-the-cobrospagos-modal--etp-4504);
only the payment-specific differences are called out here.

### F1 — Conversion fields (invoice currency ≠ account currency)

When the invoice currency differs from the currency of the selected financial account, the
**"Nuevo pago"** modal reveals two extra fields below the amount/method/account row:

| Field | i18n key | Behavior |
|-------|----------|----------|
| **Tasa de conversión** (Conversion rate) | `cpConversionRate` | Editable numeric input, prefilled from `GET {base}/validate-exchange-rate` via the `useConversionRate` hook (`tools/app-shell/src/windows/custom/shared/useConversionRate.js`); accepts `0.92` or `0,92`. |
| **Importe en moneda de la cuenta** (Amount in account currency) | `cpAmountInAccount` | Also editable, mirroring Classic's Add Payment. Whichever of the two the user edits drives the other: typing a rate recomputes this amount (`= invoice amount × rate`, rounded to 2 decimals); typing an amount here recomputes the rate instead (`= typed amount ÷ invoice amount`, rounded to 6 decimals). Changing the invoice-currency amount elsewhere in the modal (e.g. **Igualar**) keeps the rate fixed and recomputes this amount forward. |

Both are **hidden when the currencies match**. On a foreign-currency payment a **positive rate
≠ 1 is required** — a blank/non-positive or `1` rate disables **Guardar** and **Confirmar** (the
blank/non-positive case also shows the `cpConversionRateRequired` inline error;
`cpConversionRateInvalid` is the "must differ from 1" copy). The rate is sent as `conversionRate`
on `registerPayment`; the backend recomputes the account-currency amount authoritatively.

**Rate persistence on drafts (ETP-4841).** A rate typed by the user is stored on the draft and
shown back when the draft is reopened — it is not re-derived from the system rate. The mechanism
is shared with the collection side and documented in full in
[`sales-invoice.md`](sales-invoice.md#multi-currency-support-in-the-cobrospagos-modal--etp-4504):
the `invoicePayments` row carrying `conversionRate`, the verbatim backend store in
`PaymentCurrencyConverter.applyTransactionAmountAndRate` (bypassing core's
`rate = txnAmount / amount` recompute, which mangles a user-typed rate), the once-per-currency-pair
reseed keyed on the **account currency rather than the account id**, and the table of what each
action in a reopened draft does to the rate field. None of it is payment-side specific.

### F2 — Credit filtered by invoice currency

The credit/abono section lists only sources **in the invoice's currency** (server-side HQL filter
in `PaymentCreditSourcesService`, in the `com.etendoerp.go` repo). No frontend change.

### F3 — Excess handling (payment side)

Payments **never generate credit** — any payment excess blocks **Confirmar** with the inline
"Exceso: …" error and must be resolved with **Ajustar importe** (*Igualar*). This is unchanged in
substance from the two-step flow's original payment behavior; ETP-4504 only removed the (never
offered for payments) **"Dar vuelto"** / refund path from the shared code. Leave-credit
(**Generar crédito a favor**) is a collection-only resolution and is never shown here.

### F4 — Saldo a favor restricted to Facturas Rectificativas with a negative total — ETP-4738

With ETP-4737, the old "AP CreditMemo" document type is retired and unified into a single
**"Factura Rectificativa" AP document type**, flagged `c_doctype.em_etsg_isrectificative = 'Y'`
(owned by the optional `com.etendoerp.sif.general` module). ETP-4738 updates the credit/abono
section's listing to match: `PaymentCreditSourcesService.pendingAbonos` restricts the pending-PSD
query to purchase invoices that are BOTH (a) a Factura Rectificativa de Compra (doc type resolved
server-side via `RectificativeDocTypeSupport`, scoped to the invoice's client and purchase side)
AND (b) carry a negative `grandTotalAmount`. A Factura Rectificativa de Compra with a **positive**
total does not appear. The invoice-currency filter (F2) is unaffected.
`PaymentCreditConsumer.consumeAbono` mirrors the same eligibility check server-side when a
payment is registered, rejecting a crafted `psdId` the selector would not have offered (except a
PSD already linked to the payment being edited/re-saved). Legacy pending AP Credit Memos no
longer appear in this selector once retired — see ETP-4738 in Jira for the functional sign-off
on that data-visibility change. Full rationale in
[`sales-invoice.md`](sales-invoice.md#f4--saldo-a-favor-restricted-to-facturas-rectificativas-with-a-negative-total--etp-4738)
(same mechanism, AR side).

**ETP-4738 follow-up — a pre-existing bug is also fixed.** Before this change,
`PaymentCreditSourcesService.collectAccumulatedCredit` was called unconditionally for BOTH
sides, so the Pagos modal could incorrectly surface accumulated-credit rows (badge
**"Crédito"**) even though the DF explicitly states "Sin crédito acumulado a proveedor en it1".
`handleListCreditSources` now calls `collectAccumulatedCredit` only inside an `if (isReceipt)`
guard (see the AR-side note in `sales-invoice.md`), so Pagos (AP) never lists a `kind: 'credit'`
row while Cobros (AR) keeps it. The "no accumulated AP credit source (it1)" behavior documented
above is now actually enforced in code, not just intended.

### F5 — "Saldo a favor" is decided by the SIGN of the total, not the document type — ETP-4841

> **Supersedes F4** (and the AP-side badge notes above). Kept for history; where they conflict,
> this section wins.

A Factura Rectificativa de Compra can be **positive** (the supplier under-invoiced, so the
correction is **payable**) or **negative** (a credit). An ordinary "Factura" with a negative
total is likewise a credit. Payment state is therefore decided by `grandTotalAmount < 0`, never
by the document type. Full rationale, the shared helper contract and the evaluation order are in
[`sales-invoice.md` § F6](sales-invoice.md#f6--saldo-a-favor-is-decided-by-the-sign-of-the-total-not-the-document-type--etp-4841)
— the mechanism is identical on both sides and is applied symmetrically.

AP-specific consequences:

- **`PurchaseInvoiceHeaderTable.jsx` no longer sign-flips the total column.** It used to render
  `-Math.abs(Number(raw))` for any row whose `getApSubtype` was `RECTIFICATIVA`, which displayed
  a positive rectificativa as negative. The column is now the plain
  `{ key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', … }` declaration that
  sales-invoice always used — the generic amount renderer, no custom `render`.
- `PurchaseInvoiceTopbar.jsx`'s `isFullyPaid` no longer fires for credit instruments, so a
  negative purchase invoice stops rendering **"Pagado · 0,00 €"** (it computed
  `totalPaid = grandTotal − outstanding` = 0 for those rows).
- Both the grid cell and the topbar now consume `resolveInvoicePaymentBadge`; the local
  `isNcOrReturn` predicate is gone. `getApSubtype` remains, driving only the document-type badge
  column (`SUBTYPE_BADGE`) and the list tab filters.
- The grid stopped hardcoding `Saldo a favor` / `Aplicada` and uses the `cpFavorBadge` /
  `cpCreditFullyApplied` i18n keys.
- The credit selector (`pendingAbonos`) dropped the doc-type whitelist: any purchase invoice
  with a negative total and an unpaid negative PSD of the same supplier and currency now
  appears. `PaymentCreditConsumer` rejects only non-negative totals.

### Known display-only limitation

The **Importe en moneda de la cuenta** value is rounded to **2 decimals in the UI** while the
backend books the financial-transaction amount at the **account currency's own precision**. For
non-2-decimal currencies (e.g. JPY, 0 decimals) the displayed amount can differ from the amount
actually posted — a display-only discrepancy; the backend books authoritatively from the
submitted `conversionRate`.

> **Product decision pending functional confirmation.** Removing the "Dar vuelto" / refund excess
> option (ETP-4504) drops a previously available resolution and should be confirmed by the
> functional team as intended, not a regression. See the same note in `sales-invoice.md`.

### Evidence

- `tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx` — conversion fields,
  `isForeign` gating, foreign-rate guard, `conversionRate` on submit.
- `tools/app-shell/src/windows/custom/shared/useConversionRate.js` — exchange-rate prefill hook.
- `tools/app-shell/src/windows/custom/shared/usePaymentBalance.js` — excess gating; refund removed.
- i18n keys `cpConversionRate` / `cpAmountInAccount` / `cpConversionRateRequired` /
  `cpConversionRateInvalid` present in `en_US.json`, `es_ES.json`, and `es_AR.json`.

## Editable SII exemption cause in the SIF tab — ETP-4751

The SII **Causa de Exención** in the SIF tab is now an **editable selector** against `AEATSII_CAUSE_EXEMPTION`, restoring Etendo Classic parity (previously always read-only, deferred by ETP-3778). This is implemented once in the shared `tools/app-shell/src/windows/custom/shared/SifTab.jsx` (`ExemptionCauseField`) and therefore applies to both purchase-invoice and sales-invoice; the selector endpoint (`/sws/neo/purchase-invoice/header/selectors/aeatsiiCauseExemption`) and the field's `editable/foreignKey/inputMode:selector` classification already existed.

- **Gating (mirrors the SII module's `ExemptTaxes` handler):** editable only when the invoice carries an exempt tax, is a draft, and has not been sent to SII (`siiFieldReadOnly`); otherwise visible-but-read-only. The SII exemption cause is optional (`ISMANDATORY=N`) — this is a parity/completeness improvement, not a submission fix.
- **`hasExemptTaxes` (backend-served):** `AbstractInvoiceHeaderHandler#enrichHasExemptTaxes` injects it on the purchase- and sales-invoice header, detecting exempt taxes over **active invoice LINES only** (`c_invoiceline → c_tax.istaxexempt='Y'`), deliberately **not** `c_invoicetax` (stale rows linger there in Go drafts and would keep the field editable after the exempt line is removed). `refreshHeaderTotals` keeps it fresh after line add/edit/delete so the field re-locks correctly. Do not re-add the `c_invoicetax` branch (rationale comment in the code).
- **Line-save signals (`InvoiceLineHandler`):** on a line save that leaves the invoice with exempt taxes and no header cause, the handler stamps `exemptionCauseAutoFilled` (if a default cause exists → auto-fill + info toast) or `exemptionCauseWarning` (no default → one-shot warning toast "Debería indicarse una causa de exención… solapa SIF"); mutually exclusive, raw-SQL/fail-safe. Auto-fill is dormant in Go (no default seeded) so the warning path is what fires.
- **Onboarding / data provisioning:** exemption causes E1–E6 (IVA, all `isdefault=N`) are seeded for new tenants via `modules/com.etendoerp.go/referencedata/sampledata/GOClient/AEATSII_CAUSE_EXEMPTION.xml` and for existing tenants via `cli/src/data-fixes/sql/20260803T120000Z__R17-sii-cause-exemption.sql`. Seeded with **no default cause** by design (correct cause is per-operation; Go has no cause-exemption maintenance window). See `docs/etendo-ad/tenant-remediation-knowledge.md`.
- Tests: `SifTab.vitest.jsx`, `useEntity.coverage.vitest.jsx`, backend `AbstractInvoiceHeaderHandlerTest`/`InvoiceLineHandlerTest`, and the mocked E2E `e2e/tests/flows/sif-exemption-cause.mocked.spec.js` (covers both invoice types). Also fixed: `SelectorInput.jsx` keeps a controlled `''` when empty so clearing takes effect on the first pick.
## Factura Rectificativa — ETP-4737

Epic ETP-3504 unifies the former separate "Nota de Crédito" (`AP CreditMemo` / `APC`) and
return-invoice concepts into a single doc type, **"Factura Rectificativa (compras)"**
(`C_DocType_ID = 50F8C3501B8343B99394557DF3D84904`, `DocumentCategory = "API"`,
`IsSOTrx = N`, `EM_ETSG_ISRECTIFICATIVE = Y`). The old `AP CreditMemo` doc type
(`DocBaseType = APC`) is now `Active = No` — deactivated, not deleted, so historical
invoices that used it still resolve fine. Purchases never had a separate return-invoice
subtype the way sales did (no `DEV`), so this side only ever collapses two things: the new
rectificative type and the legacy `APC` credit memo.

### Backend (already done, `com.etendoerp.go`, not in this repo)

- `PurchaseInvoiceHeaderHandler#classifyDocType` resolves `apInvoiceSubtype` as `'FAC'` or
  `'RECTIFICATIVA'`: `EM_Etsg_Isrectificative = 'Y'` on the new doc type → RECTIFICATIVA;
  legacy fallback — `APC` category or `API` + `isReturn` → RECTIFICATIVA; otherwise FAC.
  Also injects `isRectificative` and `hasRectifications` (booleans) into GET responses, and
  `docTypeLocked` on detail-view responses once the invoice is saved.
- `ReturnToVendorShipmentHeaderHandler`'s `createReturnInvoice` action resolves the new
  rectificative doc type automatically when generating an invoice from a confirmed
  Albarán de Devolución de Compra — negative line quantities/totals are pre-existing,
  untouched logic.
- `AbstractInvoiceHeaderHandler` exposes an `originInvoice` virtual field on the header
  (POST/PUT body key), backed by `C_Invoice_Reverse` (`persistOriginInvoice`/
  `enrichOriginInvoice`) — the same table the separate "Reversed Invoices" / Modelo 349 tab
  (`ReversedInvoicesPanel.jsx`, `window.extraTabs.reversedInvoices`) manages its own rows on,
  for a different purpose (349 corrective-box reporting). The two are independent.
  - **New (ETP-4755): the tab's "Correctiva del 349" checkbox is now gated by the tenant's
    Fiscal Models catalog.** `ReversedInvoicesPanel.jsx` — shared, unchanged, by both
    `sales-invoice` and `purchase-invoice` — fetches the cross-spec, generic
    `GET /sws/neo/fiscal-models-catalog` endpoint (the same per-`AD_PREFERENCE` catalog the
    `fiscal-models` window itself uses to enable/disable tax forms; see
    `fiscal-models.md`'s "Downstream consumer" note for the full write-up) and only renders
    the checkbox (plus its dependent AEAT year/period/base-amount fields) when the catalog
    confirms Modelo 349 is active. **Fail-closed** in every failure mode — loading, non-200,
    network error, or a malformed/missing-key response all hide the checkbox, never show it
    by default. The read-only "Modelo 349" grid-column badge (`CorrectivaBadge`) is **not**
    gated — it always reflects the underlying `aEAT349IsCorrective` value regardless of
    catalog state; only the interactive checkbox is affected. **Known non-blocking gap:**
    toggling 349 off does not clear or warn about an already-`true` `aEAT349IsCorrective` on
    existing lines — the checkbox just becomes invisible while the data (and the grid badge)
    stay intact.

### List subset filters: "Todos" / "Facturas" / "Facturas rectificativas"

`window.subsetFilters` in `decisions.json` keeps the same three entries (`allTab`,
`invoicesTab`, `rectificativeInvoicesTab`) and its filter criteria were rebuilt around the
new discriminator. `rectificativeInvoicesTab` is a **dedicated** `genericLabels` key
(**"Facturas rectificativas"** / *"Rectificative invoice"*), shared with
`sales-invoice.md`'s equivalent tab — it is intentionally NOT the generic `creditNotesTab`
key. An earlier version of this change repurposed `creditNotesTab`'s value to save a merge
step; that broke `EntityForm.jsx`'s generic doc-type-name fallback (which uses
`creditNotesTab` for *any* window whose doc type contains "credit"/"memo"), silently
mislabeling genuine credit notes elsewhere in the app. `creditNotesTab` keeps its original
"Credit note" / "Nota de crédito" meaning and is untouched by this window.

**Discriminator chosen: `transactionDocument$etsgIsRectificative` (Hibernate/DAL property
`DocumentType.PROPERTY_ETSGISRECTIFICATIVE`, mapped to `C_DocType.EM_Etsg_Isrectificative`)
combined with the legacy `documentCategory = APC` category, via an OR.** Plain
`documentCategory` filtering alone cannot distinguish the new rectificative type from a
plain Factura, because both share `DocumentCategory = "API"` — this is the exact scenario
the ticket flagged. Verified empirically against the dev DB (`etendo_core_go`): every
"Factura Rectificativa (compras)" doc-type row (across all `AD_Client_ID`s) has
`em_etsg_isrectificative = 'Y'`, and the plain `AP Invoice` type has `'N'` — confirming the
flag alone correctly isolates the new type. **However, historical `AP CreditMemo` (`APC`)
doc-type rows were never retroactively flagged** (`em_etsg_isrectificative = 'N'` on all of
them, since the column simply defaults to `N` and no migration touched existing rows) — a
boolean-only filter would silently drop every invoice that used the now-deactivated legacy
type from the "Facturas rectificativas" tab. The filter therefore ORs the two conditions,
mirroring `PurchaseInvoiceHeaderHandler#classifyDocType`'s own server-side logic exactly:

```
Facturas rectificativas → (transactionDocument$etsgIsRectificative = true) OR (transactionDocument$documentCategory = 'APC')
Facturas                → (transactionDocument$documentCategory = 'API') AND (transactionDocument$etsgIsRectificative ≠ true)
```

The OR is expressed as a single-element criteria array wrapping an `AdvancedCriteria`
object (`{"_constructor":"AdvancedCriteria","operator":"or","criteria":[...]}`) — the same
mechanism `ListView.jsx`'s advanced-filter popover already uses and explicitly supports
composing with the surrounding subset/quick/document-type AND chain (see
`docs/list-filters.md`).

**Correction (this was wrong in an earlier revision of this doc): a frontend code change
WAS needed.** `purchase-invoice`'s list view is a hand-rolled `ListView` in
`tools/app-shell/src/windows/custom/purchase-invoice/index.jsx` — unlike a plain generated
window, it never renders the generated `HeaderPage`/`ListView` for the list route, so it
never picks up `decisions.json`'s `window.subsetFilters` at runtime. `index.jsx` declares
its own local `INVOICE_SUBSET_FILTERS` constant that must be kept in sync with
`decisions.json` by hand. Before this fix that constant filtered by matching the raw
`transactionDocument$_identifier` string against `'AP Invoice'` / `'AP CreditMemo'` — which
matches neither the new `EM_Etsg_Isrectificative` flag nor the new doc-type name, so
"Factura Rectificativa (compras)" invoices only ever showed up under "Todos" and never under
"Facturas rectificativas". `index.jsx` now uses the exact same `filter` criteria strings as
`decisions.json` (see the two literals above), so the two stay byte-for-byte in sync; any
future change to the discriminator must be applied in both places.

**Consistency note:** `sales-invoice.md`'s equivalent tab uses the identical discriminator
mechanism (`transactionDocument$etsgIsRectificative`) for the same reason — both windows
share the `C_Invoice` table and doc-type model, and the SIF General module (which owns the
`EM_ETSG_ISRECTIFICATIVE` column) is installed in this environment.

### `apInvoiceSubtype` client fallback and the list-badge bug it fixed

`artifacts/purchase-invoice/custom/purchaseInvoiceSubtype.js`'s `getApSubtype()` now returns
`'FAC' | 'RECTIFICATIVA'` (previously `'FAC' | 'NC'`), preferring the server-injected
`apInvoiceSubtype` field and falling back to identifier-keyword matching (`rectificativ`,
`credit`, `memo`, `crédito`, `return`, `devoluci`, `revers`) when the field is absent —
mirroring the server's own APC/return fallback so the client and server never disagree.

**Bug found and fixed while wiring this:** `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx`
(the active list-grid component — not the stale, unused `artifacts/purchase-invoice/custom/InvoiceHeaderTable.jsx`
stub) had its **own separate** hardcoded `NC_RETURN_TYPES`/`DOC_TYPE_BADGE` lookup, keyed by
the exact raw AD doc-type **name** (`'AP CreditMemo'`, `'Return Material Purchase Invoice'`,
`'Reversed Purchase Invoice'`). Because the new doc type is named
`"Factura Rectificativa (compras)"`, it matched none of these — the grid's document-type
badge would render blank (`—`) and, more importantly, the **"Total Gross Amount" and
"Pendiente de pago" columns would NOT negate/format the new rectificative invoices
correctly**. Fixed by replacing the hardcoded name Set with `getApSubtype(row) ===
'RECTIFICATIVA'` and a `SUBTYPE_BADGE` map keyed by subtype instead of by name — this is
the root-cause fix (any future doc-type rename can no longer silently break this), not a
one-off patch. Verified behavior-preserving: all 26 existing
`PurchaseInvoiceHeaderTable.vitest.jsx` tests (which assert on the legacy AD names via the
identifier-fallback path) still pass unchanged.

**Same bug, two more files (found in review, fixed in the same pass):** the hardcoded
doc-type-name pattern was not confined to `PurchaseInvoiceHeaderTable.jsx`. Two sibling
files had the identical anti-pattern and were fixed the same way:

- `PurchaseInvoiceTopbar.jsx` — `isCreditType` was `docType === 'Nota de Crédito' || docType
  === 'AP CreditMemo'`, which silently excluded the new doc type from the "Saldo a favor" /
  "Aplicada" payment-badge treatment. Now `getApSubtype(data) === 'RECTIFICATIVA'`.
- `RelatedDocuments.jsx` — `RETURN_INVOICE_TYPES` was a `Set` of exact doc-type-name
  strings, which silently skipped fetching linked return-delivery documents for a
  rectificativa invoice. Now `getApSubtype(data) === 'RECTIFICATIVA'`.

A full grep of `tools/app-shell/src/windows/custom/purchase-invoice/` for the old doc-type-name
literals (`AP CreditMemo`, `APC`, `Nota de Crédito`, `Return Material Purchase Invoice`,
`Reversed Purchase Invoice`, `Factura de Devolución`) turned up no further occurrences
outside `index.jsx`'s `DOC_TYPE_LABELS` display-label map — which is a cosmetic
identifier→label translation for already-human-readable AD names, not a
subtype/category discriminator, so it does not have this bug (the new doc type's raw AD
name is already a proper Spanish display string and needs no translation).

### Two new "Import from…" flows for RECTIFICATIVA invoices

`artifacts/purchase-invoice/custom/PurchaseInvoiceBottomPanel.jsx` branches on
`getApSubtype(data)`:

- **FAC** (unchanged): "Import from receipt" + "Import from PO", as before.
- **RECTIFICATIVA** (both net-new):
  - **"Import from Goods Return"** (`ImportFromGoodsReturnModal.jsx`) — lists confirmed
    Albarán de Devolución de Compra documents (`return-to-vendor-shipment` spec,
    `documentStatus=CO`, same business partner, `invoiceStatus < 100`) for the same
    supplier. Return-to-vendor shipments are `ShipmentInOut`/`M_InOut` records — the same
    table as goods-receipt, differentiated only by the linked document type's return flag —
    so already-imported detection reuses the invoice line's `goodsShipmentLine`
    (`M_InOutLine_ID`) field, and pricing is resolved through the same
    `purchase-invoice/lines/callout` cascade `ImportFromGoodsReceiptModal` uses. Imported
    lines always carry a **negative** invoiced quantity (mirrors sales-invoice's
    `ImportFromReturnShipmentModal` for its `ARI_RM` case) — consistent with "a rectificative
    invoice generated from a return must always have a negative total."
  - **"Import from Source Invoice"** (`ImportFromSourceInvoiceModal.jsx`) — lists this
    supplier's own **completed, FAC-subtype only** purchase invoices
    (`getApSubtype(inv) === 'FAC'`, filtered **client-side** because `apInvoiceSubtype` is a
    GET-response virtual field, not a persisted/Hibernate-mapped property, so it cannot be
    expressed as backend list criteria — same reasoning as the subset-filter discriminator
    above) — satisfies the acceptance criterion "Importar desde Factura origen muestra solo
    facturas de Tipo Factura". Imported lines also default to a **negative** quantity
    (modeling a correction/reversal of the source). After import, the modal best-effort
    PATCHes the header's `originInvoices` field (a JSON array, one id per imported document —
    ETP-4919; the field used to be singular `originInvoice` and, combined with a backend
    delete-then-single-create, silently dropped every previously-imported source but the most
    recent one) so the rectificative invoice stays linked to EVERY source invoice it was
    imported from via `C_Invoice_Reverse` — independent of, and does not interfere with, the
    separate "Reversed Invoices" / 349-boxes tab on the same table. `RelatedDocuments.jsx`
    renders one chip per linked origin.
  - Both modals are wired into all three surfaces FAC's own import options use: the empty-state
    buttons (`PurchaseInvoiceLinesEmptyState`), the ongoing "+ Añadir línea" dropdown trigger
    (`PurchaseInvoiceLineActions`/`detailExtraActions`), and the line kebab menu
    (`lineMenuActions`) — full parity with the FAC flow.
  - **"+ Añadir línea" (manual add) remains available unconditionally** for RECTIFICATIVA —
    it was never gated behind the FAC-only branch to begin with; this was verified, not
    assumed, while wiring the two new import buttons alongside it.

### Manual creation allows both positive and negative totals

`invoicedQuantity` and `listPrice` still carry `"min": false` in `decisions.json` (ETP-4567,
unaffected by ETP-4737) — a manually-added line on a RECTIFICATIVA invoice can be positive
or negative; only the two **import** flows above default to negative (they model
reversing/correcting an existing document). No decisions.json or generator change was
needed here — this was verified against the existing contract, not newly built.

### i18n keys (all 3 locales: `en_US.json`, `es_ES.json`, `es_AR.json`)

New `genericLabels` keys: `addLinesManuallyOrImportFromGoodsReturnOrSourceInvoice`,
`importFromGoodsReturn`, `searchGoodsReturn`, `noPendingGoodsReturnsForSupplier`,
`noGoodsReturnsMatchYourSearch`, `linesImportedFromGoodsReturn`, `importFromSourceInvoice`,
`searchSourceInvoice`, `noFacSourceInvoicesForSupplier`, `noSourceInvoicesMatchYourSearch`,
`linesImportedFromSourceInvoice`, `rectificativeInvoicesTab` (dedicated key — see above;
`creditNotesTab` is untouched and keeps its original generic meaning).

Note: `addLinesManuallyOrImportFromGoodsReturnOrSourceInvoice` was renamed from
`addLinesManuallyOrImportFromReturnOrSourceInvoice` during the merge into
`feature/ETP-4737` — `sales-invoice.md`'s branch independently introduced the same key
name for its own (sales-return-flavored) empty-state hint, with different text. Each
window now owns a distinct key for this string.

### Manual verification

1. Open `/purchase-invoice` and confirm the subset filter reads "Todos" / "Facturas" /
   "Facturas rectificativas" (not "Nota de crédito"). Select "Facturas rectificativas" and
   confirm it shows both the new "Factura Rectificativa (compras)" invoices AND any
   historical invoices that used the deactivated "AP CreditMemo" type. Select "Facturas" and
   confirm rectificative invoices are excluded from it.
2. On the list grid, confirm a RECTIFICATIVA invoice shows the "Facturas rectificativas"
   badge (not a blank `—`) in the document-type column, and that its Total Gross Amount and
   Pendiente de pago columns render with the correct negative sign / "Saldo a favor" /
   "Aplicada" treatment.
3. Open a draft RECTIFICATIVA invoice with no lines: confirm the empty state offers
   "Importar desde devolución" and "Importar desde factura origen" (not the FAC pair), plus
   "+ Añadir línea" always available.
4. Open the "Import from Goods Return" modal: confirm it lists only confirmed Albaranes de
   Devolución de Compra for the invoice's supplier, and that imported lines carry a negative
   quantity/total.
5. Open the "Import from Source Invoice" modal: confirm it lists only completed, plain
   "Factura" (FAC) invoices for the same supplier — no other rectificative invoice should
   ever appear as a candidate source. Import from a first source invoice, then reopen the
   modal and import from a SECOND, different source invoice — confirm `RelatedDocuments`
   shows TWO origin-invoice chips (both survive; ETP-4919 — this used to collapse to only the
   most recently imported one).
6. Manually add a line to a RECTIFICATIVA invoice (not via import) and confirm both a
   positive and a negative quantity/price are accepted.

### Known gaps / needs Tester follow-up

- Fixed in review (were previously gaps, resolved in the same pass as the review fixes
  below): `artifacts/purchase-invoice/custom/__tests__/purchaseInvoiceSubtype.test.js` now
  asserts `'RECTIFICATIVA'` (not the old `'NC'` literal) plus a case for the new
  "Factura Rectificativa (compras)" identifier and the server-injected
  `apInvoiceSubtype` override.
- **Coverage gap closed (this doc was stale on this point):** source-reading unit coverage for
  `ImportFromGoodsReturnModal.jsx` and `ImportFromSourceInvoiceModal.jsx` now exists —
  `artifacts/purchase-invoice/custom/__tests__/ImportFromGoodsReturnModal.test.js` (negative-only
  enforcement) and `artifacts/purchase-invoice/custom/__tests__/ImportFromSourceInvoiceModal.test.js`
  (FAC-only source filtering, rectificativa/legacy-APC exclusion, sign preservation) — added in
  commit `dd0191c9a`. The sibling `artifacts/sales-invoice/custom/__tests__/ImportFromSourceInvoiceModal.test.js`
  covers the equivalent sales-side flow. `PurchaseInvoiceHeaderTable.jsx`'s subtype-badge/amount fix
  is covered by `tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.test.js`
  (asserts `SUBTYPE_BADGE[getApSubtype(row)]`, not a hardcoded doc-type name).
- Still open: no dedicated test exists for the new subtype-aware import-button branching in
  `PurchaseInvoiceBottomPanel.jsx` (FAC vs. RECTIFICATIVA empty-state/menu wiring itself, as
  opposed to the modals it renders). No Playwright spec covers the **renamed** subset-filter tab
  either — the only E2E spec for these tabs, `e2e/tests/flows/purchase-invoice-type-filter.mocked.spec.js`
  (ETP-4036), predates ETP-4737 and still asserts the old `filter-creditnotestab` test id and
  "Notas de crédito" tab; the real component (`tools/app-shell/src/windows/custom/purchase-invoice/index.jsx`)
  now renders `filter-rectificativeinvoicestab` instead, so that spec's selectors no longer match
  the live tab and it should be treated as stale/broken test debt requiring a Tester follow-up,
  not as current coverage.

### Review round 2 fixes (this window's list never rendered the "Facturas rectificativas" tab)

The first pass shipped the correct `decisions.json` discriminator and fixed
`PurchaseInvoiceHeaderTable.jsx`'s badge, but missed that **three other files still
identified the rectificative subtype by hardcoded doc-type name/category**, so the new type
fell through untreated in each of them:

- `index.jsx`'s `INVOICE_SUBSET_FILTERS` — the list view here is a hand-rolled `ListView`
  that bypasses the generated `HeaderPage` (and therefore never reads `decisions.json`'s
  `window.subsetFilters` at runtime); its own local subset-filter constant still matched
  `transactionDocument$_identifier === 'AP Invoice' / 'AP CreditMemo'`, so a new
  "Factura Rectificativa (compras)" invoice only ever appeared under "Todos", never under
  "Facturas rectificativas" — the ticket's core requirement. Fixed by mirroring
  `decisions.json`'s exact `filter` criteria strings (server-side, not a client `rowFilter`).
- `PurchaseInvoiceTopbar.jsx`'s `isCreditType` — hardcoded to `'Nota de Crédito'` /
  `'AP CreditMemo'`, so the "Saldo a favor" / "Aplicada" payment-badge treatment never
  applied to the new type. Fixed via `getApSubtype(data) === 'RECTIFICATIVA'`.
- `RelatedDocuments.jsx`'s `RETURN_INVOICE_TYPES` — a `Set` of exact doc-type-name strings,
  so linked return-delivery documents were never fetched for a rectificativa invoice. Fixed
  via `getApSubtype(data) === 'RECTIFICATIVA'`.

A full audit of `tools/app-shell/src/windows/custom/purchase-invoice/` for the same
hardcoded-name pattern found no further occurrences (see the "Same bug, two more files"
note above for the one intentional exception, `DOC_TYPE_LABELS`).

## Theme roles

The window's live artifact custom components use the shared semantic theme.
Structural surfaces and controls consume background, card, foreground, muted, and
border roles; operational feedback uses success, warning, information, neutral,
and destructive roles. No local palette is used, so the active application theme
controls the appearance.

## Advanced-filter mode on rich cells — ETP-4681

Three list columns render bespoke cells and are therefore declared `type: 'custom'`
in `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx`
(the live table — note `artifacts/purchase-invoice/custom/InvoiceHeaderTable.jsx` is
an unreachable decoy):

| Column | Why it is `custom` | Declared `filterMode` |
|--------|--------------------|-----------------------|
| `outstandingAmount` (`OutstandingAmt`) | "Pagada" pill and an "Añadir pago" button | `numeric` |
| `grandTotalAmount` (`GrandTotal`) | sign-flips credit notes and returns | `numeric` |
| `eTGODueDate` (`EM_Etgo_Due_Date`) | 4-state coloured due-date dot | `date` |

`type: 'custom'` carries no filter semantics — `resolveFilterMode` cannot see the
underlying data type behind a bespoke `render`, so without an explicit
`filterMode` all three fell back to text mode. The visible symptom was on the
Dashboard shortcut "Por pagar", which navigates to
`/purchase-invoice?filter=overdue` and preloads `documentStatus equals CO` **and**
`outstandingAmount greaterThan 0`. Text mode has no `greaterThan` in its operator
set, so the operator `<Select>` matched no item and rendered its placeholder.

Note the divergence this also settles: sales-invoice declares `grandTotalAmount`
as `type: 'amount'` (which infers `numeric` on its own), while purchase-invoice
needs `custom` for the sign flip and therefore needs the explicit `filterMode`.

Rule **F19** of `sf-validate-pipeline` now blocks any new `custom` column over a
numeric/date/enum contract field that omits `filterMode`. Full reference:
[`list-filters.md`](../list-filters.md).

## MCP document actions (agents)

The header's `documentAction` button is what an AI agent uses to move this invoice through its
workflow over MCP. `neo_schema` returns it with `invokeVia: "neo_action"`, `actionValues` (the
active AD list of the `C_Invoice.DocAction` reference — note `CO` is labelled **Complete** here,
not Book) and `actionParameter: "docAction"`; its `agentPrompt` — defined in `decisions.json` ->
`entities.header.fields.documentAction.agentPrompt` — states which transitions are legal and
their preconditions.

Completing a draft invoice over MCP:

    neo_action { spec: "purchase-invoice", entity: "header", id: "<invoiceId>",
                 action: "documentAction", parameters: { docAction: "CO" } }

Flow encoded in the prompt: `DR -> CO` completes (computes taxes/totals, creates the payment
plan), `DR -> VO` voids, `CO -> RE` reactivates and **unposts first** when the invoice was
already posted (the Reactivate menu action carries `preUnpost: true`), `CO -> CL` closes.
Posting is a **separate** action on this window (`menuActions` key `post`, gated on
`processed && !posted`) and is **not** a `documentAction` value — the prompt explicitly tells
the agent never to send `PO` here.

This runs `PurchaseInvoiceHeaderHandler` exactly as the UI does — including the total-discount
line created before completion — because `neo_action` executes the entity's `NeoHandler` hooks
(ETP-4285). If you change this window's workflow rules, update the `agentPrompt` in the same
change: it is the only thing telling the agent what is legal.

### Write off the invoice difference (ETP-4797)

When the amount entered covers **less** than the invoice outstanding, the modal now offers an
`Ajustar diferencia de X €` toggle directly under the balance strip (which already spells the
gap out, so no separate breakdown is repeated). Turning it on settles the invoice in full and stores
the shortfall as `writeoffAmount`; leaving it alone is the previous behaviour — the invoice keeps the
difference outstanding. **Off by default.**

The control is `WriteoffToggleRow` from `components/contract-ui/WriteoffAdjustment.jsx`, shared with
the bank-reconciliation payment-method modal so both entry points produce the same outcome — the
whole point of the ticket. Its copy is direction-aware ("quedará pagada" for payments).

Three constraints worth knowing:

- **Native write-off, not a G/L item.** The amount lands on the `FIN_PaymentScheduleDetail` and its
  `FIN_PaymentDetail` and posts against the business partner group's write-off account. There is no
  accounting-concept selector and the copy deliberately does not mention one.
- **Hidden while editing a draft.** An edited draft reconciles its already-linked PSD through
  `PaymentDraftEditService.reapplyLinkedInstallmentPSD`, a Core call with no write-off input, so
  offering the toggle there would promise something the backend cannot honour.
- **Capped by the account's write-off limit.** `FIN_Financial_Account.Writeofflimit` disables the
  toggle with an explanatory caption when the difference exceeds it; the backend re-checks. An unset
  or zero limit means *no limit* — a deliberate divergence from Classic, documented in
  `financial-account.md`.

The flag travels as `writeoffDifference` in the existing `registerPayment` action body. Note this is
**not** the `writeoffs: {psdId: bool}` shape used by the New Movement / `PaymentForm` flow: that is a
different endpoint (`AddPaymentService`), and this modal never used it.

## Print button hidden in every status, list view unaffected — ETP-4714

The generic detail-view "Imprimir" action is hidden unconditionally on this window via
`"hidePrintWhen": true` in `decisions.json`. Two earlier iterations were tried and superseded:
first `hidePrintWhen: { documentStatus: "DR" }` (hide only in Borrador — the ticket's original,
later-corrected ask), then plain `"hidePrint": true`. The plain flag was itself a regression
caught during review: `hidePrint` drives **both** the detail-view Print button and the list
view's two print buttons (bulk "Print (N)" + toolbar Print/Report, neither status-gated), and
this window never had `hidePrint` set before this ticket — its list-view print was visible. The
final fix passes the literal `true` to `hidePrintWhen` instead, which
`evaluateFieldCondition(true, data) → true` treats as an unconditional match, gating **only**
the detail view; the list keeps its pre-ticket, untouched, always-visible print button. See
`docs/decisions-reference.md` ("Print Visibility") for the generic `hidePrintWhen` mechanism.
## OCR reader — create-contact pre-fill — ETP-4855

When the OCR reader cannot match the invoice's supplier to an existing business partner, the
vendor field offers "create contact" and opens `CreateContactModal`. That popup used to open
**completely empty**, discarding everything the extraction had already read — the user retyped
the name, tax ID and address by hand.

### The pre-fill chain

Four links, each of which has to carry the data:

| Step | File | Role |
|---|---|---|
| 1 | `ocrDocTypes.js` → `extraHeaderFields` | asks the vision model for the address/contact block |
| 2 | `ocrDocTypes.js` → `createPrefilledFrom` | maps extracted payload keys → **contact-form field ids** |
| 3 | `kinds/EntityField.jsx` | builds the `prefilled` map (generic — reads the config, no per-window code) |
| 4 | `CreateContactModalAdapter.jsx` | forwards the whole map as the modal's `prefill` prop |

`createPrefilledFrom` is keyed by **form field id**, not by AD column: `name`, `taxID`,
`address`, `postalCode`, `city`, `country`, `etgoEmail`, `etgoPhone`. Adding a field to the
popup is one entry there plus one `extraHeaderFields` entry — no component change.

### Why `country` is special

Text fields are seeded straight into `EntityCreationModal`'s `initialValues`. `country` (and
`region`) cannot be: the form holds an **option id**, while the invoice prints a **label**
("España"). Writing the label in would satisfy the required-field check with a value the API
rejects.

So those two are resolved through `matchOptionByLabel` (`src/lib/matchOptionLabel.js`) against
the country selector — accent- and case-insensitive, exact match first, then a prefix match in
either direction so `España` still finds `ESPAÑA (ES)`. **No match leaves the field empty**
rather than guessing: a wrong country id is invisible to the user, an empty picker is not.

The selector options are fetched *after* the modal mounts, and `EntityCreationModal` snapshots
`initialValues` in a `useState` initializer — so a late value cannot be delivered through it.
That is what the `patchValues` prop is for: it merges into fields that are **still empty**,
which makes it both idempotent and safe against clobbering something the user typed while the
options were loading. Resolving the country also seeds `currentCountry`, because the region
selector only loads once a country is known.

### Side effect worth knowing

`CreateContactModal` creates the BP up front (`BP → address → contacts → banks → billing
PATCH`) and posts the address whenever `address || city || country` is set. Pre-filling the
address block therefore means the new BP now gets a location — which is what
`resolvePartnerAddress` in `ingest/purchaseInvoiceDescriptor.js` looks up for the invoice
header's `partnerAddress` (NOT NULL on `C_Invoice`). Before this change, a BP created from the
OCR popup had no location at all.

### Automated evidence

- `src/lib/__tests__/matchOptionLabel.test.js` — label matching, including the refusal to
  prefix-match a 2-character option label and the empty-on-no-match contract.
- `src/components/contract-ui/__tests__/CreateContactModal.vitest.jsx` → `describe('CreateContactModal — pre-fill')`
  — free-text seeding, country label kept out of the form, resolution once the selector loads,
  and `initialQuery` precedence.
- `src/components/contract-ui/__tests__/EntityCreationModal.vitest.jsx` → `describe('EntityCreationModal — patchValues')`
  — fills empty, never overwrites typed input, successive patches.
- `src/components/copilot/ocr/__tests__/ocrDocTypes.prefill.vitest.js` — every
  `createPrefilledFrom` source must be a key the extraction schema actually emits. A typo there
  fails silently at runtime (the field just looks unextracted), so it is asserted in CI.

## OCR side panel — attach from the panel, removed placeholders — ETP-4855 Error 3

### Three removals

The panel shipped with UI that did nothing:

- **"Messages" / "History" tabs** — both rendered a permanent `ComingSoon` placeholder.
- **The context-menu button** (`MoreVertical`) — had no `onClick` at all.

With a single view left there is no tab bar to render, so the whole header row is gone and
`OcrSidePanel` renders the file view directly. The i18n keys (`ocrSidePanelTabFile`,
`ocrSidePanelTabMessages`, `ocrSidePanelTabHistory`, `ocrSidePanelComingSoon`,
`ocrSidePanelMore`) were removed from **both** locale files.

### Attaching from the panel

In edit mode `AttachmentsView` was **read-only** — it listed attachments and rendered the first
PDF, with no way to add one. It can now attach, and the requirement that the file "quede visible
en la sección de Adjuntos" needs no synchronisation at all:

| Path | Endpoint | Store |
|---|---|---|
| Side panel (read) — `listAttachments` | `GET /sws/neo/attachments/{table}/{id}` | `AD_Attachment` |
| Side panel (write) — `uploadAttachment` **(new)** | `POST /sws/neo/attachments/{table}/{id}` | `AD_Attachment` |
| Attachments tab — `useAttachments` | same endpoint | `AD_Attachment` |
| OCR post-commit — `attachFile` | `POST /webhooks/?name=AttachFile` (by `AD_Tab_ID`) | `AD_Attachment` |
| Document preview — `usePreviewAttachment` | `/sws/neo/preview-file` | **`ETGO_PREVIEW_FILE`** |

> The two "Side panel" rows describe this pass only. The Error 4 fix below moved the
> panel onto the document slot: it now reads `ETGO_PREVIEW_FILE` and *mirrors* the
> write into the attachments endpoint. The table is kept because the rest of this
> section reasons about it.

The panel and the Attachments tab were already reading the same endpoint; only the write side was
missing. `uploadAttachment` lives in `listAttachments.js` — the documented thin client for
`/sws/neo/attachments/*` — and returns `{ ok, error }` rather than throwing, matching its
siblings. `useAttachments` keeps its own `upload` (hook layer, with toasts and optimistic
state); de-duplicating the two is a follow-up, not part of this fix.

**PDF first, images once the slot landed.** This pass accepted PDF only, because the view
rendered the attachment in a PDF viewer and the ticket requires the attached file and the one on
screen to be the same document. Sharing the slot with the grid preview made that too narrow — a
scanned JPG dropped there has to render — so `ACCEPTED_TYPES` now covers PDF plus the common
image types, and the panel renders images through `<img>` instead of the PDF viewer.

### Why the OCR reader cannot run on a hand-captured invoice

No flag was needed. `OcrInlineUploader` is the only thing that dispatches the extraction event,
and `FileTab` mounts it **only** when `isNew`. On a saved record the panel renders
`AttachmentsView`, which attaches a file and never triggers extraction. The gap the ticket
described was the missing attach capability, not a missing guard — the guard is structural.
`OcrSidePanel.vitest.jsx` asserts the uploader is never mounted for a saved record, so a future
refactor cannot quietly reintroduce it.

### Keeping the two views in sync

The panel and the Attachments tab each hold their own copy of the list, and
DetailView keeps inactive tabs **mounted** — so a write through one left the other
showing stale data until the user left form view and came back. `useAttachments`
also only ever loaded eagerly on mount, never again.

They share a server store, not a client one, so the fix is a notification, not
shared state: `components/attachments/attachmentsBus.js`. A writer calls
`notifyAttachmentsChanged({ tableName, recordId, source })` **after** the server
confirms; every other view of the same record reloads via
`useAttachmentsChanged(...)`. Same `window` CustomEvent mechanism the OCR
extraction flow already uses to cross component boundaries.

Each view passes its own `source` (from `newAttachmentsSource()`) and skips its own
events — otherwise the tab would fire a redundant GET after every optimistic
mutation and undo its own optimistic UX. Events are addressed by
`(tableName, recordId)`, compared as strings, and a notification without a record
is dropped rather than broadcast to every view.

Emitters: the panel's upload, and `useAttachments`' `upload` / `remove` /
`removeAll` — the three operations that change the *set* of attachments.
`updateDescription` deliberately does not emit: the panel does not render
descriptions.

### Superseded: the preview modal — the document slot

An earlier pass made the grid preview read `AD_Attachment` directly. That was
replaced once a simpler invariant surfaced: **a purchase invoice has no generated
report** (`useInvoicePreview` passes `null` to `useInvoicePdf` unless the spec is
`sales-invoice`, and no jsreport template exists for it), so nothing competes for
its `ETGO_PREVIEW_FILE` slot — one file per `(specName, recordId)`.

That makes the slot the definition of *"the document of this record"*, which is
exactly what the team asked the panels to show: only the OCR source, and nothing
for invoices captured by hand or imported historically.

| | |
|---|---|
| **Read** | both side panels (grid preview and form view) read the slot via `usePreviewAttachment` |
| **Write** | storing from a panel writes the slot **and** mirrors the file into `/sws/neo/attachments`, so it appears in the Attachments tab |
| **OCR flow** | after the batch commits, `OcrInlineUploader` fills the slot alongside its existing `attachFile` call — that webhook is untouched |
| **Manual / historic** | no slot row → panels empty |

The mirror is opt-in per caller via `attachmentConfig.tableName`. Generated-PDF
caches (sales invoice, order, quotation) omit it: nobody attached those files, so
they must not appear as attachments.

**The cost, stated plainly:** the bytes live twice — once in `C_File`, once
base64-encoded in `ETGO_PREVIEW_FILE.file_data` (~33% larger). For scanned
supplier documents that is not free. It buys zero backend work: no AD column, no
Java, no `export.database`.

**Deletions are kept consistent in both directions**, because a stale slot is the
same class of bug as the one fixed above:

- deleting from a panel empties the slot and removes the mirrored attachment —
  but only when exactly one attachment matches the slot file's name; an ambiguous
  match is left untouched rather than guessing which copy to remove
- deleting from the Attachments tab fires the attachments bus; the hook then
  checks whether its slot file is still attached and, if not, empties the slot

Both panels now share `usePreviewAttachment`, so `OcrSidePanel` no longer carries
its own listing logic — the duplication between the two disappeared.

### Also removed: the preview modals' placeholder tabs

The Messages / History tabs were permanent `EmptyPanel` placeholders in every
preview modal, injected in four files directly and in three more through a shared
`makeStaticPreviewTabs(ui)` builder (goods receipt and both return windows). The
builder and all call sites are gone, along with two dead local `EmptyPanel`
helpers and eight orphaned locale keys across the three locale files.

### Automated evidence

- `src/windows/custom/shared/__tests__/OcrSidePanel.vitest.jsx` → `describe('OcrSidePanel —
  removed placeholder UI')`, `describe('… — OCR reader gating')` and `describe('… — the document
  slot')` — the three removals (no tab bar, no `tablist`/`tab` roles, no context-menu button), the
  uploader never mounting on a saved record, and the slot contract: which arguments the hook is
  asked for, empty slot ⇒ nothing rendered, PDF vs image rendering, rejected file type, failed
  store surfaced, attach action hidden without a record id.
- `src/windows/custom/shared/__tests__/usePreviewAttachment.vitest.jsx` — the slot itself: the
  mirror written on store, a failed mirror staying non-fatal, mirror deletion only on an
  unambiguous name match, and the bus-driven slot cleanup.
- `src/components/copilot/ocr/__tests__/listAttachments.upload.vitest.js` — transport contract:
  multipart body, **no** hand-set `Content-Type` (it would drop the boundary), and never throwing.
- `src/components/attachments/__tests__/attachmentsBus.vitest.jsx` — addressing rules:
  own-source suppression, per-record and per-table filtering, string id comparison,
  unsubscribe on unmount, no broadcast without a record.
- `src/components/attachments/__tests__/useAttachments.vitest.jsx` →
  `describe('useAttachments — cross-view sync')` — the tab reloading on a foreign write and
  staying silent on its own, including silence when the write failed.

The previous `OcrSidePanel.test.js` was deleted: it asserted the removed tabs via source regex,
and it was matched by neither npm test script, so it had never run.
