# ETP-4029 — Cross-domain plan

**Feature:** Editable currency and exchange-rate inheritance on sales/purchase
invoices, currency-filtered "Import from X" dialogs, and a Moneda/Tarifa
field-order fix on order and invoice headers.

This PR is approved as cross-domain because the feature forms a single
cohesive flow that cannot be split: the currency/rate behavior added to the
shared `EntityForm`/`DetailView` components is what makes editable currency
possible on invoice headers, the shared `InvoicePreview` component needs to
reflect the same currency/rate data, and every "Import from X" custom
component across both invoice windows needs the matching currency filter so a
user cannot import lines priced in a different currency than the invoice
header. All domains must land together or the feature is inconsistent between
windows.

Split from a pre-split branch (predates the schema_forge_core /
etendo_schema_forge repo split). Companion PR: schema_forge_core#16.

## Domains touched

### `platform-change` — shared currency/rate handling in contract-ui
Extends the generic `EntityForm` and `DetailView` components with currency
conversion and exchange-rate selector support, so any window's header can
expose an editable currency field with rate inheritance, not just invoices.

- `tools/app-shell/src/components/contract-ui/DetailView.jsx`
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx`
- `tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx`
- `tools/app-shell/src/components/contract-ui/__tests__/DetailView.currencyConversion.test.js`
- `tools/app-shell/src/components/contract-ui/__tests__/EntityForm.currencyRateSelector.test.js`
- `tools/app-shell/src/hooks/__tests__/useLineGrossAmount.test.js`

### `shared-custom-capability` — `InvoicePreview` currency/rate display
The shared invoice preview component (used by both sales and purchase
invoices) is updated to render the header currency and applied exchange rate
consistently.

- `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx`
- `tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreview.vitest.jsx`

### `window:purchase-invoice`, `window:sales-invoice` — editable currency + import filters
Header contract/decisions changes to make currency/rate editable and
inheritable on invoices, plus currency filtering on every "Import from X"
dialog (goods receipt, purchase order, sales order, shipment, return
shipment) so only source documents matching the invoice's currency are
offered.

- `artifacts/purchase-invoice/contract.json`, `contract.mcp.json`,
  `contract.prev.json`, `decisions.json`
- `artifacts/purchase-invoice/generated/web/purchase-invoice/`
- `artifacts/purchase-invoice/custom/ImportFromGoodsReceiptModal.jsx`,
  `ImportFromPurchaseOrderModal.jsx` (+ tests)
- `artifacts/sales-invoice/contract.json`, `contract.mcp.json`,
  `decisions.json`
- `artifacts/sales-invoice/generated/web/sales-invoice/`
- `artifacts/sales-invoice/custom/ImportFromOrderModal.jsx`,
  `ImportFromReturnShipmentModal.jsx`, `ImportFromShipmentModal.jsx`
  (+ tests)
- `docs/generated-custom-windows/purchase-invoice.md`,
  `docs/generated-custom-windows/sales-invoice.md`
- `tools/app-shell/src/locales/en_US.json`, `es_ES.json`
- `tools/app-shell/src/locales/__tests__/etp4029-currency-filter-keys.test.js`

### `window:purchase-order`, `window:sales-order`, `window:sales-quotation` — Moneda/Tarifa field order fix
Moves the currency (Moneda) and price list/rate (Tarifa) fields into the
correct position on order and quotation headers, matching the layout already
used on invoices.

- `artifacts/purchase-order/contract.json`, `contract.mcp.json`,
  `contract.prev.json`, `contract-changelog.json`, `decisions.json`
- `artifacts/purchase-order/generated/web/purchase-order/`
- `artifacts/sales-order/contract.json`, `contract.mcp.json`,
  `decisions.json`
- `artifacts/sales-order/generated/web/sales-order/`
- `artifacts/sales-quotation/contract.json`, `contract.mcp.json`,
  `decisions.json`

See `docs/plans/ETP-4029-currency-invoice.md` for the full design of the
currency/rate feature (extends the ETP-4027 order/quotation currency feature
to invoices).

## Summary of commits

1. `Feature ETP-4029: Add editable currency and rate inheritance to invoices`
   — editable currency + exchange-rate inheritance on sales/purchase
   invoices.
2. `Feature ETP-4029: Filter import-from-X dialogs by invoice currency` —
   currency-filtered "Import from X" dialogs across both invoice windows.
3. `Feature ETP-4029: Fix Moneda/Tarifa field order on orders and invoices` —
   field-order fix on order and invoice headers.
4. This commit — cross-domain plan required by `domain-boundary-check`.

## Tests

- `DetailView.currencyConversion.test.js`
- `EntityForm.currencyRateSelector.test.js`
- `InvoicePreview.vitest.jsx`
- `ImportFromGoodsReceiptModal.test.js`
- `ImportFromPurchaseOrderModal.test.js`
- `ImportFromOrderModal.test.js`
- `etp4029-currency-filter-keys.test.js` (i18n key parity between `en_US.json`
  and `es_ES.json`)

All passing: 111 Node tests + 31 Vitest tests, confirmed before this plan was
written.

## Rollback

Revert the PR. No DB or NEO config changes are made by this repo's side of
the change — this is a pure frontend/artifacts change. The companion
DB-adjacent piece, a new `documentDateField` window-config option in the
generator (schema_forge_core#16), is additive and optional, so it is
safe independently of whether this PR is rolled back.
