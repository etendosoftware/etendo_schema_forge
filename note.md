---
task: ETP-5487
note: ETP-5487/7a7af662
kind: backfill
date: 2026-09-28T17:16:15.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - f8c8dcdbea
files:
  - docs/feedback.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/widget-endpoints.md
  - e2e/tests/flows/dashboard/pending-shipments-card.mocked.spec.js
  - tools/app-shell/src/hooks/__tests__/useDashboardData.inferPendingTaskKey.vitest.jsx
  - tools/app-shell/src/hooks/useDashboardData.js
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/PurchaseOrderNoLegacyFilter.test.js
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-order/index.jsx
  - tools/app-shell/src/windows/custom/sales-order/__tests__/SalesOrderNoLegacyFilter.test.js
  - tools/app-shell/src/windows/custom/sales-order/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-order/index.jsx
---

## Resumen
Se corrigió la lógica de determinación de tareas pendientes en el dashboard para usar el estado del pedido como fuente única. Se actualizó el hook `useDashboardData` y se refactorizaron los componentes de custom windows.

## Decisiones
- Se agregó `inferPendingTaskKey` como función dedicada y testeable para resolver el estado de tareas pendientes
- Se actualizaron componentes purchase-order y sales-order con lógica consistente
- Se documentaron cambios en feedback.md y widget-endpoints.md

## Descartado
- Anteriormente las tarjetas pendientes usaban lógica diferente; se reemplazó completamente por orden de estado

## Deuda dejada
- El refactor de pending-shipments-card.mocked.spec.js duplicó líneas de test sin consolidar patrones comunes (79 líneas vs 80 originales con cambios sustanciales)
- No hay claridad en el diff sobre qué casos edge se consideraron para inferPendingTaskKey

## Pendiente
- Validar que los custom windows (purchase-order, sales-order) mantienen paridad de comportamiento en producción
- Revisar cobertura de casos no cubiertos en el nuevo test de inferPendingTaskKey
