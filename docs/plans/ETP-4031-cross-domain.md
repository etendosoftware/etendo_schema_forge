# Cross-Domain Plan — ETP-4031

## Domains

- `window:goods-shipment` — primary scope: preview fixes, partial-return logic, related documents section
- `shared-custom-capability` — `InvoicePreview.jsx` extended to show related documents (same `RelatedDocumentsCard` pattern already used by OrderPreview and QuotationPreview)
- `platform-change` — `ImportLinesModal.jsx` date timezone bugfix (5-line cosmetic fix, no API surface change)

## Why mixed

The invoice preview change was directly motivated by the goods-shipment preview work: making related-document display consistent across all preview panels. The `ImportLinesModal` fix was a companion bugfix discovered during the same testing session.

## Tests

- `GoodsShipmentPreview.vitest.jsx` — 8 tests (RelatedDocumentsCard placement, tab structure)
- `InvoicePreviewModal.vitest.jsx` — 15 tests (invoice preview including RelatedDocumentsCard)
- `GoodsShipmentActions.test.js` — 21 tests (canCreateReturn logic)

## Rollback

- `InvoicePreview.jsx`: revert `invoiceRelatedSpecs` useMemo and `<RelatedDocumentsCard>` — invoice preview returns to no related-documents section. UI-only, no data impact.
- `ImportLinesModal.jsx`: revert `fmtDate` to one-liner — date display reverts to UTC-based formatting. Cosmetic only, no data loss.
