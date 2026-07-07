# ETP-4406 — Cross-domain plan: Salt Edge PIS payment flow

## Why this change is cross-domain

ETP-4406 adds a real Salt Edge PIS bank-transfer flow from the invoice payment
popup. The change cannot live only inside one window artifact because it spans:

1. **Platform/shared frontend code** — the popup flow, callback route, i18n, and
   financial-account PSD2 UI live outside any single artifact directory.
2. **Shared custom payment capability** — the payment modal/history components are
   reused across invoice/payment flows, so the PIS behaviour is inherently shared.
3. **Multiple functional windows** — purchase-invoice is the main target, but the
   payment history/preview state also touches payment-in/payment-out artifacts and
   the financial-account UI that exposes PSD2 connectivity.

Because of that, the domain-boundary guard correctly classifies this branch as a
cross-domain change.

## Domains touched

- **platform-change**
  - `tools/app-shell/src/components/contract-ui/CreatableSearchSelect.jsx`
  - `tools/app-shell/src/locales/en_US.json`
  - `tools/app-shell/src/locales/es_ES.json`
  - `tools/app-shell/src/pages/FinancialAccountsPage.jsx`
  - `tools/app-shell/src/pages/PisCallbackPage.jsx`
  - `tools/app-shell/src/pages/__tests__/FinancialAccountsPage.handlers.vitest.jsx`
  
  Why: shared frontend infrastructure needed by the PIS flow: callback route,
  PSD2 connection state surfaced in the accounts UI, and shared translated labels.

- **shared-custom-capability**
  - `tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx`
  - `tools/app-shell/src/windows/custom/shared/InvoicePaymentHistoryModal.jsx`
  - `tools/app-shell/src/windows/custom/shared/preview-cards/PaymentsCard.jsx`
  - `tools/app-shell/src/windows/custom/shared/__tests__/NewPaymentEntryModal.vitest.jsx`
  - `tools/app-shell/src/windows/custom/shared/__tests__/InvoicePaymentHistoryModal.vitest.jsx`
  
  Why: the payment-entry modal, payment history modal, and payment preview card
  are shared UI capabilities used across the payment/invoice experience, so PIS
  support and its tests belong here.

- **unknown**
  - `tools/app-shell/src/runtime-routes.jsx`
  
  Why: route registration for the PIS callback page. The guard marks it as
  `unknown`, but functionally it is part of the platform routing layer.

- **window:financial-account**
  - `tools/app-shell/src/windows/custom/financial-account/EditAccountModal.jsx`
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/EditAccountModal.vitest.jsx`
  
  Why: the financial-account window now surfaces PSD2-connected state/details that
  the payment flow depends on.

- **window:payment-in**
  - `artifacts/payment-in/contract.json`
  - `artifacts/payment-in/contract.mcp.json`

- **window:payment-out**
  - `artifacts/payment-out/contract.json`
  - `artifacts/payment-out/contract.mcp.json`

  Why: these artifacts changed as part of the shared payment workflow rollout and
  remained version-aligned after the merge with the epic branch.

## Tests

- Frontend shared-flow coverage:
  - `tools/app-shell/src/windows/custom/shared/__tests__/NewPaymentEntryModal.vitest.jsx`
  - `tools/app-shell/src/windows/custom/shared/__tests__/InvoicePaymentHistoryModal.vitest.jsx`
- Financial-account PSD2 UI coverage:
  - `tools/app-shell/src/windows/custom/financial-account/__tests__/EditAccountModal.vitest.jsx`
  - `tools/app-shell/src/pages/__tests__/FinancialAccountsPage.handlers.vitest.jsx`
- Pre-push guards expected for this branch:
  - `data-testid` codemod check
  - `domain-boundary-check`

## Rollback

Rollback is file-level and additive; no database migration is introduced in this
repo.

- **Platform/shared frontend**: revert the `tools/app-shell/src/pages/*`,
  `runtime-routes.jsx`, shared locales, and shared modal/card files to remove the
  PIS flow and callback UI.
- **Financial-account window**: revert the `financial-account` custom UI changes
  if PSD2 account-state surfacing needs to be backed out independently.
- **Payment artifacts**: revert `artifacts/payment-in/*` and
  `artifacts/payment-out/*` to restore the prior contract versions/config, then
  re-run the normal artifact/push flow if needed.

This repo's rollback is frontend/config only. Backend behaviour and runtime PSD2
processing live in sibling/module repos and can be reverted independently if
needed.
