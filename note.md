---
task: ETP-5210
note: ETP-5210/7d7fba27
kind: backfill
date: 2026-09-11T11:22:24.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - c86e039e07
  - c99e185573
  - 3b57a62ed1
  - 69f9064cbf
  - f49875f5ad
  - b3d47d0d1a
  - 435a7b4ba0
  - 162128f616
  - a0a6dd0586
  - f2e144671c
  - 881f28e3af
  - 2c4c6b3bdf
  - bf190c9383
  - d5f1b0587e
  - c286cc9f2f
  - 23cd6ff2da
  - 34e9594cbe
files:
  - artifacts/simple-g-l-journal/contract.json
  - artifacts/simple-g-l-journal/contract.mcp.json
  - artifacts/simple-g-l-journal/decisions.json
  - artifacts/simple-g-l-journal/generated/web/simple-g-l-journal/GLJournalLineTable.jsx
  - docs/decisions-reference.md
  - docs/generated-custom-windows/simple-g-l-journal.md
  - artifacts/simple-g-l-journal/generated/__tests__/GLJournalTable.test.js
  - tools/app-shell/src/lib/__tests__/linesColumnWidth.test.js
  - artifacts/simple-g-l-journal/generated/web/simple-g-l-journal/GLJournalLineForm.jsx
  - artifacts/simple-g-l-journal/generated/web/simple-g-l-journal/GLJournalPage.jsx
  - artifacts/simple-g-l-journal/generated/web/simple-g-l-journal/mockData.js
  - artifacts/simple-g-l-journal/generated/web/simple-g-l-journal/GLJournalTable.jsx
  - docs/ui-customization.md
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.balanceFooter.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/detailViewHelpers.renderTotalsBlock.vitest.jsx
  - e2e/tests/flows/simple-gl-journal.mocked.spec.js
  - docs/generated-custom-windows/sales-invoice.md
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.balanceFooterAddRow.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/InlineLinesPanel.dataTableBalanceFooterCombined.vitest.jsx
  - e2e/tests/flows/lines-grid-narrow-viewport.mocked.spec.js
---

## Resumen
Se rediseñó GL Journal eliminando el campo de descripción de línea, ampliando la columna Account, y reposicionando los totales de balance debit/credit desde un panel separado a una fila alineada dentro del grid de líneas, coordinada con el formulario de agregar fila.

## Decisiones
- Eliminar campo de descripción de línea — simplificar el modelo de datos y ganar espacio visual
- Mover totales de balance a InlineLinesPanel, alineados con columnas del grid — mejorar alineación visual y mantener contexto durante edición
- Renderizar totales entre líneas guardadas y formulario add-row — preservar orden correcto durante inserción de filas
- Convertir ternarios anidados a if/else — conformidad con regla Sonar S3358

## Deuda dejada
- BalanceFooterPanel se mantiene como fallback para un futuro balanceFooter window en layout clásico (no-inlineEditable), que aún carece de equivalente column-aligned
- Sincronización de totales en DataTable requiere exportación de funciones auxiliares (renderBalanceFooterRow, buildLineCellStyle) desde InlineLinesPanel

## Pendiente
- Implementar totals row para layout clásico cuando se agregue una ventana balanceFooter que lo requiera
