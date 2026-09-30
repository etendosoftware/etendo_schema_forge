---
task: ETP-5069
note: ETP-5069/df4084cd
kind: backfill
date: 2026-09-10T18:41:11.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 6a48f4edf1
  - 5ca2e15a94
  - b4c7882f5d
  - 1c5d7e4b9d
  - 6cadd762bb
  - 5eb9a199fa
  - 30a5d8faf3
  - 7c93a4bec6
  - 5cb50b0c4c
  - 83bfec060b
files:
  - tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/shared/preview-cards/EmailsCard.jsx
  - tools/app-shell/src/lib/mockFetch.js
  - tools/app-shell/src/windows/custom/goods-shipment/GoodsShipmentPreview.jsx
  - tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx
  - tools/app-shell/src/windows/custom/shared/OrderPreview.jsx
  - tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx
  - docs/email-contracts.md
  - docs/generated-custom-windows/goods-shipment.md
  - docs/generated-custom-windows/purchase-order.md
  - docs/generated-custom-windows/sales-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/generated-custom-windows/sales-quotation.md
  - tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/__tests__/GoodsShipmentPreviewEmails.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/OrderPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/QuotationPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/__tests__/EmailsCard.vitest.jsx
  - .claude/skills/emails/SKILL.md
  - docs/architecture-overview.md
  - docs/email-inventory.md
  - docs/ops/transactional-email-security.md
  - tools/app-shell/src/windows/custom/shared/__tests__/testUtils/sendDocumentModalMock.jsx
---

## Resumen
Se implementó historial legible de envíos de email en paneles de vista previa (órdenes, cotizaciones, facturas, remisiones). Incluye callback `onSent` en SendDocumentModal para diferenciar envíos exitosos de cierres por cancelación, endpoint GET que retorna JSON parseado, UI en EmailsCard con lista sent/failed, y cobertura de tests.

## Decisiones
- Callback `onSent` separado de `onClose()` — permite que los llamadores capten el resultado (status, auditId, requestId) antes de que el modal se desmonte
- Historial legible en tabla separada (ETGO_EMAIL_SEND_LOG) del historial con hash (ETGO_Email_Safety) — mantiene garantías de privacidad/seguridad mientras expone lo necesario para auditoría
- Scope reducido a estados sent/failed en UI — simplificación respecto a mostrar todo el árbol de estados
- Mock del endpoint con envelope { result: "<JSON string>" } — evita regresiones de parseo mediante estructura idéntica al real

## Descartado
- Expandir filas con detalles de cuerpo/adjuntos — reducido a sent/failed tras scope cut

## Deuda dejada
- Sin proceso de retención/purga en ETGO_EMAIL_SEND_LOG (diferido por análisis de sizing)
- Pre-context rejections no generan fila en ninguna tabla
- Sin status DELIVERY_FAILED en el pipeline de email (gap documentado)

## Pendiente
- Implementación de política de purga cuando el análisis de sizing justifique la inversión
