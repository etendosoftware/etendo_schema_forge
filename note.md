---
task: ETP-5273
note: ETP-5273/43aa5784
kind: backfill
date: 2026-09-24T11:10:28.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - ef51e92db8
  - 62001d054e
  - f9876ba808
  - 71d815f09d
  - f8a8f95be8
files:
  - artifacts/purchase-invoice/contract.json
  - artifacts/purchase-invoice/contract.mcp.json
  - artifacts/purchase-invoice/contract.prev.json
  - artifacts/purchase-invoice/decisions.json
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/mockData.js
  - artifacts/sales-invoice/contract.json
  - artifacts/sales-invoice/contract.mcp.json
  - artifacts/sales-invoice/decisions.json
  - artifacts/sales-invoice/generated/web/sales-invoice/HeaderForm.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/mockData.js
  - docs/feedback.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/neo-headless-extensibility.md
  - docs/plans/completed/2026-09-11/etp-5273-fecha-contable-independiente-plan.md
  - e2e/tests/flows/invoice-accounting-date.mocked.spec.js
  - e2e/tests/flows/purchase-invoice-import-from-receipt.mocked.spec.js
  - e2e/tests/flows/rectificaciones-tab.mocked.spec.js
  - e2e/tests/flows/sales-invoice-import-no-reload.mocked.spec.js
  - e2e/tests/flows/sif-exemption-cause.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - tools/app-shell/src/windows/custom/__tests__/draft-mode-allowlist-sync.test.js
  - tools/app-shell/src/windows/custom/purchase-invoice/index.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/index.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/BasicDiscountsForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/ExchangeRatesForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/LinesForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/ReversedInvoicesForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/TaxForm.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/ExchangeRatesForm.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/LinesForm.jsx
  - artifacts/sales-invoice/generated/web/sales-invoice/ReversedInvoicesForm.jsx
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - artifacts/amortization/contract.json
  - artifacts/amortization/contract.mcp.json
  - artifacts/amortization/generated/web/amortization/HeaderForm.jsx
  - artifacts/amortization/generated/web/amortization/LinesForm.jsx
  - artifacts/conversion-rates/contract.json
  - artifacts/conversion-rates/contract.mcp.json
  - artifacts/conversion-rates/generated/web/conversion-rates/ConversionRateForm.jsx
  - artifacts/financial-account/contract.json
  - artifacts/financial-account/contract.mcp.json
  - artifacts/financial-account/generated/web/financial-account/ImportedBankStatementsForm.jsx
  - artifacts/financial-account/generated/web/financial-account/ReconciliationsForm.jsx
  - artifacts/financial-account/generated/web/financial-account/TransactionForm.jsx
  - artifacts/goods-movements/contract.json
  - artifacts/goods-movements/contract.mcp.json
  - artifacts/goods-movements/generated/web/goods-movements/MovementForm.jsx
  - artifacts/goods-movements/generated/web/goods-movements/MovementLineForm.jsx
  - artifacts/goods-receipt/__tests__/contract-integrity.test.js
  - artifacts/goods-receipt/contract-changelog.json
  - artifacts/goods-receipt/contract.json
  - artifacts/goods-receipt/contract.mcp.json
---

## Resumen
Se agregó el campo independiente `accountingDate` (Fecha contable) a Sales Invoice y Purchase Invoice, editable por separado de `invoiceDate` con sincronización unidireccional desde el sistema clásico. Se corrigieron dos issues latentes: un bug de cascada en campos editados manualmente (ETP-3836) y un issue de sincronización entre configuración declarativa y hardcoding que impedía guardar en documentos completados.

## Decisiones
- Reducir scope a solo facturas en lugar de 6 ventanas (órdenes, envíos, recepciones) — alineación con requerimientos actualizados
- One-way sync invoiceDate → accountingDate — evita conflictos bidireccionales
- Campo read-only cuando posted, editable cuando unposted — consistente con invoiceDate
- Crear test guardarrail (draft-mode-allowlist-sync.test.js) — prevenir divergencia futura entre decisions.json y hardcodes en index.jsx

## Descartado
- Expandir a 6 ventanas — scope reducido por cambio en requerimientos del ticket

## Deuda dejada
- Hardcoding de keepSaveWhenCompletedFields en custom/*/index.jsx coexiste con declaración en decisions.json — protegido por test pero el patrón de duplicación permanece
- Bump a core 0.3.61 para fijar boolean-vs-raw-string en readOnlyLogic — cambio upstream sin refactor defensivo local
