---
task: ETP-5435
note: ETP-5435/e275e648
kind: backfill
date: 2026-09-22T14:31:38.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - a1f3c8a88b
  - c096c78e51
files:
  - tools/app-shell/src/pages/RolesOverviewPage.jsx
  - tools/app-shell/src/pages/roles/RolesAccessMatrix.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
---

## Resumen
Se corrigieron dos problemas visuales en la matriz de acceso de roles: el comportamiento fantasmal del header sticky y el truncamiento incorrecto de celdas que no respetaba el ancho configurado en `col.grow`.

## Decisiones
- Ajustar el comportamiento del header sticky en `RolesAccessMatrix` — elimina el ghosting visual
- Modificar la lógica de truncamiento en `DataTable.cellRenderers` — respeta el ancho definido por `col.grow` en celdas de lista predeterminadas
