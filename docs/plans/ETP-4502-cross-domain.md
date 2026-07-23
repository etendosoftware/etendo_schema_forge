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

## Iteration 2 (post-review with functional analyst)

Five follow-up changes on top of the above, requested after a review meeting:

| Domain | Files | Reason |
|--------|-------|--------|
| `backend:etendo-go` | `PaymentCurrencyConverter.java` | Replaced `derivedRate` with `resolveInvoiceRate` (invoice's `ConversionRateDoc` → general `C_Conversion_Rate` fallback) + `invoiceAmountFor` (partial-settlement inverse conversion) |
| `backend:etendo-go` | `ReconciliationFlowSupport.java` | Unified the same-currency and foreign-invoice paths into one greedy multi-invoice loop (`settleInvoice`/`SettlementOutcome`); accepts an optional `paymentMethodId` |
| `backend:etendo-go` | `ReconciliationPaymentService.java` | `registerReconciliationPaymentMultiCurrency` → `registerReconciliationPayment`, now handles same- and cross-currency alike and accepts a user-chosen payment method (validated) or auto-resolves |
| `backend:etendo-go` | `PaymentRegistrationService.java` | `allowProperty`/`isMethodAllowed` made package-visible for the method-choice validation above |
| `backend:etendo-go` | `ReconciliationHandler.java` | `reconcileGroup` reads top-level `paymentMethodId`; `buildInvoiceCandidates` emits `rate`/`amountBase`/`baseCurrency` per foreign candidate (`appendAccountEquivalent`) |
| `window:financial-account` | `ReconciliationSplitPanel.jsx` | Removed the single-foreign-invoice selection restriction; `selectedSum`/`remaining` now sum each candidate's account-currency equivalent; added the EUR-equivalent secondary line in `MoneyCell`; added `PaymentMethodModal` |
| `window:financial-account` | `ReconciliationTab.jsx`, `index.jsx` | Threaded the account's already-fetched `paymentMethods` (from `useAccountMovements`) down to the panel — no new endpoint |
| `app-shell-core` | `en_US.json`, `es_ES.json`, `es_AR.json` | Removed the iteration-1 derived-rate-preview keys (`financeReconcileBar{InvoiceAmount,BankAmount,Rate}`); added `financeReconcileMethodModal{Title,Body,Confirm}` |

### Key design decisions
- **Rate source changed**: no longer derived from the statement line; now the invoice's own exchange
  rate, falling back to the general conversion table. A mismatch between `invoice × rate` and what
  the bank actually sent is **not** posted as an exchange difference — it stays unreconciled on the
  line (same as any other partial match).
- **Scope widened**: from "1 line ↔ 1 foreign invoice, full settlement" to "1 line ↔ N invoices of any
  currencies, full or partial", reusing the pre-existing greedy same-currency allocation instead of a
  separate code path.
- **Payment method**: chosen once per reconcile action (not per invoice, not per existing
  transaction), via a small modal; validated against the account/direction, and against
  multi-currency-enabled when the settlement is cross-currency.
- Point 4 from the review (an `EM_ETGO_Auto_Created` flag + Payment Removal on reactivate) was
  **already implemented** in iteration 1 — verified, not changed.

### Tests
- JUnit: `resolveInvoiceRate` (doc rate → general fallback → same-currency ONE → no rate throws);
  `invoiceAmountFor` (inverse of `convertedAmount`); the unified multi-invoice loop (mixed-currency
  full + partial settlement, insufficient coverage still 400, chosen-method validation, cross-currency
  multi-currency guard); same-currency behavior unchanged.
- Vitest: multi-select across currencies (no more single-foreign collapse); EUR-equivalent line
  renders for foreign candidates; `selectedSum`/`remaining` correctly sum mixed candidates; the
  payment-method modal opens only for invoice-mode with methods configured for the direction, and its
  confirm adds `paymentMethodId` to the payload; no modal when only transactions are selected.

### Rollback
Same as the base ETP-4502 entry above — revert `feature/ETP-4502`, no DB/export changes.
