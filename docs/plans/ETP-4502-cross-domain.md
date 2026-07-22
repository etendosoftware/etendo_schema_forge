# ETP-4502 Cross-Domain Plan

Multi-currency reconciliation of an invoice against a financial account: when a bank statement line
in the account currency is reconciled against an invoice in a different currency, generate the
payment in the invoice currency (settling the document) and the bank transaction in the account
currency, with the conversion rate **derived** from the two amounts (statement line ÷ invoice
outstanding). Built on top of ETP-4504's rate-aware payment machinery. Scope for this iteration:
one statement line ↔ one foreign invoice, full settlement. Same-currency reconciliation is
unchanged. Criteria 1–2 (payment-method multicurrency defaults + PSD2 bank-transfer exception) were
already delivered by ETP-4503 and are only verified here.

## Domains changed

| Domain | Files | Reason |
|--------|-------|--------|
| `backend:etendo-go` | `PaymentCurrencyConverter.java` | New `derivedRate(paymentAmount, accountAmount)` helper |
| `backend:etendo-go` | `PaymentRegistrationService.java` | New `registerReconciliationPaymentMultiCurrency` + explicit-txn-amount `createDraftPayment` overload + `assertMethodMultiCurrency` guard |
| `backend:etendo-go` | `ReconciliationFlowSupport.java` | Foreign-invoice full-settlement branch in `createInvoicePayments` |
| `backend:etendo-go` | `ReconciliationHandler.java` | Invoice currency (ISO + id) added to candidate SQL and rows |
| `window:financial-account` | `ReconciliationSplitPanel.jsx` | Currency badge on foreign candidates, derived-rate preview, single-foreign selection, foreign display currency |
| `app-shell-core` | `en_US.json`, `es_ES.json`, `es_AR.json` | i18n keys `financeReconcileBarInvoiceAmount/BankAmount/Rate` |
| `docs` | `docs/generated-custom-windows/financial-account.md` | Document multi-currency reconciliation behavior |

## Key design decision

The conversion rate is **derived** (`|statement line| ÷ |invoice outstanding|`), not looked up from
`C_Conversion_Rate`. The statement line is ground truth for what settled the invoice, so the
financial transaction is booked at the exact line amount (no double rounding, no exchange-difference
residual). The transaction amount equalling the line amount also lets the existing
`validateOperations` coverage check pass unchanged. A payment method that is not multi-currency
enabled for the direction (e.g. a PSD2 bank-transfer method, per ETP-4503) is rejected with a clear
error rather than a cryptic Core failure.

## Tests

- JUnit: cross-currency → payment in invoice currency, transaction in account currency, derived rate;
  same-currency → rate ONE (unchanged); reject >1 invoice under a foreign line; reject
  single-currency-disabled method; zero-outstanding / zero-line edge cases.
- Vitest: currency badge shown only when candidate currency ≠ account currency; derived-rate preview;
  single-foreign selection constraint; same-currency behavior unchanged.
- Manual: EUR account + USD invoice → reconcile → `FIN_Payment` in USD, `FIN_Finacc_Transaction` in
  EUR with derived rate; EUR/EUR regression unchanged.
- i18n: new keys present in `en_US.json`, `es_ES.json`, `es_AR.json`.

## Rollback

Revert `feature/ETP-4502` in both repos. No DB schema changes. The backend changes are additive
(new methods + a new branch); reverting restores the single-currency `assertCurrencyMatch` block on
the reconciliation path. No `push-to-neo` / `export.database` changes are required.
