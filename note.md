---
task: ETP-5128
note: ETP-5128/dce2b8c2
kind: backfill
date: 2026-09-21T00:40:16.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 5d2fe7dcd4
  - 6cffb95948
  - 229f0e9a27
  - 4b256432d1
  - 47bef41170
  - c79c7ebb49
files:
  - artifacts/inventory-stock-report/template.hbs
  - artifacts/report-general-ledger/template.hbs
  - artifacts/report-trial-balance/report-contract.json
  - package-lock.json
  - package.json
  - scripts/assemble-report-server-context.sh
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/pages/ReportViewerPage.jsx
  - tools/app-shell/src/pages/__tests__/ReportViewerPage.sectionVisibility.vitest.jsx
  - tools/app-shell/src/pages/__tests__/ReportViewerPage.submitParamsStripping.vitest.jsx
  - tools/app-shell/test/report-general-ledger-open-row-and-chip-order.test.js
  - tools/app-shell/test/report-inventory-stock-grouped-cards.test.js
  - artifacts/report-journal-entries/report-contract.json
  - templates/reports/helpers/report-html-helpers.js
  - tools/app-shell/test/report-journal-entries-doc-link.test.js
  - tools/app-shell/test/report-journal-entries-doctype-i18n.test.js
  - tools/app-shell/test/report-journal-entries-show-options.test.js
  - tools/app-shell/test/report-jsreport-helpers-builder.test.js
  - artifacts/report-journal-entries/template.hbs
  - tools/app-shell/test/report-journal-entries-placeholder-safety.test.js
  - artifacts/report-trial-balance/template.hbs
  - tools/app-shell/test/report-trial-balance-account-level.test.js
---

## Resumen
Se corrigieron problemas de visibilidad de secciones, orden de componentes y enlaces en reportes. Se agregaron links desde Journal Entries a Financial Account y se mejoró UX en selectores de reportes con tooltips para texto truncado.

## Decisiones
- Blanquear parámetros ocultos a `''` en lugar de eliminarlos antes de enviar al servidor — evita que valores stale sean honrados por el backend y permite que plantillas branchen correctamente sobre claves vacías
- Usar `visibleIf` a nivel de sección para ocultamiento completo, espejando la lógica existente a nivel de campo
- Mantener solo campos `visibleIf` al blanquear submitParams — parámetros ESTÁTICOS session-auto-poblados nunca deben ser tocados
- Renderizar chip antes que valor en tarjetas agrupadas — mejora legibilidad en reportes generados

## Deuda dejada
- Script `assemble-report-server-context.sh` copiaba directorio completo como fix a drift de lista per-file (5 de 6 imports faltaban) — podría beneficiarse de control más robusto

## Pendiente
- Date range en Journal Entries marcado como required pero sin validación explícita en UI mencionada
