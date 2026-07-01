# Payment Out

## Intent

Use this window to register and complete outgoing payments to vendors or other payable recipients. The payment should let a user choose who is being paid, which financial account issues the payment, how the payment is executed, which purchase schedules are being settled, and what accounting effect the payment produces.

## What this window should allow

- Create, open, edit, and review outgoing payment headers from the Finance area.
- Capture the payment header around **Paying To**, **Paying From**, **Payment Method**, **Currency**, **Payment Date**, optional **Reference No.**, and descriptive notes.
- Review payment status and the derived header amounts that summarize the payment, including total amount, used credit, and write-off amount.
- Add allocation lines against payable schedules, especially purchase-invoice schedules, while reviewing **Due Date**, **Expected Amount**, **Paid Amount**, **Invoice No.**, **Order No.**, and related partner context.
- Trigger the payment lifecycle actions exposed by the contract when the backend status allows them, especially adding scheduled payments, processing the payment, and executing it.
- Review operational follow-up surfaces tied to the payment record: execution history, exchange-rate records, used credit sources, accounting entries, and related purchase documents.

## Interaction model

- **Route:** `/payment-out` for the list and `/payment-out/:recordId` for record detail, following the shared generated/custom window route behavior documented in `app-shell-functional-flows.md`.
- **Visibility:** visible in the Finance menu through `tools/app-shell/src/menu.json`.
- **Implementation type:** custom app-shell route. `tools/app-shell/src/windows/registry.js` resolves `payment-out` to `tools/app-shell/src/windows/custom/payment-out/index.jsx`, which wraps the generated payment-out app from `artifacts/payment-out/generated/web/payment-out/index.jsx`.
- **Window shape:** master-child. The primary record is the payment header (`header` / generated `finPayment` page), and the main child working surface is **Lines**.
- Lines tab layout: this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Current visible detail composition:** the generated page is list/detail based, and the custom wrapper keeps the header plus **Lines**, uses `description` as notes, removes generated secondary tabs, and adds a custom **Related Documents** tab.
- **Contract-backed secondary surfaces:** the payment-out contract and generated API still define **Execution History**, **Exchange rates**, **Used Credit Source**, and **Accounting** entities even though the custom wrapper does not currently expose those generated secondary tabs in the app-shell detail view.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies

- Header selectors are not independent. The contract wires `SE_Payment_BPartner`, `SE_PaymentMethod_FinAccount`, `SE_Payment_FinAccount`, and `SE_Payment_MultiCurrency`, so changing the recipient, payment method, financial account, payment date, or currency should influence available values and derived payment amounts.
- Multi-currency behavior is explicitly modeled. The header exposes **Paid (Financial Account)** and **Exchange Rate** only when the financial-account currency differs from the payment currency, and both fields are tied to the multi-currency callout.
- Status drives actions. **Add Details** is available only while the payment is not processed, **Payment Process** appears only after processing and while the payment is not void, and **Execute Payment** appears only when status is `RPAE` (Awaiting Execution).
- Header totals are derived, not free-entry fields. **Amount**, **Used Credit**, and **Write-off Amount** are read-only on the header, so child allocations and credit usage should be what moves those totals.
- The **Lines** child surface is the main dependency point between the payment and payable documents. Each line can reference an invoice payment schedule or an order payment schedule, and the custom **Related Documents** tab follows those schedule references to fetch linked purchase invoices and purchase orders.
- Exchange-rate rows have their own reactions. The contract wires `SE_CalculateExchangeRate` on **Rate** and **Foreign Amount**, and the exchange-rate row becomes read-only when reversed-invoice flags are present or the payment is posted.
- Used credit is modeled as a dependent child surface. **Used Credit Source** links another payment through **Credit Payment Used**, stores an amount and currency, and should feed the header's read-only **Used Credit** total.
- Accounting is review-oriented in current evidence. The accounting surface exposes read-only ledger dimensions such as general ledger, period, accounting date, account, debit, credit, description, and related dimensional references.
- No explicit totals-balancing rule, discount recalculation, tax recalculation, or posting-side refresh is visible in the current payment-out app-shell code beyond the generic child-save refresh behavior described in `app-shell-functional-flows.md`.

## Gap assessment

- The business surface suggests one payment workspace spanning header, lines, execution history, exchange rates, used credit, accounting, and related documents. The contract and generated API define all of those entities, but the current custom wrapper clears generated secondary tabs, so **Execution History**, **Exchange rates**, **Used Credit Source**, and **Accounting** are contract-backed yet not clearly exposed in the current app-shell detail UI. That is a functional gap unless another navigation path surfaces them.
- Purchase-order allocation is only partially evident in the visible interaction. The contract supports `orderPaymentSchedule`, and the related-documents tab can resolve purchase orders from line schedules, but the generated quick-add line entry only includes **Paid Amount** plus **Invoice Payment Schedule**. It is therefore unclear whether order-based allocations are intentionally secondary-form-only or currently underexposed.
- The contract exposes lifecycle actions and read-only accounting data, but current evidence does not prove the full payable-balancing outcome, posting timing, or ledger generation timing that users would normally expect after processing or executing a payment. Treat posting/accounting effects as expected business semantics, not confirmed app-shell behavior.
- Exchange-rate and credit behavior are modeled in the contract, but there is no window-specific automated or browser evidence here showing that multi-currency recalculation, credit consumption, or cross-surface totals update correctly in the current UI.

## Manual verification

1. Open `/payment-out` from the Finance menu and confirm the route loads the custom payment-out window rather than a placeholder or generated fallback.
2. Create a payment and confirm the header supports **Paying To**, **Paying From**, **Payment Method**, **Currency**, **Payment Date**, **Reference No.**, and notes.
3. Change partner, account, payment method, date, and currency values and confirm dependent selector options or multi-currency fields react instead of remaining static.
4. Add payment lines and confirm the user can allocate **Paid Amount** against payable schedules while reviewing due date, expected amount, invoice/order references, and related partner context.
5. Save a payment whose lines reference purchase invoice and purchase order schedules, then open **Related Documents** and confirm the chips navigate to `/purchase-invoice/:id` and `/purchase-order/:id`.
6. Move a record through statuses where possible and confirm **Add Details**, **Payment Process**, and **Execute Payment** appear only in the documented lifecycle states.
7. Verify whether **Execution History**, **Exchange rates**, **Used Credit Source**, and **Accounting** are reachable anywhere in the current payment-out detail UI. If they are not visible, record that as a confirmed app-shell gap rather than assuming backend support is enough.
8. If multi-currency or credit scenarios are available, verify whether exchange-rate rows, used-credit rows, header totals, and accounting review data update after line or lifecycle changes.
9. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence

- Route visibility and loader registration are directly evidenced by `tools/app-shell/src/menu.json`, `tools/app-shell/src/windows/registry.js`, and the shared registry test `tools/app-shell/src/windows/__tests__/registry.test.js`.
- Current payment-out UI composition is directly evidenced by `tools/app-shell/src/windows/custom/payment-out/index.jsx`, `tools/app-shell/src/windows/custom/payment-out/RelatedDocuments.jsx`, and `artifacts/payment-out/generated/web/payment-out/FinPaymentPage.jsx` plus `index.jsx`.
- Payment fields, child entities, selector endpoints, action endpoints, callouts, display logic, and read-only/computed behavior are contract-backed in `artifacts/payment-out/contract.json` and shaped by `artifacts/payment-out/decisions.json`.
- No payment-out-specific browser or node test was found that proves end-to-end outgoing-payment lifecycle behavior, multi-currency recalculation, credit usage, posting effects, or exposure of the contract-defined secondary surfaces.
- The generated `FinPaymentPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `FIN_Payment` AD table.- **ETP-3995 — Related Documents tab i18n**: The generated page file now uses `labelKey: 'relatedDocuments'` in the `customTabs` prop instead of a hardcoded `label: 'Related Documents'` string, so the tab title renders via the active UI language (e.g. "Documentos relacionados" in Spanish) regardless of the browser locale.

## PSD2 dependency — `EM_Psd2_Generate_Bank_Payment`

`com.etendoerp.go` now depends on the **PSD2** module, which places a real
"Generate Bank Payment" action (`EM_Psd2_Generate_Bank_Payment`) on the payment
header. Unlike the orphan-column case in the other PSD2-touched windows, here the
PSD2 module ships an actual `AD_Field`, so it surfaces in the contract as an
**editable header field** (`psd2GenerateBankPayment`) with its own action endpoint
`/sws/neo/payment-out/header/{id}/action/psd2GenerateBankPayment` and display
logic. Contract regenerated when the PSD2 dependency was added. Full rationale:
[`docs/plans/psd2-dependency-cross-domain.md`](../plans/psd2-dependency-cross-domain.md).
