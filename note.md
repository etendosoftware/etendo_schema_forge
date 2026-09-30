---
task: ETP-5527
note: ETP-5527/c4c5bc96
kind: backfill
date: 2026-09-29T19:01:48.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 895f2b1575
  - 7ea9a6affa
  - e3f49d8dd5
files:
  - artifacts/goods-shipment/custom/RelatedDocuments.jsx
  - artifacts/return-material-receipt/custom/RelatedDocuments.jsx
  - artifacts/sales-invoice/custom/RelatedDocuments.jsx
  - artifacts/sales-invoice/custom/__tests__/RelatedDocuments.test.js
  - artifacts/sales-order/custom/RelatedDocuments.jsx
  - artifacts/sales-order/custom/__tests__/RelatedDocuments.test.js
  - artifacts/sales-order/generated/web/sales-order/__tests__/RelatedDocuments.test.js
  - artifacts/sales-quotation/custom/RelatedDocuments.jsx
  - artifacts/sales-quotation/custom/__tests__/RelatedDocuments.test.js
  - docs/generated-custom-windows/fiscal-monitor.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - docs/ui-customization.md
  - tools/app-shell/src/components/related-documents/RelatedDocumentsSection.jsx
  - tools/app-shell/src/components/related-documents/__tests__/helpers.relatedFetch.vitest.js
  - tools/app-shell/src/components/related-documents/__tests__/relatedDocumentsParity.vitest.jsx
  - tools/app-shell/src/components/related-documents/__tests__/salesRelatedDocs.vitest.js
  - tools/app-shell/src/components/related-documents/__tests__/useRelatedDocuments.vitest.jsx
  - tools/app-shell/src/components/related-documents/constants.jsx
  - tools/app-shell/src/components/related-documents/docChipTypes.jsx
  - tools/app-shell/src/components/related-documents/helpers.js
  - tools/app-shell/src/components/related-documents/index.js
  - tools/app-shell/src/components/related-documents/salesRelatedDocs.js
  - tools/app-shell/src/components/related-documents/useRelatedDocuments.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/FiscalMonitorPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/FiscalMonitorPage.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/GoodsShipmentPreview.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/ReturnMaterialReceiptPreview.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ReturnMaterialReceiptPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/RelatedDocuments.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/index.jsx
  - tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx
  - tools/app-shell/src/windows/custom/shared/OrderPreview.jsx
  - tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreviewModal.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/OrderPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/OrderPreviewEmailLink.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/QuotationPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/buildReturnPreviewContent.test.js
  - tools/app-shell/src/windows/custom/shared/preview-cards/RelatedDocumentsCard.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/ReturnDocStatsPanel.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/__tests__/RelatedDocumentsCard.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/__tests__/ReturnDocStatsPanel.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/buildReturnPreviewContent.jsx
---

## Resumen
Se consolidó la funcionalidad de documentos relacionados mediante un componente y lógica compartidos, reemplazando cinco implementaciones duplicadas en diferentes módulos (sales-invoice, sales-order, sales-quotation, goods-shipment). Se eliminó el tipo "payments" de sales order según ajuste de requisitos.

## Decisiones
- Centralizar lógica en `salesRelatedDocs.js` y `useRelatedDocuments.js` — reduce duplicación masiva y facilita cambios futuros (un cambio anterior afectaba 4+ archivos)
- Crear componente `RelatedDocumentsSection.jsx` reutilizable — separa presentación de lógica
- Colocalizar tests de paridad en directorio compartido — valida coherencia entre módulos que comparten la lógica

## Descartado
- Mantener código duplicado — causa fricción en cambios coordinados y fue el motivador de la consolidación

## Deuda dejada
- Tests de paridad acoplados a estructura de componentes preview — cambios en interfaces podrían romper validaciones sin cambiar funcionalidad real
