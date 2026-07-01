# React Doctor Report

- **Date**: 2026-07-01T17:22:37.926Z
- **Average score**: 63/100
- **Workspaces scanned**: 7
- **Total errors**: 227
- **Total warnings**: 2558

## Per workspace

| Workspace | Score | Label | Files | Errors | Warnings |
|---|---:|---|---:|---:|---:|
| @schema-forge/app-shell | 19 | Critical | 1208 | 225 | 2479 |
| @schema-forge/ui-preview | 47 | Critical | 3 | 1 | 6 |
| @etendosoftware/app-shell-core | 61 | Needs work | 97 | 1 | 47 |
| @schema-forge/quick-order-app | 67 | Needs work | 13 | 0 | 11 |
| @schema-forge/decision-panel | 69 | Needs work | 6 | 0 | 13 |
| @etendosoftware/schema-forge-stack | 82 | Needs work | 3 | 0 | 1 |
| @schema-forge/spike-hello-app | 96 | Great | 7 | 0 | 1 |

## Issues by category

| Category | Count |
|---|---:|
| Bugs | 1217 |
| Maintainability | 621 |
| Accessibility | 508 |
| Performance | 389 |
| Security | 50 |

## Top 15 rules

| Rule | Count |
|---|---:|
| react-doctor/button-has-type | 267 |
| react-doctor/no-adjust-state-on-prop-change | 206 |
| react-doctor/no-inline-exhaustive-style | 204 |
| react-doctor/control-has-associated-label | 182 |
| react-doctor/no-event-handler | 137 |
| react-doctor/only-export-components | 130 |
| react-doctor/rerender-memo-with-default-value | 125 |
| react-doctor/exhaustive-deps | 113 |
| deslop/unused-file | 101 |
| react-doctor/no-derived-state | 100 |
| react-doctor/no-static-element-interactions | 77 |
| react-doctor/click-events-have-key-events | 75 |
| react-doctor/no-chain-state-updates | 74 |
| react-doctor/prefer-useReducer | 67 |
| react-doctor/no-cascading-set-state | 64 |

## Errors (must fix)

| File | Rule | Line | Message |
|---|---|---:|---|
| src/App.jsx | react-doctor/no-mutable-in-deps | 333 | Values like "location.*" can change without re-rendering the component, so this dependency will not make the effect run again. |
| src/components/OAuth2ClientDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 50 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/OAuth2ClientDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 51 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/OAuth2ClientDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 52 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/OAuth2ClientDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 53 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/OAuth2ClientDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 54 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/OAuth2ClientDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 56 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/CreatableSearchSelect.jsx | react-doctor/no-adjust-state-on-prop-change | 149 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/CreatableSearchSelect.jsx | react-doctor/no-adjust-state-on-prop-change | 310 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/CreateContactModal.jsx | react-doctor/no-adjust-state-on-prop-change | 137 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/CurrencyRatePicker.jsx | react-doctor/no-adjust-state-on-prop-change | 72 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DataTable.jsx | react-doctor/no-effect-with-fresh-deps | 715 | Your useCallback runs every render because dep `handleChange` is a new function built fresh each time, so `===` always fails. |
| src/components/contract-ui/DataTable.jsx | react-doctor/no-adjust-state-on-prop-change | 1222 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DataTable.jsx | react-doctor/no-adjust-state-on-prop-change | 1230 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DataTable.jsx | react-doctor/no-adjust-state-on-prop-change | 1231 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DataTable.jsx | react-doctor/no-adjust-state-on-prop-change | 1232 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 1966 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/effect-needs-cleanup | 2071 | `setTimeout` creates a timer in useEffect without returning cleanup. Return a cleanup function so it does not leak after unmount. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2080 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2081 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2083 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2121 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2342 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2343 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-mutable-in-deps | 2345 | Values like "location.*" can change without re-rendering the component, so this dependency will not make the effect run again. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2356 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-mutable-in-deps | 2358 | Values like "location.*" can change without re-rendering the component, so this dependency will not make the effect run again. |
| src/components/contract-ui/DetailView.jsx | react-doctor/effect-needs-cleanup | 2463 | `setTimeout` creates a timer in useEffect without returning cleanup. Return a cleanup function so it does not leak after unmount. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2493 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2508 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2521 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2525 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2536 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2821 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2906 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2908 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-adjust-state-on-prop-change | 2909 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-mutable-in-deps | 2913 | Values like "location.*" can change without re-rendering the component, so this dependency will not make the effect run again. |
| src/components/contract-ui/DocumentPrintDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 50 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/EntityForm.jsx | react-doctor/no-adjust-state-on-prop-change | 392 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/EntityForm.jsx | react-doctor/no-adjust-state-on-prop-change | 396 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/GoodsMovementsProductSearchDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 85 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/GoodsMovementsProductSearchDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 86 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/ImageField.jsx | react-doctor/no-adjust-state-on-prop-change | 81 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/InlineCreateModal.jsx | react-doctor/no-adjust-state-on-prop-change | 40 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/InlineCreateModal.jsx | react-doctor/no-adjust-state-on-prop-change | 41 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/InternalConsumptionProductSearchDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 71 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/InternalConsumptionProductSearchDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 72 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/InternalConsumptionProductSearchDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 73 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/InternalConsumptionProductSearchDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 74 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/ProcessParamDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 46 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/ReconciliationSplitPanel.jsx | react-doctor/no-adjust-state-on-prop-change | 707 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/ReportDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 226 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/ReportDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 227 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/ReportDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 232 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/ReportDrawer.jsx | react-doctor/no-adjust-state-on-prop-change | 233 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/SelectorInput.jsx | react-doctor/no-adjust-state-on-prop-change | 91 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/SelectorInput.jsx | react-doctor/no-adjust-state-on-prop-change | 92 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/SendDocumentModal.jsx | react-doctor/no-adjust-state-on-prop-change | 357 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/__tests__/DataTable.cellRenderers.vitest.jsx | react-doctor/role-has-required-aria-props | 29 | Screen reader users can't tell the state of this `switch` without its required ARIA props, so add `aria-checked`. |
| src/components/contract-ui/__tests__/DataTable.renderCellValue.vitest.jsx | react-doctor/role-has-required-aria-props | 59 | Screen reader users can't tell the state of this `switch` without its required ARIA props, so add `aria-checked`. |
| src/components/contract-ui/productSelectorDrawerShared.jsx | react-doctor/effect-needs-cleanup | 183 | `setTimeout` creates a timer in useEffect without returning cleanup. Return a cleanup function so it does not leak after unmount. |
| src/components/contract-ui/productSelectorDrawerShared.jsx | react-doctor/no-adjust-state-on-prop-change | 185 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/productSelectorDrawerShared.jsx | react-doctor/no-adjust-state-on-prop-change | 186 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/productSelectorDrawerShared.jsx | react-doctor/no-adjust-state-on-prop-change | 187 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/productSelectorDrawerShared.jsx | react-doctor/no-adjust-state-on-prop-change | 188 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/productSelectorDrawerShared.jsx | react-doctor/no-adjust-state-on-prop-change | 189 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/contract-ui/productSelectorDrawerShared.jsx | react-doctor/no-adjust-state-on-prop-change | 190 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/copilot/ocr/ProductResolverPopup.jsx | react-doctor/effect-needs-cleanup | 184 | `setTimeout` creates a timer in useEffect without returning cleanup. Return a cleanup function so it does not leak after unmount. |
| src/components/copilot/ocr/ProductResolverPopup.jsx | react-doctor/no-adjust-state-on-prop-change | 187 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/copilot/ocr/kinds/EntityCell.jsx | react-doctor/effect-needs-cleanup | 24 | `setTimeout` creates a timer in useEffect without returning cleanup. Return a cleanup function so it does not leak after unmount. |
| src/components/dashboard/FinancialTrendChart.jsx | react-doctor/no-nested-component-definition | 132 | Your users lose all state in "TooltipBox" on every render because it's defined inside "FinancialTrendChart", so move it out to the top of the file. |
| src/components/layout/SideMenu/SideMenu.jsx | react-doctor/no-mutable-in-deps | 373 | Values like "location.*" can change without re-rendering the component, so this dependency will not make the effect run again. |
| src/components/layout/SideMenu/SideMenu.jsx | react-doctor/no-mutable-in-deps | 373 | Values like "location.*" can change without re-rendering the component, so this dependency will not make the effect run again. |
| src/components/payment/PaymentForm.jsx | react-doctor/no-adjust-state-on-prop-change | 517 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/payment/PaymentForm.jsx | react-doctor/no-adjust-state-on-prop-change | 517 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/components/payment/PaymentForm.jsx | react-doctor/no-adjust-state-on-prop-change | 517 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/explorer/RequestBuilder.jsx | react-doctor/no-adjust-state-on-prop-change | 35 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useDimensionValues.js | react-doctor/no-adjust-state-on-prop-change | 26 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useDimensionValues.js | react-doctor/no-adjust-state-on-prop-change | 32 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useDistinctValues.js | react-doctor/no-adjust-state-on-prop-change | 105 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useDistinctValues.js | react-doctor/no-adjust-state-on-prop-change | 106 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useMovementLookups.js | react-doctor/no-adjust-state-on-prop-change | 94 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useMovementLookups.js | react-doctor/no-adjust-state-on-prop-change | 94 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useMovementLookups.js | react-doctor/no-adjust-state-on-prop-change | 103 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useMovementLookups.js | react-doctor/no-adjust-state-on-prop-change | 104 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useQuickPurchaseData.js | react-doctor/no-adjust-state-on-prop-change | 167 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useQuickPurchaseData.js | react-doctor/no-adjust-state-on-prop-change | 168 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useQuickSalesData.js | react-doctor/no-adjust-state-on-prop-change | 167 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/hooks/useQuickSalesData.js | react-doctor/no-adjust-state-on-prop-change | 168 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/lib/observability/RouteTracker.jsx | react-doctor/no-mutable-in-deps | 14 | Values like "location.*" can change without re-rendering the component, so this dependency will not make the effect run again. |
| src/lib/useAnimatedOpen.js | react-doctor/no-adjust-state-on-prop-change | 22 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/lib/useAnimatedOpen.js | react-doctor/no-adjust-state-on-prop-change | 26 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/effect-needs-cleanup | 67 | `setTimeout` creates a timer in useEffect without returning cleanup. Return a cleanup function so it does not leak after unmount. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 68 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 68 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 68 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 68 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 68 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 92 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 93 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 94 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 95 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 257 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 278 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 688 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/pages/ReportViewerPage.jsx | react-doctor/no-adjust-state-on-prop-change | 689 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/WindowLoader.jsx | react-doctor/no-adjust-state-on-prop-change | 13 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/WindowLoader.jsx | react-doctor/no-adjust-state-on-prop-change | 14 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/WindowLoader.jsx | react-doctor/no-adjust-state-on-prop-change | 15 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/WindowLoader.jsx | react-doctor/no-adjust-state-on-prop-change | 19 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/WindowLoader.jsx | react-doctor/no-adjust-state-on-prop-change | 20 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/amortization/AmortizationLinesTable.jsx | react-doctor/no-adjust-state-on-prop-change | 261 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/amortization/AmortizationLinesTable.jsx | react-doctor/no-mutable-in-deps | 263 | Values like "location.*" can change without re-rendering the component, so this dependency will not make the effect run again. |
| src/windows/custom/chart-of-accounts/NewAccountModal.jsx | react-doctor/no-adjust-state-on-prop-change | 136 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/contacts/ContactsFinanceContext.jsx | react-doctor/no-adjust-state-on-prop-change | 27 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/contacts/ContactsFinanceContext.jsx | react-doctor/no-adjust-state-on-prop-change | 28 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/contacts/ContactsFinanceContext.jsx | react-doctor/no-adjust-state-on-prop-change | 31 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/contacts/ContactsFinanceContext.jsx | react-doctor/no-adjust-state-on-prop-change | 32 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/EditAccountModal.jsx | react-doctor/no-adjust-state-on-prop-change | 159 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/ImportStatementModal.jsx | react-doctor/no-adjust-state-on-prop-change | 81 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/ImportStatementModal.jsx | react-doctor/no-adjust-state-on-prop-change | 82 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/LookupPicker.jsx | react-doctor/no-adjust-state-on-prop-change | 60 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/ManualStatementModal.jsx | react-doctor/no-adjust-state-on-prop-change | 628 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/ManualStatementModal.jsx | react-doctor/no-adjust-state-on-prop-change | 629 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/ManualStatementModal.jsx | react-doctor/no-adjust-state-on-prop-change | 630 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/ManualStatementModal.jsx | react-doctor/no-adjust-state-on-prop-change | 631 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/ManualStatementModal.jsx | react-doctor/no-adjust-state-on-prop-change | 651 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewAccountWizard.jsx | react-doctor/no-adjust-state-on-prop-change | 111 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewAccountWizard.jsx | react-doctor/no-adjust-state-on-prop-change | 112 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewAccountWizard.jsx | react-doctor/no-adjust-state-on-prop-change | 113 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewAccountWizard.jsx | react-doctor/no-adjust-state-on-prop-change | 114 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewAccountWizard.jsx | react-doctor/no-adjust-state-on-prop-change | 115 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewAccountWizard.jsx | react-doctor/no-adjust-state-on-prop-change | 116 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewMovementDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 44 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewMovementDialog.jsx | react-doctor/no-adjust-state-on-prop-change | 45 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewMovementWizard/index.jsx | react-doctor/no-adjust-state-on-prop-change | 268 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewMovementWizard/index.jsx | react-doctor/no-adjust-state-on-prop-change | 269 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/financial-account/NewMovementWizard/index.jsx | react-doctor/no-adjust-state-on-prop-change | 271 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-config/CertModal.jsx | react-doctor/no-adjust-state-on-prop-change | 129 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-config/CertModal.jsx | react-doctor/no-adjust-state-on-prop-change | 130 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-config/useCertExpiry.js | react-doctor/no-adjust-state-on-prop-change | 18 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-config/useCertExpiry.js | react-doctor/no-adjust-state-on-prop-change | 21 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 316 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 317 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 318 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 319 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 320 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 320 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 320 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 320 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 320 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 321 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 321 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/ContactDetailModal.jsx | react-doctor/no-adjust-state-on-prop-change | 321 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 270 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 271 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 272 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 276 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 277 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 278 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 281 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 282 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 87 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 88 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 89 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 90 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 94 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 95 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/VerifactuMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 121 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/VerifactuMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 122 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/VerifactuMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 126 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/fiscal-monitor/VerifactuMonitorSection.jsx | react-doctor/no-adjust-state-on-prop-change | 127 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/payment-out/RelatedDocuments.jsx | react-doctor/no-adjust-state-on-prop-change | 75 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/product-category/ProductCategoryCustomForm.jsx | react-doctor/rules-of-hooks | 9 | `useUI` changes Hook order between renders when called conditionally, so React can attach state to the wrong Hook. |
| src/windows/custom/product-category/ProductCategoryCustomForm.jsx | react-doctor/rules-of-hooks | 10 | `useLabel` changes Hook order between renders when called conditionally, so React can attach state to the wrong Hook. |
| src/windows/custom/product/ProductListCells.jsx | react-doctor/no-adjust-state-on-prop-change | 84 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/product/ProductPriceBar.jsx | react-doctor/no-adjust-state-on-prop-change | 193 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/purchase-invoice/PaymentDetailsPanelCustom.jsx | react-doctor/no-adjust-state-on-prop-change | 40 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/purchase-invoice/RelatedDocuments.jsx | react-doctor/no-adjust-state-on-prop-change | 58 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/purchase-order/RelatedDocuments.jsx | react-doctor/no-adjust-state-on-prop-change | 44 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 270 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 271 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 272 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 273 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 274 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 275 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 277 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 278 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 279 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 280 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 281 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 283 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 284 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 285 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 286 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 287 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 288 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 289 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 290 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 291 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 292 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 349 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 390 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 391 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 392 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 393 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 394 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 396 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/LocationEditorModal.jsx | react-doctor/no-adjust-state-on-prop-change | 397 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/OcrSidePanel.jsx | react-doctor/no-adjust-state-on-prop-change | 70 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/OcrSidePanel.jsx | react-doctor/no-adjust-state-on-prop-change | 75 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/pdfUtils.js | react-doctor/no-adjust-state-on-prop-change | 300 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/pdfUtils.js | react-doctor/no-adjust-state-on-prop-change | 301 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/pdfUtils.js | react-doctor/no-adjust-state-on-prop-change | 302 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/pdfUtils.js | react-doctor/no-adjust-state-on-prop-change | 303 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/preview-cards/RelatedDocumentsCard.jsx | react-doctor/no-adjust-state-on-prop-change | 112 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/preview-cards/RelatedDocumentsCard.jsx | react-doctor/no-adjust-state-on-prop-change | 113 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/useDocumentCurrency.js | react-doctor/no-adjust-state-on-prop-change | 30 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/useFiscalStatus.js | react-doctor/no-adjust-state-on-prop-change | 67 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/useFiscalStatus.js | react-doctor/no-adjust-state-on-prop-change | 72 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/useFiscalStatus.js | react-doctor/no-adjust-state-on-prop-change | 76 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/shared/usePreviewAttachment.js | react-doctor/no-adjust-state-on-prop-change | 64 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/custom/warehouse/useWarehouseStock.js | react-doctor/no-adjust-state-on-prop-change | 43 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/windows/spike-apps-host/AppIframeHost.jsx | react-doctor/no-adjust-state-on-prop-change | 29 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
| src/App.jsx | react-doctor/no-eval | 79 | new Function() is a code-injection vulnerability: it builds & runs code from a string. |
| src/hooks/useCurrency.jsx | react-doctor/no-adjust-state-on-prop-change | 45 | This effect adjusts state after a prop changes, so users briefly see the stale value. |
