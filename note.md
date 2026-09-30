---
task: ETP-5132
note: ETP-5132/57d8571b
kind: backfill
date: 2026-09-09T22:23:02.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - 9ee19365d8
  - 2af8b82bc8
  - fd7a9490b3
  - 1a08eaf1fa
  - 0f7a752873
files:
  - docs/bug-reports/2026-09-08-etp5132-negative-quantity-discount.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - docs/plans/2026-05-03-discount-feature-status.md
  - tools/app-shell/src/components/contract-ui/DocumentTotalsPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DocumentTotalsPanel.vitest.jsx
  - tools/app-shell/src/lib/__tests__/documentTotals.test.js
  - tools/app-shell/src/lib/__tests__/formatCurrency.test.js
  - tools/app-shell/src/lib/formatCurrency.js
  - tools/app-shell/src/windows/custom/shared/__tests__/documentPdf.buildOrderData.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/documentPdfHelpers.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useInvoicePdf.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/useOrderPdf.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/usePurchaseOrderPdf.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/useQuotationPdf.test.js
  - tools/app-shell/src/windows/custom/shared/documentPdf.js
  - tools/app-shell/src/windows/custom/shared/useInvoicePdf.js
  - tools/app-shell/src/windows/custom/shared/useQuotationPdf.js
  - artifacts/purchase-order/custom/PurchaseOrderActions.jsx
  - artifacts/sales-order/custom/OrderConfirmModal.jsx
  - artifacts/sales-order/custom/OrderCreateInvoice.jsx
  - artifacts/sales-quotation/custom/SendToEvaluationModal.jsx
  - docs/bug-reports/2026-09-09-etp5132-confirm-modal-double-discount.md
  - docs/plans/2026-09-09-etp5132-consolidated-test-plan.md
  - artifacts/purchase-order/custom/__tests__/PurchaseOrderActions.test.js
  - artifacts/sales-order/custom/__tests__/OrderCreateInvoice.test.js
  - artifacts/sales-quotation/custom/__tests__/SendToEvaluationModal.test.js
  - e2e/tests/flows/sales-invoice-discount-display.mocked.spec.js
  - e2e/tests/flows/sales-order-totals-rounding.mocked.spec.js
  - e2e/tests/flows/sales-quotation-etp4006.mocked.spec.js
---

## Resumen
Se corrigieron dos bugs en cálculo y presentación de descuentos: líneas con cantidad negativa (devoluciones) mostraban 0,00€ de descuento en UI y PDF, y modales de confirmación reaplicaban descuentos totales ya compensados en backend. Se actualizaron pruebas y fixtures asociadas.

## Decisiones
- Cambiar gate de `>0` a `!==0` para mostrar descuentos negativos válidos
- Sign-flipar valor para display (`-discountAmt`) para presentarlo como positivo pese a cálculo negativo
- Arreglar `-0,00€` en formatter mediante guard en `groupWithSeparators`
- Usar `grossBase` directo sin replicar descuento en modales (ya compensado por ETP-4029)
- Consolidar test de sign-flip en `documentPdfHelpers.vitest.jsx` para evitar duplicación

## Deuda dejada
- Ventanas generadas en documentación se actualizaron, pero pudo quedar inconsistencia en otras referencias obsoletas

## Pendiente
- Verificación cruzada con otros sitios que clampen o esconden descuentos por condiciones obsoletas
