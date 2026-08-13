# ETP-4098 — Cross-domain plan

This PR (#667, `feature/ETP-4098` → `epic/ETP-3504`) is an intentionally
cross-domain vertical slice for the **financial accounts** area. It is declared
cross-domain via the `cross-domain-approved` label, as documented in
`docs/ops/domain-boundary-check.md`. CODEOWNER review still applies.

## Domains touched

- **window:financial-account** — account detail window: movements tab, the New
  Movement wizard (incl. "Registrar pago" / "Concepto contable"), statements,
  summary strip, advanced filter, dimensions, and its generated-window doc.
- **window:financial-accounts-page** — accounts list page (`pages/FinancialAccountsPage`)
  plus its account-type filter and generated-window doc.
- **platform-change** — shared app-shell code reused by the above: hooks
  (`useAccountMovements`, `useMovementLookups`, `useDimensionValues`,
  `useCreateMovement`/`useCreatePayment`), `pages/`, and `components/ui/tabs`.
- **shared payment/form components** — new reusable workspace under
  `tools/app-shell/src/components/payment/*` (PaymentForm, AddPaymentModal,
  paymentData, paymentInvoiceFilter) and `components/forms/fields`,
  `components/financial-accounts/AccountTypeFilter`. These are generic,
  window-agnostic building blocks (platform-level), consumed by the windows
  above; they are not classified by the current boundary policy yet.
- **app-shell-core** — i18n locale additions (`en_US.json`, `es_ES.json`).

Why one PR: the payment workspace, the movement wizard and the accounts page are
a single financial-accounts vertical developed together; splitting them would
break the shared component extraction and the i18n keys mid-flight.

## Backend companion

The matching backend changes live in `com.etendoerp.go` on the same
`feature/ETP-4098` branch (the `create-payment` action + `AddPaymentService`
replicating Classic "Add Payment", outstanding-invoices endpoint, header
dimensions). Both repos share the branch.

## Tests

- `tools/app-shell` Vitest suite green (full suite, incl. financial-account and
  payment specs): `npm run test:vitest`.
- Java module compiled (`com.etendoerp.go`).
- Manual verification against Etendo Classic (client GOClient, account Caja):
  exact receipt vs. an invoice, write-off (Descuento), G/L commission line,
  over-payment "leave credit", over-payment "refund", and the G/L-concept path —
  comparing the created `FIN_Payment` / `FIN_Finacc_Transaction` and the invoice
  outstanding amounts against Classic.

## Rollback

Single revert unit: revert the merge of PR #667 (and the paired
`com.etendoerp.go` PR) on `epic/ETP-3504`. No data migration is involved — the
backend changes are handler code (no DB schema / NEO config export), so reverting
the code fully restores prior behavior. The frontend changes are additive
(new components/hooks + wizard wiring); reverting removes the "Registrar pago"
persistence path and restores the previous manual-transaction behavior.
