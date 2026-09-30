---
task: ETP-5285
note: ETP-5285/1897d1fa
kind: backfill
date: 2026-09-28T18:11:33.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - fd42f65e99
  - ed28ea545a
files:
  - artifacts/document-sequence/contract.json
  - artifacts/document-sequence/contract.mcp.json
  - artifacts/document-sequence/decisions.json
  - artifacts/document-sequence/generated/web/document-sequence/SequenceForm.jsx
  - artifacts/document-sequence/generated/web/document-sequence/SequencePage.jsx
  - artifacts/document-sequence/generated/web/document-sequence/SequenceTable.jsx
  - artifacts/document-sequence/generated/web/document-sequence/mockData.js
  - cli/src/data-fixes/sql/20260919T120000Z__R38-document-sequence-series-prefixes.sql
  - cli/test/data-fixes-r38-document-sequence-series-prefixes.test.js
  - cli/test/data-fixes-report-regression.test.js
  - cli/test/document-sequence.contract.test.js
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - docs/generated-custom-windows/document-sequence.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - docs/decisions-reference.md
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
---

## Resumen
Se redujo el modelo de documento sequence a cinco campos y cinco series mediante migración SQL y actualización de contrato. Se añadió soporte para traducción del título y breadcrumb en la interfaz.

## Decisiones
- Narrowing a cinco campos/series — simplificación del modelo de datos, reflejada en reducción significativa del contrato JSON (475 → ~150 líneas)
- Implementación via migración SQL — cambio estructurado con prefijos de series y tests de cobertura de migración
- Internacionalización del detalle — soporte multiidioma para título y breadcrumb mediante actualización de helpers

## Deuda dejada
- Cobertura de migración de datos legacy — los tests validan la migración pero no hay evidencia explícita de cómo se migraron secuencias existentes
- Documentación de onboarding — se agregaron gaps en documentación pero no hay claridad sobre su cierre

## Pendiente
- Validación en producción — confirmar que la migración no dejó datos inconsistentes
