---
task: ETP-5292
note: ETP-5292/a99be258
kind: backfill
date: 2026-09-18T16:46:30.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - dcfb205b23
  - 3c297457f9
files:
  - docs/plans/2026-09-17-etp5292-total-discount-rounding-fix-plan.md
  - e2e/tests/flows/purchase-order-total-discount-tax-rounding.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DocumentTotalsPanel.vitest.jsx
---

## Resumen
Corrigió errores de redondeo de 1 centavo en subtotales de documentos con descuento total aplicado, y simplificó la complejidad lógica en el panel de totales.

## Decisiones
- `resolvePersistedTotals()` retorna directamente el neto final en lugar de permitir que el render lo recalcule. Por qué: el doble cálculo (re-derivación del neto pre-descuento + resta del descuento nuevamente) producía drift cuando el neto persistido no era múltiplo limpio del factor.
- Se agregó discriminación explícita entre neto persistido y recompute cliente. Por qué: elimina la lógica implícita que ocultaba el error.
- Se extrajeron las ternarias anidadas en `DocumentTotalsPanel.jsx`. Por qué: resolver violación de regla Sonar S3358.

## Deuda dejada
- El test E2E es mocked, no valida contra BD real.
- El plan de la tarea documenta comportamiento en preview y confirm-modal, pero no clarifica si hay otros contextos donde `resolvePersistedTotals()` se invoca con riesgo similar.

## Pendiente
- Validación en producción con documentos reales que tengan múltiples buckets de impuestos y descuentos totales.
