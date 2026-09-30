---
task: ETP-5193
note: ETP-5193/ef5bb9c5
kind: backfill
date: 2026-09-10T11:07:10.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - d967aa79bb
  - 310aba9032
  - d4c9519628
files:
  - docs/generated-custom-windows/user.md
  - tools/app-shell/src/windows/custom/user/AssignTemplateRolesControl.jsx
  - tools/app-shell/src/windows/custom/user/index.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/AssignTemplateRolesControl.vitest.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.helpers.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.toastMerge.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
---

## Resumen
Se corrigieron problemas en el selector de roles (overlay, checkbox y notificaciones) y se resolvió un bug de acciones obsoletas en el toast mediante consolidación de IDs de sonner.

## Decisiones
- Merge de IDs de sonner — para evitar múltiples toasts obsoletos de rol al actualizar entidades
- Cobertura de tests completa — se agregaron pruebas unitarias e integración para validar los tres aspectos del fix (overlay, checkbox, toast)

## Descartado
Sin evidencia de alternativas descartadas en los commits.

## Deuta dejada
Sin indicios de atajos o TODOs en los cambios.

## Pendiente
Sin evidencia de trabajo pendiente asociado.
