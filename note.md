---
task: ETP-5209
note: ETP-5209/a1ab0b43
kind: backfill
date: 2026-09-10T18:12:24.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 393f5dad2d
  - 5870c7aad4
  - 37df458183
  - c3882d0758
  - 9f42120e22
  - 7dad94812b
  - 3aedd9c36b
files:
  - docs/feedback.md
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
  - tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/index.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/index.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/index.jsx
  - tools/app-shell/src/windows/custom/shared/useInvoiceWindow.js
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useInvoiceWindow.test.js
  - tools/app-shell/src/windows/custom/__tests__/bulkActionsHooksOfRules.test.js
  - tools/app-shell/src/hooks/useBulkActionToast.js
  - e2e/tests/flows/matched-purchase-invoices.mocked.spec.js
  - tools/app-shell/src/windows/custom/shared/__tests__/buildDocumentRowQuickActions.test.js
  - tools/app-shell/src/windows/custom/shared/buildDocumentRowQuickActions.js
---

## Resumen
Se agrega la acción "Post" (Contabilizar) a menús de fila y acciones en masa para cuatro ventanas (purchase-invoice, sales-invoice, goods-receipt, goods-shipment), que antes solo permitían esta operación desde form view. Se extracta un helper compartido para evitar duplicación de lógica.

## Decisiones
- Agregar acciones a través de `menuActions` en wrappers custom en lugar de confiar en decisions.json, que no es la fuente viva para estas superficies en ventanas con wrapper manual (limitación documentada).
- Crear exportaciones compartidas en `BulkDocumentAction` (`buildPostActions`, `createPostRowFilter`) para reutilización en las cuatro ventanas.
- Extraer `buildDocumentRowQuickActions` como helper compartido para evitar duplicación de lógica de filtrado entre goods-receipt y goods-shipment.
- Mantener `BulkInvoiceFromShipment` en goods-shipment sin cambios, apilando el nuevo botón de bulk Post junto a él.

## Descartado
- Extender `BulkInvoiceFromShipment` en goods-shipment: se optó por mantener el componente existente intacto.

## Deuda dejada
- Los wrappers custom de estas cuatro ventanas seguirán siendo fuente de verdad para sus acciones de fila y bulk (no authoritative desde decisions.json).
- Se requieren ajustes en orden de hooks y validaciones de estado para evitar crashes en selección de filas.

## Pendiente
- Evaluar migración de estas cuatro ventanas para que lean acciones desde decisions.json.
