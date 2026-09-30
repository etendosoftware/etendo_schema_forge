---
task: ETP-4839
note: ETP-4839/a79e4fb0
kind: backfill
date: 2026-09-09T19:23:42.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 81ef442ab4
  - 3ee648d447
  - d37ac8a01f
  - 1fa2e370a7
files:
  - artifacts/goods-receipt/contract-changelog.json
  - artifacts/goods-receipt/contract.json
  - artifacts/goods-receipt/contract.mcp.json
  - artifacts/goods-receipt/contract.prev.json
  - artifacts/goods-receipt/decisions.json
  - artifacts/goods-receipt/generated/web/goods-receipt/GoodsReceiptForm.jsx
  - artifacts/goods-receipt/generated/web/goods-receipt/GoodsReceiptPage.jsx
  - artifacts/purchase-invoice/contract.json
  - artifacts/purchase-invoice/contract.mcp.json
  - artifacts/purchase-invoice/contract.prev.json
  - artifacts/purchase-invoice/decisions.json
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx
  - docs/decisions-reference.md
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/ui-customization.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.buildSaveGate.vitest.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.completedStatuses.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.saveActions.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.saveButtons.vitest.jsx
  - tools/app-shell/src/components/contract-ui/saveActions.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity-dirty-state.test.js
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/index.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useInvoiceWindow.test.js
  - tools/app-shell/src/windows/custom/shared/useInvoiceWindow.js
  - quality-gate.config.json
---

## Resumen
Se habilitó la edición del número de documento en comprobantes de compra completados. Se refactorizó el componente DetailView para reducir complejidad cognitiva ante los controles de Sonar.

## Decisiones
- Mantener editable el campo de número de documento incluso en estados completados, en lugar de bloquearlo.
- Refactorizar DetailView extrayendo lógica de guardado a un módulo separado (saveActions.jsx) para reducir complejidad.
- Agregar pruebas exhaustivas para los flujos de guardado en estados completados (buildSaveGate, saveButtons, saveActions).

## Descartado
- Agregación de excepciones (allowlist) en quality-gate.config.json para goods-receipt orderReference, en lugar de resolver el problema subyacente.

## Deuda dejada
- La excepción agregada en quality-gate.config.json sugiere que una invariante sigue siendo técnicamente violada en goods-receipt; se exceptuó el campo en lugar de alinearlo con las reglas esperadas.
- Refactorización mínima de DetailView (39 líneas modificadas) enfocada solo en pasar el gate de Sonar; la complejidad aún podría reducirse más.

## Pendiente
No hay evidencia de trabajo incompleto. Los commits incluyen cambios de contrato regenerados, documentación actualizada, y suite de pruebas ampliada para los nuevos flujos.
