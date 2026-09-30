---
task: ETP-5239
note: ETP-5239/9a798377
kind: backfill
date: 2026-09-09T18:35:04.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - 7ebd5b3d91
files:
  - tools/app-shell/src/components/layout/TopBar/TopBar.jsx
---

## Resumen
Se removieron los botones de suma (+) y notificaciones (campana) de la barra superior del TopBar, simplificando la interfaz. Los cambios pasaron la suite completa de tests.

## Decisiones
- Eliminar directamente en lugar de ocultar con condicionales — mantiene el código limpio sin opciones no utilizadas
