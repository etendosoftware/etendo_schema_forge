---
task: ETP-5302
note: ETP-5302/019cdb55
kind: backfill
date: 2026-09-16T19:36:15.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 3b7ca46db9
  - cdca6b60fa
  - 0857cec293
files:
  - artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx
  - artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js
  - artifacts/matched-purchase-invoices/custom/MatchedInvoiceBulkActions.jsx
  - artifacts/purchase-order/custom/BulkPurchaseOrderMoreMenu.jsx
  - artifacts/purchase-order/custom/__tests__/BulkPurchaseOrderMoreMenu.test.js
  - artifacts/sales-order/custom/BulkOrderMoreMenu.jsx
  - artifacts/sales-order/custom/OrderReactivateBulkAction.jsx
  - artifacts/sales-order/custom/__tests__/BulkOrderMoreMenu.test.js
  - artifacts/sales-order/custom/__tests__/OrderReactivateBulkAction.test.js
  - docs/feedback.md
  - docs/generated-custom-windows/amortization.md
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/matched-purchase-invoices.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/ui-customization.md
  - e2e/tests/flows/matched-purchase-invoices.mocked.spec.js
  - e2e/tests/flows/purchase-order-no-reactivate.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx
  - tools/app-shell/src/components/contract-ui/DetailMoreActionsMenu.jsx
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.errorTranslation.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.interactions.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/MatchedInvoiceBulkActions.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useBulkActionToast.test.js
  - tools/app-shell/src/hooks/__tests__/useBulkActionToast.vitest.jsx
  - tools/app-shell/src/hooks/useBulkActionToast.js
  - tools/app-shell/src/lib/__tests__/preUnpost.test.js
  - tools/app-shell/src/lib/preUnpost.js
  - tools/app-shell/src/locales/__tests__/etp5302-bulk-process-confirm-keys.test.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/calendar/PeriodsExpandablePanel.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/index.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/index.jsx
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/PurchaseOrderBulkActionLabel.test.js
  - tools/app-shell/src/windows/custom/purchase-order/index.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/return-material-receipt/index.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/index.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/index.jsx
  - tools/app-shell/src/test/__tests__/bulkDocumentActionMock.test.js
  - tools/app-shell/src/test/bulkDocumentActionMock.js
  - artifacts/purchase-order/custom/PurchaseOrderReactivateBulkAction.jsx
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderNoReactivate.test.js
---

## Resumen
Se renombró el botón de acción bulk "Confirmar" a "Procesar" y se unificaron tres ventanas en su comportamiento. La tarea expuso y corrigió defectos en recarga de página, validación de estados pre-unpost y opciones faltantes de descontabilización.

## Decisiones
- Renombrar a "Procesar" + opción "Confirmar" en diálogo — mejora claridad: el botón no confirma, abre diálogo donde se elige acción
- Reemplazar reload de página con callback `refresh` — preserva scroll y filtros activos
- Implementar `preUnpost` como helper compartido — asegura consistencia entre acciones bulk y detail
- "Descontabilizar" como botón propio — evita confusión con nombre opuesto a acción
- "Aceptar" en lugar de "Completado" en diálogo — evita conflicto con estado de documento
- Unificar botones de reactivación en purchase-order — normaliza UI a patrón usado en otras ventanas
- Extraer mock compartido a `bulkDocumentActionMock.js` — elimina duplicación creciente en tests

## Descartado
- Descontabilizar como opción dentro de "Contabilizar" — confundiría el nombre con la acción
- Reactivate como botón segundo — rompe consistencia UI
- Compartir stub `default` en mock — cada especificación necesita comportamiento distinto

## Deuda dejada
- Selecciones mixtas en Reactivar envían RE a filas draft que backend rechaza; comportamiento heredado también en sales-orders e invoices

## Pendiente
- Reparar rechazo de backend en Reactivate para selecciones mixtas en componente compartido
