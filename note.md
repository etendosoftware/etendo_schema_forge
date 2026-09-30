---
task: ETP-5410
note: ETP-5410/1e27c71f
kind: backfill
date: 2026-09-22T00:45:40.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 15643caf58
  - 97a4a8e72d
  - 67f98d311f
  - 8053f1ced9
  - 90a9e4473e
  - 11affacd25
  - 9c2f69b155
  - f9a21f259f
  - b651001a91
  - cd4b2e3aa6
  - 64d74b04b6
files:
  - tools/app-shell/src/components/contract-ui/CreateInvoiceConfirmModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreateInvoiceConfirmModal.vitest.jsx
  - artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx
  - artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js
  - artifacts/goods-receipt/custom/BulkInvoiceFromReceipt.jsx
  - artifacts/goods-receipt/custom/__tests__/BulkInvoiceFromReceipt.test.js
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentActions.vitest.jsx
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - artifacts/goods-receipt/custom/__tests__/GoodsReceiptActions.test.js
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptActions.vitest.jsx
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - e2e/tests/flows/goods-shipment-confirm-and-invoice.mocked.spec.js
  - e2e/tests/flows/return-to-vendor-shipment.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/PriceListPicker.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ConfirmInOutModal.spec.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/PriceListPicker.vitest.jsx
  - tools/app-shell/src/components/contract-ui/ConfirmDocumentModal.jsx
  - package-lock.json
---

## Resumen
Se implementó soporte de cotizaciones reales en la creación de facturas masivas desde recepciones y envíos de mercadería, refactorizando componentes para usar un modal compartido y agregando un selector de Tarifa buscable.

## Decisiones
- Refactorizar `BulkInvoiceFromShipment` hacia un modal compartido (`CreateInvoiceConfirmModal`) para reducir duplicación de lógica.
- Implementar cotizaciones reales en lugar de datos simulados en los modales de factura.
- Agregar componente `BulkInvoiceFromReceipt` espejo de `BulkInvoiceFromShipment` para paridad de funcionalidad.
- Extender `PriceListPicker` con capacidad de búsqueda en Tarifas.

## Deuda dejada
- El esqueleto de cotización en los modales sugiere estructura incompleta; verificar si toda la lógica de cálculo está implementada.
- Tests expandidos significativamente (210+ líneas en `BulkInvoiceFromReceipt.test.js`) pero falta evidencia de cobertura de casos edge en selección de Tarifa.
- Documentación regenerada automáticamente; las manuales podrían quedar desincronizadas.
- Conflicto en `package-lock.json` resuelto por deleción completa de diff; verificar integridad de dependencias.

## Pendiente
- Validar que todos los flujos de facturación masiva funcionen end-to-end con cotizaciones reales en integración.
