---
task: ETP-5408
note: ETP-5408/3fd650dc
kind: backfill
date: 2026-09-23T14:31:09.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - f322591a55
  - 84f19f1291
  - a81013582f
files:
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - tools/app-shell/src/components/contract-ui/saveActions.jsx
  - tools/app-shell/src/windows/custom/shared/ConfirmWithCreditButtonBase.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/ConfirmWithCreditButtonBase.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/ConfirmWithCreditButtonBase.vitest.jsx
  - artifacts/return-material-receipt/contract.json
  - artifacts/return-material-receipt/contract.mcp.json
  - artifacts/return-material-receipt/decisions.json
  - artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage.jsx
  - artifacts/return-to-vendor-shipment/contract.json
  - artifacts/return-to-vendor-shipment/contract.mcp.json
  - artifacts/return-to-vendor-shipment/decisions.json
  - artifacts/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage.jsx
  - docs/decisions-reference.md
  - docs/ui-customization.md
  - e2e/tests/flows/confirm-inout-message-keys.mocked.spec.js
  - e2e/tests/flows/printable-download-purchase.integration.spec.js
  - e2e/tests/flows/purchase-order-return-rectificativa.integration.spec.js
  - e2e/tests/flows/return-material-receipt.mocked.spec.js
  - e2e/tests/flows/return-to-vendor-shipment.mocked.spec.js
  - e2e/tests/flows/sales-order-return-rectificativa.integration.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.render.vitest.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/ConfirmWithCreditButton.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/ReturnMaterialReceiptSecondaryActions.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ConfirmWithCreditButton.spec.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ReturnMaterialReceiptSecondaryActions.test.js
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/return-material-receipt/index.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ConfirmWithCreditButton.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ReturnToVendorShipmentSecondaryActions.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/ConfirmWithCreditButton.spec.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/ReturnToVendorShipmentSecondaryActions.test.js
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/index.jsx
  - tools/app-shell/src/windows/custom/shared/ReturnWindowShell.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/ReturnWindowShell.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/confirmWithCreditButtonCopyLinkTest.jsx
  - tools/app-shell/src/windows/custom/shared/useConfirmWithCredit.js
  - tools/app-shell/src/windows/custom/shared/__tests__/confirmInOutModalProbe.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/returnDraftMode.test.js
  - tools/app-shell/src/windows/custom/shared/returnDraftMode.js
---

## Resumen
Unificó el botón Confirm en dos ventanas de devolución (return-material-receipt y return-to-vendor-shipment) reemplazando componentes personalizados por el bloque genérico draftMode compartido. Eliminó duplicación de código y solucionó deficiencias visuales e i18n.

## Decisiones
- Usar el componente Button genérico compartido con icono Check en lugar de hand-rolled button — para consistencia visual y reutilización
- Renderizar ambas ventanas de devolución a través del bloque draftMode genérico — garantiza comportamiento uniforme y permite que QA validara el resultado completo (no solo visual)
- Extraer builder draftMode compartido — elimina bloque DRAFT_MODE duplicado en ambas ventanas y permite traducción de etiqueta mediante ui('confirm') en lugar de hardcodearla
- Memoizar builder por ventana — optimización para evitar recalcular en re-renders

## Descartado
- Primer enfoque (solo reemplazar botón visual) — QA rechazó porque era superficial; requería cambio arquitectónico en cómo se dispara la confirmación
- Traducción hardcodeada — i18n check bloqueaba el merge; se pasó a dinámica

## Deuda dejada
- ConfirmWithCreditButtonBase mantiene lógica compleja de escucha de eventos; podría beneficiarse de refactor futuro (nota: funciona pero acumula responsabilidades)
