# ETP-4100 — Cross-domain plan

<!-- Justifies why this branch intentionally spans multiple monorepo domains. -->

## Summary

ETP-4100 (T6) delivers the **manual reconciliation split panel** for the
financial-account detail view: a 50/50 panel with bank statement lines (left,
single-select) and candidate operations (right, multi-select), a bottom action
bar, and a Reconcile action that composes the standard Etendo APRM services via
a new NeoHandler. Because the feature materializes a shared contract-ui
component, wires it into the financial-account window, retires the legacy
`bank-reconciliation` placeholder artifact, and adds the backend handler/spec,
it necessarily touches several domains at once.

## Domains touched

- **platform-change** — new shared component
  `tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx`
  (+ its vitest) and the reconciliation data hooks
  `tools/app-shell/src/hooks/useReconciliation.js`. Accounts list polish:
  `components/financial-accounts/AccountsToolbar.jsx` (removed the by-condition
  advanced filter), `AccountsTable/accountColumns.jsx` (wider account column),
  `pages/FinancialAccountsPage.jsx`.
- **app-shell-core** — i18n keys for the reconciliation panel (es/en)
  `packages/app-shell-core/src/locales/{en_US,es_ES}.json`.
- **window:financial-account** — `ReconciliationTab.jsx` now renders the split
  panel; `index.jsx` swaps Export → Automatch on the Conciliación tab; tab
  tests + generated window doc updated.
- **window:bank-reconciliation** — retires the legacy synthetic placeholder
  artifact (deleted `artifacts/bank-reconciliation/**`) and its registry / menu
  / mock-data wiring, since the feature is now a custom panel inside
  financial-account (no standalone window).
- **backend (com.etendoerp.go, separate repo, same ticket)** —
  `ReconciliationHandler` (`@Named("bankReconciliation")`): `pendingLines`,
  `candidates`, `reconcileGroup`; R spec/entity registration in sourcedata.

## Tests

- `tools/app-shell`: vitest for `ReconciliationSplitPanel`, the financial-account
  tab suite, and the financial-accounts suite (toolbar / table / page) — green.
- Backend: `ReconciliationHandlerTest` (Mockito) — green.

## Rollback

Revert the ETP-4100 commits on both repos (schema_forge + com.etendoerp.go).
The retired `bank-reconciliation` placeholder artifact is restored from the
prior commit if needed. The R spec/entity rows are removed by restoring the
prior sourcedata XML and re-running `export.database`; no data migration is
required (the spec held no runtime data).
