---
task: ETP-5358
note: ETP-5358/5639f34e
kind: backfill
date: 2026-09-17T01:04:41.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - d6736ae530
  - 21be8360d9
  - 858a0038da
files:
  - docs/bug-reports/2026-09-16-etp5358-preview-double-viewer.md
  - tools/app-shell/src/windows/custom/shared/GenericPreviewModal.jsx
  - tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx
  - tools/app-shell/src/windows/custom/shared/OrderPreview.jsx
  - tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/GenericPreviewModal.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useMainAttachment.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/useMainAttachment.js
  - tools/app-shell/src/windows/custom/shared/__tests__/downloadFromCachedAttachment.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/downloadFromCachedAttachment.js
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
---

## Resumen
Se eliminó el flicker en previsualizaciones PDF (invoice/order/quotation) causado por race conditions entre dos lectores concurrentes del mismo attachment, y se optimizó la fetching de blobs a demanda.

## Decisiones
- Mover el early return de autoFetch en ManagedLeftPanel para que la panel sea siempre controlada por el caller, evitando remount del PdfViewer
- Implementar fetching lazy de blobs en demand (fetchBlobUrl) vs eager en mount, reduciendo requests de red
- Deduplicar llamadas concurrentes a fetchBlobUrl() con cacheo del resultado
- Extraer lógica duplicada de resolución de descargas en downloadFromCachedAttachment() como módulo independiente

## Descartado
- Integrar downloadFromCachedAttachment() en PreviewActionButtons.jsx — rechazado porque ese módulo importa PdfViewer/pdfjs-dist, que requiere DOMMatrix global no disponible bajo jsdom

## Deuda dejada
- Los callers de downloadFromCachedAttachment() mantienen su propia lógica de fallback pdfUrl porque difiere ligeramente entre OrderPreview y QuotationPreview (guardias distintas en pdfBlob vs pdfUrl)
- Codemod de data-testid aplicado mecánicamente con cambios menores sin revisión de contexto funcional

## Verificación
- Sin flicker bajo timing adversarial
- Network optimizado: 2× GET main + 1× GET file por apertura (antes 2× GET main + 2× GET file)
- 925 archivos, 17967 tests pasados
- Quality Gate OK en Sonar
