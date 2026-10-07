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
  line (same as any other partial match). *Reversed for single-foreign-currency selections by
  Iteration 6 (ETP-5657) below; still true for mixed selections and for callers that send no
  conversion fields.*
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

## Iteration 6 (ETP-5657 — bank-rate conversion + partial payment, Classic parity)

**This iteration REVERSES iteration 2's rate decision**, at the user's request, for Classic
Add Payment parity. Iteration 2 paid a foreign invoice at its own rate and deliberately left any
gap against the bank amount unreconciled on the line ("not posted as an exchange difference").
Classic's Match Statement → Add Payment (`ob-aprm-addPayment.js`) does the opposite: it books
exactly what the bank moved and lets Core's accounting post the realized exchange difference. GO
now does the same **whenever every selected invoice shares ONE currency that differs from the
account's**. Reference case: a 27,87 € line against FV1000024 for 40,91 USD (27,83 € at the invoice
rate) used to reconcile 27,83 € and leave 0,04 € pending; it now closes the line and Core books a
0,04 € exchange gain (768 in the Spanish chart; a loss goes to 668) through the
`C_Conversion_Rate_Document` rows of the payment and of the transaction. A mixed selection (two
foreign currencies, or foreign + same-currency) has no single rate to derive and keeps the
iteration-2 behavior unchanged.

| Domain | Files | Reason |
|--------|-------|--------|
| `backend:etendo-go` | `ReconciliationConversionSupport.java` (new) | Explicit-conversion mode of `reconcileGroup`'s invoice leg: `parse` → `validate` (tenant-guarded loads before any amount) → pure `plan` (allocation + largest-remainder split) → `execute` (one `registerReconciliationPayment` per paid invoice) |
| `backend:etendo-go` | `PaymentCurrencyConverter.java` | `parseRate`/`rateError` extracted from `resolveConversionRate` (same messages, now constants); new `consistentRate` (per-payment rate that round-trips) and `standardScale`; `KEY_CONVERSION_RATE` package-visible |
| `backend:etendo-go` | `ReconciliationFlowSupport.java` | `loadInstallment` and `collectTransaction` extracted and shared by both modes; `loadInstallment` now also 404s a schedule that belongs to another invoice (both modes); `resolveChosenMethod` package-visible |
| `backend:etendo-go` | `ReconciliationWriteoffSupport.java` | `payInvoicesFromBody` routes to the conversion support when any of the three new fields is present, else calls `payInvoices` unchanged |
| `backend:etendo-go` | `ReconciliationAgentActions.java` | MCP `reconcileGroup`: three optional `TYPE_NUMBER` params; the "no extra parameter" description corrected |
| `backend:etendo-go` | `ReconciliationPaymentService.java`, `ReconciliationHandler.java` | Javadoc / comment only (the two modes) |
| `window:financial-account` | `reconciliationConversionMath.js`, `useReconciliationConversion.js`, `ReconciliationConversionSection.jsx` (all new, `components/contract-ui/`) | Pure Classic-parity math (node:test-importable), the hook holding the user's edits over computed defaults, and the conversion block of the payment-method modal |
| `window:financial-account` | `ReconciliationSplitPanel.jsx` | Wires the hook: conversion block + gates in `PaymentMethodModal` (opens even with no method for the direction), write-off hidden, payload merge, `fxNotice` footer line, edits reset on open/close/success/`GL_ITEM_REQUIRED` |
| `app-shell` | `lib/backendErrors.js`; `locales/{en_US,es_ES,es_AR}.json` | Six `backendError.reconcileConversion*` literal mappings; 15 `financeReconcile{BarFx*,Conversion*}` keys (2 `BarFx*` + 13 `Conversion*`) |
| `docs` | `docs/generated-custom-windows/financial-account.md`; com.etendoerp.go `docs/neo-headless.md` §4.12.1.1 | "Rate source — two modes" + "Bank-rate conversion block"; the `reconcileGroup` explicit-conversion contract |

### Key design decisions
- **When the mode applies (UI).** Invoice mode, a pending (or PARTIAL) line, ≥ 1 selected invoice,
  all of them in one currency ≠ the account's, Σ outstanding > 0. Anything else keeps the
  invoice-rate flow and sends no conversion field.
- **Classic-parity defaults.** Converted amount = |line pending| (for a PARTIAL line, its pending
  remainder); amount to collect/pay = Σ outstanding of the selected invoices; rate = converted ÷
  amount, 6 decimals HALF_UP (`FIN_AddPayment.setFinancialTransactionAmountAndRate`): 27,87 / 40,91
  → 0,681252. All three are editable with Classic's coupling — editing the amount keeps the
  converted amount and re-derives the rate (or, once the user typed a rate, keeps the rate and
  recomputes the converted amount); editing the rate recomputes the converted amount; editing the
  converted amount re-derives the rate. A blank/zero/negative value never propagates to the other
  two fields.
- **Partial payment** is the "Importe a cobrar / pagar" field alone: 21,34 USD against the same
  27,87 € line re-derives the rate to 1,305998 and leaves 19,57 USD outstanding on the invoice. No
  per-row amount.
- **No deviation warning and no invoice-rate reset (Classic parity).** Like Classic's Add Payment,
  the modal never warns about how far the rate is from the invoices' own rate and offers no
  one-click fallback to it. In conversion mode the three fields are **always** sent. The cues the
  user does get are the reference "Cotización de la factura" row, the gain/loss row in the modal and
  the footer notice. A warning above a fixed 5 % threshold, with a "Usar cotización de la factura"
  reset that sent no fields, was briefly prototyped and dropped at the user's request, because the
  threshold had no basis. To pay at the invoice rate, the user types the reference rate. With several
  invoices at different rates that books one blended rate, which shows up as small offsetting
  per-invoice differences.
- **Footer.** "Documentos seleccionados" / "Restante por conciliar" keep their invoice-rate meaning
  (Σ `amountBase`: 27,83 € / 0,04 € in the reference case) and gain one muted line naming the gain
  or loss reconciling at the bank rate would book with the DEFAULT figures (`fxNotice`, a separate
  prop from `differenceNotice`). It never follows the modal's edits. This replaces the original
  design idea of showing the converted amount in the footer: the footer stays a selection-time view,
  and the user sees a large gap before opening the modal.
- **Write-off is hidden and never sent in this mode**; the backend refuses the combination too. A
  write-off of the remaining balance in this mode is a follow-up.
- **The modal opens even without a method for the direction** (picker hidden, title/body switched
  to the conversion copy, no `paymentMethodId`, backend auto-resolves) — the conversion figures are
  confirmed there.
- **Backend contract** (`POST ?action=reconcileGroup` and MCP `etendo_action`, backwards
  compatible — without the fields nothing changes):
  - three optional top-level fields, unsigned (the line gives the sign): `actualPayment` (invoice
    currency, required as soon as either of the others is sent), `conversionRate`,
    `convertedAmount` (account currency);
  - 400 when combined with `operationIds` or `writeoffDifference`, when the invoices do not share
    one currency other than the account's, when `actualPayment` ∉ (0, Σ outstanding] at the
    invoice precision, or when the converted amount ∉ (0, |line|] — **strict**, no tolerance,
    against the line `resolveForMatch` resolved (above it, Core would split off a remainder of the
    opposite sign); a typed rate reuses the two-step payment modal's rate messages;
  - **`convertedAmount` wins** when present: the rate is then advisory (only the first candidate
    of the per-payment rate), so **a rate of exactly 1 is accepted** (pegged pair). With only a rate,
    converted = round(`actualPayment` × rate) and the rate must not be 1. With only
    `actualPayment`, converted = |line| rounded down. A rate/converted mismatch is never a 400;
  - allocation: invoices filled in request order (invoice date ascending), `pay_i = min(left,
    outstanding_i)`; the converted amount split across the paid invoices by **largest remainder**
    proportional to `pay_i`, so Σ `txn_i` == converted exactly (a share rounding to 0 → 400 "too
    small"); each payment's rate is the first of {typed rate, `txn_i/pay_i` at 6/8/10/12 decimals,
    `DECIMAL64`} that **round-trips** (`round(pay_i × r) == txn_i`), so accounting finds no Currency
    Balancing residual on the payment itself;
  - the invoice's own rate is never read in this mode, so an invoice without a configured rate
    becomes reconcilable here.
- **Hardening on both modes:** `loadInstallment` refuses with the usual 404 a schedule that belongs
  to a different invoice than the one named in the spec (the payment would otherwise be created for
  one invoice while settling another's instalment).

### Known and accepted risks
- **BUG-1 — a large deviation still defaults to full settlement (product decision, Classic
  parity).** Whatever the gap, the modal opens prefilled to settle every selected invoice in full at
  the bank-implied rate, and Confirmar stays enabled. A 27,75 € receipt against a 78,26 USD invoice
  (53,24 € at its own rate) defaults to rate 0,354587 and books a **−25,49 € exchange loss in one
  click**. As in Classic there is no warning: the cues are the reference "Cotización de la
  factura" row (≈ 0,680296 against 0,354587 here), the gain/loss row in the modal and the footer
  notice. Neither the SPA nor the backend checks the deviation, so an MCP/REST caller gets no cue at
  all. Documented as a "Known risk" in
  `financial-account.md`. **Verified live in Classic (same DB):** Add Payment for a +10,00 € line
  against a 106,72 USD invoice prefills Actual 106,72 / Converted 10,00 / rate 0,093703 /
  Difference 0,00 with **no warning** and Done enabled; confirming settles the invoice in full and
  posts a 62,60 € exchange loss to 668. Nuance: Classic's full-settlement prefill comes from its
  automatic selection when the currency is switched — a manual tick allocates what Actual Payment
  already holds and does not raise it. GO always prefills full settlement, and, like Classic,
  without a warning.
- **Core accounting observations** (Core's posting, not this module's code; cent-level; O1 and O2
  verified live in Classic on the same DB):
  - **O1 — identical in Classic.** On the 430 / 400 (customer / supplier) line Core derives the
    invoice-currency source amount as EUR ÷ the payment rate, so the per-invoice USD balance may not
    land on exactly zero. A Classic payment of 40,91 USD → 27,87 € at 0,681252 posts 572 Dr 27,87 /
    768 Cr 0,04 / 430 Cr 27,83 with USD source **40,85** (27,83 ÷ 0,681252), exactly like GO. With
    the skewed 0,093703 rate of BUG-1, the 430 USD source reached **774,79** for a 106,72 USD
    invoice.
  - **O2 — present in Classic too, on the opposite side.** Two 21,34 USD invoices (42,68 USD →
    27,87 € at 0,652999; true exchange difference 1,17 €) both post a 0,01 € balancing line to
    90010000. Classic creates ONE payment and rounds each invoice's difference at the shared rate
    (0,59 + 0,59 = 1,18), so its balancing line is on the **credit** side; GO creates one payment
    per invoice with per-payment rates (0,58 + 0,58 = 1,16), so its line is on the **debit** side.
    Both net to the true 1,17 €.
  - **O3** — with several invoices each payment's rate is re-derived from its own rounded share, so
    the stored rates differ slightly from the one shown in the modal: 21,34 + 21,34 USD converted to
    27,87 € (modal rate 0,652999) become 13,94 € at 0,653233 and 13,93 € at 0,652765.
- **Pre-existing, out of scope:** `ReconciliationWriteoffSupport.assertWithinWriteoffLimit`
  subtracts account-currency amounts from invoice-currency outstanding. It only affects a default-path
  caller (MCP/REST) that sends `writeoffDifference` with foreign invoices — the UI never offers the
  write-off under a conversion. Separate ticket.
- **Other follow-ups:** write-off of the remaining balance in conversion mode; a per-row editable
  amount; the UI's method list does not carry the multi-currency flag, so a non-multi-currency
  method is still only refused server-side (pre-existing); the modal's remainder hint always says
  "pending" even when a within-tolerance remainder is posted to the account's difference concept
  (footnoted in `financial-account.md`).

### Tests
- JUnit: new `ReconciliationConversionSupportTest` — pure `plan` (40,91 → 27,87 @ 0,681252; typed
  rate kept when it round-trips, replaced otherwise; several invoices with Σ txn == converted and
  ties to the earlier invoice; partial 21,34 → 1,305998; request-order filling; zero-precision
  account; "too small" at 0,02 over three invoices), `parse`, every validation refusal in its order
  (combination, 404 for unknown / foreign-tenant / other-invoice schedules with no amount echoed,
  currency, required, ranges, rate 1 accepted only with `convertedAmount`, strict line bound) and
  execution (registered amounts and rates, debit line, chosen method, invoice rate never read).
  Extended: `PaymentCurrencyConverterTest` (`consistentRate`, `rateError`, `parseRate`,
  `standardScale`, unchanged literals of `resolveConversionRate`), `ReconciliationAgentActionsTest`
  (three optional numbers, numeric strings accepted, wrong type → 422),
  `ReconciliationWriteoffSupportTest` (routing with/without the fields),
  `ReconciliationFlowSupportForeignInvoiceTest` (`loadInstallment`, schedule of another invoice on
  the default path) and `ReconciliationHandlerTest` (end-to-end: equal to the line closes it, below
  it leaves a remainder, payment-out line, within-tolerance difference).
- node:test: `reconciliationConversionMath.test.js` — rounding helpers, eligibility, reference rate,
  defaults, the three edit rules (unusable values included), validation bounds, FX difference /
  gain-or-loss naming, remainder, payload fields.
- Vitest: `ReconciliationConversionSection.vitest.jsx` (hook + section);
  `ReconciliationSplitPanel.multiCurrency.vitest.jsx` extended (defaults and payload, three fields
  always sent, no-method modal, payment line, strict bounds disabling Confirmar, footer notice,
  edits dropped on cancel / success / `GL_ITEM_REQUIRED` / read-only tier, write-off hidden, mixed
  selections unchanged); `backendErrors.test.js` (each refusal to its key, translated in all three
  locales).
- The deviation-warning and invoice-rate-reset tests from the dropped prototype are removed together
  with the feature.
- No new Playwright specs.

### Rollback
Revert `feature/ETP-5657` in both repos. No DB, AD, `push-to-neo` or `export.database` changes. The
backend is additive: a request without the three fields takes exactly the previous path, so reverting
only the frontend already restores the iteration-2 invoice-rate behavior in the UI. Payments already
booked at the bank rate stay as they are (ordinary `FIN_Payment`s with their conversion documents);
un-reconciling them removes them as usual. Reverting the backend also drops the
schedule-of-another-invoice 404 in `loadInstallment`.
