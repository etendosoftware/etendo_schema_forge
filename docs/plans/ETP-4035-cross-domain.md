# Cross-Domain Plan — ETP-4035

## Domains

- `window:sales-invoice` — primary scope: invoice type tabs (subsetFilters), readOnly doc-type lock, InvoiceHeaderTable simplification, InvoiceTopbarExtra shipment/credit badge, RelatedDocuments source links
- `window:purchase-invoice` — companion update: apply same doc-type contract structure and subsetFilters shape for consistency; no behavior change for existing AP invoice flows
- `platform-change` — `DetailView.jsx` (readOnlyLogicJs support), `SelectorInput.jsx` (doc-type selector filtering hook), `resolveIdentifier.js` (identifier resolution for subtype detection)
- `app-shell-core` — i18n keys: `returnsTab`, `creditApplied`, `manageShipment`, `createShipmentDraft`, `skipShipment`, `createShipmentDraftHint`

## Why mixed

The invoice type feature requires a shared `getArSubtype()` helper used by both sales-invoice components and purchase-invoice display logic. The `platform-change` files add `readOnlyLogicJs` support to the generic DetailView and fix the doc-type selector filtering — both are required by sales-invoice and will benefit all windows that use selectors. The purchase-invoice contract update keeps both invoice windows structurally in sync.

## Tests

- `InvoiceHeaderTable.test.js` — type filter delegation to ListView subsetFilters, FILTERS constant, DataTable direct render
- `SalesInvoiceTopbar.test.js` — shipment creation dialog rendered only for FAC subtype
- `InvoiceTopbarExtra` — credit-applied badge for NC/DEV, payment badge for FAC

## Rollback

- `window:sales-invoice`: revert `subsetFilters` in `index.jsx` → filter tabs disappear (list shows all records, no tab filtering). No data loss.
- `window:purchase-invoice`: revert `decisions.json` and regenerate contract → AP invoice reverts to previous contract shape. No behavior change for users.
- `platform-change`: revert `DetailView.jsx` `readOnlyLogicJs` support → doc type field becomes editable after save (regression for ETP-4035 only). Revert is safe for all other windows.
