---
task: ETP-5289
note: ETP-5289/c880c4fe
kind: backfill
date: 2026-09-30T20:28:00.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 7fc0157553
  - 6942bd17d4
  - 1ef7fcd7ee
files:
  - docs/generated-custom-windows/purchase-invoice.md
  - tools/app-shell/src/components/copilot/ocr/OcrInlineUploader.jsx
  - tools/app-shell/src/components/copilot/ocr/ProductResolverPopup.jsx
  - tools/app-shell/src/components/copilot/ocr/__tests__/OcrInlineUploader.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/__tests__/ProductResolverPopup.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/__tests__/attachFile.test.js
  - tools/app-shell/src/components/copilot/ocr/__tests__/useOcrFlow.flow.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/attachFile.js
  - tools/app-shell/src/components/copilot/ocr/useOcrFlow.jsx
  - tools/app-shell/src/windows/custom/shared/OcrSidePanel.jsx
  - tools/app-shell/src/components/copilot/ocr/OcrReviewModal.jsx
  - tools/app-shell/src/components/copilot/ocr/__tests__/OcrReviewModal.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/ingest/__tests__/purchaseInvoiceDescriptor.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/ingest/purchaseInvoiceDescriptor.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/components/copilot/ocr/__tests__/ocrQuery.vitest.js
  - tools/app-shell/src/components/copilot/ocr/kinds/EntityCell.jsx
  - tools/app-shell/src/components/copilot/ocr/kinds/EntityField.jsx
  - tools/app-shell/src/components/copilot/ocr/kinds/__tests__/EntityField.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/kinds/__tests__/entityLookup.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/kinds/entityLookup.js
  - tools/app-shell/src/components/copilot/ocr/ocrDocTypes.js
  - tools/app-shell/src/components/copilot/ocr/ocrQuery.js
  - tools/app-shell/src/components/copilot/ocr/strategies.js
---

## Resumen
Se refactorizó el flujo OCR de facturas de compra migrando búsquedas de productos desde `_neoWhere` a selectores, consolidando la lógica de carga de archivos, y agregando validación de dirección del vendedor.

## Decisiones
- Eliminar `attachFile.js` y consolidar su lógica en `useOcrFlow.jsx` — simplifica la estructura al evitar un módulo dedicado con una sola responsabilidad
- Implementar `ocrQuery.js` con selectores en lugar de consultas directas — mejora testabilidad y aislamiento de la lógica de búsqueda
- Validar que el vendedor tenga dirección antes de permitir revisión OCR — evita estados inconsistentes en el flujo de ingesta

## Deuda dejada
- La consolidación de `attachFile.js` en `useOcrFlow.jsx` aumenta la complejidad del hook; no hay abstracción clara entre subflujos
- Los cambios en `ProductResolverPopup.jsx` involucran lógica de búsqueda compartida con `strategies.js` sin clara separación de responsabilidades
- Falta documentación sobre cuándo las búsquedas OCR carecen de contexto de selecciones

## Pendiente
- Validar comportamiento en escenarios donde la búsqueda inicial de vendedor falla pero luego se completa manualmente
