# Chart of Accounts

## Intent
Maintain the account master used by finance users and provide a quick, read-only review of each account's debit, credit, and current balance from the same window.

## What this window should allow
- Browse the account list from the Finance menu.
- Search accounts by code, name, and account type.
- Create subaccounts from the custom tree toolbar using the selected parent account; the generic Create New list action is hidden.
- Open an existing account and update those same setup fields, except protected parent-like subaccounts whose 8-digit code ends in `0000`.
- Delete an account through the standard generated entity flow.
- Review debit, credit, and balance values in the list as accounting outputs, not as manually editable form inputs.
- See whether the account is active, although the current generated form exposes `isActive` as read-only rather than as a user-controlled toggle.

## Interaction model
- Route: `/chart-of-accounts` for the list and `/chart-of-accounts/:recordId` for record detail.
- Visibility: visible from the Finance menu as **Chart of Accounts**.
- Implementation type: generated window route loaded from the app-shell window registry.
- Window shape: single-entity window for `elementValue`, with a custom grouped tree table replacing the generated list table.
- Record detail titles use the account code (`searchKey`) rather than the internal record id.

## Reactive behavior and dependencies
- There is no visible parent/child interaction because the window only exposes the `account` entity.
- `Parent Account` is the only cross-record dependency in the form. It is rendered as a search-based foreign-key field, so users can link an account to another account, but no catalog preload, hierarchy browser, or auto-filtering behavior is visible in the current generated assets.
- Debit, credit, and balance appear only in the table and are read-only in the contract, so the current surface behaves as account setup plus financial review rather than as a balance-editing screen.
- No dependent selectors, status-driven actions, totals, discounts, tax reactions, or line-level recalculations are visible in the current evidence.
- New subaccount creation is handled by the custom modal. The action is always available; when a branch or account row is selected, the modal defaults the parent selector from that row, and otherwise it opens with no parent selected.
- Account Type values are rendered from AD list translations extracted from `AD_REF_LIST_TRL`, so raw AD values (`A`, `E`, `L`, `M`, `O`, `R`) display consistently in English and Spanish.
- Parent-like posting subaccounts with an 8-digit code ending in `0000` are protected. The form renders Code, Name, Description, and Account Type as read-only for existing protected records, and the backend rejects creating or modifying those codes.

## Gap assessment
- A chart-of-accounts screen often carries stricter accounting semantics such as deleting accounts with activity or account-type-specific behavior. Those rules are not visible in the current contract or generated UI, so they remain gaps or open ambiguities.
- The presence of a `Parent Account` field suggests hierarchical setup, but the current evidence does not show how hierarchy depth, rollups, or parent eligibility are enforced.
- The form treats `Account Type` as a plain text field in the generated UI. If the business expects a controlled value list or behavior that changes by account type, that is not visible here and should be treated as a gap.
- `isActive` is exposed as read-only in the form. If finance users are expected to activate or deactivate accounts directly from this window, that capability is not clearly supported by the current generated surface.
- The balance columns show useful review data, but no evidence here explains whether they are point-in-time totals, ledger-derived live balances, period-sensitive balances, or mock/demo placeholders outside real backend data.

## Manual verification
1. Open `/chart-of-accounts` from the Finance menu and confirm the list loads through the generated window route.
2. Confirm the table shows Code, Name, Account Type, Parent Account, Debit, Credit, Balance, and active-state visibility.
3. Search by Code, Name, and Account Type.
4. Create an account and confirm the editable fields are limited to Code, Name, Account Type, and optional Parent Account.
5. Open an existing account at `/chart-of-accounts/:recordId` and confirm the detail view matches the same maintenance scope.
6. Verify that debit, credit, and balance are review-only values and are not editable in the form.
7. Check whether the UI allows changing `isActive`; based on current generated evidence it should remain read-only.
8. If hierarchical accounting behavior is expected, try assigning a parent account and confirm whether any validation or restrictions actually exist.
9. Open an existing `xxxx0000` subaccount such as `10000000` or `10100000` and confirm the editable setup fields render as read-only.
10. Try to create a new `xxxx0000` subaccount and confirm the backend rejects it.

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `chart-of-accounts` in the Finance menu.
- `tools/app-shell/src/windows/registry.js` maps `chart-of-accounts` to the generated window loader.
- `artifacts/chart-of-accounts/generated/web/chart-of-accounts/index.jsx` implements a generated single-entity list/detail flow for `account`.
- `artifacts/chart-of-accounts/generated/web/chart-of-accounts/AccountForm.jsx` shows the editable setup fields and the read-only `isActive` checkbox.
- `artifacts/chart-of-accounts/generated/web/chart-of-accounts/AccountTable.jsx` shows the list columns and supported filters, including read-only financial review columns for debit, credit, and balance.
- `artifacts/chart-of-accounts/contract.json` defines one `account` entity, no child entities, GET/POST/PUT/DELETE endpoints, supported filters for `code`, `name`, and `accountType`, and a test manifest covering field presence, field types, searchable filters, frontend visibility, and backend-only system fields.
- There is no dedicated frontend test file for this specific window; reusable app-shell coverage exists for generated window registration and shared entity list/default-loading behavior in `tools/app-shell/src/windows/__tests__/registry.test.js`, `tools/app-shell/src/hooks/__tests__/useEntity-pagination.test.js`, and `tools/app-shell/src/hooks/__tests__/useEntity-defaults.test.js`.
