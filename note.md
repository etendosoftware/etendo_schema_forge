---
task: ETP-5548
note: ETP-5548/cec36377
kind: backfill
date: 2026-09-29T23:49:06.000Z
branches:
  - feature/ETP-5548
authors:
  - sebastianbarrozo
agents:
  - codex
sessions:
  - 01a0ee8d-4193-7e91-8202-2ec623781e82
  - 01a0ee95-ed8e-76e0-ae95-52d6f15aeca2
  - 01a0ee98-a29f-7862-8a58-b66ea0de0771
  - 01a0eeb7-3984-7ef0-8707-908d0952bd78
  - 01a0eeba-f2fd-79b1-bcfa-abd03aa71741
  - 01a0eebc-d44b-7c53-9776-b85124ed4dd8
  - 01a0eebd-eea8-7b01-91ac-4759d514a180
  - 01a0f400-b367-7ca0-94a7-83d58f836344
  - 01a0f403-94ca-7021-904a-1542fd8a65a5
commits:
  - 9af1eddeb1
  - 00d3f417b5
  - 2f1617b1b0
  - 10020a4eac
files:
  - cli/src/data-fixes/sql/20260929T180000Z__R41-demo-legacy-trial-start.sql
  - cli/test/data-fixes-report-regression.test.js
  - docs/e2e-testing-guide.md
  - docs/etendo-ad/tenant-remediation-knowledge.md
  - docs/paid-tenant-infrastructure.md
  - e2e/tests/flows/system/tenant-upgrade-provisioning-failure.integration.spec.js
  - e2e/tests/flows/system/tenant-upgrade-provisioning-failure.mocked.spec.js
  - e2e/tests/helpers/auth.js
  - scripts/run-e2e-full.sh
  - scripts/tenant-remediation/demo-trial-production-datafix.md
  - scripts/tenant-remediation/repair-demo-trial.cjs
  - scripts/tenant-remediation/tests/repair-demo-trial.integration.test.cjs
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/UpgradePage.jsx
  - cli/src/data-fixes/sql/20260929T190000Z__R42-paid-provisioning-commercial-metadata.sql
  - scripts/tenant-remediation/tests/repair-paid-commercial-metadata.integration.test.cjs
  - tools/app-shell/test/report-cli-loader.test.js
---

## Resumen
Mejora del flujo de recuperación para tenants pagos cuya provisión falla: agregó E2E test con tenant dedicado del pool, datafix idempotente para reparar demos de trial antiguo, y validaciones en UI para mostrar el estado y permitir reintentos.

## Decisiones
- **Tenant dedicado del pool para E2E** — evita mock, verifica fallo real en `finishPooledTenant` y ejecución del `POST /sws/go/onboarding` con `paymentToken`.
- **Datafix con framework existente** — sigue patrón SQL + `@check` / `@apply` para consistencia con otros datafixes del repositorio.
- **Seam protegido por entorno** — deshabilitado por defecto, requiere `E2E_PROVISIONING_FAILURE=1` para evitar ejecuciones accidentales.

## Deuda dejada
- Datafix preparado pero no ejecutado en producción; requiere túnel y credenciales AWS secretas en despliegue.
- Playwright E2E real omitido por defecto sin flag de entorno explícito.
- Cambios en UpgradePage alineados a publicación; falta confirmación de UX con stakeholders.

## Pendiente
- Ejecución del datafix en producción para reparar tenants de trial legado.
- Documentación de runbook de recuperación manual vs automática.
