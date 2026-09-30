---
task: ETP-5388
note: ETP-5388/8f7cb52b
kind: backfill
date: 2026-09-22T13:11:41.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 3caf024cb5
  - 1d49fa3ad4
  - 639eee17db
  - 71f6eb4023
  - b8170d4117
files:
  - artifacts/financial-account/custom/AccountsHeaderTable.jsx
  - artifacts/financial-account/custom/__tests__/AccountsHeaderTable.test.js
  - docs/generated-custom-windows/financial-account.md
  - docs/ui-customization.md
  - e2e/tests/flows/financial-account-detail.mocked.spec.js
  - e2e/tests/flows/financial-accounts-page.mocked.spec.js
  - package-lock.json
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/financial-accounts/AccountRowActions.jsx
  - tools/app-shell/src/components/financial-accounts/AccountsTable/__tests__/accountColumns.vitest.jsx
  - tools/app-shell/src/components/financial-accounts/AccountsTable/accountColumns.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementsTable.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.handlers.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/AccountsHeaderTable.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/MovementsTable.vitest.jsx
  - e2e/tests/flows/financial-account-delete.mocked.spec.js
  - e2e/tests/helpers/financial-account-helpers.js
  - tools/app-shell/src/windows/custom/financial-account/__tests__/testUtils/dataTableStubQuickActionsCell.jsx
---

## Resumen
Se corrigió el truncamiento de nombres de cuentas con tooltips, la sombra de hover elevada recortada en la última fila, y los problemas de interacción e2e con celdas sticky. Se refactorizó DataTable para soportar acciones personalizadas y se mejoraron las pruebas.

## Decisiones
- Usar `TruncatedText` reutilizable en todas las celdas truncables (cuenta, documento, contacto, descripción, tipo transacción, GL)
- Cambiar a `position: sticky` con `fixed` table layout para limites de clipping reales
- Agregar extensión `rowQuickActions` a DataTable para inyectar contenido personalizado en la celda de acciones en lugar de agregar columna sintética
- Aplicar padding-bottom al div interno de DataTable (no al wrapper externo) para que la sombra elevada tenga espacio real
- Crear `openAccountRowMenu()` helper e2e que scroll antes del click para evitar limitaciones de Playwright con sticky elements
- Extraer stub duplicado de quick-actions cell a `testUtils/dataTableStubQuickActionsCell.jsx`

## Descartado
- No replicar solución incompleta de single-wrapper para padding (actualizada en docs)
