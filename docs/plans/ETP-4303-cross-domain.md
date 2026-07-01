# ETP-4303 Cross-Domain Plan — Reception-status relabel + document-type column label fix

## Purpose
Two related label corrections that span purchase documents and shared surfaces:

1. **Reception status relabel** — rename the purchase delivery indicator from
   "Delivery Status" / "Estado de entrega" to "Reception Status" / "Estado de
   recepción" across purchase-invoice and purchase-order, so the column reads as
   a goods-reception (procurement) indicator instead of a shipping one.
2. **Document-type column label** — the custom invoice header tables rendered the
   document-type column via `t('docType')`, which the AD-dictionary fallback in
   `resolveColumnLabel` overrode (e.g. "Documento transacción"). Set the
   higher-priority `labels` entry so the intended "Document Type" / "Tipo de
   documento" label wins, backed by new shared i18n keys and a regression test.

## Domains Touched

| Domain | Files | Justification |
|--------|-------|---------------|
| window:purchase-invoice | `artifacts/purchase-invoice/{contract.json,contract.mcp.json,contract.prev.json,decisions.json}`, `artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx`, `tools/app-shell/src/windows/custom/purchase-invoice/{index.jsx,PurchaseInvoiceHeaderTable.jsx,__tests__/index.test.js}` | Relabel `em_etgo_delivery_status` to Reception Status in `decisions.json` (regenerated contract/generated), and set `labels` for the doc-type column in the custom header table. |
| window:purchase-order | `artifacts/purchase-order/{contract.json,contract.mcp.json,decisions.json}`, `artifacts/purchase-order/generated/web/purchase-order/HeaderPage.jsx`, `docs/generated-custom-windows/purchase-order.md` | Relabel `DeliveryStatusPurchase` to Reception Status in `decisions.json` (regenerated contract/generated) and update the window guide to match. |
| generator-change | `cli/test/invoice-delivery-status.test.js` | Make the `em_etgo_delivery_status` label assertion per-window so sales-invoice keeps "Delivery Status" while purchase-invoice expects "Reception Status". |
| window:sales-invoice | `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx` | Same doc-type column `labels` fix so the header outranks the AD-dictionary fallback. |
| app-shell-core | `packages/app-shell-core/src/locales/{en_US.json,es_ES.json}` | New `documentType` i18n key added to both locales (Spanish is the primary client locale). |
| platform-change | `tools/app-shell/src/lib/__tests__/resolveColumnLabel.test.js` | Regression test asserting `labels` priority beats the AD-dictionary fallback in `resolveColumnLabel`. |

## Risk Assessment
- Label-only change: no DB schema, no behavior, no API contract field changes
  (only display labels and checksum/timestamp churn in the regenerated contracts).
- `decisions.json` is the source of truth for the relabel; contracts and generated
  files were produced via `make regen`, so the change survives pipeline re-runs.
- i18n key added to both `en_US` and `es_ES` — no missing-translation risk.
- The purchase-order list wrapper carries duplicated `LABEL_OVERRIDES`; both the
  wrapper and `decisions.json` were updated, and the window guide notes the
  known duplication.

## Test Plan
- `make test` — CLI/app-shell node tests, including the new
  `resolveColumnLabel.test.js` and the updated `purchase-invoice/__tests__/index.test.js`.
- `node cli/src/validate-pipeline.js --scope=purchase-invoice,purchase-order` — 0 violations.
- Manual verification per `docs/generated-custom-windows/purchase-order.md`:
  the list shows "Reception Status" / "Estado de recepción" and the invoice
  header doc-type column reads "Document Type" / "Tipo de documento".

## Rollback
Revert commit `Feature ETP-4303: Relabel delivery status as reception status for purchase documents`.
Restoring the prior `decisions.json` labels (and re-running `make regen`), the two
locale keys, and the custom header `labels` entries returns every surface to the
previous "Delivery Status" / "docType" wording with no other impact.
