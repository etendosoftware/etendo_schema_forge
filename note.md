---
task: ETP-5246
note: ETP-5246/195a47af
kind: backfill
date: 2026-09-10T15:12:52.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 4d953293a6
  - 2025b68fe4
files:
  - tools/app-shell/src/pages/__tests__/ReportViewerPage.popupSelectors.vitest.jsx
  - tools/app-shell/src/pages/ReportViewerPage.jsx
---

## Resumen
Se amplió el selector de cuentas en la página ReportViewer y se cubrió el cambio con una prueba de regresión específica para evitar redimensionamientos no intencionales.

## Decisiones
- Modificar el ancho del popup del selector de cuentas en `ReportViewerPage.jsx` — cambio visual identificado como necesario
- Crear prueba de regresión en archivo separado (`popupSelectors.vitest.jsx`) — aislar la prueba del comportamiento del selector permite validar futuros cambios sin afectar el árbol de pruebas existente
