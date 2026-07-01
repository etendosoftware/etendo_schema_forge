# ETP-4036 — Cross-domain plan

**Feature:** Purchase invoice subset filters and return invoice fixes.

This PR is approved as cross-domain because the changes span shared
`contract-ui` components (`ListFilterBar.jsx`, `EntityForm.jsx`,
`DetailView.jsx`, `ListView.jsx`), `app-shell-core` locales, generator
tooling, and window-specific changes to Purchase Invoice.

## Domains touched

### `platform-change` (shared contract-ui)

Shared components used by every generated window:

- `tools/app-shell/src/components/contract-ui/ListFilterBar.jsx` — added
  document-type filter support via `isTypeFilter` column flag. Renders a
  dropdown pill with distinct values fetched on demand (lazy on menu open),
  merged with in-memory rows to avoid a second round-trip. Falls back to
  `allTypes` label when no filter is active. `enumLabels` map allows
  per-window label overrides without touching the component again.
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx` — added
  optional `transformRecord` prop: a function applied to the editing record
  before rendering, allowing windows to inject derived fields (e.g. computed
  `isReturn` flag) without mutating the backend payload. Also added
  `dependsOn.noAutoSelect` flag to suppress the default auto-select
  behaviour on dependsOn chains when a value is already set upstream.
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — subset
  filter button layout fix: replaced `flex-1 h-8 px-2` with
  `h-8 px-3 whitespace-nowrap` so multi-word labels don't wrap or collapse.
- `tools/app-shell/src/components/contract-ui/ListView.jsx` — minor fix
  aligned with DetailView subset filter button class change.

### `app-shell-core`

- `packages/app-shell-core/src/locales/en_US.json`,
  `packages/app-shell-core/src/locales/es_ES.json` — 11 new i18n keys:
  `importFromReturnDelivery`, `searchReturnDelivery`,
  `noPendingReturnDeliveriesForSupplier`,
  `noReturnDeliveriesMatchYourSearch`, `linesImportedFromReturnDelivery`,
  `addLinesManuallyOrImportFromReturnDelivery`, `creditApplied`,
  `returnInvoiceTab`, `allTypes`, `searchTypes`, `docType`.

### `generator-change`

- `cli/src/generate-contract.js` — minor fix.
- `cli/src/generate-frontend.js` — minor fix to support new field-level flags.

### `window:purchase-invoice` (primary)

- `artifacts/purchase-invoice/decisions.json` — added `isTypeFilter` on the
  document-type column, `origin invoice` field, and return-invoice-specific
  configuration.
- `artifacts/purchase-invoice/contract.json`, `contract.mcp.json` —
  regenerated.
- `artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx`,
  `HeaderForm.jsx`, `mockData.js` — regenerated.
- `artifacts/purchase-invoice/custom/ImportFromReturnDeliveryModal.jsx` —
  new modal: searches pending return deliveries for the current supplier,
  lets the user pick one, and imports its lines into the draft invoice.
- `artifacts/purchase-invoice/custom/PurchaseInvoiceBottomPanel.jsx` —
  updated to handle return-invoice doc types: `lineMenuActions` returns
  `import-return` for return invoices and `import-receipt` for normal ones;
  `detailExtraActions` exposes `openImportReturnModal` /
  `openImportReceiptModal` via `useImperativeHandle`.
- `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx`
  — updated for new subset filters and origin invoice field.
- `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx`
  — updated.
- `tools/app-shell/src/windows/custom/purchase-invoice/RelatedDocuments.jsx`
  — added return invoice tab.
- `tools/app-shell/src/windows/custom/purchase-invoice/index.jsx` — updated
  entry point.

## Tests

- `artifacts/purchase-invoice/__tests__/contract-integrity.test.js` —
  updated; passes.
- `tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceSubsetFilters.test.js`
  — 152-line new test file; all pass.
- `tools/app-shell/src/windows/custom/purchase-invoice/__tests__/RelatedDocuments.vitest.jsx`
  — 77-line new Vitest file; all pass.
- `tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.test.js`
  — updated; all pass.
- `e2e/tests/flows/purchase-invoice-type-filter.mocked.spec.js` — new E2E
  mocked spec covering type-filter pill, selection, and reset.
- `cli/test/bottom-panels-rollout.test.js` — updated test names to match
  `import-return` / `openImportReturnModal` (was `import-order`).
- Full CLI test suite: 0 failures.

## Rollback

- **Type filter:** revert `ListFilterBar.jsx` `isTypeFilter` block and
  remove the `typeCol` memo. No data change; filter state is client-only.
- **EntityForm:** revert `transformRecord` prop and `noAutoSelect` flag.
  No data change.
- **DetailView / ListView:** revert button class to `flex-1 h-8 px-2`.
  Visual only.
- **Return delivery modal:** remove `ImportFromReturnDeliveryModal.jsx`.
  Lines already imported are unaffected.
- **i18n keys:** unused keys are safe to leave; removing them requires
  reverting both locale JSON files.
