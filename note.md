---
task: ETP-5488
note: ETP-5488/0a6df697
kind: backfill
date: 2026-09-24T17:09:19.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 9beea271f9
  - 2de1b0e0e5
files:
  - docs/feedback.md
  - tools/app-shell/src/pages/InviteAcceptancePage.jsx
  - tools/app-shell/src/pages/__tests__/InviteAcceptancePage.vitest.jsx
  - tools/app-shell/src/pages/__tests__/InviteAcceptancePage.sessionGuard.vitest.jsx
---

## Resumen
Se implementó autenticación automática para nuevos invitados tras aceptar la invitación, evitando que queden en pantalla de éxito sin sesión. Se estabilizaron tests flaky que fallaban ~66% de las veces por timing incorrecto en assertions.

## Decisiones
- Iniciar sesión automáticamente luego de registrar en el flujo `register-and-accept` — alínea con el comportamiento del flujo `existing-account`
- Cambiar assertions en session guard tests para esperar la pantalla establecida en lugar del paso de login — refleja que la cookie session es quien acepta, no el flujo de login

## Deuda dejada
- Feedback documentado en `docs/feedback.md` sin evidencia de que haya sido implementado
- Los tests flaky indicaban race conditions en timing; se corrigió el test pero el comportamiento subyacente de sincronización entre identity check y render de login podría revisarse
