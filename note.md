---
task: ETP-5418
note: ETP-5418/2d46c7d2
kind: backfill
date: 2026-09-21T16:37:17.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 0d5ab6e592
  - 78dc8b5b71
  - 7bb23eae7c
files:
  - tools/ai-bff/package-lock.json
  - e2e/tests/flows/confirm-inout-message-keys.mocked.spec.js
  - e2e/tests/flows/assets.integration.spec.js
---

## Resumen
Se repararon tres especificaciones de prueba relacionadas con la puerta rectify de ETP-5381: resincronización del package-lock.json, corrección del spec de confirmación de mensajes de entrada/salida, y reseteo del estado del filtro avanzado en el spec de assets.

## Decisiones
- Arreglar specs existentes en lugar de crear nuevos tests, manteniendo la cobertura actual
- Incluir resincronización del lock file como parte de la garantía de reproducibilidad

## Deuda dejada
- La referencia a ETP-5381 ("rectify gate") sugiere que esta tarea corrigió efectos colaterales de otro trabajo; se desconoce si la solución es definitiva o temporal
