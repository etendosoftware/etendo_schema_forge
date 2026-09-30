---
task: ETP-5378
note: ETP-5378/be076b20
kind: backfill
date: 2026-09-23T16:57:29.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - dd835c6cac
  - 5f8208ec5c
  - 278396b98e
  - 8fb1f15e8f
  - 4386b2f535
  - f641237c22
  - 753f2ebb07
  - 91ec4f741f
  - 0a895ff531
  - 23b2aae8ec
  - fa950831b3
  - 00ab215849
  - 8126fc0880
  - 93877f2877
  - d997bbe37b
files:
  - artifacts/return-material-receipt/contract.json
  - artifacts/return-material-receipt/contract.mcp.json
  - artifacts/return-material-receipt/decisions.json
  - artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage.jsx
  - artifacts/return-to-vendor-shipment/contract.json
  - artifacts/return-to-vendor-shipment/contract.mcp.json
  - artifacts/return-to-vendor-shipment/decisions.json
  - artifacts/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage.jsx
  - tools/app-shell/src/components/contract-ui/DetailMoreActionsMenu.jsx
  - tools/app-shell/src/components/contract-ui/RowQuickActions.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/RowQuickActions.vitest.jsx
  - tools/app-shell/src/lib/__tests__/preUnpost.test.js
  - tools/app-shell/src/lib/preUnpost.js
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/return-material-receipt/index.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/index.jsx
  - tools/app-shell/src/windows/custom/shared/ReturnWindowShell.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/ReturnWindowShell.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/buildDocumentRowQuickActions.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/useInvoiceWindow.test.js
  - tools/app-shell/src/windows/custom/shared/buildDocumentRowQuickActions.js
  - tools/app-shell/src/windows/custom/shared/useInvoiceWindow.js
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/index.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/shared/__tests__/useRowConfirmAction.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/useRowConfirmAction.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/ReturnMaterialReceiptRowConfirmModal.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ReturnToVendorShipmentRowConfirmModal.jsx
  - tools/app-shell/src/windows/custom/sales-quotation/__tests__/index.confirmAction.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-quotation/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/sales-quotation/index.jsx
  - artifacts/sales-quotation/custom/QuotationConfirmModal.jsx
  - artifacts/sales-quotation/custom/__tests__/QuotationConfirmModal.test.js
  - tools/app-shell/src/windows/custom/sales-quotation/__tests__/QuotationConfirmModal.goToDoc.vitest.jsx
  - e2e/tests/flows/row-quick-actions.mocked.spec.js
  - tools/app-shell/src/windows/custom/shared/__tests__/buildReturnRowConfirmModal.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/buildReturnRowConfirmModal.jsx
  - artifacts/sales-quotation/custom/CreateRejectReasonModal.jsx
  - artifacts/sales-quotation/custom/RejectQuotationModal.jsx
  - e2e/tests/flows/quotation-bulk-process.mocked.spec.js
  - e2e/tests/flows/return-bulk-unpost.mocked.spec.js
  - e2e/tests/flows/return-row-confirm-rectify.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.test.js
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-quotation/__tests__/index.bulkActions.vitest.jsx
  - artifacts/goods-receipt/custom/BulkInvoiceFromReceipt.jsx
  - artifacts/goods-receipt/custom/__tests__/BulkInvoiceFromReceipt.test.js
  - artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx
  - artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js
  - tools/app-shell/src/locales/__tests__/etp5378-document-count-keys.test.js
  - e2e/tests/flows/stale-list-cache-after-form-action.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.docActionMenuRefresh.vitest.jsx
---

## Resumen
Se amplió la barra de acciones rápidas (kebab) en grillas de devoluciones, facturas, albaranes y presupuestos, ofreciendo operaciones contables (Post, Unpost, Confirmar, Reactivar) directamente desde las filas. Antes estaban disponibles solo en el formulario o no estaban accesibles.

## Decisiones
- **Flag `includeUnpost` opt-in**: permite goods-shipment/goods-receipt optar por mostrar Unpost sin romper comportamiento existente
- **Refetch antes de abrir modals**: garantiza que las modales reciban datos enriquecidos (linkedOrders, resolvedPriceListId) que el servidor calcula solo cuando el registro está identificado
- **Modal directo para invoices**: bypassa popup de Confirmar ya que las facturas no lo reutilizan (el form tiene botón plain, no flow indirecto)
- **Extraer `preUnpost.js`**: consolidar la lógica de descontabilizar en un único lugar (form kebab, row kebab, bulk actions)
- **Factory para modals de devoluciones**: `buildReturnRowConfirmModal(config)` elimina 35% de código duplicado entre ReturnMaterialReceiptRowConfirmModal y ReturnToVendorShipmentRowConfirmModal

## Descartado
- No saltear popup de Confirmar en devoluciones aunque ya estén 100% facturadas (a diferencia de goods-shipment), para mantener fidelidad con el flujo del formulario

## Deuda dejada
- El botón Confirmar en el form permanece visible pero inerte en algunos estados (pre-existing, fuera de scope)

## Pendiente
Ninguno explícitamente marcado en los commits.
