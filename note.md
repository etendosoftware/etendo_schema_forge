---
task: ETP-5485
note: ETP-5485/0101b898
kind: backfill
date: 2026-09-29T17:59:39.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - f7ae8ee040
  - c7a71c2112
  - d224f6c1a4
  - dc9db76c4a
  - b85924458d
  - 0c21a359e1
  - c6c1eb4fda
files:
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - docs/generated-custom-windows/user.md
  - e2e/tests/flows/system/user-role-assignment.mocked.spec.js
  - tools/app-shell/src/lib/rolesApi.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/roles/useRolesOverviewData.js
  - tools/app-shell/src/windows/custom/user/UserRolesTab.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/UserRolesTab.vitest.jsx
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/pages/roles/__tests__/otherCategoryLocale.vitest.js
  - docs/generated-custom-windows/not-posted-documents.md
  - e2e/tests/flows/accounting/not-posted-documents.mocked.spec.js
  - tools/app-shell/src/components/access/ProcessAccessGuard.jsx
  - tools/app-shell/src/components/access/__tests__/ProcessAccessGuard.vitest.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/__tests__/NotPostedDocumentsPage.vitest.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/__tests__/index.access.vitest.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/index.jsx
---

## Resumen
Refactorización de la pestaña Roles del Usuario para usar la matriz de roles compartida del sistema en lugar de reconstruir desde el árbol AD, eliminando ~380 líneas de código duplicado. Se completó la validación de acceso en la página Not Posted Documents y se tradujeron mensajes de error.

## Decisiones
- Usar matriz de roles compartida (`SFSystemRoleTemplates` con `includeMatrix=true`) — evita duplicación lógica y asegura consistencia con la página de Configuración > Roles
- Agregar `ProcessAccessGuard` a Not Posted Documents — la página no tenía validación de acceso (el `AD_Window` nunca se aplicaba), dejaba ver filtros sin permisos
- Traducir categoría "Other" y errores de posting — mejora la experiencia en multiidioma

## Descartado
- Mantener reconstrucción desde árbol AD en UserRolesTab — fue reemplazado por la matriz compartida para reducir complejidad y garantizar sincronización

## Deuda dejada
- Tests de `UserRolesTab` redujeron de 742 a menos líneas pero la prueba mantiene cobertura (refactor de limpieza)
- `NotPostedDocumentsPage` ahora requiere manejo de `AccessDeniedMessage` (markup copiado de core) — candidato futuro a componente compartida
