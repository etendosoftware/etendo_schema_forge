---
task: ETP-5240
note: ETP-5240/9d1eae51
kind: backfill
date: 2026-09-09T15:59:15.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 228cb7697b
  - b5617895fe
  - 5d35ac493e
  - dd8a91c69a
  - 5fb6d77c09
files:
  - tools/app-shell/src/layout/AppLayout.jsx
  - tools/app-shell/src/menu.json
  - tools/app-shell/src/windows/registry.js
  - tools/app-shell/src/layout/__tests__/AppLayout.vitest.jsx
  - tools/app-shell/src/windows/__tests__/registry.vitest.jsx
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - tools/app-shell/src/__tests__/runtime-routes.vitest.js
  - tools/app-shell/src/components/layout/SideMenu/__tests__/SideMenu.vitest.jsx
  - tools/app-shell/src/pages/__tests__/ReportViewerPage.vitest.jsx
  - tools/app-shell/src/pages/__tests__/SmartScanPage.vitest.jsx
  - tools/app-shell/src/windows/__tests__/navigationExpectations.js
---

## Resumen
Se introdujo un nuevo eje de control de acceso `accessWindowId` en el sistema de permisos de menú para restaurar la visibilidad de la barra lateral en vistas de reportes y Smart Scan, que fue rota por cambios anteriores que reutilizaban `windowId` (reservado para membresía real de AD_Menu).

## Decisiones
- Crear eje `accessWindowId` independiente — evita conflictos con uso existente de `windowId` para nodos AD_Menu reales
- Eximir admin/client-admin del nuevo gate — preserva privilegios administrativos sin restricciones adicionales
- Guardar el catálogo completo de navegación — centraliza y documenta expectativas de acceso en un punto único

## Deuda dejada
- Documentación en `app-shell-functional-flows.md` requiere sincronización manual con futuras modificaciones de reglas de gating
- Cobertura de tests enfocada en casos de admin y rol general; comportamiento en roles intermedios puede tener lagunas

## Pendiente
- Mantener alineación entre `navigationExpectations.js` y cambios de permisos en producción
- Considerar refactor centralizado si más ejes de control se agregan en el futuro
