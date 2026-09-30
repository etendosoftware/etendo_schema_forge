---
task: ETP-5178
note: ETP-5178/95f859a8
kind: backfill
date: 2026-09-10T19:09:53.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - 98390845d2
  - 91d530e648
files:
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/plans/completed/2026-09-10/etp-5178-import-lines-quantity-plan.md
  - tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ImportLinesModal.vitest.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se corrigió el modal de importación (compartido en sales-invoice, purchase-invoice, goods-shipment y goods-receipt) para permitir edición libre de cantidades sin validación en cada keystroke. La validación ahora ocurre solo al salir del campo (blur). Simultáneamente, se refactorizó un ternario anidado para resolver linting de SonarQube.

## Decisiones
- Mover validación de cantidad a evento blur — permite digitar libremente valores grandes sin que se bloquee el input, eliminando fricción de UX sin perder validación
- Extraer ternario anidado (S3358) en cálculo de border/background — mantiene legibilidad mientras cumple estándares de código

## Deuda dejada
- Cambios en 4 guías de documentación generadas automáticamente (posible actualización manual de 2 de ellas en sales-invoice y purchase-invoice); el patrón de actualización de docs generadas requiere revisión para evitar divergencias futuras
