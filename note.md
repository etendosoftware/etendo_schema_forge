---
task: ETP-5501
note: ETP-5501/9438bede
kind: backfill
date: 2026-09-29T00:55:47.000Z
authors:
  - Matias Bernal
agents:
sessions:
commits:
  - 34149f236a
  - 209cc3e144
  - a38c34ab56
  - dffcf2c9a4
  - 8522e5277e
  - 8bd72a1758
  - c1b491ff47
files:
  - artifacts/__tests__/etp-4565-accounting-tab-restrictions.test.js
  - artifacts/__tests__/etp-4717-send-email-visibility.test.js
  - artifacts/__tests__/etp-4906-user-roles-tab-exclusion.test.js
  - artifacts/__tests__/etp-5133-no-truncate-artifact-wiring.test.js
  - artifacts/__tests__/negative-qty-price-and-label.test.js
  - artifacts/amortization/__tests__/contract.test.js
  - artifacts/amortization/generated/__tests__/HeaderTable.test.js
  - artifacts/chart-of-accounts/custom/__tests__/AccountCodeField.test.js
  - artifacts/chart-of-accounts/custom/__tests__/AccountTreeView.test.js
  - artifacts/chart-of-accounts/custom/__tests__/NewAccountModal.test.js
  - artifacts/financial-account/custom/__tests__/AccountsHeaderTable.test.js
  - artifacts/financial-account/custom/__tests__/accountsListDeclarations.test.js
  - artifacts/financial-account/generated/__tests__/TransactionTable.test.js
  - artifacts/goods-receipt/__tests__/contract-integrity.test.js
  - artifacts/goods-receipt/custom/__tests__/BulkInvoiceFromReceipt.test.js
  - artifacts/goods-receipt/custom/__tests__/ConfirmGoodsReceiptModal.test.js
  - artifacts/goods-receipt/custom/__tests__/GoodsReceiptSecondaryActions.test.js
  - artifacts/goods-receipt/custom/__tests__/ImportFromPurchaseInvoiceModal.test.js
  - artifacts/goods-receipt/custom/__tests__/ImportFromPurchaseOrderModal.fetchLines.test.js
  - artifacts/goods-receipt/custom/__tests__/ImportFromPurchaseOrderModal.test.js
  - artifacts/goods-receipt/generated/__tests__/GoodsReceiptTable.test.js
  - artifacts/goods-shipment/custom/__tests__/BulkInvoiceFromShipment.test.js
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentBillingBadge.test.js
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentConfirmModal.test.js
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentSecondaryActions.test.js
  - artifacts/goods-shipment/custom/__tests__/ImportFromSalesInvoiceModal.test.js
  - artifacts/goods-shipment/custom/__tests__/ImportFromSalesOrderModal.fetchLines.test.js
  - artifacts/goods-shipment/custom/__tests__/ImportFromSalesOrderModal.test.js
  - artifacts/goods-shipment/generated/__tests__/GoodsShipmentTable.test.js
  - artifacts/internal-consumption/custom/__tests__/InternalConsumptionActions.test.js
  - artifacts/match-rule/generated/web/match-rule/__tests__/EtgoMatchRuleHeaderPage.test.js
  - artifacts/match-rule/generated/web/match-rule/__tests__/index.test.js
  - artifacts/matched-purchase-invoices/custom/__tests__/MatchedInvoiceBulkActions.test.js
  - artifacts/monitor-verifactu/__tests__/contract-integrity.test.js
  - artifacts/payment-in/custom/__tests__/ApplyToInvoices.test.js
  - artifacts/payment-in/custom/__tests__/NewPaymentModal.test.js
  - artifacts/payment-in/custom/__tests__/PaymentSummaryCard.test.js
  - artifacts/payment-in/custom/__tests__/ReactivarConfirmModal.test.js
  - artifacts/payment-out/custom/__tests__/ReactivarConfirmModal.test.js
  - artifacts/physical-inventory/custom/__tests__/GenerateLinesModal.test.js
  - artifacts/physical-inventory/custom/__tests__/InventoryCreateListModal.test.js
  - artifacts/physical-inventory/custom/__tests__/InventoryMenuContent.test.js
  - artifacts/physical-inventory/custom/__tests__/InventoryTopbarActions.test.js
  - artifacts/physical-inventory/custom/__tests__/PhysicalInventoryBottomPanel.test.js
  - artifacts/physical-inventory/generated/__tests__/InventoryTable.test.js
  - artifacts/purchase-invoice/__tests__/contract-integrity.test.js
  - artifacts/purchase-invoice/custom/__tests__/ImportFromGoodsReturnModal.test.js
  - artifacts/purchase-invoice/custom/__tests__/InvoiceHeaderTable.test.js
  - artifacts/purchase-invoice/custom/__tests__/PurchaseInvoiceSecondaryActions.test.js
  - artifacts/purchase-invoice/generated/__tests__/HeaderTable.test.js
  - artifacts/purchase-order/custom/__tests__/BulkPurchaseOrderMoreMenu.test.js
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderDraftChips.test.js
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderNoReactivate.test.js
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderReactivateBulkAction.test.js
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderSecondaryActions.test.js
  - artifacts/purchase-order/custom/__tests__/RelatedDocuments.test.js
  - artifacts/purchase-order/generated/web/purchase-order/__tests__/purchase-order-create.test.js
  - artifacts/sales-invoice/custom/__tests__/InvoiceHeaderTable.test.js
  - artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js
  - artifacts/sales-invoice/custom/__tests__/PaymentPlanBlock.test.js
---

## Resumen
Se eliminaron ~293 archivos de tests que no ejecutaban código real del producto: algunos solo validaban que cierta línea existía mediante regex, otros se encontraban en rutas nunca alcanzadas por los entry points de CI. Sin cambios en cobertura real.

## Decisiones
- **Eliminar tests basados en lectura de fuente** — validan sintaxis, no comportamiento; no instruyen código real
- **Eliminar tests en rutas inaccesibles** — scripts/__tests__ y algunos .vitest.jsx bajo artifacts/ no aparecen en workflows ni Jenkinsfiles
- **Validar impacto con medición real** — corrida completa de make test-ci-coverage confirma que cobertura de producto no cambió

## Descartado
- Arreglar y mantener los tests — eran validaciones falsas que creaban confianza sin valor real

## Deuda dejada
- 10 tests fallidos en InvoiceHeaderTable no se detectaron porque el archivo nunca se ejecutaba; se elimina el problema pero posibles issues subyacentes quedan sin diagnosticar
