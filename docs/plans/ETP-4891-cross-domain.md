# ETP-4891 Cross-Domain Plan

The bank-transfer payment method must **never** auto-withdraw, and the payment modal must refuse a
transfer aimed at an account whose PSD2 connection has been switched off.

Two halves. First, `Automatic Withdrawn` becomes an invariant of the transfer *method* — always off —
instead of something `FinancialAccountBankConnectionHandler` cleared on connect and restored to `'Y'`
on a permanent disconnect (that restore was a live bug: a connected-then-disconnected account drifted
back to auto-withdrawing, and an account never connected was never corrected at all). Second, the
payment modal splits the account's three PSD2 states: connected → the full PIS form; **reconnectable**
(connected once, then switched off, Salt Edge link alive) → the form is hidden behind a warning that
links to *Editar Cuenta*, with Confirm disabled; never connected → the ordinary manual flow, unchanged.

Scope decisions taken with the product owner: the block applies to `bankReconnectable` only (never
connected keeps working), to Payment **OUT** only (PIS initiates outbound transfers only), and hides
only the form *body* — the Método and Cuenta selects stay so the user can pick another account without
reopening the modal. **Save draft stays enabled**; only Confirm is blocked, because with Automatic
Withdrawn off a draft transfer moves no money and creates no bank transaction.

## Domains changed

| Domain | Files | Reason |
|--------|-------|--------|
| `backend:etendo-go` | `FinancialAccountBankConnectionHandler.java` | Delete the connect-time clear, the permanent-disconnect restore and their 3 private helpers (−75 lines) |
| `backend:etendo-go` | `FinancialAccountSupport.java` | `createLink` forces `automaticWithdrawn=false` for a transfer method instead of copying the template; `isBankTransferMethod` widened to package-private |
| `backend:etendo-go` | `PaymentRegistrationService.java` | `invoiceAccounts` emits `bankReconnectable`; `invoicePaymentMethods` emits `isBankTransfer` |
| `backend:etendo-go` | `FIN_PAYMENTMETHOD.xml`, `FIN_FINACC_PAYMENTMETHOD.xml` | Sampledata: `AUTOMATIC_WITHDRAWN` `Y → N` on "Transferencia bancaria" and its link |
| `window:shared (app-shell)` | `NewPaymentEntryModal.jsx` | `psd2Blocked` state, `Psd2InactiveWarning`, body gating, Confirm-only block, submit hard guard, flag-based transfer predicate |
| `window:financial-account` | `financial-account/index.jsx` | New `?edit=true` deep link opening the Editar Cuenta modal |
| `app-shell i18n` | `en_US.json`, `es_ES.json`, `es_AR.json` | `cpPsd2InactiveBody`, `cpPsd2InactiveAction` |
| `cli (data-fixes)` | `20260821T120000Z__R24-transfer-automatic-withdrawn.sql` | Corrective fix for existing tenants, on both tables the flag lives in |
| `docs` | `purchase-invoice.md`, `financial-account.md`, `payment-out.md`, `onboarding-and-datafixes-map.md`, `tenant-remediation-knowledge.md` | All three window docs described the removed dynamic behavior; R24/G3 registered |

## Key design decisions

**The flag is enforced in three places, deliberately.** Sampledata makes new tenants born correct,
R24 repairs existing ones, and `createLink`'s guard makes the invariant independent of the data — a
legacy tenant whose template is still `'Y'`, or a transfer method created by hand, cannot propagate
it to a link. Only the guard is strictly redundant today; it is one line and it is what stops this
from regressing the moment someone edits a template in Classic.

**`bankReconnectable` had to be added to the payment contract.** The state already existed in the
backend (`FinancialAccountsPageHandler`) but `invoiceAccounts` emitted only `bankConnected`, so the
modal could not tell "disconnected" from "never connected" — and conflating them would have blocked
transfers on every account without PSD2. The predicate is duplicated in two handlers now; they must
stay in lockstep (noted in both).

**The transfer predicate moved off the method name.** The modal used `/transfer|transferencia/i` on
the label. That was fine while it only *offered* an extra section; as a hard block it would have
stopped a payment on a method called "Transferencia interna". `invoicePaymentMethods` now emits
`isBankTransfer` from `EM_PSD2_Is_Bank_Transfer`, with the regex kept only as a fallback for backends
predating this change.

**Navigation over a nested modal.** The warning navigates to `/financial-account/<id>?edit=true`
rather than embedding `EditAccountModal` inside the payment modal. Nesting would need the full account
record (the modal only holds the reduced `invoiceAccounts` item) plus `useBankConnectionFlow`, and
modal-over-modal has no precedent here. Navigating discards the payment modal, which costs nothing:
the payment was blocked anyway. The deep link follows the window's existing `?tab=` / `?autoMatch=` /
`?txn=` / `?newMovement=` convention.

**No `ONBOARDING_PROVISIONED_THROUGH` bump** — same reasoning as G1/R14: sampledata makes new tenants
correct, and R24 overlapping a new tenant is a harmless no-op (`@check` returns 0 rows).

## Tests

- `NewPaymentEntryModal.vitest.jsx` — 11 new cases: warning shown + body hidden on reconnectable;
  Método/Cuenta selects survive; Confirm disabled but **Save draft enabled**; no `registerPayment` on
  a blocked confirm; navigation asserts `/financial-account/acc-1?edit=true`; PIS form on connected;
  full manual form on never-connected; receipt (`dir: 'in'`) not blocked; "Transferencia interna" with
  `isBankTransfer: false` not blocked; name-heuristic fallback when the flag is absent; warning clears
  when switching to a connected account. **136 pass** (125 pre-existing + 11).
- `index.interactions.vitest.jsx` — 2 new cases for `?edit=true` (opens the modal + clears the query
  string) and `?edit=false` (stays closed). **27 pass.**
- `FinancialAccountBankConnectionHandlerLinkTest.java` — the 5 tests that pinned the old clear/restore
  behavior rewritten to pin its **absence**, including an explicit regression guard that a permanent
  disconnect no longer restores the flag.
- `FinancialAccountSupportTest.java` — new case: a transfer template with `isAutomaticWithdrawn=true`
  still produces a link with `false`, while `automaticDeposit`/`uponWithdrawalUse` stay faithful copies.
- `PaymentRegistrationServiceTest.java` — 5 new cases: the three PSD2 states plus a blank-Salt-Edge-id
  edge case, and `isBankTransfer` derived from the flag rather than the name.
- R24 validated on GOClient in a rolled-back transaction: `@check` 15 rows → `@apply` 1 template + 14
  links → `@check` 0 (idempotent).

## Addendum — the transaction-creation gap (found during manual QA, 2026-08-24)

Making Automatic Withdrawn permanently off exposed a second bug: Core's
`FIN_AddPayment.processPayment` only auto-creates the `FIN_Finacc_Transaction` on action `"P"`
("Process Made Payment(s)") when `FIN_Utility.isAutomaticDepositWithdrawn` is true — the exact flag
this change just turned off everywhere. Classic's own "Add Payment" dialog exposes this fork
directly as its "Action Regarding Document" dropdown (`"Process Made Payment(s)"` vs
`"Process Made Payment(s) and Withdrawal"`, i.e. actions `"P"` vs `"D"`), which is what QA's
screenshot showed. Without a matching backend fix, a transfer payment OUT on **any** account —
connected or not — would process with no transaction, silently.

**Fix:** `PaymentRegistrationService.resolveProcessAction(FIN_Payment payment, boolean
mayDeferToPis)` — a transfer payment OUT gets `"D"` (create the transaction now) unless
`mayDeferToPis` is true AND the account is actively PSD2-connected, in which case it stays `"P"`
and defers to the Salt Edge callback (`PisPaymentCallback` → `PISTransactionUtils`). `mayDeferToPis`
is `true` at exactly one call site — `applyOverpaymentAndProcess` (reached from
`doRegisterPaymentAdvanced`, the two-step modal's confirm) — because it is the only place that can
have arranged for that callback. Every other caller of `processOrThrow`
(`PaymentDraftEditService#confirmDraftPayment`, the older single-click quick-pay,
`ReconciliationPaymentService`) and `AddPaymentService` (the New Movement wizard) never initiate a
PIS handshake, so they pass `false` and always get `"D"` for a transfer.

This is a strict improvement, not a new risk, for the three non-modal callers: the OLD connect-time
clear (removed by this same ticket) applied to the per-account LINK regardless of which code path
was processing the payment, so a transfer on a connected account already produced no transaction
there before ETP-4891 too — `resolveProcessAction`'s `false` branch fixes a latent bug in
reconciliation-via-transfer-method-on-a-connected-account that predates this ticket, rather than
introducing one. Bank reconciliation specifically REQUIRES a transaction to exist right after
registering the payment (`ReconciliationFlowSupport` errors with "Payment did not produce a
transaction" otherwise) — always deferring there would have hard-broken it.

Files touched: `PaymentRegistrationService.java` (new `resolveProcessAction`, wired into
`processOrThrow` and `applyOverpaymentAndProcess`), `AddPaymentService.java` (its two direct
`processPayment` calls), plus javadoc updates on `ReconciliationPaymentService` and
`PaymentDraftEditService` explaining why they always pass `false`. New tests: 7 cases on
`resolveProcessAction` covering every branch (not-connected, never-connected, connected+deferrable,
connected+non-deferrable, receipt, non-transfer, name-fallback). Existing tests
(`AddPaymentServiceTest`, `PaymentRegistrationServiceAdvancedTest`) stay green unchanged — none of
them stub a payment mock as an actual transfer method, so they keep getting `"P"` exactly as before.

## Rollback

Every piece is independently revertible and nothing is destructive.

- **Frontend / backend code:** revert the commits. No schema change, no migration, no stored state.
- **Sampledata:** flip the two `AUTOMATIC_WITHDRAWN` values back to `Y`. Only affects tenants
  provisioned after the change.
- **R24:** the ledger row can be deleted and the flag re-enabled with the inverse `UPDATE`
  (`automatic_withdrawn='N' → 'Y'` on the same predicate). Note this would restore the double-movement
  bug for PIS accounts, so a rollback of R24 alone is not advisable without also reverting the code.
- **Contract additions** (`bankReconnectable`, `isBankTransfer`) are additive: an older SPA ignores
  them, and the SPA degrades to "don't block" / the name heuristic when they are absent, so the two
  repos can be deployed in either order.
