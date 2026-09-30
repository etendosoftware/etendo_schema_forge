---
task: ETP-5255
note: ETP-5255/56df2e12
kind: backfill
date: 2026-09-28T12:49:08.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 0a600157a8
  - 9dec9ad52d
  - 48720b1754
  - 3c41e36aaf
  - 47f03723bc
  - b3e75ead2c
  - 75d427140d
  - e929acb0cc
  - edcc2f004e
  - 2d63a0194e
  - fb3946c1ed
  - 1727b43a85
  - ecb9f7cacc
  - b3e86b9c94
  - 494dae8608
  - ec4eb0a8cb
  - 9d11b06eb8
  - 9a1961d0e3
files:
  - tools/app-shell/src/windows/custom/contacts/ContactsFinancialPanel.jsx
  - tools/app-shell/src/windows/custom/contacts/index.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactsFinancialPanel.singleFlight.vitest.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactsFinancialPanel.test.js
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactsFinancialPanel.updatedToken.vitest.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactsFinancialPanel.vitest.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/semantic-token-usage.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - docs/generated-custom-windows/product.md
  - tools/app-shell/src/hooks/__tests__/useRecordWriteQueue.vitest.jsx
  - tools/app-shell/src/hooks/useRecordWriteQueue.js
  - tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx
  - tools/app-shell/src/windows/custom/amortization/__tests__/AmortizationLinesTable.editModeAndEvents.vitest.jsx
  - tools/app-shell/src/windows/custom/amortization/__tests__/AmortizationLinesTable.test.js
  - tools/app-shell/src/windows/custom/amortization/__tests__/AmortizationLinesTable.writeQueue.vitest.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/recordVersionAliases.vitest.js
  - tools/app-shell/src/windows/custom/contacts/recordVersionAliases.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.manualDataSingleFlight.vitest.jsx
  - tools/app-shell/src/windows/custom/product/ProductPriceBar.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductPriceBar.writeQueue.vitest.jsx
  - artifacts/purchase-order/custom/PurchaseOrderActions.jsx
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderActions.test.js
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/GeneratedPurchaseOrderActions.confirmModalLifecycle.vitest.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - docs/e2e-testing-guide.md
  - docs/plans/2026-09-10-stale-record-defect-detection-plan.md
  - e2e/tests/flows/amortization-lines-single-flight.mocked.spec.js
  - e2e/tests/flows/contacts-credit-limit-single-flight.mocked.spec.js
  - e2e/tests/flows/fiscal-303-manual-data-single-flight.mocked.spec.js
  - e2e/tests/flows/product-price-single-flight.mocked.spec.js
  - e2e/tests/flows/purchase-order-confirm-stale-token.mocked.spec.js
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js
  - e2e/tests/flows/sales-order-confirm-stale-token.mocked.spec.js
  - tools/app-shell/src/windows/custom/sales-order/__tests__/OrderCreateInvoice.confirmModalLifecycle.vitest.jsx
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/test/realApiFetch.js
  - tools/app-shell/src/test/setup.js
  - .claude/agents/workflow.md
  - CLAUDE.md
  - README.md
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.render.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
---

## Resumen
Se corrigieron conflictos de concurrencia (409 `stale_record`) en escrituras simultáneas a registros individuales. Múltiples paneles emitían PATCHes/PUTs superpuestos con tokens vencidos porque las rutas hacia el guardado no estaban sincronizadas.

## Decisiones
- Crear `useRecordWriteQueue`: hook que serializa escrituras **por registro**, no por campo o input — el token `updated` es per-registro
- Guardar contra el último valor persistido en ref (no state, que está retrasado una renderización)
- En FmModel303Page: descartar ediciones en cola después de envío de declaración — evita un PUT con token de pre-envío que no puede validarse
- En órdenes de compra/venta: recargar registro tras fallo parcial en confirmación — mantiene el modal abierto durante la recarga
- Cambiar mensaje de conflicto: deja de afirmar "otra persona editó esto" (falso) y explica ambas opciones al usuario

## Descartado
- Recargar mientras modal montado bajo `isDraft` — desmontaba el modal (silent failure completo)
- Renderizar portal desde ambos return paths — remontaba con estado perdido, re-ejecutaba documentAction

## Deuda dejada
- AmortizationLinesTable tenía `catch { /* silencioso */ }`, ahora reporta; casos de no-parallelism en specs documentados
- Token residual en 303: caché cosecha asincrónicamente, causaba 409s intermitentes raros; arreglado en core

## Pendiente
- Merge debe reemplazar pin preview de core (0.3.49) con versión release
