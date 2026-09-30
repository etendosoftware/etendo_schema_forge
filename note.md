---
task: ETP-5281
note: ETP-5281/23fe2072
kind: backfill
date: 2026-09-16T14:10:09.000Z
authors:
  - Santiago Alaniz
agents:
sessions:
commits:
  - 340fb593b9
  - d410779ed5
  - c8142af3ac
  - 1002a75780
  - 9caab7008c
  - 0ced5652de
  - 23343b3c24
  - 2d3fd61878
  - cf02c24b38
files:
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx
  - tools/app-shell/src/components/financial-accounts/SortableHeaderLabel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.numericHeaderAlignment.test.js
  - docs/feedback.md
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.columnChrome.vitest.jsx
  - artifacts/financial-account/custom/AccountsHeaderTable.jsx
  - e2e/tests/flows/financial-account-delete.mocked.spec.js
  - e2e/tests/flows/financial-account-detail.mocked.spec.js
  - e2e/tests/flows/financial-accounts-page.mocked.spec.js
---

## Resumen
Se implementó truncación de texto y ancho mínimo de columnas en el DataTable (modo lista), con refactorización de código duplicado en headers y fixes para ocultamiento de kebab actions.

## Decisiones
- Refactorizar duplicidad en header-cell logic antes de aplicar minWidth y truncación, para reducir complejidad
- Documentar flake pre-existente en sort-column-width en lugar de resolverlo (feedback.md)
- Re-habilitar tests de row-kebab tras corregir escape de overflow en pending-count cell
- Cubrir casos adicionales (filas con 0-pending, archivadas) con tests basado en feedback de QA

## Deuda dejada
- Test flake en sort-column-width documentado pero sin resolver
- Pending-count cell usa escape de overflow como workaround, no eliminación de causa raíz

## Pendiente
- Resolver el test flake de sort-column-width
