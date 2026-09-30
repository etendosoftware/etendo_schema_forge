---
task: ETP-5323
note: ETP-5323/d09d3657
kind: backfill
date: 2026-09-16T11:38:24.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 13e8ecc2ad
  - a693e938bd
  - 5563531dda
  - a6129f91b9
  - 12fb832ee6
files:
  - artifacts/purchase-invoice/generated/web/purchase-invoice/AccountingForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/BatuzForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/ExchangeRatesForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/ExchangeRatesTable.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderTable.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/IntrastatForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/LinesForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/LinesTable.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/PaymentPlanForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/SiiDataForm.jsx
  - artifacts/purchase-order/generated/web/purchase-order/HeaderForm.jsx
  - artifacts/purchase-order/generated/web/purchase-order/HeaderTable.jsx
  - artifacts/purchase-order/generated/web/purchase-order/LinesForm.jsx
  - artifacts/purchase-order/generated/web/purchase-order/LinesTable.jsx
  - artifacts/purchase-order/generated/web/purchase-order/PaymentDetailsForm.jsx
  - artifacts/purchase-order/generated/web/purchase-order/ReservedStockForm.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/ExchangeRatesForm.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/ExchangeRatesTable.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/HeaderForm.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/HeaderTable.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/LinesForm.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/LinesTable.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/PaymentPlanForm.jsx
  - artifacts/sales-order/generated/web/sales-order/HeaderForm.jsx
  - artifacts/sales-order/generated/web/sales-order/HeaderTable.jsx
  - artifacts/sales-order/generated/web/sales-order/LinesForm.jsx
  - artifacts/sales-order/generated/web/sales-order/LinesTable.jsx
  - artifacts/sales-quotation/generated/web/sales-quotation/QuotationForm.jsx
  - artifacts/sales-quotation/generated/web/sales-quotation/QuotationLineForm.jsx
  - artifacts/sales-quotation/generated/web/sales-quotation/QuotationLineTable.jsx
  - artifacts/sales-quotation/generated/web/sales-quotation/QuotationTable.jsx
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - tools/app-shell/src/lib/backendErrors.js
  - e2e/tests/flows/inline-lines-description-maxlength.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.addRowMaxLength.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.maxLength.vitest.jsx
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - artifacts/amortization/generated/web/amortization/HeaderForm.jsx
  - artifacts/amortization/generated/web/amortization/HeaderTable.jsx
  - artifacts/asset-group/generated/web/asset-group/AssetCategoryForm.jsx
  - artifacts/asset-group/generated/web/asset-group/AssetCategoryTable.jsx
  - artifacts/assets/generated/web/assets/AssetsTable.jsx
  - artifacts/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryForm.jsx
  - artifacts/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryTable.jsx
  - artifacts/chart-of-accounts/generated/web/chart-of-accounts/ElementValueForm.jsx
  - artifacts/chart-of-accounts/generated/web/chart-of-accounts/ElementValueTable.jsx
  - artifacts/contacts/generated/web/contacts/BankAccountForm.jsx
  - artifacts/contacts/generated/web/contacts/BankAccountTable.jsx
  - artifacts/contacts/generated/web/contacts/BusinessPartnerForm.jsx
  - artifacts/contacts/generated/web/contacts/BusinessPartnerTable.jsx
  - artifacts/contacts/generated/web/contacts/ContactForm.jsx
  - artifacts/contacts/generated/web/contacts/ContactTable.jsx
  - artifacts/contacts/generated/web/contacts/CustomerForm.jsx
  - artifacts/contacts/generated/web/contacts/LocationAddressForm.jsx
---

## Resumen
Se implementó validación de maxLength para campos Description y traducción de errores 400 del backend. Se refactorizó el manejador de errores para reducir complejidad ciclomática y se agregaron tests de regresión.

## Decisiones
- Extraer helper `response.errors` en `backendErrors.js` — reducir complejidad ciclomática (regla S3776) y reutilizar lógica
- Traducir errores HTTP 400 en UI — mejorar experiencia de usuario
- Regenerar ~126 componentes — propagar cambios de maxLength en core a todos los artifacts

## Deuda dejada
- Fix post-merge necesario para Phone maxLength (commit final) sugiere sincronización incompleta entre ramas durante regeneración
