---
task: ETP-5269
note: ETP-5269/522f2cff
kind: backfill
date: 2026-09-14T12:36:26.000Z
authors:
  - sebastianbarrozo
agents:
  - claude-code
  - codex
sessions:
  - 09ab4aa8-764d-40ea-ae02-50b82fb49699
  - 30be2bfc-1958-4ed3-9b7e-e23a7f48337e
  - bc079ac8-47df-424b-9a8a-51313b0c761f
  - 01a091c5-f0e1-7451-a65c-c4776b63e7c9
  - 01a091c5-f244-7f02-bb4d-531a82763877
  - 01a09fd5-540c-74e3-bd1b-76c2480baae1
  - 01a09fd5-54bd-78e1-afbb-a6158d63fffa
  - 01a0a08a-13d1-7333-9640-6df150e862e9
  - 01a0a0fc-7873-7f91-84fa-af5ef4cc635a
  - 01a0a0fc-79a3-7892-855e-bd0a88580271
commits:
  - 8f4807ab10
  - b9580d156f
  - 3237acde8d
  - 3831dd58ac
  - 4cdeb7e26f
  - 3761fe1c8b
  - 68d396bc5d
  - 0a0398336e
files:
  - flags-registry.json
  - tools/app-shell/src/lib/acctProcessMonitorApi.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/AcctProcessMonitorPage.jsx
  - tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx
  - tools/app-shell/src/components/layout/SideMenu/__tests__/SideMenu.firstStepsBadge.vitest.jsx
  - tools/app-shell/src/components/layout/SideMenu/__tests__/SideMenu.vitest.jsx
  - tools/app-shell/src/lib/flags/flag-keys.js
  - tools/app-shell/src/lib/flags/index.js
  - tools/app-shell/src/menu.json
  - tools/app-shell/src/pages/acct-process-monitor/RunStatusPill.jsx
  - tools/app-shell/src/pages/acct-process-monitor/useAcctProcessMonitor.js
  - tools/app-shell/src/runtime-routes.jsx
  - tools/app-shell/src/windows/__tests__/navigationExpectations.js
  - tools/app-shell/src/windows/__tests__/registry.vitest.jsx
  - e2e/tests/flows/acct-process-monitor.mocked.spec.js
  - tools/app-shell/src/pages/__tests__/AcctProcessMonitorPage.vitest.jsx
  - tools/app-shell/src/pages/acct-process-monitor/__tests__/useAcctProcessMonitor.vitest.js
  - tools/app-shell/src/lib/__tests__/acctProcessMonitorApi.vitest.js
  - tools/app-shell/src/pages/acct-process-monitor/__tests__/RunStatusPill.vitest.jsx
  - docs/feature-flags.md
  - docs/generated-custom-windows/INDEX.md
  - docs/generated-custom-windows/acct-process-monitor.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/components/StatusCard.jsx
  - tools/app-shell/src/pages/RolesOverviewPage.jsx
---

## Resumen
Se agregó una página de monitoreo del servidor de contabilidad (`/acct-process-monitor`) con histórico de ejecuciones y botón "Run now" que dispara un proceso manual. El cambio principal fue implementar polling inteligente para que la página muestre los runs disparados, que antes nunca aparecían porque el backend reporta esos datos de forma asincrónica.

## Decisiones
- **Polling acotado a deadline (60s)** — evita que el admin espere indefinidamente si el scheduler dropea silenciosamente el job
- **Mensaje de scope: "esta empresa" en lugar de "instancia completa"** — refleja que un manual run desde cliente X cubre solo la contabilidad pendiente de X, no toda la instancia
- **Log nunca renderizado** — backend no envía `AD_PROCESS_RUN.LOG` según contrato; no hay column ni drill-down
- **Feature gateada por flag (default false)** — rollout controlado; flag solo gates menu entry, la ruta sigue accesible y SFAcctProcessMonitor enforce admin/client-admin

## Deuda dejada
- El polling que observa `running` false + no hay run nuevo tuvo que arreglarse; el mock anterior retornaba ficción (`running:true` + run presente) y pasaba contra comportamiento que backend nunca produce
- Componentes SideMenu/StatusCard/Timestamp requirieron compat pass post-codemod para aceptar `data-testid`

## Pendiente
- Rollout de `acct-process-monitor` flag una vez validada en staging
