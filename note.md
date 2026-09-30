---
task: ETP-5547
note: ETP-5547/5806180a
kind: backfill
date: 2026-09-30T18:56:50.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - f0699b7bcc
  - e3ad2f8edf
  - 8764c28b88
  - 55ada5d96b
  - 48ac9f8f7b
  - e433291454
files:
  - tools/app-shell/src/components/contract-ui/__tests__/CloneOrderModal.verifyClone.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.processConfirmRefresh.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/detailViewHelpers.refreshRecordAfterMutation.vitest.jsx
  - docs/generated-custom-windows/financial-account.md
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/payment-in.md
  - docs/generated-custom-windows/payment-out.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - docs/ui-customization.md
  - tools/app-shell/src/components/contract-ui/CloneOrderModal.jsx
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se implementó verificación de clones y refresco automático de detalles tras confirmación. Se refactorizó `CloneOrderModal` para cumplir límites de complejidad, se agregaron tests exhaustivos y se internacionalizaron las nuevas funcionalidades.

## Decisiones
- Refactorizar `CloneOrderModal` para reducir complejidad ciclomática (Sonar S3776) — mejora mantenibilidad
- Agregar `data-testid` previo a tests — facilita selectores confiables
- Tests para estados fallidos (red, 500, 403) y clones sin ID — cubre casos edge de POST/GET
- Actualizar docs de ventanas personalizadas — documenta nueva funcionalidad

## Deuda dejada
- Tests de estados "sin verificación" requieren cobertura adicional (GET fallido mantiene fila navegable pero marcada)
- Clones con POST 2xx pero sin ID válido o sin JSON body quedan inertes sin error genérico
- `onCloned` no se invoca con `null` en esos casos — comportamiento silencioso que podría confundir

## Pendiente
- Validar que refresh de detalles funciona en todos los tipos de documentos
- Revisar si hay casos de clones que queden en estado inconsistente tras cancelación de confirmación
