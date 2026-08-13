# ETP-4241 Cross-Domain Plan — Unit Test Coverage

## Purpose
Add unit and integration tests across all Schema Forge domains to increase Sonar coverage from 56% to 65%+. This is a **test-only** PR — no production code is modified.

## Domains Touched

| Domain | Files | Justification |
|--------|-------|---------------|
| generator-change | 19 test files in `cli/test/` | Tests for CLI pipeline tools (extract, generate, push, validate, migrate) |
| platform-change | 37 test files in `tools/app-shell/src/` | Tests for shared hooks, libs, contract-ui components, pages |
| shared-custom-capability | 3 test files in `windows/custom/shared/` | Tests for LocationEditorModal, OcrSidePanel, usePreviewAttachment |
| window:contacts | 4 test files | BillingPreferencesForm, BusinessPartnerSidebar, ContactsFinancialPanel, ContactsTable |
| window:financial-account | 1 test file | NewMovementWizard |
| window:fiscal-config | 2 test files | CertModal, FiscalConfigDebugPanel |
| window:fiscal-models | 3 test files | FmDebugPanel, FmTabContent, fiscalModelsUtils |
| window:fiscal-monitor | 5 test files | SiiMonitor, ContactDetail, FiscalMonitor, Verifactu, Tbai |
| window:goods-movements | 1 test file | index source-reading test |
| window:physical-inventory | 1 test file | index source-reading test |
| window:price-list | 2 test files | index + PriceListProductPrices |
| window:product | 1 test file | ProductSidebar |
| window:warehouse | 2 test files | MoveStockModal, WarehouseTransactionsTable |
| unknown | 1 test file | report-server helpers |

## Risk Assessment
- **Zero risk to production code** — only `__tests__/` and `cli/test/` files are added/modified
- No generated files changed
- No decisions.json or contract.json modified
- No source code in `src/` modified (only files inside `__tests__/` directories)

## Test Plan
- `make test` — 4,513 tests pass, 0 failures
- `make test-all-coverage` — coverage reports generated
- Sonar coverage verified via scanner upload

## Rollback
Delete the test files. No production impact since only test files are added.
