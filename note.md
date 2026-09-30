---
task: ETP-5190
note: ETP-5190/085cbe73
kind: backfill
date: 2026-09-10T17:23:51.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 9a93dbb5b6
  - f7b3fa2ceb
  - 7b40d0a41a
  - 23422c149c
  - 7ef284d249
  - 02c31dc2b9
  - ebdd273ebb
files:
  - artifacts/document-sequence/contract.json
  - artifacts/document-sequence/contract.mcp.json
  - artifacts/document-sequence/decisions.json
  - artifacts/document-sequence/generated/web/document-sequence/SequenceForm.jsx
  - artifacts/document-sequence/generated/web/document-sequence/SequencePage.jsx
  - artifacts/document-sequence/generated/web/document-sequence/SequenceTable.jsx
  - artifacts/document-sequence/generated/web/document-sequence/index.jsx
  - artifacts/document-sequence/generated/web/document-sequence/mockCatalogs.js
  - artifacts/document-sequence/generated/web/document-sequence/mockData.js
  - artifacts/organization/contract.json
  - artifacts/organization/contract.mcp.json
  - artifacts/organization/decisions.json
  - artifacts/organization/generated/web/organization/OrganizationForm.jsx
  - cli/cache/ad-snapshot/dd3bd7b6d581c9d843680be0b4cb0fc7719b7a70919500043c450a7dd911db2f.json
  - cli/config/regen-windows.json
  - docs/functionalidad/02-capacidades-y-flujos.md
  - docs/generated-custom-windows/INDEX.md
  - docs/generated-custom-windows/document-sequence.md
  - docs/generated-custom-windows/organization.md
  - e2e/tests/flows/first-steps-onboarding.mocked.spec.js
  - e2e/tests/flows/onboarding-validations.mocked.spec.js
  - e2e/tests/helpers/auth.js
  - scripts/add-data-testid.cjs
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListViewExport.vitest.js
  - tools/app-shell/src/components/contract-ui/useWindowImportDialog.js
  - tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx
  - tools/app-shell/src/components/layout/SideMenu/__tests__/SideMenu.firstStepsBadge.vitest.jsx
  - tools/app-shell/src/index.css
  - tools/app-shell/src/layout/AppLayout.jsx
  - tools/app-shell/src/lib/__tests__/taxIdValidation.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/lib/taxIdValidation.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/menu.json
  - tools/app-shell/src/pages/DashboardPage.jsx
  - tools/app-shell/src/pages/FirstStepsPage.jsx
  - tools/app-shell/src/pages/OnboardingPage.jsx
  - tools/app-shell/src/pages/__tests__/DashboardPage.firstStepsGate.vitest.jsx
  - tools/app-shell/src/pages/__tests__/FirstStepsPage.vitest.jsx
  - tools/app-shell/src/pages/first-steps/CompanyDataSummary.jsx
  - tools/app-shell/src/pages/first-steps/FirstStepsContext.jsx
  - tools/app-shell/src/pages/first-steps/FirstStepsImportButton.jsx
  - tools/app-shell/src/pages/first-steps/__tests__/FirstStepsContext.vitest.jsx
  - tools/app-shell/src/pages/first-steps/__tests__/firstStepsConfig.vitest.js
  - tools/app-shell/src/pages/first-steps/__tests__/useFirstSteps.vitest.jsx
  - tools/app-shell/src/pages/first-steps/firstStepsConfig.js
  - tools/app-shell/src/pages/first-steps/firstStepsIcons.js
  - tools/app-shell/src/pages/first-steps/firstStepsImport.js
  - tools/app-shell/src/pages/first-steps/useFirstSteps.js
  - tools/app-shell/src/pages/onboarding/__tests__/onboardingSteps.vitest.jsx
  - tools/app-shell/src/pages/onboarding/onboardingSteps.jsx
  - tools/app-shell/src/windows/__tests__/registry.test.js
  - tools/app-shell/src/windows/custom/organization/BusinessTypeCards.jsx
  - tools/app-shell/src/windows/custom/organization/OrganizationPage.jsx
  - tools/app-shell/src/windows/custom/organization/__tests__/OrganizationPage.vitest.jsx
  - tools/app-shell/src/windows/registry.js
  - tools/app-shell/src/hooks/__tests__/useTenantPlan.vitest.jsx
---

## Resumen
Se implementó un checklist de "Primeros Pasos" para guiar el onboarding de nuevas organizaciones, con validación de NIF, secuencias de documentos y flujos diferenciados según tipo de tenant (trial vs productivo).

## Decisiones
- Validación de NIF integrada como parte del checklist de onboarding, con mensajes localizados en múltiples idiomas
- Hook `useTenantPlan` para determinar dinámicamente qué pasos mostrar según el plan del tenant, ocultando pasos solo-productivos en tenants de prueba
- Estructura de DocumentSequences para modelar flujos de documentación requeridos
- Contexto y configuración centralizados en `FirstStepsConfig` para mantener la lógica de estado en un lugar

## Deuda dejada
- Suite de snapshots ampliada significativamente; múltiples archivos JSON de datos de prueba sugieren complejidad potencial en la configuración de estados de ejemplo que podría revisarse más adelante
- Refactor de imports de íconos Phosphor fue reactivo a deprecation de la librería
- Helpers de E2E ahora requieren persistencia y settle del warehouse antes de guardar; esto añade complejidad a los tests que podría tener oportunidad de simplificación si se modifican los flujos backend

## Pendiente
- Validación de si los pasos ocultos en trial tenants funcionan correctamente al migrar a productivo
