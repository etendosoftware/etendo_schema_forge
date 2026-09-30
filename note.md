---
task: ETP-5449
note: ETP-5449/dd360242
kind: backfill
date: 2026-09-24T15:20:37.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 5ac551c75b
  - b20669aede
files:
  - tools/app-shell/src/lib/__tests__/dateRangeBounds.test.js
  - tools/app-shell/src/lib/dateRangeBounds.js
  - tools/app-shell/src/windows/custom/goods-shipment/GoodsShipmentPreview.jsx
---

## Resumen
Se corrigieron dos bugs menores en filtros de fecha y timers de componentes: el off-by-one en la reconciliación derivaba de conversiones a UTC que desplazaban los límites según zona horaria, y un timer sin limpieza causaba actualizaciones de estado en componentes ya desmontados.

## Decisiones
- Reemplazar `toISOString()` por `todayCalendarISO()` para mantener aritmética de fechas en el huso local, evitando desplazamientos — "Ayer" ahora funciona correctamente en cualquier zona horaria
- Usar ref para almacenar el id del timeout y limpiarlo en unmount — previene callbacks ejecutándose en componentes muertos y fallos intermitentes en Vitest cuando el jsdom environment se recicla

## Deuda dejada
- El test que exponía el bug de timer solo se manifestaba en contextos específicos de reciclaje de jsdom; la carga cognitiva de debuggear esto fue alta (identificado ejecutando en aislamiento)
