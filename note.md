---
task: ETP-5414
note: ETP-5414/9c81572f
kind: backfill
date: 2026-09-25T17:03:40.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - e251d8ff44
  - ebdc7d1a2d
  - 3ad416ad0b
  - 6cedf75f31
  - 6290a87664
  - d05bf64881
  - c9adf09201
  - f85a4baa5f
  - 4006df0d39
  - 23245c3f71
  - 06b54a4233
  - 1514596651
files:
  - artifacts/amortization/contract.json
  - artifacts/amortization/contract.mcp.json
  - artifacts/amortization/custom/AmortizationBulkActions.jsx
  - artifacts/amortization/decisions.json
  - artifacts/amortization/generated/web/amortization/HeaderPage.jsx
  - docs/generated-custom-windows/amortization.md
  - tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx
  - tools/app-shell/src/components/contract-ui/RowQuickActions.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/AmortizationBulkActions.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/RowQuickActions.vitest.jsx
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/amortization/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/amortization/index.jsx
  - tools/app-shell/src/windows/custom/assets/AssetsSidebar.jsx
  - tools/app-shell/src/windows/custom/assets/__tests__/AssetsSidebar.vitest.jsx
  - tools/app-shell/src/windows/registry.js
  - package-lock.json
  - tools/app-shell/src/test/bulkDocumentActionMock.js
  - docs/generated-custom-windows/assets.md
  - tools/app-shell/src/components/account/SubscriptionSection.jsx
  - tools/app-shell/src/pages/FirstStepsPage.jsx
  - e2e/tests/flows/assets.integration.spec.js
  - tools/app-shell/src/windows/custom/assets/AssetsAmortizationPanel.jsx
  - tools/app-shell/src/windows/custom/assets/__tests__/AssetsAmortizationPanel.vitest.jsx
  - tools/app-shell/src/components/contract-ui/EntityForm.jsx
---

## Resumen
Se implementaron acciones bulk (confirmar/reactivar/post) en la sección de amortización con menú contextual por fila. Se corrigió la fórmula del saldo pendiente de amortización para usar depreciación acumulada.

## Decisiones
- Reutilizar componentes BulkDocumentAction/RowQuickActions existentes mediante extensiones en lugar de crear nuevos
- Corregir "Pendiente de Amortizar" con fórmula acumulativa (depreciationAmt − depreciatedValue − previouslyDepreciatedAmt) en lugar de residualAssetValue directo
- Extraer render function inline a nivel módulo (recomendación Sonar S6478)
- Revertir tentativa de fix con useLayoutEffect por falta de reproducción consistente del bug original

## Descartado
- useLayoutEffect para sincronización de DeferredInput — seis corridas de control (con backend real) no reprodujeron el problema, descartado sin evidencia firme

## Deuta dejada
- Fix de DeferredInput revertido; comportamiento original se mantiene bajo revisión potencial si el bug reaparece
- Patrón de formato decimal con coma aplicado en e2e; requiere validación con diferentes locales

## Pendiente
- Validar comportamiento de cálculo de amortización en casos extremos (depreciación parcial, múltiples ciclos)
