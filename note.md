---
task: ETP-5375
note: ETP-5375/543fed8b
kind: backfill
date: 2026-09-16T15:22:32.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - ad22d1197e
files:
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/__tests__/App.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useRoleMenu.vitest.jsx
  - tools/app-shell/src/hooks/useRoleMenu.js
  - tools/app-shell/src/lib/menuTree.js
---

## Resumen
Se añadió lógica para distinguir entre menús inaccesibles (sin permisos) y menús confirmadamente vacíos. Los cambios afectan el hook `useRoleMenu` y la estructura de árbol de menú.

## Decisiones
- Separar los estados de acceso inalcanzable vs. confirmado vacío — permite representar claramente dos condiciones distintas que probablemente antes se trataban como un único caso
