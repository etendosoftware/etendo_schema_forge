---
task: ETP-5316
note: ETP-5316/497223eb
kind: backfill
date: 2026-09-21T11:32:39.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 67d5734bda
  - 3e8ac2f68b
  - 5034d7ffac
  - 2ed4429979
  - 2f3d7b0e29
  - 047d804718
  - 4a3f3c0232
  - fc19a61ed3
  - 2050727f96
  - 343a0d2308
files:
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - e2e/tests/flows/return-material-receipt.mocked.spec.js
  - e2e/tests/flows/return-to-vendor-shipment.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/RowQuickActions.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/RowQuickActions.vitest.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/index.jsx
  - tools/app-shell/src/hooks/__tests__/useBulkActionToast.vitest.jsx
  - tools/app-shell/src/hooks/useBulkActionToast.js
  - artifacts/return-material-receipt/contract.json
  - artifacts/return-material-receipt/contract.mcp.json
  - artifacts/return-material-receipt/decisions.json
  - artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptLineForm.jsx
  - artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage.jsx
  - artifacts/goods-shipment/contract.json
  - artifacts/goods-shipment/contract.mcp.json
  - artifacts/goods-shipment/decisions.json
  - artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentLineForm.jsx
  - artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentLineTable.jsx
  - artifacts/goods-shipment/generated/web/goods-shipment/mockData.js
  - artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptLineTable.jsx
  - artifacts/return-to-vendor-shipment/contract.json
  - artifacts/return-to-vendor-shipment/contract.mcp.json
  - artifacts/return-to-vendor-shipment/decisions.json
  - artifacts/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentLineTable.jsx
  - docs/generated-custom-windows/goods-shipment.md
  - e2e/tests/flows/lines-grid-narrow-viewport.mocked.spec.js
  - docs/i18n-guide.md
  - tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx
  - tools/app-shell/src/components/contract-ui/ConfirmInOutModal.jsx
  - tools/app-shell/src/hooks/useDocumentAction.js
  - tools/app-shell/src/hooks/useNeoAction.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - e2e/tests/flows/confirm-inout-message-keys.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ConfirmInOutModal.spec.jsx
  - tools/app-shell/src/hooks/__tests__/useDocumentAction.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useNeoAction.vitest.js
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/locales/__tests__/es_ES-structure.test.js
---

## Resumen
Mejoraron la experiencia de confirmación en documentos de movimiento (shipment, return) corrigiendo visibilidad de acciones, mensajes de error contextuales y editabilidad de campos, e implementaron un mapeo elegante de errores backend por AD message key para mostrar mensajes localizados en vez de core sentences numéricas.

## Decisiones
- **`show: false` verificado antes de `visibleWhen`** — fix anterior (ETP-4717/4933) nunca tomó efecto porque el config no se leía; al centralizarlo se arreglaron dos ventanas de paso
- **Error real en single-record failure, resumen genérico en multi** — user experience diferenciada: un registro fallido muestra el backend error traducido; batch mantiene contador (escala mejor)
- **Heredar visibility editable de return-to-vendor** — el campo Cant. movida ya funcionaba en return-to-vendor; consistencia entre ventanas hermanas
- **Mapeo por AD message key, no lineNo grid** — producto rechazó exponer lineNo; en su lugar, frontend mapea messageKeys que envía NEO, controlando wording propio

## Descartado
- **Exponer lineNo como columna grid** — alternativa rechazada por producto después de implementación; se revertió limpiamente

## Deuda dejada
- Entrada en BACKEND_ERROR_KEY_MAP sin locale falla silenciosamente (cae a core sentence)
- Solución alternativa para "raw line numbers in backend errors" aún en decisión (fuera de scope esta iteración)

## Pendiente
- Finalizar enfoque alternativo a lineNo grid para localizar errores backend
