---
task: ETP-5551
note: ETP-5551/dc3b5a8b
kind: backfill
date: 2026-09-30T13:57:37.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - b8ddb8f434
  - cf4525c7f8
  - 27f0a7ad45
  - a0a65a1306
files:
  - .claude/agents/merge-block-helper.md
  - docs/generated-custom-windows/financial-account.md
  - e2e/tests/flows/onboarding/first-steps-onboarding.mocked.spec.js
  - e2e/tests/helpers/auth.js
  - e2e/tests/flows/first-steps-demo-data-transfer.mocked.spec.js
---

## Resumen
Se optimizó el flujo de login en tests e2e al eliminar una espera implícita global por la lectura de first-steps dashboard y permitir que solo los specs que la necesiten la soliciten explícitamente mediante `awaitFirstStepsRead`.

## Decisiones
- `login()` dejó de esperar por defecto la lectura de first-steps — reduce stalls innecesarios en tests
- Opt-in explícito en specs que requieren esa espera — claridad sobre intención y dependencias
- Guardia con timeout de 10s y excepción — evita stalls silenciosos en fallas

## Deuda dejada
- Refactorización significativa de `auth.js`: 65 líneas reorganizadas entre commits 3 y 4, sugiere complejidad acumulada en helpers
- Múltiples puntos de sincronización en first-steps (login, onboarding, demo-data-transfer) — patrón repetido que podría consolidarse

## Pendiente
- Cambios en documentación (neo-headless, merge-block-helper) indican cascada de updates en otras áreas; validar que referencias externas se mantuvieron consistentes
- Verificar si otros specs heredan el comportamiento antiguo de `login()` sin ajuste explícito
