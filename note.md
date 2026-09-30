---
task: ETP-5315
note: ETP-5315/70537712
kind: backfill
date: 2026-09-15T11:51:26.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 371df78aa0
  - 0b3a37816a
  - f099f8d6a6
  - e6a657bfdb
  - a8ed6b34ea
  - 5c065ba9d0
  - d0ef54f0de
files:
  - artifacts/purchase-order/contract.json
  - artifacts/purchase-order/contract.mcp.json
  - artifacts/purchase-order/custom/PurchaseOrderReactivateBulkAction.jsx
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderNoReactivate.test.js
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderReactivateBulkAction.test.js
  - artifacts/purchase-order/decisions.json
  - artifacts/purchase-order/generated/web/purchase-order/HeaderPage.jsx
  - docs/generated-custom-windows/purchase-order.md
  - e2e/tests/flows/purchase-order-no-reactivate.mocked.spec.js
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-order/index.jsx
  - artifacts/purchase-order/custom/PurchaseOrderActions.jsx
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - docs/generated-custom-windows/sales-order.md
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/GeneratedPurchaseOrderActions.manageButtonRefresh.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-order/__tests__/OrderCreateInvoice.manageButtonRefresh.vitest.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/PurchaseOrderBulkActions.labelCollision.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/PurchaseOrderReactivateBulkAction.mixedSelection.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useOrderWindow.vitest.jsx
  - artifacts/purchase-order/contract.prev.json
---

## Resumen
Se implementó la funcionalidad de Reactivate (Reactivar) en órdenes de compra, disponible en menú de fila, grid y acciones en lote. Luego de QA, se corrigió una colisión de labels que hacía que dos botones bulk distintos tuvieran la misma etiqueta.

## Decisiones
- Crear componente dedicado `PurchaseOrderReactivateBulkAction` para la acción bulk — aislamiento de lógica
- Asignar label propia `reactivateBulk` al botón bulk de Reactivate — evitar colisión con `confirmBulk` de otra acción
- Refrescar botón manage después de crear documentos relacionados — mantener UI sincronizada

## Descartado
- Reutilizar label `confirmBulk` — causaba que dos botones distintos (Book y Reactivate) tuvieran idéntica etiqueta en selecciones mixtas

## Deuda dejada
- Tests E2E requirieron correcciones post-merge con develop — las specs pueden desincronizarse en desarrollos concurrentes
- Los tests de negativos para kebab menu Reactivate fueron mínimos (39 líneas agregadas)

## Pendiente
- Validar comportamiento de Reactivate con selecciones que mezclen estados de documento en producción
