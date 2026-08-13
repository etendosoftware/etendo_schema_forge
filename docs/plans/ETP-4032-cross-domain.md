# ETP-4032 — Cross-domain plan

This PR (#623, `feature/ETP-4032` → `epic/ETP-3504`) is an intentionally
cross-domain change for the **goods receipt** feature. It is declared
cross-domain via the `cross-domain-approved` label, as documented in
`docs/ops/domain-boundary-check.md`. CODEOWNER review still applies.

## Domains touched

- **window:goods-receipt** — primary feature window: `ConfirmGoodsReceiptModal`
  (new dedicated confirm modal with invoice toggle), `GoodsReceiptActions`,
  `GoodsReceiptBottomPanel` (import from PO + invoice), `GoodsReceiptPreview`,
  `GoodsReceiptTopbar`, `GoodsReceiptDraftChips`, `ImportFromPurchaseOrderModal`,
  `ImportFromPurchaseInvoiceModal`, `PurchaseReturnWizard`, `RelatedDocuments`.
- **window:goods-shipment** — `GoodsShipmentActions`: migrated `ConfirmResultModal`
  caller from old `cards[]` API to new `docs[]` API.
- **window:purchase-order** — `PurchaseOrderActions`: same `ConfirmResultModal`
  migration.
- **window:purchase-invoice** — `RelatedDocuments`: same migration + nested
  ternary refactor.
- **window:sales-order** — `OrderCreateInvoice`, `index`: same migration.
- **platform-change** — shared app-shell components redesigned: `ConfirmResultModal`
  (new `docs[]` API with type-tinted cards and navigation), `ConfirmDocumentModal`
  (new shared primitives: `CheckboxCard`, `Spinner`, style constants),
  `CreateInvoiceConfirmModal` (new generic confirm modal for invoice creation).
- **app-shell-core** — i18n locale additions (`en_US.json`, `es_ES.json`):
  new keys for `goodsReceipt.confirmModal.*`, `confirmResultModal.*`.

Why one PR: `ConfirmResultModal` is a shared platform component consumed by all
confirm flows across windows. The redesign replaced the `cards[]` API with an
incompatible `docs[]` API — all callers had to be migrated atomically to avoid
runtime errors from the API mismatch. Splitting the platform change from the
caller updates would leave the app broken mid-flight.

## Backend companion

Matching backend changes live in `com.etendoerp.go` on the same
`feature/ETP-4032` branch: `AbstractInOutLineHandler` (captures `invoiceLineId`
across NeoHandler hook phases), `NeoInvoiceSupport.computePendingQtyPerLine`,
`CreatePurchaseInvoiceHandler` (per-line quantity overrides), and
`GoodsReceiptHeaderHandler.afterHandle` (enriches `linkedOrders`,
`linkedInvoices`, `linkedReturns`, `linkedReceipts`). Both repos share the branch.

## Tests

- `tools/app-shell` Vitest suite green (133 new tests added across 7 files):
  `ConfirmGoodsReceiptModal.vitest.jsx` (21), `ConfirmResultModal.vitest.jsx` (11),
  `CreateInvoiceConfirmModal.vitest.jsx` (24), `ImportFromPurchaseInvoiceModal.vitest.jsx` (27),
  `goods-receipt/RelatedDocuments.vitest.jsx` (10),
  `purchase-invoice/RelatedDocuments.vitest.jsx` (10),
  `GoodsReceiptPreview.vitest.jsx` (extended), `GoodsReceiptWindow.vitest.jsx` (extended).
- Java unit tests added for `AbstractInOutLineHandler` and `NeoInvoiceSupport`
  in `com.etendoerp.go` (JUnit 4 + Mockito).
- Pipeline validation: `make validate-pipeline` clean for `goods-receipt`.

## Rollback

Single revert unit: revert the merge of PR #623 (and the paired
`com.etendoerp.go` PR) on `epic/ETP-3504`. Partial rollback is not safe —
`ConfirmResultModal`'s `docs[]` and old `cards[]` APIs are incompatible;
reverting only the shared component while leaving callers migrated (or vice-versa)
causes runtime errors. Full revert restores prior behavior with no data migration
needed (no DB schema or NEO config changes).
