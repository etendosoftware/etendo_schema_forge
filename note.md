---
task: ETP-5107
note: ETP-5107/8f14bff2
kind: backfill
date: 2026-09-16T12:37:06.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - 3427e17406
  - 57932dd35b
  - 35f8afd330
  - 2723c5f2d9
  - c837c1cb70
  - 0f91094466
  - 9bf671513d
  - 742c98f27d
  - 26e09e2a10
  - 3d9537902b
  - db270d01a5
  - 64d9c2eed6
  - f962f1bd83
  - 95fa671961
  - 3495fbe11f
files:
  - docs/plans/2026-09-08-etp5107-price-input-locale-fix.md
  - e2e/tests/flows/price-input-locale.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - tools/app-shell/src/components/contract-ui/ListModalWindow.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.addLineFieldColTypeMismatch.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.clearsField.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.coveragePaths.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.etp4603Coverage.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.helpers.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.maskedAmountInput.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.minValue.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/detailViewHelpers.vitest.js
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - tools/app-shell/src/components/forms/__tests__/fields.MaskedAmountInput.vitest.jsx
  - tools/app-shell/src/components/forms/fields.jsx
  - tools/app-shell/src/lib/__tests__/parseLocaleNumber.test.js
  - tools/app-shell/src/lib/numericFieldTypes.js
  - tools/app-shell/src/lib/parseLocaleNumber.js
  - tools/app-shell/src/windows/custom/product/ProductPriceBar.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductPriceBar.updatedToken.vitest.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductPriceBar.vitest.jsx
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-goods-receipt-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-goods-shipment-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-purchase-invoice-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-sales-invoice-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-sales-quotation-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-simple-g-l-journal-lines-overlap-after.png
  - docs/plans/2026-09-13-etp5107-experimental-server-verification.md
  - e2e/tests/flows/amortization-lines-single-flight.mocked.spec.js
  - e2e/tests/flows/financial-account-new-transaction.mocked.spec.js
  - e2e/tests/flows/multi-currency-payment-modal.mocked.spec.js
  - e2e/tests/flows/sales-order-currency-rate-picker.mocked.spec.js
  - templates/reports/helpers/report-html-helpers.js
  - tools/app-shell/src/components/contract-ui/CurrencyRatePicker.jsx
  - tools/app-shell/src/components/contract-ui/EntityForm.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CurrencyRatePicker.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/EntityForm.commaDecimal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/EntityForm.deferredInput.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/EntityForm.render.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/EntityForm.vitest.jsx
  - tools/app-shell/src/lib/formatCurrency.js
  - tools/app-shell/src/lib/parseAmountInput.js
  - tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx
  - tools/app-shell/src/windows/custom/amortization/__tests__/AmortizationLinesTable.editModeAndEvents.vitest.jsx
  - tools/app-shell/src/windows/custom/amortization/__tests__/AmortizationLinesTable.vitest.jsx
  - tools/app-shell/src/windows/custom/amortization/__tests__/AmortizationLinesTable.writeQueue.vitest.jsx
  - tools/app-shell/src/windows/custom/assets/AssetsConfigPanel.jsx
  - tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx
  - tools/app-shell/src/windows/custom/financial-account/CashClose/CashCloseSidePanel.jsx
  - tools/app-shell/src/windows/custom/financial-account/CashClose/__tests__/cashCloseMath.test.js
  - tools/app-shell/src/windows/custom/financial-account/CashClose/cashCloseMath.js
  - tools/app-shell/src/windows/custom/financial-account/FundsTransferModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/ManualStatementModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/NewTransactionModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/FundsTransferModal.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/NewTransactionModal.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/statementAmount.js
  - tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx
---

## Resumen
Se unificó el manejo locale-aware de entrada y lectura de montos/cantidades en toda la aplicación, consolidando lógica dispersa en un componente `MaskedAmountInput` reutilizable. La tarea fijó siete defectos reportados por QA donde cada pantalla implementaba su propia solución, causando inconsistencias en parsing y formateo.

## Decisiones
- Adoptar `MaskedAmountInput` en todos los campos editables de montos (modales financieros, líneas de amortización, selector de tasa de cambio, etc.) en lugar de soluciones ad-hoc por pantalla
- Crear `parseLocaleNumber` como parser canónico para valores enmascarados, con fallback al parser estructural solo para valores formatados
- Implementar `parseMaskedAmount` que distingue entre entrada limpia y strings de display
- Agregar manejo de paste (`onPaste`) para importar valores como el path CSV/xlsx, diferenciando entrada de edición
- Cambiar redondeo a HALF_UP en `formatCurrency` para converger con Etendo Classic en lugar de divergir
- Retype campos Assets de 'number' a 'amount' (referencia es Amount en estructura)

## Descartado
- Migración de `components/payment/` y `NewMovementWizard/`: inaccesibles desde ETP-4500; fueron revertidos deliberadamente

## Deuda dejada
- CSV/xlsx import aún usa parser estructural; mantiene dualidad intencional
- Hallazgos de SonarQube (code smells) resueltos pero incremento en líneas de código complejo

## Pendiente
- Validación en producción post-merge de todas las rutas de montos críticas
