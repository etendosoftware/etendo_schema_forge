---
task: ETP-5290
note: ETP-5290/b4d40eb2
kind: backfill
date: 2026-09-11T16:30:58.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - bc0e08691c
files:
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.helpers.vitest.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
---

## Resumen
Se agregó lógica para forzar una recarga de datos desde la red después de cambios en roles de administrador. Los helpers de vista fueron extendidos y los tests correspondientes expandidos.

## Decisiones
- Implementar refetch forzado en lugar de actualización local — garantiza sincronización con estado del servidor tras cambios de permisos críticos
