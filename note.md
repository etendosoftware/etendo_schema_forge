---
task: ETP-5260
note: ETP-5260/7160c37a
kind: backfill
date: 2026-09-11T13:45:50.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 493a6e53db
  - 7baa4cc7b6
  - edca0febee
files:
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - artifacts/goods-receipt/custom/GoodsReceiptSecondaryActions.jsx
  - artifacts/goods-receipt/custom/__tests__/GoodsReceiptSecondaryActions.test.js
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - artifacts/goods-shipment/custom/GoodsShipmentSecondaryActions.jsx
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentSecondaryActions.test.js
  - artifacts/purchase-invoice/custom/PurchaseInvoiceSecondaryActions.jsx
  - artifacts/purchase-invoice/custom/__tests__/PurchaseInvoiceSecondaryActions.test.js
  - artifacts/purchase-order/custom/PurchaseOrderActions.jsx
  - artifacts/purchase-order/custom/PurchaseOrderSecondaryActions.jsx
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderActions.test.js
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderSecondaryActions.test.js
  - artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx
  - artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - artifacts/sales-order/custom/OrderCreateInvoiceSecondaryActions.jsx
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoiceSecondaryActions.test.js
  - artifacts/sales-quotation/custom/QuotationSecondaryActions.jsx
  - artifacts/sales-quotation/custom/QuotationTopbarActions.jsx
  - artifacts/sales-quotation/custom/__tests__/QuotationSecondaryActions.test.js
  - artifacts/sales-quotation/custom/__tests__/QuotationTopbarActions.test.js
  - docs/document-printables.md
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - docs/plans/2026-09-10-etp-5260-orden-botones-accion-plan.md
  - docs/ui-customization.md
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.render.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/index.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceTopbar.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/index.jsx
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-order/index.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/ConfirmWithCreditButton.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/ReturnMaterialReceiptSecondaryActions.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ConfirmWithCreditButton.spec.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ReturnMaterialReceiptSecondaryActions.test.js
  - tools/app-shell/src/windows/custom/return-material-receipt/index.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ConfirmWithCreditButton.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ReturnToVendorShipmentSecondaryActions.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/ConfirmWithCreditButton.spec.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/ReturnToVendorShipmentSecondaryActions.test.js
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/index.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/SalesInvoiceSecondaryActions.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/SalesInvoiceTopbar.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/SalesInvoiceSecondaryActions.test.js
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/SalesInvoiceTopbar.sifDuplicate.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/index.jsx
  - tools/app-shell/src/windows/custom/sales-order/__tests__/index.vitest.jsx
---

## Resumen
Reordenamiento de botones de acciones en 9 ventanas de documentos: acciones secundarias (copiar link, clonar, enviar email) ahora renderean antes que primarias (Guardar, Confirmar), con dos correcciones colaterales en headers HTTP y propagación de props.

## Decisiones
- Crear `topbarSecondary` slot nuevo en DetailView (antes de Save/Confirm) en lugar de modificar `topbarRight` para evitar regresión de ETP-4933 (posición de Confirm en return-shipment)
- Extraer componente `DocumentSecondaryActions` compartido para 9 ventanas, reemplazando copias divergentes del botón clone
- Usar `buildHeaders` canónico en clone-modal para incluir `Accept-Language`, consistente con fix ETP-5022
- Reenviar props adicionales en CloneButton (incluyendo `data-testid`) hacia el DOM

## Deuda dejada
- Corrección de token incorrecto (`status-info-fg` como fondo en lugar de `hsl(var(--primary))`) aplicada a 4 ventanas; describida como patrón igual a ETP-4781, no directamente parte del reordenamiento
- Bug de propagación de props no fue detectado por tests unitarios de `DocumentSecondaryActions` porque mockean `CloneButton`; requirió test e2e para surfacing

## Pendiente
Revisar si la corrección del token incorrecto en botones primarios necesita aplicarse a otras ventanas más allá de las 4 corregidas.
