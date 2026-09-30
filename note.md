---
task: ETP-5265
note: ETP-5265/a53bd5b8
kind: backfill
date: 2026-09-17T01:11:01.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - af79157ad4
  - 54fa8480a4
  - 0344543452
  - 19187730db
  - ca23ad0811
  - d2e86bfd96
files:
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentConfirmModal.test.js
  - e2e/tests/flows/goods-receipt-confirm-and-invoice.mocked.spec.js
  - e2e/tests/flows/goods-shipment-confirm-and-invoice.mocked.spec.js
  - tools/app-shell/src/locales/__tests__/view-labels-no-arrow.test.js
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptActions.vitest.jsx
  - artifacts/goods-receipt/custom/__tests__/GoodsReceiptActions.test.js
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.saveButtons.vitest.jsx
  - tools/app-shell/src/components/contract-ui/saveActions.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/index.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.cache.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
---

## Resumen
Se optimizó el flujo de confirmación para envíos y recibos completamente facturados, eliminando un modal intermedio e implementando un spinner en el botón (en línea con otros documentos). El busy state se extiende ahora hasta que el registro se refresque completamente.

## Decisiones
- Extraer `DraftModeConfirmButton` y hacer que `runDraftModeConfirm` aguarde `onConfirm()` dentro de un flag de busy local, permitiendo que el button muestre spinner y estado deshabilitado mientras la operación asincrónica está en vuelo.
- Usar `CustomEvent` con un objeto `detail` mutable para pasar la promise entre capas (window wiring → acciones), evitando acoplamiento directo.
- Retornar la promise de `fetchById` para que la llamante pueda aguardar el ciclo completo POST + refresh, permitiendo que el spinner se mantenga visible durante todo el proceso.
- Mantener vivos los efectos existentes (`setInvoiceResult`, `setConfirmedDocs`) para el flujo del modal, documentando la divergencia para evitar inconsistencias accidentales.

## Deuda dejada
- Los cambios son *strictly additive*: un `onConfirm` que retorna `undefined` se comporta exactamente como antes, sin impacto observable en otras ventanas. Sin embargo, esto crea una semántica implícita (undefined = fire-and-forget, promise = aguardable) que depende de la disciplina de quien implemente nuevos handlers.
- La refutación de refresh (cuando el POST falla) se silencia intencionalmente, asumiendo que `fetchById` fallos son no-confirmables. No hay visibilidad si la refetch falla silenciosamente.
