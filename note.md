---
task: ETP-5549
note: ETP-5549/c9c2b564
kind: backfill
date: 2026-09-30T18:04:21.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 10582f9235
  - d40cd190a5
  - 21fee03762
  - d72159ebc8
  - 56157957ad
files:
  - artifacts/goods-receipt/custom/GoodsReceiptDraftChips.jsx
  - artifacts/goods-receipt/custom/GoodsReceiptTopbar.jsx
  - artifacts/goods-receipt/custom/__tests__/GoodsReceiptDraftChips.test.js
  - artifacts/goods-shipment/custom/GoodsShipmentBillingBadge.jsx
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentBillingBadge.test.js
  - artifacts/purchase-invoice/contract.json
  - artifacts/purchase-invoice/contract.mcp.json
  - artifacts/purchase-invoice/custom/PurchaseInvoiceReceiptBadge.jsx
  - artifacts/purchase-invoice/custom/__tests__/PurchaseInvoiceReceiptBadge.test.js
  - artifacts/purchase-invoice/decisions.json
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx
  - artifacts/purchase-order/custom/PurchaseOrderDraftChips.jsx
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderDraftChips.test.js
  - artifacts/return-material-receipt/contract.json
  - artifacts/return-material-receipt/contract.mcp.json
  - artifacts/return-material-receipt/custom/ReturnMaterialReceiptInvoicedBadge.jsx
  - artifacts/return-material-receipt/custom/__tests__/ReturnMaterialReceiptInvoicedBadge.test.js
  - artifacts/return-material-receipt/decisions.json
  - artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage.jsx
  - artifacts/return-to-vendor-shipment/contract.json
  - artifacts/return-to-vendor-shipment/contract.mcp.json
  - artifacts/return-to-vendor-shipment/custom/ReturnToVendorShipmentInvoicedBadge.jsx
  - artifacts/return-to-vendor-shipment/custom/__tests__/ReturnToVendorShipmentInvoicedBadge.test.js
  - artifacts/return-to-vendor-shipment/decisions.json
  - artifacts/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage.jsx
  - artifacts/sales-invoice/contract.json
  - artifacts/sales-invoice/contract.mcp.json
  - artifacts/sales-invoice/custom/InvoiceDeliveryBadge.jsx
  - artifacts/sales-invoice/custom/__tests__/InvoiceDeliveryBadge.test.js
  - artifacts/sales-invoice/decisions.json
  - artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx
  - artifacts/sales-order/custom/OrderDraftChips.jsx
  - artifacts/sales-order/custom/__tests__/OrderDraftChips.test.js
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - e2e/tests/flows/sales/printable-download.integration.spec.js
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/DocumentStatusPill.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DocumentStatusPill.vitest.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptDraftChips.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptTopbar.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/ProgressFieldBadge.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/ProgressFieldBadge.vitest.jsx
  - tools/app-shell/src/locales/__tests__/etp5549-received-percent-locale-parity.vitest.js
  - tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx
  - tools/app-shell/src/windows/custom/shared/OrderPreview.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/OrderPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/SummaryCard.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/__tests__/SummaryCard.vitest.jsx
  - artifacts/purchase-invoice/contract.prev.json
---

## Resumen
Se unificaron los badges de estado de documentos en un componente compartido `ProgressFieldBadge` para mostrar consistentemente el progreso de entrega/recepción en headers, previsualizaciones y chips de órdenes, eliminando duplicación de código.

## Decisiones
- Crear `ProgressFieldBadge` compartido — unificar lógica de progreso dispersa en múltiples componentes (GoodsReceiptTopbar, ProgressBadge local, chips de order)
- Montar el badge en `topbarExtra` de invoices (sales y purchase) y ventanas de devolución — consistencia con el grid y facilitar visibilidad del progreso
- Mostrar progreso en previsualizaciones (`InvoicePreview`, `OrderPreview`) — mantener información visible en vistas resumidas
- Redondeo visual del porcentaje — 99.8% se muestra como 100% en verde para mejorar UX

## Descartado
- Mantener `ProgressBadge` local en chips — migrado a reutilizar `ProgressFieldBadge` centralizado

## Deuda dejada
- Badge de progreso en draft solo se muestra cuando `invoiced > 0`
- Montaje en topbarExtra limitado a CO (¿posibles restricciones de contexto?)
