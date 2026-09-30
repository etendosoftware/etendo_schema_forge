---
task: ETP-5279
note: ETP-5279/4d61e291
kind: backfill
date: 2026-09-24T16:07:34.000Z
authors:
  - Román Magnoli
agents:
sessions:
commits:
  - 0b30725450
files:
  - docs/request-policy.md
  - tools/app-shell/test/no-raw-fetch.test.js
---

## Resumen
Se implementó una guardia para validar pedidos custom de artefactos. Se documentó la política y se expandieron los tests de no-raw-fetch.

## Decisiones
- Agregar validación en la capa de requests custom — el cambio en `request-policy.md` sugiere una política más restrictiva

## Deuda dejada
- Los tests se ampliaron significativamente (27 líneas netas) pero sin visibilidad de qué casos se cubrieron ni si la cobertura es exhaustiva
