---
task: ETP-5196
note: ETP-5196/708f0131
kind: backfill
date: 2026-09-15T21:57:50.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 524bce701b
  - fde669dcbf
  - fea85dd599
  - 488b7bd78d
  - a0f7f59739
  - fb00ab8797
  - 71222cfcc9
  - 7d61542e0b
  - 7a07f7c318
  - 102a7bd82a
  - b65f41c0b3
  - 7f278f3ecf
  - 8adafcb2b1
  - 5bfe146e26
  - 8c79e5b5b6
  - 5967cdb2d6
  - e483da2034
files:
  - docs/generated-custom-windows/user.md
  - tools/app-shell/src/pages/roles/useRolesOverviewData.js
  - tools/app-shell/src/windows/custom/user/UserRolesTab.jsx
  - tools/app-shell/src/windows/__tests__/navigationExpectations.js
  - tools/app-shell/src/windows/custom/user/__tests__/UserRolesTab.vitest.jsx
  - tools/app-shell/src/menu.json
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - e2e/tests/flows/user-role-assignment.mocked.spec.js
  - tools/app-shell/src/lib/mockFetch.js
  - tools/app-shell/src/pages/roles/RolesAccessMatrix.jsx
---

## Resumen
Se implementó una matriz de acceso administrativo en la pestaña de Roles del usuario, con agrupamiento de categorías que coincide con la estructura del menú. Se ocultó Smart Scan del menú y se agregó etiquetado semántico a los encabezados de la matriz.

## Decisiones
- **Matriz de acceso admin en UserRolesTab** — centraliza la visualización de permisos administrativos en la pestaña existente
- **Agrupamiento por categorías** — estructura coherente entre menú y matriz, sincronizada con `menu.json`
- **Eliminar overlay de General rows** — simplifica la UI removiendo capa de interacción adicional
- **scope=row en encabezados** — mejora accesibilidad de la matriz

## Deuda dejada
- **Documentación desactualizada generalizada** — múltiples commits sucesivos para corregir referencias obsoletas a "General-rows" en: flujos funcionales, e2e specs, comentarios y claves i18n. Sugiere que la documentación automática generada se queda atrás
- **Dispersión de cambios** — referencias al mismo concepto removido (General-rows) aparecieron en mockFetch, JSDoc, locales, tests. Riesgo de nuevas referencias obsoletas si el patrón persiste

## Pendiente
- Verificar que la sincronización menu.json ↔ UserRolesTab tenga un mecanismo que evite futuros desalineamientos
