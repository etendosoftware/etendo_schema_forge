---
task: ETP-5383
note: ETP-5383/a9e5c556
kind: backfill
date: 2026-09-24T14:07:34.000Z
authors:
  - Matias Bernal
agents:
sessions:
commits:
  - e1d4e94dcb
  - a1d097b9a9
  - 1a54377fbd
  - c563e349f7
  - 23055c73bf
  - 2ae1df2a44
files:
  - e2e/tests/flows/printable-download-purchase.integration.spec.js
  - e2e/package.json
  - e2e/tests/flows/acct-process-monitor.mocked.spec.js
  - e2e/tests/flows/amortization.integration.spec.js
  - e2e/tests/flows/amortization.mocked.spec.js
  - e2e/tests/flows/assets.integration.spec.js
  - e2e/tests/flows/assets.mocked.spec.js
  - e2e/tests/flows/attachment-preview-sync.mocked.spec.js
  - e2e/tests/flows/attachments.mocked.spec.js
  - e2e/tests/flows/boolean-defaults-tolerance.mocked.spec.js
  - e2e/tests/flows/bp-blocking-banner.mocked.spec.js
  - e2e/tests/flows/business-partner-category-accounting.mocked.spec.js
  - e2e/tests/flows/calendar.mocked.spec.js
  - e2e/tests/flows/chart-of-accounts-lock.mocked.spec.js
  - e2e/tests/flows/command-palette-etp4003.mocked.spec.js
  - e2e/tests/flows/confirm-inout-message-keys.mocked.spec.js
  - e2e/tests/flows/contacts-accounting.mocked.spec.js
  - e2e/tests/flows/contacts-bank-format-translation.mocked.spec.js
  - e2e/tests/flows/contacts-import-category-resolution.mocked.spec.js
  - e2e/tests/flows/contacts-integration.spec.js
  - e2e/tests/flows/contacts-razon-social-prefill.mocked.spec.js
  - e2e/tests/flows/copilot-agent-navigation.mocked.spec.js
  - e2e/tests/flows/cost-center-service-project-master-crud.mocked.spec.js
  - e2e/tests/flows/dashboard-period-filter.mocked.spec.js
  - e2e/tests/flows/date-defaults-tolerance.mocked.spec.js
  - e2e/tests/flows/delete-visibility.mocked.spec.js
  - e2e/tests/flows/discount-max-autocorrect.mocked.spec.js
  - e2e/tests/flows/document-posting.mocked.spec.js
  - e2e/tests/flows/environment-access-block.mocked.spec.js
  - e2e/tests/flows/financial-account-create.mocked.spec.js
  - e2e/tests/flows/financial-account-delete.mocked.spec.js
  - e2e/tests/flows/financial-account-detail.mocked.spec.js
  - e2e/tests/flows/financial-account-import-statement.mocked.spec.js
  - e2e/tests/flows/financial-accounts-page.mocked.spec.js
  - e2e/tests/flows/first-steps-onboarding.mocked.spec.js
  - e2e/tests/flows/fiscal-config.mocked.spec.js
  - e2e/tests/flows/fiscal-models-303-identification.mocked.spec.js
  - e2e/tests/flows/fiscal-monitor-etp3778.mocked.spec.js
  - e2e/tests/flows/fiscal-monitor.mocked.spec.js
  - e2e/tests/flows/general-ledger-configuration.mocked.spec.js
  - e2e/tests/flows/goods-receipt-confirm-and-invoice.mocked.spec.js
  - e2e/tests/flows/goods-shipment-billing-badge.mocked.spec.js
  - e2e/tests/flows/inline-lines-behavior.mocked.spec.js
  - e2e/tests/flows/inline-lines-description-maxlength.mocked.spec.js
  - e2e/tests/flows/inline-lines-min-value.mocked.spec.js
  - e2e/tests/flows/inline-lines-quotation.mocked.spec.js
  - e2e/tests/flows/invoice-import-order-line-fk.mocked.spec.js
  - e2e/tests/flows/invoice-preview-modal.spec.js
  - e2e/tests/flows/invoice-preview-persistence.spec.js
  - e2e/tests/flows/labels-naming.mocked.spec.js
  - e2e/tests/flows/mcp-oauth-pkce.smoke.spec.js
  - e2e/tests/flows/multi-currency-payment-modal.mocked.spec.js
  - e2e/tests/flows/navigation.spec.js
  - e2e/tests/flows/new-button-label.mocked.spec.js
  - e2e/tests/flows/no-access-screen.mocked.spec.js
  - e2e/tests/flows/not-posted-documents.mocked.spec.js
  - e2e/tests/flows/notes-save-on-blur.mocked.spec.js
  - e2e/tests/flows/onboarding-invoice-readiness.spec.js
  - e2e/tests/flows/onboarding-length-limits.mocked.spec.js
  - e2e/tests/flows/onboarding-register.integration.spec.js
---

## Resumen
Reducción de 790 a 418 tests E2E (eliminados 372), y reorganización de 133 archivos en nueve carpetas espejando la estructura del sidebar de la aplicación para permitir ejecución selectiva por dominio.

## Decisiones
- Eliminar 372 tests sin ejecución o redundantes — 39 vivían en archivos que el harness no recoge por patrón de nombre, 5 esperaban reescritura ya realizada (tenant-upgrade-cookie), 6 estaban detras de feature flags no exportadas, 99 eran duplicados, 5 debería haber interceptado red fuera de integration, 4 ya cubiertos con backend real, 3 estaban deshabilitados, 2 eran flaky y pasaron al reintentar.
- Agrupar specs en carpetas (sales 22, purchases 20, system 13, finance 12, contacts 9, products 8, inventory 6, onboarding 6, platform 21, fiscal 7, accounting 7, dashboard 2) — permite ejecutar `npx playwright test --project=mocked tests/flows/sales` en lugar de listar archivos.
- Ajustar 25 rutas de acceso (credentials, onboarding-accounts.json, evidence, test-results, neo-token scripts) un nivel más profundo; dejar rutas de screenshot sin cambios.

## Deuda dejada
- De los 372 tests removidos, 214 fueron verdicts para MOVER la cobertura, no descartar: 209 a vitest (lógica pura) y 5 a specs mocked (intercepciones de red). Esa cobertura no existe aún en ningún nivel.
- Se eliminaron 80 describe blocks vacíos y 30 archivos vacíos tras la poda.

## Pendiente
- Escribir equivalentes en vitest para los 209 tests de lógica pura.
- Escribir specs mocked para las 5 intercepciones de red.
