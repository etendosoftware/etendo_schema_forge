---
task: ETP-5407
note: ETP-5407/30df9a3c
kind: backfill
date: 2026-09-22T15:45:26.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 256f56d127
files:
  - artifacts/fiscal-calendar/contract.json
  - artifacts/fiscal-calendar/contract.mcp.json
  - artifacts/fiscal-calendar/decisions.json
  - artifacts/fiscal-calendar/generated/web/fiscal-calendar/YearPage.jsx
  - docs/generated-custom-windows/INDEX.md
  - docs/generated-custom-windows/calendar.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/calendar/__tests__/PeriodsExpandablePanel.vitest.jsx
  - tools/app-shell/src/windows/custom/calendar/index.jsx
---

## Resumen
Se agregaron dos nuevos rangos de años fiscales (April-March y October-September) al calendario fiscal, actualizando el contrato de datos, documentación generada y traducciones correspondientes.

## Decisiones
- Incluir estos rangos específicos en el contrato del calendario — quedó documentado en decisions.json
- Generar automáticamente documentación y archivos traducidos en lugar de mantenerlos manualmente
