---
task: ETP-5205
note: ETP-5205/6ec68e61
kind: backfill
date: 2026-09-29T13:22:24.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 1058c1779e
  - f003d224ee
  - b722786949
  - 9ec0b31c43
  - ff7293f8a3
  - 5a6085ffda
  - 048d9feeda
  - 039dc8c364
  - 930315f39d
  - 86aa2ee0ae
  - 2579dd7f53
  - 7ccda6c4e4
  - c7d7cd03cc
  - 50dc2d4a56
  - 907ba7c748
  - 45d60756a6
  - d5c77bc4d7
  - 3201acbcec
  - d8b890e8a8
  - 7494dfb169
  - 3d2650d7dd
  - fbcb1931e3
  - b9d7a43d39
  - 1202138115
  - fceedfa3ce
  - 192b005d84
  - 74dcd6b803
  - d533cb46ca
  - e73e74233c
  - d32f08209b
files:
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.bulkDelete.vitest.jsx
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/LinesBottomSection.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/LinesBottomSection.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.saveWindowReadOnly.vitest.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.extractedHelpers.vitest.js
  - tools/app-shell/src/windows/custom/shared/DocumentSecondaryActions.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/DocumentSecondaryActions.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.customTabSaveHeader.vitest.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/ConfirmWithCreditButton.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ConfirmWithCreditButton.jsx
  - tools/app-shell/src/windows/custom/shared/ConfirmWithCreditButtonBase.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/ConfirmWithCreditButtonBase.vitest.jsx
  - tools/app-shell/src/components/attachments/AttachmentsTab.jsx
  - tools/app-shell/src/components/attachments/__tests__/AttachmentsTab.vitest.jsx
  - artifacts/purchase-order/custom/BulkPurchaseOrderMoreMenu.jsx
  - artifacts/purchase-order/custom/__tests__/BulkPurchaseOrderMoreMenu.test.js
  - artifacts/sales-order/custom/BulkOrderMoreMenu.jsx
  - artifacts/sales-order/custom/__tests__/BulkOrderMoreMenu.test.js
  - tools/app-shell/src/windows/custom/product-category/ProductCategoryCustomForm.jsx
  - tools/app-shell/src/windows/custom/product-category/__tests__/ProductCategoryCustomForm.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-quotation/__tests__/index.confirmAction.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-quotation/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/sales-quotation/index.jsx
  - tools/app-shell/src/windows/custom/purchase-order/index.jsx
  - tools/app-shell/src/windows/custom/sales-order/index.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useOrderWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/useOrderWindow.jsx
  - artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx
  - artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js
  - tools/app-shell/src/windows/custom/sales-invoice/SalesInvoiceTopbar.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/SalesInvoiceTopbar.test.js
  - tools/app-shell/src/windows/custom/shared/SendToSifButton.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/SendToSifButton.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementsTab.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementsToolbar/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementsToolbar/index.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/MovementsTab.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/index.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementRowKebab.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementsTable.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/MovementRowKebab.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/index.interactions.vitest.jsx
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/financial-account.md
  - docs/generated-custom-windows/product-category.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - artifacts/purchase-invoice/custom/PurchaseInvoiceSecondaryActions.jsx
  - artifacts/purchase-invoice/custom/__tests__/PurchaseInvoiceSecondaryActions.test.js
---

## Resumen
Se implementó el modo "Solo Lectura" en la interfaz, ocultando y deshabilitando acciones editoriales en múltiples ventanas según el tier de acceso. Los cambios cubrieron más de 30 commits que progresivamente gateaban botones, campos y operaciones en toda la aplicación.

## Decisiones
- Distinguir entre `isDocumentReadOnly` (estado de documento + tier Solo Lectura) e `windowReadOnly` (flag estático + tier) — cada uno controla diferentes acciones porque ciertas operaciones (notas, clone, send) deben sobrevivir al completado o flag estático, solo bloqueadas por tier
- Print y Download permanecen disponibles en Solo Lectura; solo Send, edición de notas, bulk actions y attachment writes se bloquean
- Refactorizar `renderNotesField` a object pattern para reducir complejidad de parámetros (Sonar finding)

## Descartado
- Usar un único flag booleano para read-only — la confusión entre estados documento/tier requirió separación explícita

## Deuda dejada
- Iteración larga con correcciones en vuelta: commit #74dcd6b80 revisó la lógica de gating porque inicialmente se bloqueaban acciones que no debían bloquearse
- Documentación requirió ajustes posteriores (drop de referencias a archivos gitignored)
- Tests agregados pero el flujo sugiere gaps iniciales en cobertura

## Pendiente
- Validación en QA de los gates según tier en todos los windows listados (financial-account, product-category, purchase-invoice, etc.)
