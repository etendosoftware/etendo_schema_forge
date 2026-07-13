# ETP-4331 — Cross-domain plan: two-step collection/payment modal

## Why this change is cross-domain

The two-step Cobros/Pagos flow (history popup → "new collection/payment" modal)
lives in a **shared custom component** consumed by both invoice verticals:
`InvoicePaymentHistoryModal.jsx` (unified history popup, step 1) plus
`NewPaymentEntryModal.jsx` and `usePaymentBalance.js` (step 2 + balancing logic).
The entry point is the payment-status badge that each vertical's topbar renders,
so wiring the badge necessarily touches both the **sales-invoice** and
**purchase-invoice** windows. The user-visible strings are shared, so the change
also edits the **app-shell-core** locale files. Splitting this per window would
duplicate the shared modal and leave the two topbars inconsistent.

## Domains touched (dominios)

- **shared-custom-capability** — `InvoicePaymentHistoryModal.jsx` (unified
  history popup for sales + purchase, Figma redesign, opens step 2),
  `NewPaymentEntryModal.jsx` (new step-2 modal), `usePaymentBalance.js` (new
  balancing hook), `paymentModalUi.jsx` (shared `DirBadge`),
  `preview-cards/PaymentsCard.jsx` (processed-flag fix + PWNC/RPAE statuses),
  and their unit tests. All components carry baseline + explicit `cp-*`
  `data-testid`s. `InvoicePaymentModal.jsx` removed (consolidated into history
  modal).
- **app-shell-core** — new generic `cp*` i18n keys in `es_ES.json` and
  `en_US.json` (modal/popup labels), kept in ES/EN parity.
- **window:sales-invoice** — `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx`
  (rewired to `InvoicePaymentHistoryModal`; opens the unified popup) + its
  generated window doc.
- **window:purchase-invoice** — `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx`
  (same badge testid wiring) + its generated window doc.
- **e2e** — `e2e/tests/flows/collection-payment-modal.mocked.spec.js` and
  `e2e/tests/flows/payment-modal-validation.mocked.spec.js` (full two-step flows,
  mocked).

The backend counterpart (NeoHandler actions for draft/confirm + credit sources)
lives in the sibling `com.etendoerp.go` repo and is tracked in its own PR.

## Tests

- **Node** — `usePaymentBalance.test.js` (es-ES format/parse round-trips, balance
  math, toggle auto-cash-adjust, equalize), `NewPaymentEntryModal.test.js`
  (source-structure guards for the redesign).
- **Vitest** — `usePaymentBalance.vitest.jsx`, `NewPaymentEntryModal.vitest.jsx`
  (fields prefilled, split-adaptive credit section, draft vs confirm payloads,
  excess gating, date-required validation), `InvoicePaymentHistoryModal.vitest.jsx`
  (unified modal: stats, empty state, add button, deposited/draft state tags).
- **Playwright** — `collection-payment-modal.mocked.spec.js` (badge → history
  popup → new-payment modal → register → refreshed movement) and
  `payment-modal-validation.mocked.spec.js` (date-required guard, red border).
  Both stateful mocks, no backend required.

## Rollback

Single-branch revert. The change is shared UI components + additive locale keys +
topbar rewires + additive tests, with no DB migration, no NEO push, and no
schema/contract change. Reverting the branch restores the previous modals; the
`cp-*` i18n keys are additive so removing them is inert. The E2E specs are
mock-only and have no runtime impact.
