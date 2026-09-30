---
task: ETP-5300
note: ETP-5300/df8c9aed
kind: backfill
date: 2026-09-22T14:14:25.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 42532601b0
  - 5676532183
  - b2c10eccea
  - cb708f0785
files:
  - tools/app-shell/src/components/contract-ui/ReportDrawer.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ReportDrawer.vitest.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/shared/__tests__/usePurchaseOrderPdf.test.js
  - tools/app-shell/src/windows/custom/shared/usePurchaseOrderPdf.js
---

## Resumen
Se corrigió el componente ReportDrawer para regenerar la vista previa en clicks repetidos, resetear el formato por defecto al reabrir el drawer, traducir literales hardcodeados en reports (preview/PDF/Excel) y corregir etiquetas de vendor en documentos Purchase Order.

## Decisiones
- Usar `previewNonce` bumped en cada click para forzar re-render, evitando race conditions de navegación a about:blank — el efecto re-render ahora depende de este nonce.
- Resetear `activeFormat` a 'preview' en cada reopen — el drawer nunca unmount (solo togglea `open`), por lo que el estado anterior persistía.
- Crear `reportLabels` memoizado (records/filters/total/reportGeneratedBy/yes/no) e inyectarlo tanto en payload jsreport como en fallback HTML, evitando literales ingleses hardcodeados.
- Añadir overrides `purchaseOrderPdfCustomer` + nuevas i18n keys para etiquetas de vendor, separando la lógica de Purchase Order de la de Cliente.

## Deuda dejada
- La estructura de reportLabels requiere threading manual en dos rutas (jsreport y fallback HTML), lo que podría consolidarse en el futuro si se refactoriza el flujo de rendering.

## Pendiente
No hay trabajo pendiente evidente en los commits.
