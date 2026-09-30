---
task: ETP-5424
note: ETP-5424/9c449bb5
kind: backfill
date: 2026-09-29T19:53:28.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 9f43fada32
  - 23b098ebb7
  - 638aed4d15
files:
  - tools/app-shell/src/App.jsx
  - tools/app-shell/src/components/attachments/__tests__/useAttachments.coverage.vitest.jsx
  - tools/app-shell/src/components/attachments/useAttachments.js
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/DocumentPrintDrawer.jsx
  - tools/app-shell/src/components/contract-ui/ImportLinesModal.jsx
  - tools/app-shell/src/components/contract-ui/ReportDrawer.jsx
  - tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreateInvoiceConfirmModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CurrencyRatePicker.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.lineSidebarSaveDeleteFlow.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DocumentPrintDrawer.timeout.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ImageField.behavior.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/PriceListPicker.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ReportDrawer.networkError.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.timeout.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/__tests__/attachFile.timeout.vitest.js
  - tools/app-shell/src/components/copilot/ocr/attachFile.js
  - tools/app-shell/src/components/copilot/ocr/ingest/__tests__/useBatch.timeout.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/ingest/useBatch.js
  - tools/app-shell/src/hooks/__tests__/useCsvExport.timeout.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.coverage.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.networkError.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useEntity.processTimeout.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useNeoAction.vitest.js
  - tools/app-shell/src/hooks/__tests__/useReconciliation.vitest.jsx
  - tools/app-shell/src/hooks/useCsvExport.js
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/hooks/useNeoAction.js
  - tools/app-shell/src/i18n/__tests__/errorTranslator.vitest.js
  - tools/app-shell/src/i18n/errorTranslator.js
  - tools/app-shell/src/lib/__tests__/authMethodsApi.vitest.js
  - tools/app-shell/src/locales/__tests__/etp5424-network-error-key.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/ReportViewerPage.jsx
  - tools/app-shell/src/pages/__tests__/ReportViewerPage.networkError.vitest.jsx
  - tools/app-shell/src/test/recordApiFetch.js
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
  - tools/app-shell/src/windows/custom/contacts/contactsImportDescriptor.js
  - tools/app-shell/src/windows/custom/fiscal-calendar/CloseYearConfirmModal.jsx
  - tools/app-shell/src/windows/custom/fiscal-calendar/__tests__/CloseYearConfirmModal.timeout.vitest.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/__tests__/NotPostedDocumentsPage.timeout.vitest.jsx
  - tools/app-shell/src/windows/custom/purchase-order/PurchaseOrderActions.jsx
  - tools/app-shell/src/windows/custom/purchase-order/__tests__/PurchaseOrderActions.timeout.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useMainAttachment.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/useTaxSifLineRowActions.vitest.jsx
  - CLAUDE.md
  - docs/i18n-guide.md
  - docs/request-policy.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
---

## Resumen
Se implementó un sistema centralizado de traducción de errores de red (NetworkError) en lugar de mostrar mensajes genéricos "Failed to fetch". Se agregó control granular de timeouts para diferenciar entre operaciones rápidas, lecturas largas y procesos síncronos.

## Decisiones
- Crear `errorTranslator.js` como módulo centralizado para mapear errores de red a mensajes localizados
- Excluir lecturas largas y procesos síncronos del timeout de apiFetch para evitar interrupciones innecesarias
- Mapear explícitamente TypeError de jsreport al tipo NetworkError
- Registrar el traductor desde App.jsx para disponibilidad global
- Pinear dependencias core a versión 0.3.64 para esta feature

## Descartado
No hay alternativas descartadas identificables en la evidencia.

## Deuda dejada
- AbortSignal para timeout control requiere verificación en casos edge de navegadores antiguos
- Documentación nueva en `request-policy.md` sobre políticas de manejo de timeouts debe mantenerse actualizada
- Casos específicos de jsreport podrían no estar completamente cubiertos más allá del TypeError mapeado
- Tests de timeout se agregaron pero la cobertura de integración con backends reales de jsreport es limitada

## Pendiente
- Validar comportamiento con timeouts en ambientes de producción reales con latencias variables
- Mantener sincronizado el mapeo de errores al evolucionar jsreport
