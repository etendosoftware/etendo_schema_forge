---
task: ETP-4947
note: ETP-4947/50132d23
kind: backfill
date: 2026-09-21T14:10:00.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 0615ab2655
  - e4d9d5368c
files:
  - artifacts/general-ledger-configuration/contract.json
  - artifacts/general-ledger-configuration/contract.mcp.json
  - artifacts/general-ledger-configuration/decisions.json
  - artifacts/general-ledger-configuration/figma-spec.md
  - artifacts/general-ledger-configuration/generated/web/general-ledger-configuration/GeneralForm.jsx
  - artifacts/general-ledger-configuration/generated/web/general-ledger-configuration/GeneralPage.jsx
  - artifacts/general-ledger-configuration/generated/web/general-ledger-configuration/mockData.js
  - docs/generated-custom-windows/general-ledger-configuration.md
  - e2e/tests/flows/general-ledger-configuration.mocked.spec.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/general-ledger-configuration/GeneralTab.jsx
  - tools/app-shell/src/windows/custom/general-ledger-configuration/__tests__/GeneralTab.vitest.jsx
  - tools/app-shell/src/windows/custom/general-ledger-configuration/__tests__/useGeneralLedgerConfig.vitest.jsx
  - tools/app-shell/src/windows/custom/general-ledger-configuration/mockCatalogs.js
  - docs/etendo-ad/onboarding-gaps.md
---

## Resumen
Se eliminó el checkbox "Permitir negativos" de la UI del módulo de configuración del libro mayor general, reclasificando su indicador como `system-visibility` en decisiones.json. Se removió la sección "Politicas contables" que contenía solo este control.

## Decisiones
- El flag `allowNegative` se mantuvo como dato en el sistema (no se eliminó completamente) para preservar valores persistidos en GET, pero cerrado a escrituras en el backend
- Se simplificó `GeneralTab.jsx` removiendo la sección UI que lo contenía, acoplada al formulario general
- Se actualizó documentación de onboarding-gaps para corregir una línea stale y referenciar la decisión final de eliminación

## Descartado
- Mantener el checkbox editable en UI (solución anterior documentada como "pending REVIEW" que fue superada por la decisión de producto de eliminación total)

## Deuda dejada
- El endpoint GET del backend aún expone el valor persistido de `allowNegative`; puede ser candidato a eliminación si no hay dependencias de clientes actuales
