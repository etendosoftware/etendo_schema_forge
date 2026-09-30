---
task: ETP-5448
note: ETP-5448/eba00ed6
kind: backfill
date: 2026-09-23T14:23:24.000Z
authors:
  - Lucas Palacios
agents:
sessions:
commits:
  - 4e9ce2db73
files:
  - .github/workflows/deploy-staging.yml
  - docs/ops/app-shell-observability.md
  - docs/ops/cloudfront-alb-routing.md
  - gateway/src/main.ts
  - tools/app-shell/src/lib/__tests__/apiKeysPage.test.js
  - tools/app-shell/src/lib/__tests__/observability-adapters.test.js
  - tools/app-shell/src/lib/observability/browser.js
  - tools/app-shell/src/lib/rum.js
  - tools/app-shell/src/lib/sentry.js
  - tools/app-shell/src/pages/ApiKeysPage.jsx
---

## Resumen
Se trasladó la configuración de entorno y observabilidad del app-shell desde código hardcodeado a variables inyectadas por el workflow de deploy. Ahora los cambios de dominio requieren solo edición de variable más redeploy, sin tocar código.

## Decisiones
- **Inyectar configuración desde deploy** — El workflow ya conoce el target; usarlo como fuente única de verdad evita desincronización y fallos silenciosos.
- **Validar `public_origin`** — Requerir HTTPS absoluto en tiempo de build previene errores en producción.
- **Unificar nomenclatura de RUM** — Usar `RUM_*_<TARGET>` en lugar de mezclar `*_PROD` y `*_PRODUCTION` arregla ETP-5131 donde la configuración nunca se aplicaba en producción.

## Descartado
- Mantener mapas hardcodeados (`SENTRY_ENV_MAP`, `getRumConfigs`) — Generaban code drift cuando cambiaban dominios (p.ej., go.etendo.cloud retirado en 2026-09-10 aún estaba mapeado).

## Deuda dejada
- Se removieron dos mapas del código (`observability-adapters`), pero quedan referencias heredadas en documentación que podrían necesitar limpieza adicional.

## Pendiente
- Verificar que todas las instancias de deploy usen las nuevas variables de Actions.
