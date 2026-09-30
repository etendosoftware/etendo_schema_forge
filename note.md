---
task: ETP-5521
note: ETP-5521/12e7d97e
kind: backfill
date: 2026-09-29T14:01:36.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 6898076fd1
  - 561db37454
  - 1f9478ae8d
files:
  - tools/app-shell/src/hooks/__tests__/useAccountMutations.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/AccountSummaryStrip.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/NewAccountWizard.vitest.jsx
  - docs/generated-custom-windows/financial-account.md
  - docs/generated-custom-windows/financial-accounts-page.md
  - docs/plans/ETP-5521-cross-domain.md
  - tools/app-shell/src/hooks/useAccountMutations.js
  - tools/app-shell/src/windows/custom/financial-account/AccountSummaryStrip.jsx
  - tools/app-shell/src/windows/custom/financial-account/NewAccountWizard.jsx
---

## Resumen
Se implementó la persistencia de logos de proveedores en cuentas financieras creadas en modo offline, junto con cobertura de tests de regresión y refactoring para reducir complejidad cognitiva.

## Decisiones
- Centralizar la lógica de mutación en `useAccountMutations` como hook principal
- Priorizar tests de regresión exhaustivos antes del refactoring (272 líneas de casos de test)
- Refactorizar `AccountSummaryStrip` y el hook de mutaciones para cumplir umbrales de complejidad de Sonar

## Deuda dejada
- `AccountSummaryStrip` sufrió reorganización significativa (134 líneas modificadas) que sugiere complejidad acumulada anterior
- Documentación generada (financial-account.md) requiere mantenimiento continuo a medida que evoluciona la feature
- Potenciales edge cases de sincronización offline no explícitamente documentados en el plan técnico
