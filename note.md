---
task: ETP-4972
note: ETP-4972/39cfd30c
kind: backfill
date: 2026-09-10T13:54:35.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - a73d72dfc8
files:
  - docs/generated-custom-windows/financial-account.md
  - docs/ui-customization.md
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.interactions.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/ImportedStatementsTab.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementsTab.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/MovementsTab.vitest.jsx
---

## Resumen
Se previene que cambios de filtro dejen filas seleccionadas en la barra de acciones en lote de vistas de lista. El cambio elimina la posibilidad de aplicar operaciones a filas ocultas tras modificar un filtro.

## Decisiones
- Limpiar selección solo en cambios de filtro, no en cambios de ordenamiento — mantener la selección durante la reordenación es el comportamiento esperado

## Alcance
Se implementó en three componentes:
- ListView (componente genérico)
- MovementsTab
- ImportedStatementsTab

## Cobertura
- Tests de regresión en cada componente (114 líneas en ListView, ampliaciones en los otros)
- Actualización de documentación de UI customization
