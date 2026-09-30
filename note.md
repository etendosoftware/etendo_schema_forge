---
task: ETP-5333
note: ETP-5333/a8065507
kind: backfill
date: 2026-09-16T01:27:36.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 04d269cb08
  - 6fc83388f0
  - 749a2c56ae
files:
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - artifacts/goods-receipt/custom/__tests__/GoodsReceiptActions.test.js
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - tools/app-shell/src/components/contract-ui/CreateInvoiceConfirmModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreateInvoiceConfirmModal.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptActions.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentActions.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/ConfirmWithCreditButtonBase.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/ConfirmWithCreditButtonBase.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useConfirmWithCredit.test.js
  - tools/app-shell/src/windows/custom/shared/useConfirmWithCredit.js
  - tools/app-shell/src/windows/custom/return-material-receipt/ConfirmWithCreditButton.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ConfirmWithCreditButton.jsx
---

## Resumen
Se mejoró el flujo de creación de facturas: el modal se mantiene abierto durante el procesamiento, se evitan recargas completas después de crear facturas de retorno y se reduce la complejidad cognitiva del componente modal mediante extracción de lógica.

## Decisiones
- Mantener modal abierto mientras se procesa — mejor UX, evita confusión por cierre prematuro
- Evitar recargas completas en creación de facturas de retorno — actualización más eficiente, mantiene contexto del usuario
- Extraer lógica del componente modal — reduce complejidad cognitiva, mejora mantenibilidad

## Descartado
- Recargas completas de página — reemplazadas por actualizaciones parciales

## Deuda dejada
- Los cambios afectan múltiples componentes (GoodsReceipt, GoodsShipment, ReturnMaterialReceipt, ReturnToVendorShipment) con posibles divergencias en implementación
- Hook `useConfirmWithCredit` modificado en 3 líneas pero posible complejidad remanente
- Documentación generada pero sin cambios visibles de lógica en archivos Markdown
