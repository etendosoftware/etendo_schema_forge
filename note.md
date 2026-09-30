---
task: ETP-5423
note: ETP-5423/91829f1a
kind: backfill
date: 2026-09-23T14:18:14.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - ace088cd8d
  - 64baea5def
files:
  - docs/plans/2026-09-22-etp5423-logout-permissions-banner-fix.md
  - tools/app-shell/src/hooks/useRoleChangeNotice.js
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - e2e/tests/helpers/auth.js
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/components/RoleChangedBanner.jsx
  - tools/app-shell/src/components/__tests__/RoleChangedBanner.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useRoleChangeNotice.vitest.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se eliminó completamente el sistema de notificación de cambio de rol (`RoleChangedBanner`, `useRoleChangeNotice`) tras determinar que era obsoleto. Un commit anterior había intentado arreglarlo reseteando el baseline al logout, pero se optó por removerlo en su lugar.

## Decisiones
- Remover el componente y hook en lugar de mantenerlos — la notificación se consideró innecesaria y su eliminación reduce complejidad
- Actualizar documentación para reflejar los cambios en flujos funcionales

## Descartado
- Mantener el hook reparado (`useRoleChangeNotice`) — se decidió que el problema de fondo era que la feature no era necesaria, no solo que estuviera rota
