---
task: ETP-5387
note: ETP-5387/251738f9
kind: backfill
date: 2026-09-22T15:01:06.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 6e8149955a
  - 1c89409bea
files:
  - artifacts/chart-of-accounts/custom/AccountTreeView.jsx
  - docs/generated-custom-windows/chart-of-accounts.md
  - tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/AccountTreeView.vitest.jsx
  - package-lock.json
---

## Resumen
Se eliminó el destello de esqueleto que aparecía al cargar el árbol de cuentas contables. El componente ahora renderiza la vista solo después del primer ciclo completado de carga, evitando pinturas de datos parciales.

## Decisiones
- Usar `hasLoadedOnce` como condición de renderizado en lugar de validar `fetchedData !== null` — permite distinguir entre "nunca intentó cargar" (mostrar esqueleto) y "ya intentó, aunque haya fallado" (mantener último estado), eliminando flashes indeseados en reintentos.

## Deuda dejada
- El flag `hasLoadedOnce` requiere gestión de estado adicional; el comportamiento en reintentos tras error (mantener la vista anterior vs. mostrar estado vacío) queda implícito en la lógica y no está documentado en el código.
