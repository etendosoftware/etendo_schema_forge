---
task: ETP-5229
note: ETP-5229/43f7b92c
kind: backfill
date: 2026-09-14T14:22:48.000Z
authors:
  - RubenEtendo
  - Valentin Vivaldi
agents:
sessions:
commits:
  - e8101aafc0
  - a3238bfdf4
  - 7f8a34769a
  - 7ec2f83362
  - 4946d91dc9
  - ee61e26d54
  - 082313448c
  - eecf81a85b
  - e21dc5548c
  - 4efa409d18
  - ba995231ce
  - 6556c9fc42
  - 9bcea132bf
  - b0010c6c92
files:
  - docs/generated-custom-windows/fiscal-monitor.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - tools/app-shell/src/components/related-documents/__tests__/helpers.patchById.vitest.jsx
  - tools/app-shell/src/components/related-documents/helpers.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/useFiscalMonitor.activeRow.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/useFiscalMonitor.js
  - tools/app-shell/src/windows/custom/shared/SifTab.jsx
  - tools/app-shell/src/windows/custom/shared/TaxSifModal.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/SifTab.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/TaxSifModal.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useTaxSifLineRowActions.integration.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useTaxSifLineRowActions.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/useSifFieldPatcher.js
  - tools/app-shell/src/windows/custom/shared/useTaxSifLineRowActions.jsx
  - artifacts/purchase-invoice/custom/InvoiceHeaderTable.jsx
  - artifacts/purchase-invoice/custom/__tests__/InvoiceHeaderTable.test.js
  - artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx
  - artifacts/sales-invoice/custom/__tests__/InvoiceHeaderTable.test.js
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/useFiscalStatus.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/useFiscalStatus.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/FiscalMonitorPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/VerifactuMonitorSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/VerifactuMonitorSection.cutoverDate.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/VerifactuMonitorSection.pendingStatus.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/VerifactuMonitorSection.selectedRow.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/VerifactuMonitorSection.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/buildCutoverCriteria.fieldName.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/useFiscalMonitor.verifactuCutoverDate.vitest.js
  - docs/generated-custom-windows/fiscal-models.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/fiscal-models/FmOverlays.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/FmTabContent.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmOverlays.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmOverlays.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmTabContent.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/fiscal-models.css
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.aeatFlow.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.breadcrumb.i18n.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.incidents.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.missingIaeGuard.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.receiptTab.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/FmModel349Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.receiptTab.realAttachments.vitest.jsx
  - docs/generated-custom-windows/fiscal-config.md
  - tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/TbaiMonitorSection.direction.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/TbaiMonitorSection.selectedRow.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/TbaiMonitorSection.test.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/TbaiMonitorSection.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/useFiscalMonitor.cutoverDate.vitest.js
  - e2e/tests/flows/purchase-invoice-batuz-column.mocked.spec.js
---

## Resumen
Se implementaron restricciones por fecha de cutover para los monitores fiscales (Verifactu, TBAI), se diferenciaron estados pendientes de no aplicables, y se refactorizó el badge de estado fiscal para independizarlo de la configuración. Se agregaron 1500+ líneas de tests.

## Decisiones
- Gatear monitors Verifactu y TBAI por `cutoverDate` del registro activo — reduce complejidad de configuración
- Diferenciar `not-applicable` de `pending-send` en `useFiscalStatus` — clarifica el estado real de envío fiscal
- Hacer el badge de estado fiscal config-independent — estabiliza su comportamiento
- Agregar columna `direction` a TBAI — visualización de dirección de documentos
- Extraer ternarios anidados en `useFiscalStatus` — mejora legibilidad (SonarQube S3358)

## Deuda dejada
- Migración SQL R35 (Verifactu doctype) requiere validar que no haya documentos pendientes con doctypes antigüos
- Stubs de cutover Verifactu en tests — recién deduplicados, pero siguen siendo datos hardcodeados

## Pendiente
- Validar comportamiento de modal redeseñado (FmOverlays) en flujo AEAT real
- Confirmar que el filtro de TicketBAI reflejado en ambas tablas (sales/purchase) no genera inconsistencias
