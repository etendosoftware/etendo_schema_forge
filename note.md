---
task: ETP-5272
note: ETP-5272/4d4546cb
kind: backfill
date: 2026-09-14T17:47:58.000Z
authors:
  - AyelenGarcia01
agents:
sessions:
commits:
  - 94fb171086
  - 39565bd980
  - 3180fd7267
  - ad9c9ed289
  - 3397bda28f
  - 3073026759
  - 7a998115c5
  - 0d0af95f18
  - 4e185f2719
  - 693894a16e
  - 3436190f93
  - 6a3faf5bf2
  - 7d627e8f03
  - 757cd1172d
  - a31388734a
  - 9aaccafe62
  - bb0e28a020
  - a8ec3f96f7
  - d4dddb8673
  - cdc3ce0bf8
  - 463cc2b0e7
files:
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
  - tools/app-shell/src/windows/custom/shared/__tests__/sifSending.test.js
  - tools/app-shell/src/windows/custom/shared/sifSending.js
  - artifacts/sales-invoice/contract.json
  - artifacts/sales-invoice/contract.mcp.json
  - artifacts/sales-invoice/decisions.json
  - artifacts/sales-invoice/generated/web/sales-invoice/mockData.js
  - tools/app-shell/src/windows/custom/shared/SifTab.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/SifTab.vitest.jsx
  - docs/generated-custom-windows/fiscal-config.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/SiiSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/TbaiSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/VerifactuSection.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/FiscalConfigPage.serialization.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/FiscalConfigPage.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/SiiSection.test.js
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/SiiSection.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/TbaiSection.test.js
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/TbaiSection.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/VerifactuSection.test.js
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/VerifactuSection.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/useFiscalTestMode.test.js
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/useFiscalTestMode.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-config/useFiscalTestMode.js
  - artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx
  - artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceTopbar.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceTopbar.vitest.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/SalesInvoiceTopbar.jsx
  - tools/app-shell/src/windows/custom/shared/SendToSifButton.jsx
  - tools/app-shell/src/windows/custom/shared/SifSendingModal.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/SendToSifButton.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/SifSendingModal.saveBeforeSend.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/OnboardingWizard.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/OnboardingWizard.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/fiscalConfig.utils.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js
  - tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/FmOverlays.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/fm303Layouts.js
  - docs/generated-custom-windows/fiscal-models.md
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmListPage.newDeclError.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmListPageAutoCompute.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmOverlays.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.additional.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.boxMerge.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.precomputed.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.requiredFields.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.vitest.js
---

## Resumen
Tarea amplia de correcciones y mejoras en el flujo de presentación fiscal electrónica (SIF/AEAT). Se corrigió el envío de facturas tras errores de registro, se bloqueó la configuración fiscal en modo test, se implementaron sobreescrituras manuales en declaraciones modelo 303, y se restringieron sistemas fiscales por territorio.

## Decisiones
- **Fijar visibilidad del botón "Send to SIF"**: Mostrar botón cuando `aeatsiiErrorRegistral` es truthy, independientemente de `aeatsiiIssent`, para permitir reenvío tras corrección de errores de registro.
- **Remover campo de fecha de registro contable**: Eliminación completa del campo en factura de venta (contrato y UI).
- **Bloquear configuración fiscal en modo test**: Deshabilitar ediciones en FiscalConfigPage, OnboardingWizard y secciones SII/TBAI cuando está forzado el modo test.
- **Guardar cambios antes de envío SIF**: Persistir ediciones pendientes del encabezado en SifSendingModal antes de ejecutar envío.
- **Sobreescrituras manuales para valores precomputados**: Implementar override logic en cajas 303, KPI de IVA deducible e IRA, con utility compartido `fiscalModelsUtils.js`.
- **Restringir sistemas por territorio**: Filtrar opciones de AEAT/TBAI/Verifactu disponibles según territorio configurado.

## Deuda dejada
- La complejidad cognitiva del código de ruteo y validaciones se redujo parcialmente (último commit), pero `fiscalConfig.utils.js` y `FmOverlays.jsx` siguen siendo densos.
- Falta contexto de la sincronización con cambios backend en `SiiSendHandler.java` (ticket separado).
- Los tests cubren happy paths, pero el manejo de transiciones de estado en el ciclo de corrección de errores podría ser más exhaustivo.

## Pendiente
- Validación end-to-end de presentaciones con sobreescrituras manuales en ambiente de integración con AEAT.
