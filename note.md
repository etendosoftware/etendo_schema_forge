---
task: ETP-5308
note: ETP-5308/adabd6dd
kind: backfill
date: 2026-09-23T19:01:47.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 6f184d0c82
  - c3896b4611
files:
  - .claude/skills/document-printables/SKILL.md
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.pdfLazyLoad.test.js
  - artifacts/purchase-order/custom/PurchaseOrderActions.jsx
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderActions.pdfLazyLoad.test.js
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoice.pdfLazyLoad.test.js
  - artifacts/sales-quotation/custom/QuotationTopbarActions.jsx
  - artifacts/sales-quotation/custom/__tests__/QuotationTopbarActions.pdfLazyLoad.test.js
  - docs/document-printables.md
  - tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.pdfBlobLoadingFallback.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-order/__tests__/OrderCreateInvoice.pdfLazyLoad.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/pdfUtils.cleanup.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/pdfUtils.js
  - tools/app-shell/src/components/account/SubscriptionSection.jsx
  - tools/app-shell/src/pages/FirstStepsPage.jsx
---

## Resumen
Se optimiza la generación de PDFs en documentos Draft eliminando llamadas innecesarias al servidor de reporte. Los hooks de PDF en Sales Order, Purchase Order, Sales Quotation y Goods Shipment ahora se gatillan solo cuando el modal Send se abre, no al montar el topbar. También se añaden atributos data-testid faltantes en dos componentes.

## Decisiones
- Gated la ejecución del hook de PDF al estado abierto del Send modal: evita remontajes innecesarios del topbar durante la carga del registro, que duplicaban llamadas POST /jsreport/api/report.
- Espejó el patrón validado en ETP-4912 (Sales Invoice): mantiene coherencia con soluciones previas en la misma familia de módulos.
- usePdfGenerator resetea estado al cerrar: garantiza que reaperturas del modal inician limpias, sin PDFs obsoletos en cache.
- SendDocumentModal's fallback build no compite con el build del caller: elimina race conditions entre construcciones simultáneas.

## Deuda dejada
- El patrón se aplica solo a cuatro módulos de documentos. Extender a otros tipos (facturas adicionales, remitos, etc.) requeriría aplicar manualmente el mismo enfoque de lazy loading.
