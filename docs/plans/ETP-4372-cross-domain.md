# ETP-4372 Cross-Domain Plan

Document email — fix, enable and clean up the document email access points across
sales/purchase/return windows. The change is cross-domain because a single shared
email capability (`SendDocumentModal` + `useRowEmailModal`) is wired, enabled, or
removed consistently across many document windows.

## Domains changed

| Domain | Files | Reason |
|--------|-------|--------|
| `shared-custom-capability` | `shared/useRowEmailModal.jsx`, `shared/useOrderWindow.jsx`, `shared/OrderPreview.jsx`, `shared/PreviewActionButtons.jsx`, `shared/preview-cards/buildReturnPreviewContent.jsx` (+ tests) | Shared hook/preview plumbing so the row-hover envelope opens `SendDocumentModal` WITH PDF preview, and the EMAILS-section link is wired |
| `platform-change` | `tools/app-shell/src/windows/registry.js` | Repoint `return-to-vendor` to its new custom window |
| `window:sales-invoice` | `custom/InvoiceTopbarExtra.jsx` | Part 1 — fix the 4 email access points (row envelope, side-panel header, EMAILS link, form action bar) |
| `window:sales-order` | `custom/OrderCreateInvoice.jsx`, `custom/sales-order/index.jsx` | Part 1 — form-view Send stays available in CO (not only Draft); row/preview email with PDF |
| `window:purchase-order` | `custom/PurchaseOrderActions.jsx`, `custom/purchase-order/index.jsx` | Part 1 — 4 email access points with PDF preview |
| `window:goods-shipment` | `custom/GoodsShipmentActions.jsx`, `custom/goods-shipment/*`, `contract.json` | Part 1 — add EMAILS card + row/preview email with PDF |
| `window:sales-quotation` | `custom/QuotationTopbarActions.jsx`, `custom/sales-quotation/index.jsx` | Part 1 — 4 email access points with PDF preview |
| `window:return-to-vendor` | `custom/return-to-vendor/*` (Actions, Preview, index, `useReturnToVendorOrderPdf`), `decisions.json`, `contract.json`, generated | Part 2 — enable all 4 email access points with PDF preview; expose `documentNo` |
| `window:return-from-customer` | `decisions.json`, `contract.json`, generated `CustomerReturnPage.jsx` | Part 3 — remove all email access (out of scope): `sendDocument.enabled:false` |
| `window:goods-receipt` | `custom/GoodsReceiptActions.jsx`, `custom/goods-receipt/*`, `decisions.json`, generated, doc | Part 3 — remove email access: `sendDocument.enabled:false` |
| `window:return-material-receipt` | `decisions.json`, `contract.json`, generated | Part 3 — remove email access: `sendDocument.enabled:false` |
| `window:return-to-vendor-shipment` | `decisions.json`, `contract.json`, generated | Part 3 — remove email access: `sendDocument.enabled:false` |

## Tests

- Unit (Vitest): `useRowEmailModal`, `OrderPreviewEmailLink`, `EmailsCard`,
  `GoodsShipmentPreview`, `return-to-vendor/index` and `ReturnToVendorActions`.
- Node test runner: `buildReturnPreviewContent` source-reading assertions updated
  for the email-removal contract.
- Manual: on sales-invoice/sales-order/purchase-order/goods-shipment/sales-quotation
  each of the 4 access points opens the popup WITH PDF preview.
- Manual: return-to-vendor exposes all 4 access points with preview.
- Manual: return-from-customer, goods-receipt, return-material-receipt and
  return-to-vendor-shipment show NO email affordance anywhere.
- Pipeline: `sf-validate-pipeline --staged` clean; `data-testid` check clean.

## Rollback

Revert the ETP-4372 commit on `feature/ETP-4372`. All changes are frontend-only
(custom components, decisions.json UI flags, regenerated artifacts) except the
`return-to-vendor` `documentNo` exposure, which is applied to NEO via
`push-to-neo.js` + `export.database` and can be re-applied or removed with the
same script — no DB schema migration involved.
