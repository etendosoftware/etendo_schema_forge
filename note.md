---
task: ETP-5046
note: ETP-5046/9509a7f3
kind: backfill
date: 2026-09-27T23:22:33.000Z
authors:
  - Martin Taal
agents:
sessions:
commits:
  - fe23e1137d
  - ef42e7702b
  - 6fb2aa6f1a
  - 73b8315de0
  - 952c44874a
  - 1d849e2348
  - 9e6da98ac0
  - af47d35f4c
  - b2a6fb8371
  - 2f486d2a29
  - d319efa5e0
  - 7619f7a413
  - 307fed92f1
  - 4c5cddfea0
  - 59691b499d
  - 4c59a20dcd
  - b7516ea005
  - e3c3b37c24
  - a0223bda6b
  - c09fc1e69b
  - eb6de01c3e
  - a5016f476f
  - 09528c68f1
  - a8a3bfa2f1
  - 03f608b28e
  - 691322903b
files:
  - cli/src/data-fixes/sql/20260918T120000Z__R37-tenant-subscription-backfill.sql
  - cli/test/data-fixes-r37-tenant-subscription-backfill.test.js
  - cli/test/data-fixes-report-regression.test.js
  - docs/etendo-ad/onboarding-gaps.md
  - docs/paid-tenant-infrastructure.md
  - tools/app-shell/src/lib/__tests__/upgrade-api.test.js
  - tools/app-shell/src/lib/upgrade/api.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/UpgradePage.jsx
  - tools/app-shell/src/pages/__tests__/UpgradePage.vitest.jsx
  - run-sonar.sh
  - docs/stripe-local-testing.md
  - docs/plans/2026-09-08-tbai-status-computed-column-migration.md
  - tools/app-shell/src/lib/__tests__/dateOnly.test.js
  - tools/app-shell/src/lib/dateOnly.js
  - tools/app-shell/src/windows/custom/shared/__tests__/sifAdoptionDateTimezone.test.js
  - tools/app-shell/src/windows/custom/shared/fiscalTargets.js
  - tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/NewPaymentEntryModal.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentPreviewEmails.vitest.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ReturnMaterialReceiptPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/ReturnToVendorShipmentPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreviewModal.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/__tests__/PaymentsCard.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/__tests__/SummaryCard.vitest.jsx
  - cli/src/data-fixes/sql/20260924T150000Z__R37-tenant-subscription-backfill.sql
  - docs/plans/2026-08-27-recurring-billing-and-resource-limits-prd.md
  - cli/test/data-fixes-catalog-ordering.test.js
  - .claude/agents/tenant-fixer.md
  - cli/src/data-fixes/sql/README.md
  - docs/functionalidad/02-capacidades-y-flujos.md
  - docs/functionalidad/04-matriz-de-pruebas-funcionales.md
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - tools/stripe-subscription-past-due.sh
  - e2e/tests/flows/onboarding-logout-resume.mocked.spec.js
  - e2e/tests/flows/tenant-upgrade-cookie.mocked.spec.js
---

## Resumen

Se implementó el flujo de suscripción por plan: el cliente elige un plan antes del checkout, y el servidor requiere planKey en cada compra. Se migró (R37) suscripciones de tenants productivos al plan legado grandfathered, copiando IDs de Stripe de solicitudes de checkout anteriores. Se corrigieron bugs de timezone en lecturas de wall clock local.

## Decisiones

- **Enviar planKey como key, no price id**: el endpoint proyecta solo seis campos, impidiendo que price ids lleguen al navegador y se regresen sin revisión.
- **Guard de aborto en R37**: lanza error (FAILED + reintentos) en lugar de insertar nada cuando falta la fila de plan, evitando que falle silenciosamente y se pierda el tenant.
- **Watermark de fecha estricta**: previene que futuras ejecuciones reordenen R31/R32, que leerían la preferencia directamente e forzarían modo test en tenants pagos.
- **Wall clock literal en timezone checks**: elimina desajustes entre timezones (true en UTC, false en UTC+). Ahora consistente con la columna computada SQL.

## Deuda dejada

- Página de upgrade muestra radio list simple para múltiples planes; ETP-5049 lo reemplazará.
- Script de Stripe para past-due quedó con gap que se corrigió después.
- Catalogo de planes duplica precio en dos lugares (marketing card + checkout); necesita refactor unitario.

## Pendiente

- ETP-5049: mejorar UI del selector de planes.
