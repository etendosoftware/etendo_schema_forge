---
task: ETP-5460
note: ETP-5460/7114ef56
kind: backfill
date: 2026-09-23T17:09:57.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - f914307383
  - a913c08097
files:
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/test/report-api-branding-org-lookup.test.js
  - tools/app-shell/test/report-api-is-interactive.test.js
  - tools/app-shell/test/report-api-neo-accept-language.test.js
  - tools/app-shell/test/report-api-pdf-chrome-payload.test.js
  - tools/app-shell/test/report-api-session-auth.test.js
  - tools/app-shell/test/report-branding.test.js
  - tools/app-shell/test/report-cli-loader.test.js
  - tools/app-shell/vite-plugins/report-api.js
  - tools/app-shell/vite-plugins/report-cli.js
  - tools/app-shell/src/components/account/SubscriptionSection.jsx
  - tools/app-shell/src/pages/FirstStepsPage.jsx
---

## Resumen
Se resolvió la fuga de identidad de reportes entre tenants migrando de decodificación local de JWT a resolución de sesión por cookie. Se agregaron datos de testeo faltantes en dos componentes de UI.

## Decisiones
- Resolver sesión antes de cualquier consulta a BD/NEO, devolviendo errores específicos (401/403/502) en lugar de genéricos
- Cargar módulos compartidos (report-auth, report-sql, report-branding, etc.) a través de report-cli.js para permitir verificación local contra cambios no publicados del core
- Scopear reportes SQL y filtros de cliente incondicionalmente por clientId de la sesión, eliminando el fallback inseguro a '0'
- Mantener la interpolación raw de currency-selector sin cambios para alineación con el core

## Descartado
- Modificar selectedOrgId en currency-selector (descartado para consistencia con cambios del core)

## Deuda dejada
- LOCAL_CORE es un mecanismo experimental dev-only; requiere validación continua en CI para evitar regresiones
