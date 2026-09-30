---
task: ETP-5463
note: ETP-5463/034ec264
kind: backfill
date: 2026-09-24T13:16:14.000Z
branches:
  - feature/ETP-5463
authors:
  - sebastianbarrozo
agents:
  - claude-code
  - codex
sessions:
  - a7be96da-2d80-440a-a3c6-af1ee2e817ff
  - fbe694ad-c4b1-4f93-a92a-558a901524cb
  - 01a0d150-f662-79b0-81e9-6bcbc64c3d1d
  - 01a0d158-b6ad-7ff3-8dea-0800320a993c
  - 01a0d169-38e0-79b0-8711-9b15cb91a696
  - 01a0d309-4aab-7e22-b27e-93a72c1accf7
  - 01a0d331-6f9d-79a3-9eff-f05dd975e843
  - 01a0d349-ead6-7bb3-9a55-724b267b7186
  - 01a0d34a-76e4-71e0-bca2-71e73a418a6f
  - 01a0d353-b15b-7521-a623-99369ec91c7a
  - 01a0d365-ec2e-78c1-9181-de396641e403
  - 01a0d372-aa5c-7921-a607-ba1a0073c4c2
  - 01a0d390-28e5-7ca2-a439-481f03781fd2
commits:
  - cc7af0e43d
  - 16f6d690cf
  - e694270e7c
  - 2562758396
  - 23c0319e0b
  - ad6ab60782
files:
  - docs/paid-tenant-infrastructure.md
  - tools/app-shell/src/hooks/__tests__/useEnvironmentSwitch.vitest.jsx
  - tools/app-shell/src/hooks/useEnvironmentSwitch.js
  - tools/app-shell/src/lib/__tests__/upgrade-api.test.js
  - tools/app-shell/src/lib/formatCurrency.js
  - tools/app-shell/src/lib/upgrade/api.js
  - tools/app-shell/src/lib/upgrade/currency.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/UpgradePage.jsx
  - tools/app-shell/src/pages/__tests__/UpgradePage.vitest.jsx
  - tools/app-shell/src/components/account/SubscriptionSection.jsx
  - tools/app-shell/src/components/account/__tests__/SubscriptionSection.vitest.jsx
  - tools/app-shell/src/__tests__/runtime-routes-integration.vitest.jsx
  - tools/app-shell/src/runtime-routes.jsx
  - tools/app-shell/src/auth/useLogout.js
---

## Resumen
Se integró el flujo de recompra pagada con reintentos y sincronización de precios Stripe. Los cambios muestran datos productivos (monto, moneda, intervalo), resisten compras previas por ID existente, ocultan intentos fallidos, y esperan el `clientId` canónico antes de cambiar de entorno. Seis commits iterativos incluyeron formateo de importes, corrección de logout (llevaba a onboarding en lugar de login), limpieza de sesión tras desconexión, y resolución de hallazgos de revisión.

## Decisiones
- **Mostrar oferta de Stripe configurada** — para alineación entre precio y checkout
- **Respetar ID de compra existente** — para reanudar sin recrear compras
- **Ocultar checkouts sin pagar** — para reducir fricción en UI
- **Esperar `clientId` en lista canónica** — evita cambios prematuros de entorno
- **Logout → login en lugar de onboarding** — comportamiento esperado; requirió limpiar estado de sesión

## Deuda dejada
- Iteraciones menores en test IDs y formateo sugieren ciclos de revisión no capturados en primeros commits
- Según handoff concurrente, rama tenía rebase en progreso con conflictos pendientes en locales y `UpgradePage`
- No está claro si documento de infraestructura (`paid-tenant-infrastructure.md`) con cambios (+297 líneas) está actualizado con diagrama y runbook

## Pendiente
- Push de commits a remoto (handoff menciona que no se pusheó)
- Abrir PR con identificador correcto y aclarar que incluye commit de ETP-5443 renombrado
- Revisión final (Alex estaba asignado según sessions)
