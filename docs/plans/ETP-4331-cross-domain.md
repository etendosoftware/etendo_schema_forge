# ETP-4331 — Cross-domain plan: two-step collection/payment modal

## Why this change is cross-domain

The two-step Cobros/Pagos flow (history popup → "new collection/payment" modal)
lives in a **shared custom component** consumed by both invoice verticals:
`tools/app-shell/src/windows/custom/shared/InvoicePaymentModal.jsx` (redesigned
step 1) plus the new `NewPaymentEntryModal.jsx` and `usePaymentBalance.js`
(step 2 + balancing logic). The entry point is the payment-status badge that
each vertical's topbar renders, so wiring the badge necessarily touches both the
**sales-invoice** and **purchase-invoice** windows. The user-visible strings are
shared, so the change also edits the **app-shell-core** locale files. Splitting
this per window would duplicate the shared modal and leave the two topbars
inconsistent.

## Domains touched (dominios)

- **shared-custom-capability** — `InvoicePaymentModal.jsx` (step-1 redesign +
  opens step 2 + observability `trackDocumentCreated`), `NewPaymentEntryModal.jsx`
  (new step-2 modal), `usePaymentBalance.js` (new balancing hook), and their unit
  tests. Both components carry baseline + explicit `cp-*` `data-testid`s.
- **app-shell-core** — new generic `cp*` i18n keys in `es_ES.json` and `en_US.json`
  (modal/popup labels), kept in ES/EN parity.
- **window:sales-invoice** — `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx`
  (payment-status badge gains `data-testid="payment-status-badge"`; opens the
  redesigned popup) + its generated window doc.
- **window:purchase-invoice** — `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx`
  (same badge testid wiring) + its generated window doc.
- **e2e** — `e2e/tests/flows/collection-payment-modal.mocked.spec.js` (full
  two-step flow, mocked).

The backend counterpart (NeoHandler actions for draft/confirm + credit sources)
lives in the sibling `com.etendoerp.go` repo and is tracked in its own PR.

## Tests

- **Node** — `usePaymentBalance.test.js` (es-ES format/parse round-trips, balance
  math, toggle auto-cash-adjust, equalize), `InvoicePaymentModal.test.js` and
  `NewPaymentEntryModal.test.js` (source-structure guards for the redesign).
- **Vitest** — `usePaymentBalance.vitest.jsx`, `NewPaymentEntryModal.vitest.jsx`
  (fields prefilled, split-adaptive credit section, draft vs confirm payloads,
  excess gating), and `InvoicePaymentModal.vitest.jsx` (step-1 stats, empty state,
  add button visibility, opens step 2). `PaymentRegisterForm.validation.vitest.jsx`
  kept green (the form is retained).
- **Playwright** — `collection-payment-modal.mocked.spec.js`: badge → history
  popup → new-payment modal → register → refreshed movement (deposited + draft),
  stateful mock, no backend required.

## Rollback

Single-branch revert. The change is shared UI components + additive locale keys +
two topbar testid wirings + additive tests, with no DB migration, no NEO push,
and no schema/contract change. Reverting the branch restores the previous
"Payments" modal and removes the new step-2 modal and keys; the topbars fall back
to opening the prior modal. The `cp-*` i18n keys are additive, so removing them is
inert. The E2E spec is mock-only and has no runtime impact.
