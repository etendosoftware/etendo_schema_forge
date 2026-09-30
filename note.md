---
task: ETP-5401
note: ETP-5401/ba6dd2d6
kind: backfill
date: 2026-09-25T19:40:36.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 7e860af7ee
  - 55c2272fce
  - c3817d5394
  - 2fdcfd3c79
files:
  - artifacts/balance-sheet/report-contract.json
  - artifacts/profit-loss/report-contract.json
  - artifacts/report-general-ledger/report-contract.json
  - artifacts/report-trial-balance/report-contract.json
  - artifacts/report-trial-balance/template.hbs
  - templates/reports/helpers/report-html-helpers.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/test/report-jsreport-helpers-builder.test.js
  - tools/app-shell/test/report-trial-balance-account-blocks.test.js
  - tools/app-shell/test/report-trial-balance-account-level.test.js
---

## Resumen
Se corrigió el orden de cuentas, fechas y el total Epigrafe en reportes de trial balance. Se agregaron helpers HTML auxiliares y se actualizaron dependencias core a versión preview, con expansión correlativa de tests.

## Decisiones
- Implementar la corrección mediante helpers en `report-html-helpers.js` en lugar de modificar directamente los templates
- Adoptar versión preview de core packages en lugar de esperar release estable

## Descartado
No se identifica.

## Deuda dejada
- Adopción de versión preview implica potencial inestabilidad o cambios futuros en dependencias
- Tests de trial balance expandidos significativamente (+68 líneas); requiere mantenimiento si lógica de `is_root` evolucionan

## Pendiente
No se identifica.
