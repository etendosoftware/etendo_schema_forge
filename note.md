---
task: ETP-5550
note: ETP-5550/f8d7d25c
kind: backfill
date: 2026-09-30T22:08:13.000Z
authors:
  - Román Magnoli
agents:
sessions:
commits:
  - afba5016d9
  - 00b56781bb
  - af2d34ad0a
  - c679e617a8
files:
  - e2e/tests/flows/session-multi-tab-csrf.mocked.spec.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - e2e/tests/flows/onboarding/onboarding-length-limits.mocked.spec.js
  - e2e/tests/flows/onboarding/onboarding-logout-resume.mocked.spec.js
  - e2e/tests/flows/onboarding/onboarding-validations.mocked.spec.js
  - e2e/tests/flows/onboarding/onboarding.mocked.spec.js
  - e2e/tests/helpers/auth.js
---

## Resumen
Hotfix para rotatión segura de sesiones en escenarios multi-tab y recuperación ante backends no disponibles. Se agrega cobertura E2E y se actualizan las dependencias core con los fixes necesarios.

## Decisiones
- **E2E multi-tab para rotación**: Valida que un tab con sesión revocada recupera escritura, rechaza adoptar pruebas de sesión cuando se mueve a otra company, y que logout desde tab stale no re-entra en onboarding.
- **Mockear GET /sws/go/session en onboarding**: Evita dependencia de backend remoto; previene que ausencia de backend (respuesta 500 del proxy) se interprete como deploy en progreso, evitando retries indefinidos que causaban timeouts.
- **Versionado: preview → stable**: Primero pinea versión preview de app-shell-core, etendo-go-core y schema-forge-core (0.3.65-preview.hotfix-ETP-5550), luego la versión stable 0.3.65.

## Deuda dejada
- El segundo commit marca como temporal el pineo a preview, requiriendo repinear a stable antes de mergear (completado en el tercer commit).
