# React Doctor Report

- **Date**: 2026-05-09T00:24:47.193Z
- **Average score**: 86/100
- **Workspaces scanned**: 5
- **Total errors**: 16
- **Total warnings**: 2034

## Per workspace

| Workspace | Score | Label | Files | Errors | Warnings |
|---|---:|---|---:|---:|---:|
| @schema-forge/app-shell | 45 | Critical | 416 | 15 | 2010 |
| @schema-forge/decision-panel | 95 | Great | 6 | 0 | 11 |
| @schema-forge/quick-order-app | 95 | Great | 13 | 0 | 7 |
| @schema-forge/spike-hello-app | 98 | Great | 7 | 0 | 4 |
| @schema-forge/ui-preview | 98 | Great | 3 | 1 | 2 |

## Issues by category

| Category | Count |
|---|---:|
| Architecture | 1243 |
| Performance | 269 |
| State & Effects | 177 |
| Accessibility | 172 |
| Dead Code | 135 |
| Correctness | 49 |
| Bundle Size | 3 |
| Security | 2 |

## Top 15 rules

| Rule | Count |
|---|---:|
| react-doctor/design-no-redundant-size-axes | 502 |
| react-doctor/design-no-default-tailwind-palette | 417 |
| react-doctor/no-inline-exhaustive-style | 120 |
| knip/exports | 91 |
| react-doctor/no-react19-deprecated-apis | 88 |
| react-doctor/rerender-memo-with-default-value | 76 |
| jsx-a11y/no-static-element-interactions | 53 |
| react-doctor/no-cascading-set-state | 51 |
| jsx-a11y/click-events-have-key-events | 48 |
| react-doctor/prefer-useReducer | 46 |
| react-doctor/no-tiny-text | 37 |
| react-doctor/js-combine-iterations | 36 |
| react-doctor/no-array-index-as-key | 36 |
| react-doctor/rerender-state-only-in-handlers | 35 |
| knip/files | 35 |

## Errors (must fix)

| File | Rule | Line | Message |
|---|---|---:|---|
| vite-plugins/report-api.js | react-doctor/no-eval | 604 | new Function() is a code injection risk — avoid dynamic code execution |
| src/windows/custom/fiscal-config/FiscalConfigPage.jsx | react-doctor/no-nested-component-definition | 62 | Component "WipBadge" defined inside "FiscalConfigPage" — creates new instance every render, destroying state |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-mutable-in-deps | 462 | Mutable global "location.*" in deps — values like `location.pathname` can change without triggering a re-render, so they can't drive effect re-runs. Subscribe with useSyncExternalStore or read inside the effect |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-mutable-in-deps | 475 | Mutable global "location.*" in deps — values like `location.pathname` can change without triggering a re-render, so they can't drive effect re-runs. Subscribe with useSyncExternalStore or read inside the effect |
| src/components/contract-ui/DetailView.jsx | react-doctor/no-mutable-in-deps | 979 | Mutable global "location.*" in deps — values like `location.pathname` can change without triggering a re-render, so they can't drive effect re-runs. Subscribe with useSyncExternalStore or read inside the effect |
| src/components/contract-ui/DetailView.jsx | react-doctor/effect-needs-cleanup | 565 | useEffect schedules `setTimeout(...)` but never returns a cleanup — leaks the registration on every re-run and on unmount. Return a cleanup function that calls clearTimeout(...) |
| src/windows/custom/purchase-order/PurchaseOrderActions.jsx | react-hooks/rules-of-hooks | 35 | React Hook "useMemo" is called conditionally. React Hooks must be called in the exact same order in every component render. |
| src/windows/custom/purchase-order/PurchaseOrderActions.jsx | react-hooks/rules-of-hooks | 39 | React Hook "useMemo" is called conditionally. React Hooks must be called in the exact same order in every component render. |
| src/components/contract-ui/ProductSearchDrawer.jsx | react-doctor/effect-needs-cleanup | 188 | useEffect schedules `setTimeout(...)` but never returns a cleanup — leaks the registration on every re-run and on unmount. Return a cleanup function that calls clearTimeout(...) |
| src/components/dashboard/FinancialTrendChart.jsx | react-doctor/no-nested-component-definition | 132 | Component "TooltipBox" defined inside "FinancialTrendChart" — creates new instance every render, destroying state |
| src/components/contract-ui/InternalConsumptionProductSearchDrawer.jsx | react-doctor/effect-needs-cleanup | 200 | useEffect schedules `setTimeout(...)` but never returns a cleanup — leaks the registration on every re-run and on unmount. Return a cleanup function that calls clearTimeout(...) |
| src/pages/ReportViewerPage.jsx | react-doctor/effect-needs-cleanup | 74 | useEffect schedules `setTimeout(...)` but never returns a cleanup — leaks the registration on every re-run and on unmount. Return a cleanup function that calls clearTimeout(...) |
| src/App.jsx | react-doctor/no-mutable-in-deps | 221 | Mutable global "location.*" in deps — values like `location.pathname` can change without triggering a re-render, so they can't drive effect re-runs. Subscribe with useSyncExternalStore or read inside the effect |
| src/components/layout/SideMenu/SideMenu.jsx | react-doctor/no-mutable-in-deps | 236 | Mutable global "location.*" in deps — values like `location.pathname` can change without triggering a re-render, so they can't drive effect re-runs. Subscribe with useSyncExternalStore or read inside the effect |
| src/components/layout/SideMenu/SideMenu.jsx | react-doctor/no-mutable-in-deps | 236 | Mutable global "location.*" in deps — values like `location.pathname` can change without triggering a re-render, so they can't drive effect re-runs. Subscribe with useSyncExternalStore or read inside the effect |
| src/App.jsx | react-doctor/no-eval | 79 | new Function() is a code injection risk — avoid dynamic code execution |
