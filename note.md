---
task: ETP-5402
note: ETP-5402/c9d64bf5
kind: backfill
date: 2026-09-22T01:06:38.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - bd66a59208
  - a6b46ba1b1
  - 82f62b4f4f
  - acda0705d9
  - 24f0cf19a2
  - ae808d2948
  - bee251bf63
  - b5c96a4292
  - f62ca9eba2
  - 07d7483644
  - 4def079b33
  - e580b9f406
  - 263b0c7b78
  - b6296e4eb8
  - 5693b76ae0
  - 9eb36d9765
  - 693397cc3b
  - 30f0e8098d
  - 75190974b2
files:
  - tools/app-shell/src/pages/roles/__tests__/useRolesOverviewData.vitest.js
  - tools/app-shell/src/pages/roles/useRolesOverviewData.js
  - tools/app-shell/src/windows/custom/user/UserRolesTab.jsx
  - tools/app-shell/src/windows/custom/user/__tests__/UserRolesTab.vitest.jsx
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - docs/generated-custom-windows/user.md
  - tools/app-shell/src/menu.json
  - tools/app-shell/src/pages/roles/__tests__/RolesAccessMatrix.vitest.jsx
  - tools/app-shell/src/windows/__tests__/navigationExpectations.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/RolesOverviewPage.jsx
  - tools/app-shell/src/pages/roles/RolesAccessMatrix.jsx
  - tools/app-shell/src/layout/AppLayout.jsx
  - tools/app-shell/src/layout/__tests__/AppLayout.vitest.jsx
  - tools/app-shell/src/lib/rolesApi.js
  - tools/app-shell/src/pages/ReportViewerPage.jsx
  - tools/app-shell/src/pages/__tests__/ReportViewerPage.popupSelectors.vitest.jsx
  - tools/app-shell/src/pages/__tests__/ReportViewerPage.sectionVisibility.vitest.jsx
  - tools/app-shell/src/pages/__tests__/ReportViewerPage.submitParamsStripping.vitest.jsx
  - tools/app-shell/src/windows/registry.js
  - tools/app-shell/src/windows/__tests__/registry.vitest.jsx
  - package-lock.json
  - e2e/tests/helpers/auth.js
  - tools/app-shell/src/pages/__tests__/reportViewerTestHelpers.js
---

## Resumen
Agregó la subsección Informes a la matriz de acceso de roles, resolviendo un bug donde todas las filas de reportes se descartaban silenciosamente (porque tenían `hidden: true` en menu.json por razones ajenas). Implementó filtrado por permisos individuales de reporte en la galería y sidebar.

## Decisiones
- Agregar flag `excludeHidden` a `resolveMatrixRow()/resolveCategoryRow()` para controlar si excluir entradas ocultas — permite manejar reportes que necesitan `hidden: true` por convención, pero deben mostrarse en la matriz
- Crear `fetchMyReportAccess()` (backend SFMyReportAccess) — obtener permisos granulares por reporte en lugar de validar solo por ventana coarse
- Construir `REPORT_IDS_BY_GROUP` leyendo menu.json sin filtrar — fallback de acceso a reportes en sidebar necesita leer antes de que `buildMenuGroups()` elimine items ocultos
- Encabezados anidados "Informes" en ambas tablas — refleja estructura de categorías con sub-secciones de reportes
- Headers sticky en celdas `<th>` en lugar de `<thead>` — `position: sticky` en `display: table-header-group` es inconsistente entre navegadores

## Descartado
- Header sticky en RolesAccessMatrix — 6 estrategias CSS diferentes fallaron en producción con superposición visual; descartado a ETP-5435 con investigación completa

## Deuda dejada
- Compositing layer en sticky header de RolesAccessMatrix aún requiere investigación (ETP-5435)
- Overflow horizontal aceptado en viewports muy estrechos con muchas columnas

## Pendiente
- Resolver ETP-5435 (header sticky con superposición visual)
