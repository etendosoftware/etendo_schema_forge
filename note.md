---
task: ETP-5310
note: ETP-5310/b790fc4f
kind: backfill
date: 2026-09-18T22:59:57.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 2478f7b3ec
files:
  - docs/functionalidad/02-capacidades-y-flujos.md
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/lib/__tests__/unauthenticatedRedirect.test.js
  - tools/app-shell/src/lib/unauthenticatedRedirect.js
---

## Resumen
Se modificó el flujo de redirección post-login: el usuario es dirigido a home en lugar de a la última ventana visitada. Se implementó mediante un nuevo módulo independiente con cobertura de tests.

## Decisiones
- Crear módulo `unauthenticatedRedirect.js` — separación de responsabilidades para la lógica de redirección
- Redireccionar a home como destino único — simplificación del comportamiento (elimina lógica de "última ventana")
- Documentar cambio en capacidades y flujos — mantener docs sincronizados
