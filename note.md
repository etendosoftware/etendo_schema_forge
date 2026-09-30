---
task: ETP-5295
note: ETP-5295/f462870d
kind: backfill
date: 2026-09-17T11:03:29.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 26aacff583
  - c7f6714981
  - 0fe101b614
  - bb9c6d0d95
  - 997ea7d576
  - 824fd3a06c
  - 9631a91104
  - 1e736c4da3
  - 1c09469bf7
  - 0ddfa5d697
files:
  - artifacts/purchase-order/custom/PurchaseOrderActions.jsx
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderActions.test.js
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/GeneratedPurchaseOrderActions.manageDocsLauncher.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-order/__tests__/GeneratedOrderCreateInvoice.manageDocsLauncher.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-order/index.jsx
  - tools/app-shell/src/windows/custom/sales-order/index.jsx
  - tools/app-shell/src/windows/custom/shared/useOrderWindow.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useOrderWindow.vitest.jsx
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-order.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/shared/orderPendingDocs.js
  - tools/app-shell/src/windows/custom/shared/__tests__/orderPendingDocs.test.js
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
---

## Resumen
Se corrigió un crash de Rules-of-Hooks en ManageDocsLauncher y se refactorizó la lógica para derivar la acción "manage" desde flags del backend en lugar de lógica del frontend. Se solucionó además la forma incorrecta de documentos en popups de grid.

## Decisiones
- Crear un helper `orderPendingDocs` para centralizar la lógica de derivación de acciones — simplifica mantenimiento y testing
- Mover la decisión de "manage" al backend mediante flags — mejor separación de responsabilidades y control desde datos

## Deuda dejada
- Los cambios en PurchaseOrderActions y OrderCreateInvoice son similares pero paralelos — potencial para abstracción común si el patrón se replica más
