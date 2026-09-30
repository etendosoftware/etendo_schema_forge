---
task: ETP-5242
note: ETP-5242/c1430b20
kind: backfill
date: 2026-09-25T19:47:49.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 22a611f559
files:
  - artifacts/financial-account/custom/AccountsHeaderTable.jsx
  - artifacts/financial-account/custom/__tests__/AccountsHeaderTable.test.js
  - docs/generated-custom-windows/financial-account.md
  - tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ReconciliationSplitPanel.sort.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/reconciliationSort.vitest.js
  - tools/app-shell/src/components/contract-ui/reconciliationSort.js
  - tools/app-shell/src/components/financial-accounts/AccountsTable/__tests__/accountColumns.vitest.jsx
  - tools/app-shell/src/components/financial-accounts/AccountsTable/accountColumns.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.vitest.jsx
---

## Resumen
Se implementó ordenamiento client-side en la reconciliación y se redimensionó la tabla de cuentas con ancho fijo por columna y distribución proporcional de espacio extra, mejorando la usabilidad en ventanas estrechas.

## Decisiones
- Sorting client-side en reconciliación mediante `SortableHeaderLabel` + `useClientSort`: permite feedback inmediato del usuario
- Fechas se ordenan con `parseCalendarDate`; montos por equivalente en account-currency; Progreso por ratio reconciliado
- Selección de columna sobrescribe pin automático
- Cada columna de cuentas declara ancho explícitamente; el grid establece un piso de `min-width` y distribuye espacio extra proporcionalmente
- Ventanas estrechas generan scroll horizontal en lugar de comprimir columnas
- Se añadió `TruncatedText` para nombres truncados y celdas largas (Country, IBAN); badge offline se ajusta bajo el nombre

## Deuda dejada
- Ancho de columnas declarado manualmente en cada campo; cambios globales requieren actualización distribuida
- 502 líneas de tests de sort y 336 líneas de tests vitest sugieren alta complejidad en la lógica de ordenamiento; mantenibilidad del código depende de cobertura de tests

## Pendiente
- Revisión/validación de comportamiento en viewports muy estrechos
