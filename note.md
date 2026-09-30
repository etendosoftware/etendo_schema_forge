---
task: ETP-5450
note: ETP-5450/fbf66110
kind: backfill
date: 2026-09-25T17:19:38.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - fef276773d
  - 6361ac0913
  - 71b8c7f658
files:
  - docs/generated-custom-windows/financial-account.md
  - tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ReconciliationSplitPanel.multiCurrency.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/AmortizationBulkActions.vitest.jsx
---

## Resumen
La tarea ETP-5450 implementó la visualización simultánea de ambas monedas en operaciones reconciliadas del panel de reconciliación: la moneda de cuenta y el importe del documento original. Se agregó cobertura extensa de tests para validar comportamiento en escenarios complejos.

## Decisiones
- Mostrar ambas monedas en linked rows y partial-line blocks — proporciona contexto completo para validación de cuentas en operaciones multidivisa
- Ampliar tests con casos edge (1:N groups, no-EUR accounts, dos monedas extranjeras, per-row unlink payloads) — validar comportamiento en operaciones complejas de reconciliación

## Deuda dejada
- El tercer commit reveló un problema de timers no limpiados en BulkDocumentAction que sobrevivían teardown de jsdom. Solución aplicada localmente (fake timers por test), pero sugiere deuda similar en otras suites de tests que podrían tener fallback reload timers activos
