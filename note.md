---
task: ETP-5124
note: ETP-5124/9e99f5c9
kind: backfill
date: 2026-09-16T13:57:49.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 23248d4aec
  - 0efb5d93e3
  - 6ebb012895
  - 1b6bc7f889
  - 5efd2f8c56
  - 482f303ccc
  - 3b19d99019
  - 7bcafcff84
  - 4d86c3ebf3
files:
  - artifacts/return-material-receipt/contract.json
  - artifacts/return-material-receipt/contract.mcp.json
  - artifacts/return-material-receipt/decisions.json
  - artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage.jsx
  - artifacts/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptTable.jsx
  - docs/decisions-reference.md
  - docs/generated-custom-windows/return-material-receipt.md
  - tools/app-shell/src/windows/custom/return-material-receipt/index.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/useReturnReceiptPdf.js
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/useReturnToVendorPdf.js
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/useReturnReceiptPdf.vitest.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/useReturnToVendorPdf.vitest.jsx
  - docs/document-printables.md
  - tools/app-shell/src/components/contract-ui/DocumentPrintDrawer.jsx
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - e2e/tests/flows/return-material-receipt.mocked.spec.js
  - tools/app-shell/src/windows/custom/return-material-receipt/ReturnMaterialReceiptPreview.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/ReturnMaterialReceiptPreview.vitest.jsx
  - docs/email-inventory.md
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/ReturnToVendorShipmentPreview.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/index.jsx
  - tools/app-shell/src/windows/custom/shared/PreviewActionButtons.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/PreviewActionButtons.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/buildReturnPreviewContent.test.js
  - tools/app-shell/src/windows/custom/shared/preview-cards/ReturnDocStatsPanel.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/__tests__/ReturnDocStatsPanel.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/preview-cards/buildReturnPreviewContent.jsx
  - artifacts/return-to-vendor-shipment/contract.json
  - artifacts/return-to-vendor-shipment/contract.mcp.json
  - artifacts/return-to-vendor-shipment/decisions.json
  - artifacts/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage.jsx
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/ReturnToVendorShipmentPreview.vitest.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/index.test.js
---

## Resumen
Se corrigió un error de referencia no definida (HELPERS) en los generadores de PDF para recibos de devolución, se mejoró la lógica de visibilidad del botón Print y se implementó el envío de documentos por email para Return Material Receipt y Return To Vendor Shipment, alineando estas funcionalidades con otras ventanas de documentos.

## Decisiones
- Usar `RETURN_DOC_HELPERS` ya importado en lugar de referencia global indefinida — evita ReferenceError y aprovecha imports existentes
- Mostrar Print solo cuando status es "Completado" — coherente con goods-shipment y return-to-vendor-shipment
- Excluir borradores (drafts) de multi-select print — previene envío accidental de documentos incompletos
- Mantener adiciones backward-compatible con parámetros opcionales en funciones — no rompe return-to-vendor-shipment que aún no tiene contrato de envío
- Restaurar Etendo PDF en preview — consistencia visual y funcional

## Deuda dejada
- Return-to-vendor-shipment tiene "no working send contract yet" en backend — envío de email habilitado pero funcionalidad parcial
- Comentarios stale corregidos sugieren documentation debt previo

## Pendiente
- Completar contrato backend para return-to-vendor-shipment send
- Verificar contratos de email en backend según notas en commits
