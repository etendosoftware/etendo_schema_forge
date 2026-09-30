---
task: ETP-5409
note: ETP-5409/d9f28f0d
kind: backfill
date: 2026-09-18T18:35:08.000Z
authors:
  - RubenEtendo
agents:
sessions:
commits:
  - 496d76e77a
  - 4977fbf4ab
  - dd2ed32853
  - e151368366
  - 17d967cd41
files:
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmBoxes303.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmBoxes303.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.manualEntryRounding.vitest.jsx
  - docs/generated-custom-windows/fiscal-models.md
  - tools/app-shell/src/windows/custom/fiscal-models/fiscal-models.css
---

## Resumen

Se corrigieron varios comportamientos en la edición de casillas del Modelo 303: evitar limpiar valores cuando la edición no introduce cambios reales, redondear entradas manuales a 2 decimales, limpiar valores pendientes obsoletos tras confirmar/escapar/reabrir cajas, y truncar con ellipsis valores que desbordan.

## Decisiones

- Mantener estado solo si la edición introdujo cambios — evita pérdida accidental de datos en no-ops
- Redondear a 2 decimales — garantiza consistencia con normativa fiscal
- Limpiar `pendingValues` al cerrar la edición — previene que estado antiguo interfiera en reaperturas
- Truncar visualmente valores largos — mejora legibilidad sin destruir datos

## Descartado

Nada mencionado en los commits.

## Deuda dejada

- El redondeo se aplicó solo a entrada manual; validar si cálculos automáticos también necesitan este tratamiento
- La lógica de limpieza de `pendingValues` agregó complejidad al flujo; verificar que se cubre en todos los puntos de salida

## Pendiente

Nada evidente en la evidencia.
