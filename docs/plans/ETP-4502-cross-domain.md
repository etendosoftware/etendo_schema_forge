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

## Iteration 3 (UI polish + default-method fix + partial line coverage)

Small follow-ups from continued review of iteration 2:

| Domain | Files | Reason |
|--------|-------|--------|
| `window:financial-account` | `ReconciliationSplitPanel.jsx` | `PaymentMethodModal`'s selector swapped from `CreatableSearchSelect` to `ChipSelect` (`@/components/forms/fields`) to match "Concepto contable" in the New Movement modal; `DialogContent bg-white`; Confirm button's hover restyled to the app's yellow primary-hover; both modal "Cancelar" buttons switched from the shared `financeReconcileActionCancel` ("Cancelar selección") to the generic `cancel` key ("Cancelar") — they close the modal, not a selection |
| `backend:etendo-go` | `PaymentRegistrationService.java` | `resolvePaymentMethod`'s account-fallback now orders by `FinAccPaymentMethod.PROPERTY_DEFAULT` desc (mirrors Classic's account-level fallback) then by method name asc (deterministic tie-break — Classic itself has no tie-break here) |
| `backend:etendo-go` | `ReconciliationFlowSupport.java` | `createInvoicePayments` no longer requires invoices to fully cover the line — under-coverage now succeeds (Core's own line-splitting handles the pending remainder, same mechanism the existing-transaction path already used); over-coverage remains impossible by construction; still rejects the degenerate case where the selection settles nothing at all |
| `window:financial-account` | `ReconciliationSplitPanel.jsx` | `balanced` no longer requires invoice selections to fully cover the line (`sameDirection` alone, no upper bound) — transaction-mode is unchanged (`sameDirection && withinLine`, since an existing transaction can't be partially "used") |

### Key design decisions
- **Payment-method default priority**: verified against Classic's own `TransactionAddPaymentDefaultValues.getDefaultPaymentMethod` (Match-Statement "Add Payment" popup). Copied Classic's safe part (account's own `isDefault` flag wins the fallback) but deliberately did NOT copy validating the BP's method against the BP's *own* account — reproduced live as a real Classic bug (BP method not on the reconciliation account still gets defaulted, payment creation then fails with "Selected payment method doesn't exist"). See memory `project-classic-add-payment-default-method-bug`.
- **Partial line coverage**: a statement line can now be matched against invoice(s) that settle LESS than the line — e.g. a 100 line + a single 60 invoice pays the invoice in full and leaves the line split (60 reconciled + a new 40 pending sub-line), exactly like matching an existing transaction smaller than the line already did. A 100 line + a 120 invoice was already fine before this change (uses the full line, leaves the invoice itself partially paid) — unaffected. The only remaining rejection: selecting invoice(s) that settle nothing at all (e.g. already fully paid) — still a 400, since that accomplishes nothing.
- Known pre-existing (not introduced here) UX gap: reactivating a reconciliation that was a SINGLE partial match (one operation/invoice, line split in two) doesn't auto-merge the split sub-lines back — they stay split as two pending lines. Not a data issue, just a follow-up UX item; already true today for the transaction path.

### Tests
- JUnit: `resolvePaymentMethod` fallback order verified via `addOrderBy` (Mockito can't prove real DB ordering — needs OBBaseTest for that); regression test that an invoice method NOT allowed for the account correctly falls through instead of being returned; new regression test that partial-line coverage now returns success (mocks `ReconciliationPaymentService` statically).
- Vitest: `PaymentMethodModal` tests updated for the `ChipSelect` mock (matches the existing `NewTransactionModal.vitest.jsx` stub pattern); the "Conciliar disabled when invoices don't cover the line" test flipped to "enabled" (now a legitimate partial match); new regression test confirming a single invoice EXCEEDING the line still enables Conciliar (invoiceMode's `balanced` has no upper bound, unlike transaction-mode).

### Rollback
Same as the base ETP-4502 entry above — revert `feature/ETP-4502`, no DB/export changes.

## Iteration 4 (partial-match display fix)

Real bug reported live: reconciling a 100 EUR line against a single 53.24 EUR invoice correctly
settles the invoice, but the 46.76 remainder (Core's own split, per iteration 3's "partial line
coverage") showed up as a brand-new, seemingly-unrelated statement line in "Extractos importados"
instead of "100, 46.76 pending" (Holded-style). Root cause: the grouping mechanism that re-collapses
a split line's two physical rows back into one (`EM_ETGO_Match_Group_ID` + `mergeMatchGroups`,
already built for 1:N matches) was gated on `operationIds.size() > 1` — a single-operation PARTIAL
match (exactly this case) has only one operation id, so it was never tagged.

| Domain | Files | Reason |
|--------|-------|--------|
| `backend:etendo-go` | `ReconciliationHandler.java` | New `willSplitLine(line, operationIds)`: true for 2+ operations (unchanged, Core always splits at least once chaining through them) OR a single operation whose amount doesn't exactly equal the line (the missed case) — replaces the `operationIds.size() > 1` gate before `tagMatchGroup` |
| `backend:etendo-go` | `BankStatementsSupport.java` | `mapLineRow` now emits `reconcileStatus` (`RECONCILED`/`PARTIAL`/`PENDING`) and a signed `pendingAmount` per physical row; `mergeSubLineIntoHead` accumulates `pendingAmount` across a group's sub-lines and recomputes the group's own `reconcileStatus` (previously: `matched` was forced `true` as soon as the group had ANY transaction, hiding a still-pending remainder) |
| `window:financial-account` | `StatementLinesInline.jsx` | New `matchKindFor(line)` (3-state: reconciled/partial/pending) + a "Parcial" `MatchPill` state + a pending-amount caption shown only for PARTIAL; `MINI_TAIL_TRACKS` widened to fit it |
| `window:financial-account` | `StatementLinesTable.jsx` | The old green/gray `matched`-boolean dot replaced with the same 3-state `StatusTag` pill + pending-amount caption (`MatchCell`), for consistency with the accordion view |
| `app-shell-core` | `en_US.json`, `es_ES.json`, `es_AR.json` | New keys `financeAccountStatementLinesStatusPartial` ("Parcial"/"Partial") and `financeAccountStatementLinesPendingAmount` ("{amount} por conciliar"/"{amount} pending") |
| `docs` | `docs/generated-custom-windows/financial-account.md` | New "Partial-match display" subsection |

### Key design decisions
- **Tagging condition, not tagging mechanism**: `tagMatchGroup` itself is unchanged (still stamps a
  fresh UUID on `EM_ETGO_Match_Group_ID` before the match so `DalUtil.copy` propagates it to Core's
  clone); only the *condition* for calling it changed. Tagging on an exact 1-operation match (no
  split will happen) is harmless — the id just sits unused on a single row — but was deliberately
  kept excluded (`willSplitLine` returns `false` there) to avoid an unnecessary extra DAL
  save/flush on the hottest path (`testReconcileGroupHappy1to1`'s existing "no split, no tag"
  regression test still holds).
- **`reconcileStatus` supersedes `matched` as the source of truth for display**, but `matched` is
  kept on the wire (now derived as `reconcileStatus === "RECONCILED"`) so any other existing
  consumer of the plain boolean keeps working unchanged.
- This directly resolves the "known pre-existing UX gap" flagged in iteration 3 above (reactivating
  a single partial match left two disconnected pending lines) for the FORWARD direction (creating
  the partial match now displays correctly); the reactivate-side merge-back behavior
  (`normalizeReactivatedMatchGroup`) was already correct and untouched by this iteration.
- Scope boundary, not fixed here: the parent statement's "Parcial N/M" fraction still counts
  physical rows, not collapsed/logical lines — documented as a known follow-up, out of scope for
  this fix (the ask was specifically about the line-level display).

### Tests
- JUnit: new regression test that a single-operation PARTIAL match (line ≠ operation amount) now
  DOES call `tagMatchGroup` (previously didn't); existing 1:1-exact and 1:N tests re-verified
  unaffected; `mergeMatchGroups`/`mergeSubLineIntoHead` new regression test — a group with one
  matched + one still-pending sub-line resolves to `reconcileStatus: "PARTIAL"`, `matched: false`,
  and the correct summed `pendingAmount`.
- Vitest: `StatementLinesInline`/`StatementLinesTable` render the "Parcial" pill + pending-amount
  caption for a `PARTIAL` line and omit the caption for `RECONCILED`/`PENDING`; the stale
  `aria-label`-based dot assertion in `StatementLinesTable.vitest.jsx` (superseded by the visible
  `StatusTag` pill) updated accordingly.

### Rollback
Same as the base ETP-4502 entry above — revert `feature/ETP-4502`, no DB/export changes.

## Iteration 5 (reconciliation tab: partial lines stay pending + per-item un-reconcile)

Brings the partial-reconciliation model to the **reconciliation tab** (not just imported-statements),
per the "Opción A2" design handoff: a line is PENDING while <100 % is used, CONCILIADA at 100 %; a
new **Progreso** column (thin bar + hover tooltip "X € por conciliar"); a collapsible **"conciliado"
block** on the right listing already-matched documents, each **un-reconcilable individually**
("desvincular"); and the ability to reconcile the pending remainder.

| Domain | Files | Reason |
|--------|-------|--------|
| `backend:etendo-go` (DB, by the user) | `EM_ETGO_Pending_Amount` on `FIN_BankStatementLine` | New Amount column (per-sub-line amount still pending); AD_Column/element/field + export done by the user |
| `backend:etendo-go` | `handlers/BankStatementLinePendingAmountHandler.java` (new) | EventHandler maintaining `EM_ETGO_Pending_Amount = (txn==null) ? |cr−dr| : 0` on every line NEW/UPDATE (incl. Core match/split/unmatch) via `setCurrentState` |
| `backend:etendo-go` | `ReconciliationHandler.java` | `PENDING_LINES_SQL` + `buildPendingLines` now expose the same partial contract as `mapLineRow` (`pendingAmount` from the column, `reconcileStatus`, `txns[]`, `reconciledAmount`/`reconciledPct`, `remainderLineId`); `state` derived post-merge (PARTIAL folds into `pending`); `tagMatchGroup` reuse guard; **new `removeOperation` action** (per-item un-reconcile) |
| `backend:etendo-go` | `BankStatementsSupport.java` | `buildLineTxns` +`autoCreated`; `mergeMatchGroups`/`mergeSubLineIntoHead` capture `remainderLineId`; `mapLineRow` reads the column |
| `backend:etendo-go` | `ReactivationSupport.java` | `COL_PENDING_AMOUNT` constant |
| `window:financial-account` | `ReconciliationSplitPanel.jsx` | `ProgressCell` + Progreso column (bar + tooltip, no % chip); `ReconciledOperationsSection` (collapsible matched block with per-item "Desvincular"); `RemoveOperationConfirmDialog` (always-confirm); PARTIAL line not read-only, candidate fetch by `remainderLineId`, action-bar balance on the pending amount; `selectedLine` re-resolved from live `lines` by match group |
| `app-shell-core` | `useReconciliation.js` | `useRemoveOperation` hook (POST `removeOperation`) |
| `app-shell-core` | `en_US`/`es_ES`/`es_AR` | `financeReconcileColProgress`, `financeReconcilePendingLabel`, `financeReconcilePctConciliated`, `financeReconcileActionRemoveOne`, `financeReconcileConfirmRemoveOne{Title,Body}`, `financeReconcileRemoveOneAutoHint`, `financeReconcileToastOperationRemoved` |

### Key design decisions
- **`removeOperation` reuses the module's per-op primitive** `ReconciliationRemovalUtil.removeTransactionFromReconciliation` (detach one txn, re-process, keep the document) + `PaymentRemovalUtil.reactivateAndRemove` for the auto-created payment (restores the invoice). The LAST operation delegates to the proven whole-line `undoReconciliation` + `normalizeReactivatedMatchGroup`.
- **No physical collapse on unlink**: the freed sub-line keeps its group id and amount; the EventHandler re-sets its pending amount and `mergeMatchGroups` folds it back into the line's remaining on reload.
- **`EM_ETGO_Pending_Amount` is a single source of truth** for both the reconciliation tab and imported-statements (`mapLineRow` reads it too), avoiding drift.
- **Progreso column = bar + tooltip** (handoff), superseding the earlier text-only idea; the % chip on the row was dropped. All new UI uses semantic theme tokens (handoff grays → `--foreground`/`--border`/`--text-primary`; "Factura" tag → `--status-warning-*`).
- **Confirm-always on unlink** (product decision); whole-line "Reactivar" kept alongside.

### Tests
- JUnit: `BankStatementLinePendingAmountHandler` (txn null → |cr−dr|, txn set → 0); `removeOperation`
  (one-of-N auto-created → removeTransaction + PaymentRemoval; pre-existing → payment kept; last-op →
  undoReconciliation+normalize; closed period → 409; unlinked/other-account → 4xx);
  `mergeMatchGroups` `remainderLineId` + PARTIAL derivation.
- Vitest: Progreso bar/tooltip only when partly reconciled; `ReconciledOperationsSection` visibility,
  collapse, per-item unlink → confirm → `useRemoveOperation`; PARTIAL not read-only + candidate fetch
  by `remainderLineId`. Theme test stays green (tokens only).

### Rollback
Revert `feature/ETP-4502`. The `EM_ETGO_Pending_Amount` column stays (harmless if unused); to fully
revert, drop it from the AD + DB. No other DB/export changes.

### Addendum — un-reconcile by selection (bulk desvincular)
On top of the per-item unlink, un-reconcile became **selection-based** and the global **"Reactivar"
button was removed**:
- `removeOperation` now accepts **`transactionIds[]`** (single `transactionId` still accepted) and
  branches on whether the selection covers the WHOLE reconciliation: **all** → `undoReconciliation`
  (whole undo, payment removal); **subset** → loop `removeTransactionFromReconciliation` +
  `PaymentRemovalUtil` per selected txn (rest stay reconciled). Rejects ids from different
  reconciliations (400).
- Frontend: the "conciliado" block shows a **checkbox per matched doc (all checked by default) only
  on fully-reconciled lines** (bulk mode); the bottom action bar becomes **"Desconciliar (N)"** over
  the checked set (i18n `financeReconcileActionRemoveCount`). The per-row "−" unlink stays in all
  cases. A PARTIAL line (under "Pendiente") has NO checkboxes — un-links only one-by-one; bulk is
  only for the "Conciliado" state. `ReconciliationActionBar` gained `removeCount`; the old
  `ReactivateConfirmDialog`/`useReactivateReconciliation` were removed; the confirm dialog now takes
  `count`/`hasAuto` (one/many body + auto-created hint). New i18n `financeReconcileActionRemoveCount`,
  `financeReconcileConfirmRemoveManyBody`.
