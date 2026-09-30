---
task: ETP-5245
note: ETP-5245/1eb9ab4b
kind: backfill
date: 2026-09-11T04:13:32.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 0a294ae7dd
  - 4088b3d228
  - e838dea313
  - 892d681b94
  - c0085ccd04
  - c62da8ae86
  - 029d384836
  - b743024cdc
  - b00a99a8fd
  - 7eaa4d792b
  - 9a8d9d2bec
  - 866afda938
files:
  - docs/decisions-reference.md
  - docs/feedback.md
  - docs/generated-custom-windows/product.md
  - docs/ui-customization.md
  - cli/src/data-fixes/sql/20260910T120000Z__R36-costing-background-schedule.sql
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - docs/etendo-ad/tenant-remediation-knowledge.md
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.secondaryDeleteClosesPanel.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.secondaryDetailSidebar.vitest.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - artifacts/product/contract.json
  - artifacts/product/contract.mcp.json
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.linesColgroupChevron.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.secondaryLineDeleteConfirm.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/detailViewHelpers.headerRefreshOnChildWrite.vitest.js
  - tools/app-shell/src/components/contract-ui/__tests__/linesAddRowColumnAlignment.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.productCostGate.vitest.jsx
  - tools/app-shell/src/lib/linesActionSlot.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - artifacts/product/decisions.json
  - artifacts/product/generated/web/product/CostingForm.jsx
  - artifacts/product/generated/web/product/CostingTable.jsx
  - artifacts/product/generated/web/product/ProductPage.jsx
  - artifacts/product/generated/web/product/mockData.js
  - cli/src/data-fixes/sql/20260909T120000Z__R35-pricelist-isdefault.sql
  - cli/test/data-fixes-report-regression.test.js
  - docs/generated-custom-windows/amortization.md
  - tools/app-shell/src/components/InfoBanner.jsx
  - tools/app-shell/src/components/__tests__/InfoBanner.vitest.jsx
  - tools/app-shell/src/components/contract-ui/BlockingBpBanner.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/BlockingBpBanner.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.summableCurrency.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.trailingAmountColumn.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/linesDateField.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/secondaryTabAddRowDefaults.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/hooks/useSaveBlockSignal.js
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/__tests__/productCostRequirement.vitest.js
  - tools/app-shell/src/lib/__tests__/rowCurrency.vitest.js
  - tools/app-shell/src/lib/__tests__/saveBlockSignal.vitest.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/lib/productCostRequirement.js
  - tools/app-shell/src/lib/rowCurrency.js
  - tools/app-shell/src/lib/saveBlockSignal.js
  - tools/app-shell/src/locales/__tests__/etp5245-product-cost-keys.vitest.js
  - tools/app-shell/src/windows/custom/product/ProductCostBanner.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductCostBanner.vitest.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/productImportDescriptor.vitest.js
  - tools/app-shell/src/windows/custom/product/productImportDescriptor.js
  - tools/app-shell/src/windows/custom/shared/NewPaymentEntryModal.jsx
  - package-lock.json
---

## Resumen
Se implementó la pestaña de Costo en la ventana Producto con edición de costos y warning bloqueante cuando no existe. Incluye fixes en el editor inline de líneas (date fields, alineación, phantom panels) y scheduling del proceso de costing background por tenant.

## Decisiones
- Costos generados por engine se bloquean por fila via readOnlyLogic; campos system (manual, permanent, production) cambian de discarded a system para preservar valores
- Banner bloqueante no se activa durante creación de producto: necesita registro guardado para que las líneas puedan existir
- Delete de línea se verifica por entity, no por fila; filas engine-generated muestran icono de papelera pero la API rechaza con 403
- Banners dismissibles por defecto, excepto PSD2 que reemplaza el formulario
- Date fields en add row con control propio emitiendo yyyy-MM-dd; columnas amount soportan currency personalizado
- Preventivo (crear schedule en onboarding) queda en PR separado

## Descartado
- Bumping ONBOARDING_PROVISIONED_THROUGH: nuevos tenants siguen sin schedule, necesitan fix correctivo mientras que preventivo no está merged

## Deuda dejada
- Pin de core en versión alpha (preview): debe elevarse a release cuando PR en core merge y patch release se publique
- Preventivo del scheduling en onboarding está sin merge, en PR ajeno
- Banners, inline-cell dispatchers (date, currency) como módulos reutilizables pero inicialmente vinculados a Costing

## Pendiente
- Elevar core a versión release tras su merge
- Merge del preventivo de onboarding scheduling
