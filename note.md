---
task: ETP-4994
note: ETP-4994/ba53a0e0
kind: backfill
date: 2026-09-28T13:25:32.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 6d5e49d440
files:
  - docs/list-filters.md
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/lib/ListStateRouteGuard.jsx
  - tools/app-shell/src/lib/__tests__/ListStateRouteGuard.vitest.jsx
  - tools/app-shell/src/lib/__tests__/listViewSession.navigation.test.js
  - tools/app-shell/src/lib/listViewSession.js
---

## Resumen
Se implementó limpieza automática del estado de la cuadrícula al navegar entre ventanas. El estado se preserva en sessionStorage durante la sesión actual, pero se elimina al cambiar de ventana (primer segmento de ruta).

## Decisiones
- Usar route guard para interceptar cambios de navegación y limpiar estado
- Almacenar en sessionStorage para persistencia por sesión (no global)
- Preservar estado con F5 dentro de la misma ventana
- Documentar el comportamiento en docs/list-filters.md

## Deuda dejada
- Relación del route guard con navegación del frame izquierdo no está explícita en los cambios visibles
