---
task: ETP-5133
note: ETP-5133/a89b5259
kind: backfill
date: 2026-09-21T12:56:14.000Z
authors:
  - Santiago Alaniz
agents:
sessions:
commits:
  - 5ccd07fb74
  - 0009bce4a0
  - f1e3a15e00
  - 90bcc0a133
  - cabe49211a
  - 88ecf730a9
  - a7c6495864
  - 109d1b496b
  - 9a31f3d1e4
  - 425dba8948
files:
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-goods-receipt-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-goods-receipt-lines-overlap-before.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-goods-shipment-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-goods-shipment-lines-overlap-before.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-purchase-invoice-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-purchase-invoice-lines-overlap-before.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-sales-invoice-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-sales-invoice-lines-overlap-before.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-sales-quotation-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-sales-quotation-lines-overlap-before.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-simple-g-l-journal-lines-overlap-after.png
  - artifacts/delivery-evidence/ETP-5133/ETP-5133-simple-g-l-journal-lines-overlap-before.png
  - artifacts/delivery-evidence/ETP-5133/README.md
  - e2e/tests/flows/lines-overflow-etp5133.mocked.spec.js
  - docs/ui-customization.md
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - artifacts/__tests__/etp-5133-no-truncate-artifact-wiring.test.js
  - artifacts/purchase-invoice/contract.json
  - artifacts/purchase-invoice/decisions.json
  - artifacts/purchase-invoice/generated/web/purchase-invoice/LinesTable.jsx
  - artifacts/sales-invoice/contract.json
  - artifacts/sales-invoice/decisions.json
  - artifacts/sales-invoice/generated/web/sales-invoice/LinesTable.jsx
  - docs/decisions-reference.md
  - docs/feedback.md
  - docs/generated-custom-windows/amortization.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-invoice.md
  - e2e/tests/flows/lines-add-row-overflow-hit-testing.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/DimensionsPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.dimensionsPanelHiddenFields.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.etp4603Coverage.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.growColumnWidth.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.savingSpinnerAlignment.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DimensionsPanel.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.dataTableAddRowScrollHost.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.noTruncateColumnPolicy.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/linesAddRowColumnAlignment.vitest.jsx
  - tools/app-shell/src/lib/linesScrollHost.js
  - tools/app-shell/src/locales/__tests__/etp5133-saving-line-tooltip-locale-parity.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/purchase-invoice/InvoiceLineTableCustom.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/SalesInvoiceLinesTable.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/__tests__/SalesInvoiceLinesTable.test.js
  - tools/app-shell/src/windows/custom/shared/InvoiceLinesTable.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoiceLinesTable.hiddenColumns.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoiceLinesTable.test.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - artifacts/purchase-invoice/contract.mcp.json
  - artifacts/purchase-invoice/contract.prev.json
  - artifacts/sales-invoice/contract.mcp.json
  - templates/reports/helpers/report-html-helpers.js
  - tools/app-shell/test/report-journal-entries-doctype-i18n.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.helpers.vitest.jsx
---

## Resumen
Corrigió overflow en tablas de líneas que se superponía con sidebar y paneles laterales. Implementó scroll horizontal independiente para header y body sincronizados, junto con correcciones en spinner, dimensiones, truncado y order de hooks.

## Decisiones
- Dividir wrapper de scroll en header y body independientes sincronizados por scrollLeft, para evitar que CSS overflow rompa position:sticky
- Agregar flag noTruncate en columnas clave para mostrar texto completo en lugar de ellipsis
- Usar portal para scroll-host, mejorando estructura DOM
- Cambiar prioridad de translateDocType: return-check primero, luego override (alineado con esquema_forge_core)

## Descartado
- Enfoque ETP-5332 minWidth-budget: supercedido por growColumnWidth() con ResizeObserver
- Componentes hand-written (InvoiceLinesTable.jsx, SalesInvoiceLinesTable.jsx, InvoiceLineTableCustom.jsx): nunca fueron wired via customLinesComponent

## Deuda dejada
- Portal scroll-host introdujo efectos secundarios que requirieron correcciones posteriores:
  - testid collision en hidden hideHeader cells (strict-mode Playwright)
  - Scrollbar drag interpretado como click outside en add-row
  - Hook order violation por useLinesScrollHost hoisted incorrectamente
- Sonar complexity findings requirieron múltiples extracciones de funciones (computeColFlexTotals, findDimensionsPanelColumn, computeLineCellStyle, computeRowActionColumnState)

## Pendiente
Completado. Spec de regresión cubre 6 documento tipos con antes/después.
