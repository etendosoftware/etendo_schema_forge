---
task: ETP-5380
note: ETP-5380/9de9e30e
kind: backfill
date: 2026-09-16T17:35:56.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 8b5aed82ba
files:
  - e2e/tests/flows/fiscal-models-303-identification.mocked.spec.js
  - e2e/tests/flows/inline-lines-quotation.mocked.spec.js
  - e2e/tests/flows/sales-invoice-discount-display.mocked.spec.js
---

## Resumen
Se agregó timeout explícito de 10 segundos a todas las llamadas de `waitForLoadState('networkidle')` en los archivos de pruebas mocked-serial (3 archivos, 11 ocurrencias). Esto evita que el timeout por defecto de Playwright (~30s) cause acumulación de tiempos y supere el timeout global de 60s de los tests, produciendo errores específicos en lugar de mensajes genéricos.

## Decisiones
- Usar 10s como timeout estándar — alinea con la convención ya establecida en attachments.mocked.spec.js y el helper login() compartido; mejora la experiencia de debugging al fallar rápido y específicamente
- Actualizar todos los archivos de flujos (fiscal-models-303-identification, inline-lines-quotation, sales-invoice-discount-display) — garantiza consistencia y predecibilidad en toda la suite
