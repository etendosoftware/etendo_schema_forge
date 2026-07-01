# ETP-4272 — Cross-domain plan

<!-- Justifies why this branch intentionally spans multiple monorepo domains. -->

## Summary

ETP-4272 (T11) adds **funds transfer between financial accounts**, reachable from two
entry points: the row kebab (⋮) of each account in the Accounts list, and a button in the
action bar of the account detail (the slot of the former, feature-flagged "New movement"
button). The source account is pre-filled (read-only); on confirm the backend validates
(same-account, positive amount, balance, same org tree) and **delegates to Etendo Classic's
`FundsTransferActionHandler.createTransfer(...)`**, which creates the paired withdrawal
(`BPW`) / deposit (`BPD`) — plus an optional bank-fee (`BF`) — transactions, left Pending
(`PWNC` / `RDNC`) until reconciled. It necessarily spans frontend components, i18n, the
window doc, and the backend handler, all under the same ticket.

## Domains touched

- **platform-change** — new modal
  `tools/app-shell/src/windows/custom/financial-account/FundsTransferModal.jsx`; new hook
  `useFundsTransfer()` in `tools/app-shell/src/hooks/useCreateMovement.js` (wraps the
  existing `usePostAction('transfer')`); entry-point wiring in
  `components/financial-accounts/AccountRowMenu.jsx` (+ `AccountsTable/AccountRow.jsx`,
  `AccountsTable/index.jsx`), `pages/FinancialAccountsPage.jsx`, and
  `windows/custom/financial-account/{MovementsToolbar/index.jsx,MovementsTab.jsx}`
  (Transfer button replaces the hidden New-movement button); vitest
  `__tests__/FundsTransferModal.vitest.jsx` (+ updated `MovementsToolbar` test).
- **app-shell-core** — i18n keys for the transfer modal (ES + EN)
  `packages/app-shell-core/src/locales/{en_US,es_ES}.json` (the `financeAccountTransfer*`
  group: action/title/source/destination/amount/currency-from/currency-to/rate/bank-fee/
  description/confirm/cancel/success/error/error-same-account/error-balance).
- **window:financial-account** — `docs/generated-custom-windows/financial-account.md`
  documents the "Transfer funds" action in the list kebab and detail action bar, the form,
  and the backend `action=transfer` endpoint.
- **backend (com.etendoerp.go, separate repo, same ticket)** —
  `FinancialAccountTransactionsHandler`: `transfer` route + `transfer(...)` (validation +
  `sameOrgScope` / `availableBalance` / `loadAccount` seams) delegating to Classic
  `FundsTransferActionHandler.createTransfer` via the `doTransfer` seam; reuses the
  `com.etendoerp.go` ↔ `org.openbravo.advpaymentmngt` (core) dependency. No DB/schema
  changes (it composes existing tables and the existing Classic flow).

## Tests

- `tools/app-shell`: vitest for `FundsTransferModal` (source prefilled read-only,
  destination excludes source, confirm gating, bank-fee toggle, currency-to visibility,
  over-balance block, payload on confirm, multi-currency rate) + `MovementsToolbar` transfer
  button fires `onTransfer`.
- Backend: `FinancialAccountTransactionsHandlerTest` (transfer delegates to Classic with the
  expected args; 400 same-account / non-positive / over-balance / different-org; 404 missing
  account; multi-currency forwards the rate; bank fees → `bankFeeFrom`/`bankFeeTo`; error rolls back).

## Rollback

Revert the ETP-4272 commits on both repos (schema_forge + com.etendoerp.go). No DB migration
is required — the feature composes existing tables and reuses the Classic funds-transfer
flow; reverting the code fully removes the action from both entry points.
