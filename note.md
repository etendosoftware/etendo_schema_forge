---
task: ETP-5195
note: ETP-5195/38d8ffd9
kind: backfill
date: 2026-09-11T11:50:50.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 4f122ee404
  - 25866de004
  - 8770cc4703
  - 772b9b10c3
  - 3764238884
  - c749557984
  - b26d27f8af
  - 9df6073481
  - 27d3abca59
  - cdf64cd878
  - 0a1424a4b5
  - 79e22692db
  - 7f2e509f0a
  - e6b23b8e63
  - 900e862884
  - a0e723f548
  - c9648008f1
files:
  - tools/app-shell/src/hooks/__tests__/useAccountMutations.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useCreateStatement.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useDistinctValues.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useReconciliation.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useStatementActions.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useStatementImport.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useStatementPreview.vitest.jsx
  - docs/generated-custom-windows/user.md
  - tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/user/index.jsx
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/auth/__tests__/useApiFetch.vitest.jsx
  - tools/app-shell/src/auth/useApiFetch.js
  - tools/app-shell/src/hooks/__tests__/useEnvironmentSwitch.vitest.jsx
  - tools/app-shell/src/hooks/useEnvironmentSwitch.js
  - tools/app-shell/src/hooks/__tests__/useRoleMenu.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useViewerRole.vitest.jsx
  - tools/app-shell/src/hooks/useRoleMenu.js
  - tools/app-shell/src/hooks/useViewerRole.js
  - tools/app-shell/src/__tests__/runtime-routes-integration.vitest.jsx
  - tools/app-shell/src/pages/__tests__/OnboardingPage.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/SelectorInput.cache.vitest.jsx
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/hooks/__tests__/useDashboardData.vitest.jsx
  - tools/app-shell/src/hooks/useDashboardData.js
  - tools/app-shell/src/hooks/__tests__/findFetchCall.js
  - e2e/tests/flows/user-invitation.email.integration.spec.js
---

## Resumen
Se refactorizó la renovación silenciosa de tokens en AuthProvider para evitar revalidaciones innecesarias en hooks dependientes. Los cambios implementan gates de readiness de sesión y heredan scope ambiental cuando no hay sesión local.

## Decisiones
- Agregar gates de readiness en hooks que dependan de sesión (useRoleMenu, useViewerRole) para esperar a que AuthProvider complete su inicialización
- Evitar refetch del dashboard y identity churn en useApiFetch durante rotación de token mediante flags de estabilidad
- Propagar session scope a través de requests en useEnvironmentSwitch para mantener consistencia entre sesiones

## Deuda dejada
- Los tests de múltiples hooks fueron arreglados independientemente (useAccountMutations, useCreateStatement, useDistinctValues, etc.); no hay abstracción compartida de mocking de AuthProvider
- La lógica de herencia de ambient scope en useApiFetch usa ternarios complejos que requieren atención futura
- Otros hooks podrían necesitar gates de readiness similares

## Pendiente
- Auditar si hay hooks adicionales que deban gatarse en readiness de sesión
- Consolidar el patrón de mocking de AuthProvider en tests centralizados
