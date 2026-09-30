---
task: ETP-5371
note: ETP-5371/9534ad21
kind: backfill
date: 2026-09-16T17:51:05.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - d401a0a2ab
files:
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/components/contract-ui/useWindowImportDialog.js
  - tools/app-shell/src/components/copilot/ocr/ingest/__tests__/useBatch.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/ingest/useBatch.js
  - tools/app-shell/src/components/copilot/ocr/useOcrFlow.jsx
  - tools/app-shell/src/lib/__tests__/neoBaseUrl.vitest.js
  - tools/app-shell/src/lib/neoBaseUrl.js
  - tools/app-shell/src/pages/first-steps/FirstStepsImportButton.jsx
  - tools/app-shell/src/pages/first-steps/__tests__/FirstStepsImportButton.vitest.jsx
---

## Resumen
Se centralizó la gestión de URLs base de NEO en un módulo único (`neoBaseUrl.js`) en lugar de tenerlas dispersas entre componentes, mejorando la mantenibilidad y eliminando duplicación.

## Decisiones
- Crear módulo centralizado `neoBaseUrl.js` — establecer un único propietario de la configuración de URLs base de NEO
- Refactorizar componentes (`App.jsx`, `useOcrFlow.jsx`, etc.) para usar la nueva fuente única — garantizar coherencia y facilitar cambios futuros

## Descartado
No aplica.

## Deuda dejada
No identificada en el diff.

## Pendiente
No aplica.
