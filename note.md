---
task: ETP-5188
note: ETP-5188/bee9e736
kind: backfill
date: 2026-09-21T14:41:32.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - 1b6ab8831b
  - 8b70da5c89
  - 36915826ab
  - cd1bab0b86
  - 76968f148f
files:
  - docs/generated-custom-windows/user.md
  - docs/plans/2026-09-11-etp-5188-role-filter-open-questions.md
  - docs/ui-customization.md
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.vitest.jsx
  - tools/app-shell/src/lib/__tests__/gridQuery.vitest.jsx
  - tools/app-shell/src/lib/__tests__/linesColumnWidth.vitest.js
  - tools/app-shell/src/lib/gridQuery.js
  - tools/app-shell/src/lib/linesColumnWidth.js
  - tools/app-shell/src/windows/custom/user/RoleChipsCell.jsx
  - tools/app-shell/src/windows/custom/user/RoleFilterControl.jsx
  - tools/app-shell/src/windows/custom/user/RoleQuickFilterToolbarSlot.jsx
  - tools/app-shell/src/windows/custom/user/UserHeaderTable.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/RoleChipsCell.vitest.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/RoleFilterControl.vitest.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/RoleQuickFilterToolbarSlot.vitest.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/UserHeaderTable.vitest.jsx
  - e2e/tests/flows/roles-overview.mocked.spec.js
  - e2e/tests/flows/user-role-assignment.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.bulkDelete.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.etp4603Coverage.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.headerContentMeta.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.helpers.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.import.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.importLabels.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.interactions.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.printLoadingState.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.tableOwnsScroll.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/testUtils/gridQueryMock.js
  - tools/app-shell/src/hooks/useEntity.js
---

## Resumen
Se corrigió el filtrado de roles en la ventana de usuarios, agregando el campo Rol y mejorando el manejo de cargas asincrónicas para evitar remontajes innecesarios y mostrar esqueletos en lugar de estados vacíos mientras se resuelven asignaciones.

## Decisiones
- Inicializar `loading` desde `!skipListFetch` en `useEntity` para que el primer render refleje correctamente si un fetch está garantizado, evitando remontajes de Table cuando la carga real comienza
- Pasar `loading` explícito a DataTable cuando un filtro de rol está activo y las asignaciones no se han resuelto aún, diferenciando entre estado vacío real y fetch en progreso
- Extraer `gridQueryMock` como utilidad compartida para reducir duplicación en tests
- Crear `RoleQuickFilterToolbarSlot` como componente separado para el acceso rápido al filtro de roles

## Descartado
- El documento abierto (etp-5188-role-filter-open-questions.md) indica que hubo alternativas consideradas durante el diseño, aunque los detalles específicos no están en los commits

## Deuda dejada
- El componente `UserHeaderTable` ahora tiene lógica de loading explícita; considerar si esta pauta debería estandarizarse en otros `ListView` con filtros secundarios
- Los mocks de `gridQuery` fueron actualizados reactivamente; verificar si hay otros tests con mocks obsoletos no capturados

## Pendiente
- Validar comportamiento en conexiones lentas donde assignments resuelve significativamente después del base list (confirmado en app.etendo.software pero podría necesitar más cobertura de integración)
