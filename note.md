---
task: ETP-5360
note: ETP-5360/ca130961
kind: backfill
date: 2026-09-23T21:25:37.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - b1f1f9e554
  - 6d5db5133f
  - 3f7f60d51c
  - 4058593161
  - 90ff4c8e3c
  - 9bde4fe4f8
  - ef28290e53
  - 74cf5a22c9
  - 92e823cb3f
files:
  - artifacts/physical-inventory/contract.json
  - artifacts/physical-inventory/contract.mcp.json
  - artifacts/physical-inventory/decisions.json
  - artifacts/physical-inventory/generated/web/physical-inventory/InventoryForm.jsx
  - artifacts/physical-inventory/generated/web/physical-inventory/InventoryLineForm.jsx
  - artifacts/physical-inventory/generated/web/physical-inventory/InventoryPage.jsx
  - artifacts/physical-inventory/generated/web/physical-inventory/InventoryTable.jsx
  - docs/generated-custom-windows/physical-inventory.md
  - tools/app-shell/src/windows/custom/physical-inventory/index.jsx
  - tools/app-shell/src/windows/custom/physical-inventory/__tests__/index.test.js
  - docs/ui-customization.md
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/shared/buildDocumentRowQuickActions.js
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/buildDocumentRowQuickActions.test.js
  - tools/app-shell/src/components/account/SubscriptionSection.jsx
  - tools/app-shell/src/pages/FirstStepsPage.jsx
---

## Resumen
Se implementó la funcionalidad de post/unpost en Inventario Físico con disparo automático al pasar el cursor sobre las filas, incluyendo traducción de errores y deduplicación de mensajes NotCalculatedCost.

## Decisiones
- Unpost se dispara al hover de fila, no como botón explícito — integrado en `buildDocumentRowQuickActions`
- Errores de unpost y costo se traducen localizadamente (en_US, es_ES) — usuario recibe feedback en su idioma
- NotCalculatedCost se deduplica con `sameKeyEntries` — reduce ruido en mensajes de error

## Descartado
- (No hay evidencia de alternativas rechazadas en los commits)

## Deuda dejada
- Documentación desactualizada que requirió corrección separada — sugiere falta de sincronización inicial entre código y docs
- Comentario sobre row-hover quedó obsoleto tras implementación — necesitó limpieza posterior
- Atributos data-testid faltantes mergeados desde develop — cobertura de tests incompleta en origen
- Múltiples iteraciones de test fixes (`hideMenuActions` regression) — indica validación incremental

## Pendiente
- (Todos los checks pasaron: testid, tests, regen, xml, pw-mocked, pw-integration)
