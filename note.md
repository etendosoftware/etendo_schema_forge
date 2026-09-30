---
task: ETP-5432
note: ETP-5432/016b7bbe
kind: backfill
date: 2026-09-28T14:55:56.000Z
authors:
  - AyelenGarcia01
agents:
sessions:
commits:
  - b5d23754c9
  - f79df581d7
  - a5e39b156d
  - ef2ca73311
  - d53e4f3a51
  - b64900074b
  - 6006c9e005
  - dbd6a6e01d
  - ac71bc7729
  - 3b45611bba
  - bd5fd38106
  - 48f37d73f8
  - 31173cf0b4
  - 0316582091
  - f2a603021d
  - ca6037fb0e
  - ed68c73a10
  - 52562c581d
  - bc12bc09dd
  - 427bd18a57
  - 4ad96d57bc
  - 896600189c
  - 3d0797d4c0
  - c54570d3b5
  - 6889353d2e
files:
  - tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
  - tools/app-shell/src/windows/custom/shared/SifTab.jsx
  - tools/app-shell/src/windows/custom/shared/useSifFieldPatcher.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/components/attachments/AttachmentsTab.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/FmModel349Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/TbaiMonitorSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/FiscalMonitorPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/SiiMonitorSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/useFiscalMonitor.js
  - tools/app-shell/src/windows/custom/shared/useFiscalStatus.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/FiscalKpiCards.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/fiscal-monitor.css
  - tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js
  - tools/app-shell/src/windows/custom/shared/SendToSifButton.jsx
  - tools/app-shell/src/windows/custom/shared/sifSending.js
  - tools/app-shell/src/windows/custom/shared/useInvoicePreview.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/AeatSubmitFlow.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/AeatSubmitFlow.missingIaeGuard.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.missingIaeGuard.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.calcularPersists.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.explicitSaveSingleFlight.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.requiredFieldGate.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.iae.vitest.js
  - docs/generated-custom-windows/fiscal-models.md
  - docs/generated-custom-windows/fiscal-monitor.md
  - docs/generated-custom-windows/organization.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/useFiscalConfig.activeRow.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmListPage.test.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/FiscalKpiCards.test.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.errorReason.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.export.errorReason.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.export.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.formatAmount.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.selectedRow.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.test.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/SiiMonitorSection.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/SalesInvoiceTopbar.sifDuplicate.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/SendToSifButton.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/SifTab.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/sifSending.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/useFiscalStatus.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useInvoicePreview.vitest.jsx
  - tools/app-shell/src/components/attachments/__tests__/AttachmentsTab.vitest.jsx
  - e2e/tests/flows/fiscal-monitor.mocked.spec.js
  - e2e/tests/flows/purchase-invoice-batuz-column.mocked.spec.js
  - tools/app-shell/src/windows/custom/fiscal-monitor/__tests__/testHelpers/siiCutoverStub.js
---

## Resumen
Se implementaron diez correcciones de QA en el módulo fiscal (SII, TBAI, modelos 303/349) incluidas validaciones de cutover por fecha, conversión de banners a toasts, gateos de operaciones por estado, y correcciones de cálculos y propiedades DAL. Se eliminó el selector de período anterior en SII y se renombró terminología TicketBAI a Batuz.

## Decisiones
- Usar toasts en lugar de banners inline para alertas de IAE faltante y campos obligatorios — mejor UX de notificación
- Gatear SII/TBAI por `earliestTbaiCutoverDate` en lugar de fecha del config activo — consistencia entre componentes y visibilidad correcta pre-cutover
- Bloquear eliminación de justificantes fuera de estado draft — restricción de negocio
- Color cálido para badge "Recibida" de TBAI — diferenciación visual

## Deuda dejada
- Brecha de cutover en `getPendingSifTargets` (TBAI): sigue comparando contra `tbaisystemdate` del config activo en lugar de `earliestTbaiCutoverDate`, a diferencia de su rama SII (commit 4ad96d57b). Test fallido documenta deliberadamente esta inconsistencia
- Causa raíz del selector de período anterior SII diferida — solo ocultado, no resuelto

## Pendiente
- Alinear TBAI `getPendingSifTargets` para usar cutover más temprano, consistente con SII y `useFiscalStatus`
