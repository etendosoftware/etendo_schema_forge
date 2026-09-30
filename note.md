---
task: ETP-5175
note: ETP-5175/b4b858ef
kind: backfill
date: 2026-09-28T18:55:21.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - c713bfb8be
files:
  - docs/generated-custom-windows/matched-purchase-invoices.md
  - docs/generated-custom-windows/not-posted-documents.md
  - docs/i18n-guide.md
  - tools/app-shell/src/components/contract-ui/BulkDocumentAction.jsx
  - tools/app-shell/src/components/contract-ui/DetailMoreActionsMenu.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.neoActionMenu.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useBulkActionToast.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useNeoAction.vitest.js
  - tools/app-shell/src/hooks/useBulkActionToast.js
  - tools/app-shell/src/hooks/useNeoAction.js
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx
  - tools/app-shell/src/windows/custom/not-posted-documents/__tests__/NotPostedDocumentsPage.vitest.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/buildDocumentRowQuickActions.test.js
  - tools/app-shell/src/windows/custom/shared/buildDocumentRowQuickActions.js
---

## Resumen
Se implementó la renderización del error de publicación por cuenta inválida, usando la categoría de contacto del backend en lugar del texto predefinido. Se agregaron pruebas, documentación de i18n y manejo mejorado de errores en la lógica centralizada.

## Decisiones
- Componer mensajes de error con `Categoria de contacto` del backend identity en lugar de confiar en texto AD_MESSAGE_TRL predefinido
- Centralizar la lógica de manejo de errores de backend en `backendErrors.js` para consistencia
- Documentar la guía de internacionalización para implementaciones futuras

## Deuda dejada
- No hay evidencia de TODOs o atajos en los cambios; la implementación parece completa con cobertura de pruebas (vitest, integration, mocked)
