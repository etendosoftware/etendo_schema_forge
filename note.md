---
task: ETP-5374
note: ETP-5374/fa35779e
kind: backfill
date: 2026-09-17T19:44:27.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - b13d5d168f
files:
  - docs/generated-custom-windows/contacts.md
  - docs/generated-custom-windows/product.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/components/contract-ui/__tests__/etp5374-lookup-does-not-logout.vitest.js
  - tools/app-shell/src/components/contract-ui/useWindowImportDialog.js
---

## Resumen
Se fijó la versión del core reconstruido en las dependencias y se endurecieron las validaciones de búsqueda duplicada en el diálogo de importación de ventanas para evitar logout no autorizado.

## Deuda dejada
- El test `etp5374-lookup-does-not-logout.vitest.js` (66 líneas) cubre específicamente el escenario del logout durante búsqueda, pero no queda claro si hay cobertura de otros casos extremos en el refuerzo de la lógica de duplicate lookup.
- Los cambios en `useWindowImportDialog.js` son menores (9 líneas), sugiriendo que la solución es puntual; el alcance completo del endurecimiento no está documentado en el código.
