---
task: ETP-5472
note: ETP-5472/87687bdf
kind: backfill
date: 2026-09-28T18:53:30.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 6630d59fc2
  - 259d42e6a2
  - 0c2548571f
  - 30075d545a
files:
  - tools/app-shell/src/components/contract-ui/__tests__/AutoMatchSuggestionModal.draftStatementError.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/AutoMatchSuggestionModal.nearMatch.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ReconciliationSplitPanel.difference.vitest.jsx
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/locales/__tests__/etp5472-already-reconciled-locale-parity.vitest.js
  - tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - docs/generated-custom-windows/financial-account.md
---

## Resumen
Se agregó traducción de errores de líneas reconciliadas y soporte para reconciliaciones parciales en el panel de reconciliación. Se centralizó la lógica de traducción de errores de backend y se extrajeron componentes para reducir complejidad.

## Decisiones
- Centralizar traducción de errores en `backendErrors.js` — reutilización de lógica y mantenimiento en un solo lugar
- Extraer el toast de reconciliación a componente separado — reducir complejidad del componente principal
- Agregar traducciones en en_US, es_AR, es_ES — soporte multiidioma desde el inicio

## Descartado
- Mantener lógica de traducción incrustada en componentes — habría duplicado código y complejidad

## Deuda dejada
- Refactoring iterativo: el toast se extrajo después de implementar la feature, sugiriendo acumulación previa de complejidad en `ReconciliationSplitPanel.jsx`

## Pendiente
- Documentación de `backendErrors.js` — solo se cubre `financial-account.md`
