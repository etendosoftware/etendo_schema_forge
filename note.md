---
task: ETP-5455
note: ETP-5455/4754fb23
kind: backfill
date: 2026-09-23T21:45:27.000Z
authors:
  - Román Magnoli
agents:
sessions:
commits:
  - 2e0a1807e5
  - 64f38f5715
  - c365d53514
  - aea68354f2
  - 2eba28e988
files:
  - tools/app-shell/src/components/ChangePasswordDialog.jsx
  - tools/app-shell/src/components/__tests__/ChangePasswordDialog.vitest.jsx
  - tools/app-shell/src/explorer/useDiscovery.js
  - tools/app-shell/src/lib/__tests__/health-events.vitest.js
  - tools/app-shell/src/lib/__tests__/rolesApi.vitest.js
  - tools/app-shell/src/lib/__tests__/sessionCredentialOverride.vitest.js
  - tools/app-shell/src/lib/__tests__/sessionIdentity.vitest.js
  - tools/app-shell/src/lib/__tests__/userRoleAssignmentsApi.vitest.js
  - tools/app-shell/src/lib/flags/__tests__/clearAccountIdentity.vitest.js
  - tools/app-shell/src/lib/flags/__tests__/useAccountIdentity.vitest.jsx
  - tools/app-shell/src/lib/flags/__tests__/useFeatureFlag.vitest.jsx
  - tools/app-shell/src/lib/flags/bootstrap.js
  - tools/app-shell/src/lib/flags/useAccountIdentity.js
  - tools/app-shell/src/lib/menuTree.js
  - tools/app-shell/src/lib/neoWebhookClient.js
  - tools/app-shell/src/lib/observability/health-events.js
  - tools/app-shell/src/lib/sessionIdentity.js
  - tools/app-shell/src/windows/custom/user/InviteUserDialog.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/InviteUserDialog.vitest.jsx
  - tools/app-shell/src/windows/custom/user/index.jsx
  - tools/app-shell/test/no-legacy-auth-storage.test.js
  - tools/app-shell/src/components/account/SubscriptionSection.jsx
  - tools/app-shell/src/components/account/__tests__/SubscriptionSection.vitest.jsx
  - tools/app-shell/src/locales/__tests__/etp5455-account-session-expired-keys.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/AccountSettingsPage.jsx
  - tools/app-shell/src/pages/__tests__/AccountSettingsPage.vitest.jsx
  - e2e/tests/flows/account-session-cookie.mocked.spec.js
  - e2e/tests/flows/account-session-expired.mocked.spec.js
  - e2e/tests/flows/report-selector-cookie.mocked.spec.js
  - docs/feature-flags.md
  - docs/ops/app-shell-observability.md
  - tools/app-shell/src/pages/FirstStepsPage.jsx
---

## Resumen
Migración de autenticación legacy (claves localStorage sf_auth_*, sf_platform_token) a sesiones HTTP. Se eliminaron referencias a credenciales legacy en ChangePasswordDialog, menuTree, neoWebhookClient, InviteUserDialog y flag targeting, reemplazándolas con lectura centralizada de identidad de sesión. Se agregó manejo visual de sesiones expiradas en AccountSettingsPage.

## Decisiones
- Centralizar identidad de sesión en lib/sessionIdentity.js como única fuente de verdad, eliminando lecturas dispersas de claves legacy
- Representar 401 en /me o billing como estado session-expired distinto (UX específico con acción "Sign in again"), manteniendo error + Retry para fallos 5xx
- useAccountIdentity opera ahora con cualquier sesión autenticada, no solo cuando sf_platform_token está presente

## Deuda dejada
- data-testids agregados a FirstStepsPage y algunos íconos de SubscriptionSection sin relación directa a ETP-5455 (requerimiento de codemod baseline, preexistentes)
