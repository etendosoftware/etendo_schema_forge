---
task: ETP-4576
note: ETP-4576/54dc28e6
kind: backfill
date: 2026-09-21T18:57:47.000Z
authors:
  - Román Magnoli
agents:
sessions:
commits:
  - 70029c90e0
  - 871672d401
  - f1b9ca5e82
  - ff855534fa
  - 8994c55720
  - 3d684fbe07
  - 2cab9facfe
  - 1c2819fb31
  - 4859c8806a
  - 12134989f1
  - 20881f927d
  - 84450e7fc6
  - 8e03461861
  - 827650d5c9
  - d982a93c11
  - 6aebb13365
  - 5b500549c2
  - 2616b45abe
  - aa2fb7eb27
  - 53f69ce30b
  - 0f540b1a61
  - 142c47a98e
  - 5b151d63dc
  - 067b25ca73
  - 476a36fd68
  - dbcfdd2cd5
  - 10ecb0858f
  - 8fb9d1a622
  - 6a59fee093
  - c1bbb5d488
  - f327c5a7eb
  - 6534d09993
  - 21637f25b8
  - e18627351f
  - d2d7968e0e
  - 6fe727997b
  - 422c92e546
  - 31eb1a9851
  - b0c0a379a8
  - fca0634ad6
  - ec6e887e8e
  - 1101e2180f
  - e4675ab8b7
  - 552a42106f
  - 2d7feea2ac
  - 17adf522be
  - bd84404c6f
  - ef90d60c44
  - 7e851110ab
  - 36bf47381f
  - a82a5b2947
  - a65c3ddde0
  - 05a215a34c
  - 4b44001fe3
  - a03b4f6d28
  - d5e00959ae
  - 55d03ebf6c
  - 48744035ad
  - cf3e9d939b
  - 1500729e13
  - e979fbd64f
  - b43ab04799
  - a50bade1a2
  - 1774781a56
  - 5598f075d0
  - 385a4b8718
  - 54ab04608d
  - 05c359d090
  - 8a33b07609
files:
  - e2e/tests/helpers/auth.js
  - tools/app-shell/src/__tests__/dualCredentialScheme.vitest.jsx
  - tools/app-shell/src/__tests__/sessionContractInvariants.test.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/DocumentPrintDrawer.jsx
  - tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx
  - tools/app-shell/src/components/copilot/ocr/OcrInlineUploader.jsx
  - tools/app-shell/src/hooks/useWidget.js
  - tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/shared/OcrSidePanel.jsx
  - tools/app-shell/src/windows/custom/shared/useMainAttachment.js
  - e2e/tests/flows/fiscal-config.mocked.spec.js
  - e2e/tests/flows/general-ledger-configuration.mocked.spec.js
  - e2e/tests/flows/onboarding-length-limits.mocked.spec.js
  - e2e/tests/flows/onboarding-logout-resume.mocked.spec.js
  - e2e/tests/flows/onboarding-validations.mocked.spec.js
  - e2e/tests/flows/onboarding.mocked.spec.js
  - e2e/tests/flows/tenant-upgrade.mocked.spec.js
  - e2e/tests/flows/user-invitation.mocked.spec.js
  - e2e/tests/flows/contacts-import-category-resolution.integration.spec.js
  - e2e/tests/flows/product-import-category-resolution.integration.spec.js
  - e2e/tests/flows/purchase-order-full-flow.integration.spec.js
  - artifacts/contacts/generated/web/contacts/BankAccountForm.jsx
  - artifacts/contacts/generated/web/contacts/CustomerAccountingForm.jsx
  - artifacts/contacts/generated/web/contacts/LocationAddressForm.jsx
  - artifacts/contacts/generated/web/contacts/VendorAccountingForm.jsx
  - artifacts/payment-term/generated/web/payment-term/HeaderForm.jsx
  - artifacts/price-list/generated/web/price-list/PriceListForm.jsx
  - artifacts/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentLineForm.jsx
  - artifacts/simple-g-l-journal/generated/web/simple-g-l-journal/GLJournalLineForm.jsx
  - tools/app-shell/src/components/GuardedNavLink.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmListPage.test.js
  - e2e/tests/flows/onboarding-invoice-readiness.spec.js
  - e2e/tests/helpers/inventory-helpers.js
  - e2e/tests/helpers/purchase-helpers.js
  - tools/app-shell/src/auth/useApiFetch.js
  - artifacts/amortization/custom/AmortizationConfirmModal.jsx
  - artifacts/financial-account/custom/__tests__/AccountsHeaderTable.test.js
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - artifacts/goods-receipt/custom/GoodsReceiptBottomPanel.jsx
  - artifacts/goods-shipment/custom/BulkInvoiceFromShipment.jsx
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - artifacts/goods-shipment/custom/GoodsShipmentBottomPanel.jsx
  - artifacts/goods-shipment/custom/ReturnWizard.jsx
  - artifacts/internal-consumption/custom/InternalConsumptionActions.jsx
  - artifacts/internal-consumption/custom/__tests__/InternalConsumptionActions.test.js
  - artifacts/payment-in/custom/ApplyToInvoices.jsx
  - artifacts/payment-in/custom/NewPaymentModal.jsx
  - artifacts/payment-in/custom/PaymentActivity.jsx
  - artifacts/payment-in/custom/PaymentActivityPanel.jsx
  - artifacts/payment-in/custom/PaymentBottomPanel.jsx
  - artifacts/payment-in/custom/PaymentSummaryCard.jsx
  - artifacts/payment-in/custom/RelatedDocuments.jsx
  - artifacts/payment-out/custom/PaymentOutBottomPanel.jsx
  - artifacts/payment-out/custom/RelatedDocuments.jsx
---

## Resumen
Migración de autenticación bearer (token en localStorage) a sesiones HTTP-only con cookies. Requirió remover guards que chequeaban token, centralizar manejo de credenciales en `apiFetch`, reescribir stubs E2E y actualizar 40 componentes custom.

## Decisiones
- **Credenciales vía `apiFetch`** — punto único de verdad en lugar de distribuir lógica de headers entre componentes
- **CSRF del backend (`GET /sws/go/session`)** — más fresco que capturar y replicar, resuelve staleness tras rotaciones de sesión
- **Stubs sin `csrfToken`** — su presencia dispara esquema cookie; mocked suite ejercita path bearer que se shipi hoy
- **Rutas genéricas al final** — `/sws/**` se resuelve LIFO en Playwright para no swallowear stubs más específicos
- **`apiAuthHeaders` async** — para obtener prueba CSRF en tiempo de request en helpers

## Descartado
- Capturar CSRF de requests previas — se invalida tras rotación de sesión
- Mantener ambos esquemas en paralelo en specs — excesiva duplicación

## Deuda dejada
- Shell autentica pero aterriza en onboarding wizard — falta al menos una señal de provisión de cuenta
- Import local en `dualCredentialScheme.vitest.jsx` apuntaba a archivo que no existe en develop
- `GuardedNavLink`: testid del codemod se pisaba con props.spread; moved before `{...rest}` pero requiere vigilancia en futuras migraciones

## Pendiente
- Completar señales de provisión para que shell reconozca cuenta aprovisionada
