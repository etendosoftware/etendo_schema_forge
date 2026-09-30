---
task: ETP-5253
note: ETP-5253/dd5a3966
kind: backfill
date: 2026-09-10T17:49:04.000Z
authors:
  - Santiago Alaniz
agents:
sessions:
commits:
  - 62dd7b9e37
  - 51930d1772
  - 2e192239fa
files:
  - tools/app-shell/src/windows/custom/shared/InvoicePaymentHistoryModal.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoicePaymentHistoryModal.vitest.jsx
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
---

## Resumen
Se agregó un piso mínimo de altura (minHeight floor) al cuerpo del modal de historial de pagos de facturas para mantener una altura visual estable cuando hay pocos registros. Los cambios incluyen la implementación, pruebas de regresión y documentación.

## Decisiones
- Implementar pruebas de regresión (84 líneas) — garantizar que el comportamiento visual no se revierta en futuros cambios

## Descartado
No se identifica.
