# ETP-4102 — Cross-domain plan

<!-- Justifies why this branch intentionally spans multiple monorepo domains. -->

## Summary

ETP-4102 (T8 part 1) delivers the **reactivate / un-reconcile flow** for bank
reconciliation, plus the 1:N fixes that make a reactivated group reconcilable
again. Reactivating a reconciled statement line undoes the reconciliation as a
unit (delegating to the `com.etendoerp.payment.removal` module), un-matches the
bank-statement line, restores each kept transaction to its correct "not cleared"
status by direction (inflow → `RDNC`, outflow → `PWNC`), deletes any auto-created
invoice payments / rule transactions, and physically collapses the 1:N split
sub-lines back into a single line. It necessarily spans frontend components,
i18n, the window doc, and the backend handler, all under the same ticket.

## Domains touched

- **platform-change** — `tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx`
  adds the `ReactivateConfirmDialog` (destructive confirm) and hides the
  "selected / remaining" totals for reconciled lines; `tools/app-shell/src/hooks/useReconciliation.js`
  adds `useReactivateReconciliation()` (wraps `useNeoPost('reactivate')`); plus the
  matching vitest `__tests__/ReconciliationSplitPanel.vitest.jsx`.
- **app-shell-core** — i18n keys for the reactivate confirm dialog and toast
  (ES + EN) `packages/app-shell-core/src/locales/{en_US,es_ES}.json`
  (`financeReconcileToastReactivated`, `financeReconcileConfirmReactivateTitle`,
  `financeReconcileConfirmReactivateBody`).
- **window:financial-account** — `docs/generated-custom-windows/financial-account.md`
  documents the reactivate button (undoes reconciliation + collapses 1:N groups)
  and the updated automatch / left-panel state behavior.
- **backend (com.etendoerp.go, separate repo, same ticket)** —
  `ReconciliationHandler`: `reactivate` route + `undoReconciliation` (unit undo via
  `ReconciliationRemovalUtil.reactivateAndRemoveReconciliation`), `unmatchBankStatementLine`,
  `restoreNotClearedStatus` (direction-based RDNC/PWNC), `normalizeReactivatedMatchGroup`
  (collapse 1:N split sub-lines), `markAutoCreated`/`isAutoCreated`; `AutoMatchSupport`
  subset matcher (`subsetMatch`/`subsetMatchDfs`) + `classifyPendingLine` signal-group
  check; `BankStatementsSupport.mergeMatchGroups` derives `matched` from the merged
  txns (so a reactivated group reads "not reconciled"); DB column `EM_ETGO_Auto_Created`
  on `FIN_FinaccTransaction` (`modifiedTables` + `AD_COLUMN`/`AD_ELEMENT`).

## Tests

- `tools/app-shell`: vitest for `ReconciliationSplitPanel` (reactivate dialog open/
  cancel/confirm, payload, selection clear; totals hidden for reconciled lines) — 35
  green.
- Backend: `ReconciliationHandlerTest` (reactivate happy path, 409 not-reconciled /
  not-linked / closed-period, rollback, `undoReconciliation` unit undo,
  `normalizeReactivatedMatchGroup` merge/skip, `restoreNotClearedStatus` by direction),
  `AutoMatchSupportTest` (subset match + classify) — passing.

## Rollback

Revert the ETP-4102 commits on both repos (schema_forge + com.etendoerp.go). The
`EM_ETGO_Auto_Created` column must be reverted in the DB with `./gradlew update.database`
after reverting the sourcedata/`modifiedTables` XML. No data migration is required —
the column is informative (it flags transactions auto-created by the reconcile flow so
reactivate can delete them) and defaults to `N`.
