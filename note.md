---
task: ETP-5381
note: ETP-5381/2cce4973
kind: backfill
date: 2026-09-21T05:17:07.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - fb77fe226f
  - 0007e20198
  - e63e5be425
  - 54ea3bbdea
  - 5ed6389ed3
  - c0b419d27b
  - e5e9bcd5c3
  - 47bfc9622c
  - e62ab5a3ac
  - 1ae1ded14c
  - f553ffd7fe
  - edbb1add79
  - e6d21b1358
  - 88dae53cff
  - 5a578985b6
  - a3159f77de
  - a84798d2ad
  - 8d25cc45bf
  - 9cf9345cd3
  - 9b527eaf52
  - e7c16e8357
  - 250af8af2f
  - 6da815f929
  - 0f7a7c5944
  - 08b103b6f3
  - 719314062c
  - eb397164ef
  - 90ca015422
files:
  - tools/app-shell/src/windows/custom/shared/useConfirmWithCredit.js
  - tools/app-shell/src/components/contract-ui/ConfirmInOutModal.jsx
  - tools/app-shell/src/components/contract-ui/CreateInvoiceConfirmModal.jsx
  - tools/app-shell/src/components/contract-ui/RectifiableInvoicePicker.jsx
  - tools/app-shell/src/windows/custom/shared/ConfirmWithCreditButtonBase.jsx
  - artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx
  - artifacts/purchase-order/custom/PurchaseOrderActions.jsx
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - artifacts/sales-quotation/custom/QuotationConfirmModal.jsx
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - docs/generated-custom-windows/sales-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js
  - artifacts/sales-quotation/custom/__tests__/QuotationConfirmModal.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/ConfirmInOutModal.spec.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/RectifiableInvoicePicker.vitest.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ConfirmWithCreditButton.spec.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/ConfirmWithCreditButton.spec.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useConfirmWithCredit.test.js
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - tools/app-shell/src/components/contract-ui/ConfirmResultModal.jsx
  - tools/app-shell/src/windows/custom/shared/useOrderWindow.jsx
  - tools/app-shell/src/components/contract-ui/InvoicePickerModal.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/ReversedInvoicesPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreateInvoiceConfirmModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InvoicePickerModal.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/ReversedInvoicesPanel.vitest.jsx
  - artifacts/_test-support/__tests__/sourceAdjacency.test.js
  - artifacts/_test-support/contractApiKey.js
  - artifacts/_test-support/loadCustomModule.js
  - artifacts/_test-support/sourceAdjacency.js
  - artifacts/goods-receipt/custom/__tests__/GoodsReceiptActions.test.js
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js
  - artifacts/purchase-invoice/custom/__tests__/ImportFromGoodsReceiptModal.test.js
  - artifacts/purchase-invoice/custom/__tests__/ImportFromPurchaseOrderModal.test.js
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderActions.test.js
  - artifacts/sales-invoice/custom/ImportFromOrderModal.jsx
  - artifacts/sales-invoice/custom/ImportFromShipmentModal.jsx
  - artifacts/sales-invoice/custom/ImportFromSourceInvoiceModal.jsx
  - artifacts/sales-invoice/custom/__tests__/ImportFromOrderModal.test.js
  - artifacts/sales-invoice/custom/__tests__/ImportFromReturnShipmentModal.test.js
  - artifacts/sales-invoice/custom/__tests__/ImportFromShipmentModal.test.js
  - artifacts/sales-invoice/custom/__tests__/ImportFromSourceInvoiceModal.test.js
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
  - e2e/tests/flows/goods-shipment-confirm-and-invoice.mocked.spec.js
  - e2e/tests/flows/invoice-import-order-line-fk.mocked.spec.js
  - e2e/tests/flows/return-material-receipt.mocked.spec.js
  - e2e/tests/flows/return-to-vendor-shipment.mocked.spec.js
  - e2e/tests/flows/sales-invoice-import-no-reload.mocked.spec.js
  - e2e/tests/helpers/rectifiable-invoices-mock.js
---

## Resumen
La tarea automatiza la generación y confirmación de facturas en órdenes y devoluciones: ahora se crean confirmadas en un paso, en lugar de quedar en borrador. Se añade validación para elegir qué factura rectifica una rectificativa, sincronizando la lógica cliente-servidor para evitar desacuerdos entre UI y guardia de duplicados.

## Decisiones
- Leer `data.hasReturnInvoice` del backend en lugar de filtrar en cliente por tipo de factura — el backend computa sobre todas las facturas no-anuladas, mismo criterio que la guardia servidor
- Generar invoices confirmadas automáticamente — elimina ambigüedad de estado y paso de revisión inexistente
- Hacer obligatorio seleccionar qué invoice rectifica — garantiza relación `C_INVOICE_REVERSE_TRG` antes de confirmar
- Extraer picker a componente compartida `InvoicePickerModal` — una sola fuente entre Rectificaciones y Return Document

## Descartado
- Crear invoices en borrador — cambiaba la experiencia a confirmar en un paso
- Copy prometiendo review antes de confirmar — ya no aplica en nuevo flujo

## Deuda dejada
- UI no surfaces "Reactivate" como forma de editar invoices generadas (documentado pero no implementado)
- Fixtures de tests con `businessPartner` y `businessPartner$_identifier` fueron insuficientes para detectar regresión en producción (UUID en lugar de nombre en header rows)
- Path de duplicate-invoice en dos windows no pasaba por `translateBackendError`, dejaba mensajes en inglés

## Pendiente
- Agregar UI para "Reactivate" en invoices generadas confirmadas
