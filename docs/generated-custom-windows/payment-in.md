# Payment In

## Intent
This window should let a finance user register money received from a customer, decide whether that money is a free credit or tied to open invoices, process the payment through its operational states, and review the resulting allocations and follow-up documents from the payment record itself.

The current repo evidence shows a generated finance window with payment-in-specific custom surfaces around creation, activity, related documents, and payment summary, while the main header and allocation lines still follow the standard contract-driven detail flow.

## What this window should allow
- Browse existing incoming payments and find them by document number, payment date, or received-from business partner.
- Create a new incoming payment either as an unapplied credit/advance or as a payment linked to an outstanding invoice.
- Capture the core intake data for the payment header: payer, payment date, payment method, deposit account, currency, amount, notes, and current status.
- Maintain allocation lines under the payment so the received amount can be matched to invoice payment schedules.
- Process an awaiting payment and later reverse it when the payment has already reached a received, deposited-not-cleared, or cleared state.
- Review related invoices and payment activity directly from the payment detail page.

## Interaction model
- Route: `/payment-in` for the list and `/payment-in/:recordId` for the detail view.
- Visibility: visible from the Finance menu in `tools/app-shell/src/menu.json`.
- Implementation type: generated window loader from `tools/app-shell/src/windows/registry.js`, backed by `artifacts/payment-in/generated/web/payment-in/FinPaymentPage.jsx` and extended with payment-specific custom components such as `NewPaymentModal`, `PaymentBottomPanel`, `PaymentActivityToggle`, and `RelatedDocuments`.
- Window shape: master-child. The primary entity is `finPayment` and the child dataset is `finPaymentScheduleDetail`, exposed as the payment allocation lines.
- Lines surface: the allocation child (`finPaymentScheduleDetail`) is managed through the custom `PaymentBottomPanel` component, not through the standard lines table. `decisions.json` sets `detailEntity: null`, so `linesLayout` is not applicable for this window. Allocation management and summary recalculation are handled entirely inside `PaymentBottomPanel`.
- List interaction: the list shows document number, payment date, received-from business partner, amount, and status, with filters limited to `documentNo`, `paymentDate`, and `businessPartner`.
- Detail interaction: opening a payment uses the generated detail page with the contract-backed header form, related-documents tab, bottom summary panel, notes field on `description`, and a top-right activity toggle. Creating a payment from the list opens the specialized `NewPaymentModal` instead of the plain generated new-record flow.

## Reactive behavior and dependencies
- Selector dependencies are explicit in the contract and modal flow. `paymentMethod` is a searchable selector, `account` depends on the selected payment method, and `currency` depends on the selected account. In the new-payment modal, changing payment method refetches deposit accounts and resets the selected account.
- Header defaulting is partially evidenced. The contract defaults `paymentDate` to the current date, `amount` to `0`, and `status` to `RPAP` (Awaiting Payment). The modal also initializes the date to today and auto-selects the first available account after accounts are fetched.
- The `date` field in `NewPaymentModal.jsx` uses the generic `DateField` component (`tools/app-shell/src/components/ui/date-field.jsx`) — Figma-aligned calendar popover with always-visible calendar icon, month/year picker, and Etendo yellow hover on filled-black elements.
- Invoice-linked intake reacts to the chosen invoice in the specialized modal. After a customer and invoice are selected, the modal preloads the payment amount from the invoice outstanding amount and calls the sales-invoice payment registration action rather than creating a freeform header directly.
- Payment-state reactions are clearly visible on the detail page. `Process Payment` is exposed only when status is `RPAP`, while `Reverse Payment` is exposed only when status is `RPPC`, `RPR`, or `RDNC`. The page also hides deletion once the payment is considered complete.
- The allocation-line relationship is parent-driven. The child `finPaymentScheduleDetail` dataset is fetched with `parentId={paymentId}`, so line visibility and related-document lookups depend on the selected payment header.
- Amount allocation reactions are partially evidenced through the payment-specific bottom panel. That panel recalculates applied amount indirectly from child lines with `invoicePaymentSchedule`, computes remaining unallocated credit against the header amount, and shows linked invoices resolved from those schedule lines.
- Activity and related-document surfaces also react to the payment state and allocations. The activity panel builds timeline entries from payment date, status, linked invoice schedules, and appended notes; the related-documents tab resolves invoices from payment schedule lines. No discount, tax, or order-style total recalculation is visible in the current evidence for this window.

## Gap assessment
- Incoming-payment intent strongly suggests that allocation lines should be the main way to distribute a payment across invoices, but the current visible page wiring only proves the generic child lines plus custom summary/activity surfaces. The repo also contains `artifacts/payment-in/custom/ApplyToInvoices.jsx`, which implements an explicit apply-and-process flow, yet that component is not visibly wired from `FinPaymentPage.jsx`. Treat the exact invoice-allocation UX as an open ambiguity.
- The contract excludes the `aPRMAddScheduledpayments` action from the visible process overrides, so current evidence does not show a dedicated built-in action for pulling scheduled payments into lines. If users are expected to auto-populate allocation lines from outstanding schedules, that behavior is a documented gap rather than proven functionality.
- The bottom panel proves that remaining credit is recomputed from child lines, but the current evidence does not prove whether editing a line updates header summaries immediately, only after save/refresh, or through backend recalculation. Real-time allocation feedback should be treated as partially evidenced.
- Processing intent is clear, but the current reviewed evidence does not fully describe guardrails such as preventing over-allocation across lines, blocking process when unapplied balance remains, or handling partial allocations differently from full settlement. Those business rules remain open.
- There is no payment-in-specific UI test in `tools/app-shell` covering the specialized modal, status-driven actions, activity drawer, or allocation summary behavior, so these interactions still rely on manual verification.

## Manual verification
1. Open `/payment-in` and confirm the Finance menu route loads the incoming-payment list rather than a placeholder.
2. Start a new payment and confirm creation opens the specialized modal with the two intake modes instead of the plain generated header form.
3. In credit/advance mode, select a customer, payment method, and deposit account, enter an amount, save, and confirm the created record opens in `/payment-in/:recordId`.
4. In invoice-linked mode, select a customer with open invoices, pick an invoice, and verify the modal preloads the amount from the invoice outstanding balance before creating the payment.
5. Open a saved payment and confirm the detail page shows the related-documents tab, the bottom summary panel, and the top-right activity toggle.
6. On a payment in `RPAP`, confirm `Process Payment` is available. After processing the payment to `RPR`, `RDNC`, or `RPPC`, confirm `Reverse Payment` becomes visible and delete is no longer the expected completion path.
7. Open the `Lines` child dataset for a payment with allocations and confirm the line surface exposes at least due date, received amount, and invoice payment schedule, all scoped to the current payment via `parentId`.
8. Create or edit allocation lines tied to invoice schedules and confirm the bottom panel reflects linked invoices and any remaining unallocated credit after refresh.

## Automated evidence
- There is no dedicated payment-in UI test in `tools/app-shell` covering the specialized create flow, payment-state actions, or allocation panels.
- The contract itself contains generated validation coverage for field presence, field types, searchable filters, and default-value typing for `finPayment` and `finPaymentScheduleDetail`, but those checks do not assert rendered payment-specific behavior.
- Shared shell loading and route behavior are documented centrally in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- Evidence reviewed for this document:
  - `tools/app-shell/src/menu.json`
  - `tools/app-shell/src/windows/registry.js`
  - `artifacts/payment-in/contract.json`
  - `artifacts/payment-in/generated/web/payment-in/FinPaymentPage.jsx`
  - `artifacts/payment-in/generated/web/payment-in/FinPaymentTable.jsx`
  - `artifacts/payment-in/generated/web/payment-in/FinPaymentScheduleDetailForm.jsx`
  - `artifacts/payment-in/custom/NewPaymentModal.jsx`
  - `artifacts/payment-in/custom/PaymentBottomPanel.jsx`
  - `artifacts/payment-in/custom/PaymentActivityPanel.jsx`
  - `artifacts/payment-in/custom/RelatedDocuments.jsx`
  - `artifacts/payment-in/custom/ApplyToInvoices.jsx`