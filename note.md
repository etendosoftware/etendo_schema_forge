---
task: ETP-5403
note: ETP-5403/145f8d19
kind: backfill
date: 2026-09-22T18:18:10.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - bc0d5f5e8a
  - 4ad6b8b7fe
files:
  - tools/app-shell/src/__tests__/App.vitest.jsx
  - docs/feedback.md
  - tools/app-shell/src/App.jsx
---

## Resumen
Se desacoplaron los TTLs de menu-access para fallos y éxitos, permitiendo diferentes tiempos de recuperación. Se añadió una prueba de regresión QA para validar el comportamiento.

## Decisiones
- Desacoplar TTL de fallos y éxitos en menu-access — permite controlar independientemente cuánto esperar según el resultado previo

## Deuda dejada
- La documentación en `feedback.md` fue modificada (15 líneas) pero el alcance de esos cambios no es evidente desde los diffs
