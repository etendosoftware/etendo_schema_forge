---
task: ETP-5445
note: ETP-5445/1a38940c
kind: backfill
date: 2026-09-24T13:07:52.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - e9fa1b3f50
  - 775a682a87
  - b030c4f7d0
files:
  - artifacts/internal-consumption/__tests__/contract-integrity.test.js
  - artifacts/internal-consumption/contract.json
  - artifacts/internal-consumption/contract.mcp.json
  - artifacts/internal-consumption/decisions.json
  - artifacts/internal-consumption/generated/web/internal-consumption/InternalConsumptionPage.jsx
  - artifacts/internal-consumption/generated/web/internal-consumption/InternalConsumptionTable.jsx
  - artifacts/internal-consumption/generated/web/internal-consumption/mockData.js
  - cli/src/data-fixes/sql/20260923T120000Z__R40-internal-consumption-table-active.sql
  - cli/test/data-fixes-r40-internal-consumption-table-active.test.js
  - cli/test/data-fixes-report-regression.test.js
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - docs/etendo-ad/tenant-remediation-knowledge.md
  - docs/generated-custom-windows/INDEX.md
  - docs/generated-custom-windows/internal-consumption.md
  - docs/generated-custom-windows/not-posted-documents.md
  - docs/plans/ETP-5445-cross-domain.md
  - tools/app-shell/src/components/account/SubscriptionSection.jsx
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/pages/FirstStepsPage.jsx
  - tools/app-shell/src/windows/custom/internal-consumption/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/internal-consumption/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/internal-consumption/index.jsx
  - tools/app-shell/src/windows/registry.js
  - artifacts/internal-consumption/custom/InternalConsumptionActions.jsx
  - artifacts/internal-consumption/custom/__tests__/InternalConsumptionActions.test.js
  - docs/ui-customization.md
  - tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useNeoAction.vitest.js
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/hooks/useNeoAction.js
  - tools/app-shell/src/windows/custom/internal-consumption/__tests__/voidInternalConsumption.test.js
  - tools/app-shell/src/windows/custom/internal-consumption/__tests__/voidInternalConsumption.vitest.js
  - tools/app-shell/src/windows/custom/internal-consumption/voidInternalConsumption.js
---

## Resumen
Se implementó el flujo de "internal consumption posting" con confirmación y validación de cantidad cero. Incluye puerta de confirmación para evitar posting accidental, acciones bulk confirmadas, y extracción de lógica void en helper reutilizable.

## Decisiones
- Crear ventana custom independiente para internal-consumption en lugar de integrar en UI existente — mejor aislamiento y mantenibilidad
- Extraer lógica `voidInternalConsumption` en helper separado — permite reutilización en tests y acciones
- Agregar puerta de confirmación en row y bulk actions — previene errores operacionales
- Registrar ventana en `registry.js` — patrón consistente del proyecto

## Deuda dejada
- Documentación de "onboarding-gaps.md" menciona remediación pero no detalla completitud del flujo
- Contract integrity tests y data-fixes incluidos pero no está claro si cobertura es exhaustiva

## Pendiente
Ninguno evidente en los commits completados; todos los checks pasaron (testid, tests, regen, xml, pw-mocked, pw-integration).
