---
task: ETP-5364
note: ETP-5364/dacd1869
kind: backfill
date: 2026-09-28T19:41:08.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 4eec1d9952
  - b75268602c
  - 29b0cc43e5
  - 7673941578
  - 84ea7472f8
  - 1cfa75a901
  - 3ba532ccb9
files:
  - artifacts/document-sequence/contract.json
  - artifacts/document-sequence/contract.mcp.json
  - artifacts/document-sequence/decisions.json
  - artifacts/document-sequence/generated/web/document-sequence/SequenceForm.jsx
  - artifacts/document-sequence/generated/web/document-sequence/SequenceTable.jsx
  - cli/test/document-sequence.contract.test.js
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - docs/generated-custom-windows/document-sequence.md
  - e2e/tests/flows/first-steps-onboarding.mocked.spec.js
  - tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx
  - tools/app-shell/src/components/layout/SideMenu/__tests__/SideMenu.firstStepsBadge.vitest.jsx
  - tools/app-shell/src/components/layout/SideMenu/__tests__/SideMenu.vitest.jsx
  - tools/app-shell/src/layout/AppLayout.jsx
  - tools/app-shell/src/layout/__tests__/AppLayout.vitest.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/menu.json
  - tools/app-shell/src/pages/DashboardPage.jsx
  - tools/app-shell/src/pages/FirstStepsPage.jsx
  - tools/app-shell/src/pages/__tests__/DashboardPage.firstStepsGate.vitest.jsx
  - tools/app-shell/src/pages/__tests__/FirstStepsPage.vitest.jsx
  - tools/app-shell/src/pages/first-steps/FirstStepsContext.jsx
  - tools/app-shell/src/pages/first-steps/__tests__/FirstStepsContext.vitest.jsx
  - tools/app-shell/src/pages/first-steps/__tests__/useFirstSteps.vitest.jsx
  - tools/app-shell/src/pages/first-steps/useFirstSteps.js
  - tools/app-shell/src/windows/__tests__/navigationExpectations.js
  - tools/app-shell/src/windows/__tests__/registry.vitest.jsx
  - tools/app-shell/src/windows/registry.js
  - cli/src/data-fixes/sql/20260922T120000Z__R39-ap-invoice-fc-series.sql
  - cli/src/data-fixes/sql/20260922T130000Z__R39-document-sequence-clear-descriptions.sql
  - cli/test/data-fixes-r39-ap-invoice-fc-series.test.js
  - cli/test/data-fixes-r39-document-sequence-clear-descriptions.test.js
  - tools/app-shell/src/components/layout/TopBar/TopBar.jsx
  - tools/app-shell/src/components/layout/TopBar/__tests__/TopBar.vitest.jsx
  - tools/app-shell/src/pages/first-steps/__tests__/firstStepsConfig.vitest.js
  - tools/app-shell/src/pages/first-steps/firstStepsConfig.js
  - tools/app-shell/src/pages/first-steps/__tests__/useDemoDataTransfer.vitest.jsx
  - tools/app-shell/src/pages/first-steps/firstStepsIcons.js
  - tools/app-shell/src/pages/first-steps/useDemoDataTransfer.js
  - tools/app-shell/test/demo-data-transfer-product-import-fields.test.js
  - e2e/tests/flows/row-quick-actions.mocked.spec.js
  - docs/feature-flags.md
  - e2e/tests/flows/first-steps-demo-data-transfer.mocked.spec.js
  - e2e/tests/flows/tenant-upgrade-cookie.mocked.spec.js
  - flags-registry.json
  - tools/app-shell/src/lib/__tests__/upgrade-api.test.js
  - tools/app-shell/src/lib/upgrade/api.js
  - tools/app-shell/src/pages/UpgradePage.jsx
  - tools/app-shell/src/pages/__tests__/UpgradePage.vitest.jsx
  - tools/app-shell/src/pages/onboarding/onboardingSteps.jsx
  - e2e/tests/flows/onboarding/first-steps-onboarding.mocked.spec.js
---

## Resumen
Se implementó el flujo completo de onboarding inicial (First Steps) con capacidad de descarte, integrando serie FC de compras/facturas, validación NIF y transferencia de datos demo. Los pasos son no reabribles una vez completados.

## Decisiones
- Hacer los pasos iniciales descartables en lugar de obligatorios
- Deduplicar contadores de progreso en el catálogo de navegación
- Integrar validación NIF en el flujo de upgrade
- Añadir UI de transferencia de datos demo dentro del flujo de onboarding
- Finalizar hacia el dashboard sin permitir reapertura del flow

## Descartado
- Opción de reabrirlos tras completar (eliminada en último commit)
- Registros de catálogo con estado "dismissed" en navegación (simplificado en commit 2)

## Deuda dejada
- FirstStepsContext y useFirstSteps acumulan lógica compleja con 71+ líneas en el hook; podrían necesitar refactorización si el flujo crece
- Data-fixes SQL para serie FC bastante amplios (246 y 95 líneas) sin evidencia de validación en producción
- Múltiples flag features en flags-registry.json simplificados, requiere auditoría de flags activos

## Pendiente
- Validación de comportamiento de contramaestría de datos en ambientes no-demo
- Cobertura de casos edge en transferencia de datos con series FC duplicadas
