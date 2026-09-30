---
task: ETP-5331
note: ETP-5331/cb325c76
kind: backfill
date: 2026-09-18T18:21:33.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - d8c69bdd30
files:
  - tools/app-shell/src/components/ui/__tests__/date-range-popover.test.js
  - tools/app-shell/src/components/ui/date-range-popover.jsx
---

## Resumen
Se corrigió el botón Apply en el filtro de fechas para que no cambie de color (amarillo) al pasar el mouse cuando está deshabilitado. Se agregó una prueba de regresión.

## Decisiones
- Usar la clase Tailwind `disabled:pointer-events-none` en el botón Apply — evita que eventos del mouse se propaguen a un elemento deshabilitado, impidiendo que se aplique el estado hover.
