---
task: ETP-5429
note: ETP-5429/41694ac3
kind: backfill
date: 2026-09-24T18:47:40.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - 6607779aab
  - 795385a40b
  - 6a0e55dec3
  - de6b05d217
  - a6abc8fbfd
files:
  - .claude/skills/estimate/calibration-log.md
  - .claude/skills/estimate/points-table.md
  - artifacts/goods-receipt/custom/PurchaseReturnWizard.jsx
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - artifacts/goods-shipment/custom/ReturnWizard.jsx
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/plans/2026-09-21-etp-5178-return-popups-followup-investigation.md
  - docs/plans/2026-09-22-etp-5429-phase2-unify-return-wizards.md
  - docs/plans/2026-09-22-etp-5429-unify-import-return-lines.md
  - tools/app-shell/src/components/contract-ui/CreateReturnWizard.jsx
  - tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreateReturnWizard.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ImportLinesModal.vitest.jsx
  - tools/app-shell/src/components/import-return-lines/ImportModalFooter.jsx
  - tools/app-shell/src/components/import-return-lines/ImportReturnLinesModal.jsx
  - tools/app-shell/src/components/import-return-lines/__tests__/ImportReturnLinesModal.spec.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/ReturnWizard.vitest.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/ImportFromShipmentModal.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ImportFromShipmentModal.spec.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ImportFromReceiptModal.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/ImportFromReceiptModal.spec.jsx
  - package-lock.json
  - tools/app-shell/src/windows/custom/shared/importReturnLinesHelpers.js
  - e2e/tests/flows/purchase-invoice-import-from-receipt.mocked.spec.js
  - e2e/tests/flows/sales-invoice-import-no-reload.mocked.spec.js
---

## Resumen
Unificación de componentes de entrada de cantidad en flujos de devolución, eliminando duplicación de código y corrigiendo un bug de manejo de errores en la lectura de respuestas del backend.

## Decisiones
- Migración de `ImportReturnLinesModal.jsx` hacia `ImportLinesModal.jsx` con props opcionales, preservando consumidores de invoice-flow
- Extracción de `CreateReturnWizard.jsx` como componente unificado desde dos wizards casi idénticos
- Uso de `MaskedAmountInput` para soportar separador decimal en coma (locale español)
- Desduplicación de lógica compartida en `importReturnLinesHelpers.js`
