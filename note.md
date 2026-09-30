---
task: ETP-5443
note: ETP-5443/34758283
kind: backfill
date: 2026-09-24T00:55:43.000Z
branches:
  - feature/ETP-5443
authors:
  - sebastianbarrozo
agents:
  - codex
sessions:
  - 01a0cc16-3fef-7af0-a117-3a07b283ba54
  - 01a0cc16-3fef-7af0-a117-3a07b283ba54
commits:
  - 7fecc3204b
files:
  - e2e/tests/flows/first-steps-onboarding.mocked.spec.js
---

## Resumen
Se desactivó Demo Transfer en los tests de onboarding agregando 19 líneas al archivo `e2e/tests/flows/first-steps-onboarding.mocked.spec.js`. Todos los checks de CI pasaron.

## Decisiones
- Modificar el test mocked en lugar de la especificación de integración — aislar Demo Transfer del flujo de onboarding sin afectar tests de integración
