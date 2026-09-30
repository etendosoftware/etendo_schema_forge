---
task: ETP-5278
note: ETP-5278/75b23f7e
kind: backfill
date: 2026-09-26T00:49:15.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 83f4eb9421
  - 4d59b9e4ef
  - 4bfd105e9f
  - e87dd0e6fd
  - aab9bfb9aa
  - d70e8a894a
  - 6b5af14589
files:
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.helpers.vitest.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - tools/app-shell/src/windows/custom/user/AssignTemplateRolesControl.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/AssignTemplateRolesControl.vitest.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/user/index.jsx
  - docs/generated-custom-windows/user.md
  - tools/app-shell/src/hooks/useEntity.js
  - docs/functionalidad/02-capacidades-y-flujos.md
  - e2e/tests/flows/system/user-role-assignment.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.dirtyState.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.extractedHelpers.vitest.js
  - tools/app-shell/src/components/contract-ui/__tests__/saveActions.deferredSaveToast.vitest.jsx
  - tools/app-shell/src/components/contract-ui/saveActions.jsx
  - tools/app-shell/src/lib/userRoleAssignmentsApi.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se corrigieron inconsistencias de datos tras cambios de rol en la ventana de usuarios. El caché de lista no se invalidaba tras promover/degradar, mostrando datos obsoletos al regresar a la cuadrícula. El formulario permitía escrituras superpuestas, causando errores en el backend.

## Decisiones
- Mantener el botón Save en estado ocupado durante toda la cadena de escritura (save del registro + asignación de roles)
- Deshabilitar controles de promote/demote mientras se ejecutan operaciones de escritura
- Invalidar explícitamente el caché de lista tras cambios de rol para garantizar que la cuadrícula refleje datos frescos
- Consolidar notificaciones en un único toast final con contrato de resultado en lugar de múltiples toasts

## Descartado
- No se encontró evidencia de alternativas rechazadas

## Deuda dejada
- La invalidación del caché está integrada en el componente de détalle pero la lógica de estados durante operaciones complejas se concentra en `saveActions.jsx`; futuras operaciones similares podrían reutilizar estos patrones

## Pendiente
- No identificado
