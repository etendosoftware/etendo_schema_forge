---
task: ETP-5332
note: ETP-5332/5e7d8412
kind: backfill
date: 2026-09-18T13:18:32.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 7c06864311
  - 8ea580b636
  - 50f53da609
  - 0c9314a5c6
files:
  - docs/generated-custom-windows/contacts.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-order.md
  - docs/ui-customization.md
  - flags-registry.json
  - tools/app-shell/src/components/contract-ui/AddressSection.jsx
  - tools/app-shell/src/components/contract-ui/CreateContactModal.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/EntityCreationModal.jsx
  - tools/app-shell/src/components/contract-ui/FinancialSection.jsx
  - tools/app-shell/src/components/contract-ui/RecordCreateModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/AddressSection.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/CreateContactModal.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/CreateContactModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/EntityCreationModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/FinancialSection.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/RecordCreateModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/contactModalConfig.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/getBillingPatch.vitest.js
  - tools/app-shell/src/components/contract-ui/contactModalConfig.js
  - tools/app-shell/src/components/contract-ui/lookupCreateTargets.js
  - tools/app-shell/src/components/contract-ui/useCreateContactModal.jsx
  - tools/app-shell/src/components/copilot/ocr/CreateContactModalAdapter.jsx
  - tools/app-shell/src/components/copilot/ocr/ocrDocTypes.js
  - tools/app-shell/src/hooks/__tests__/useEntity-helpers.test.js
  - tools/app-shell/src/hooks/__tests__/useEntity.initialDataSeeding.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useUnsavedChangesGuard.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/hooks/useUnsavedChangesGuard.js
  - tools/app-shell/src/lib/__tests__/unsavedChanges.vitest.js
  - tools/app-shell/src/lib/defaultCountry.js
  - tools/app-shell/src/lib/unsavedChanges.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
  - e2e/tests/flows/contacts-integration.spec.js
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.etp4603Coverage.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.helpers.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/linesAddRowColumnAlignment.vitest.jsx
  - tools/app-shell/src/lib/__tests__/linesColumnWidth.test.js
  - tools/app-shell/src/lib/__tests__/linesScrollSync.vitest.js
  - tools/app-shell/src/lib/linesColumnWidth.js
  - tools/app-shell/src/lib/linesScrollSync.js
  - tools/app-shell/src/windows/custom/contacts/index.jsx
---

## Resumen
Reemplaza la ventana emergente de creación de contactos personalizada por la real, eliminando ~1972 líneas de código duplicado y desfasado. Corrige defectos de almacenamiento en filas inline dentro de popups y resuelve alineación de columnas en tablas anchas.

## Decisiones
- Reutilizar `RecordCreateModal` y `EmbeddedWindowRoute` en lugar de mantener implementación custom — reduce deuda técnica y divergencia de comportamiento
- Agregar `initialData` a `useEntity`/`DetailView` para prefilling de registros nuevos — permite seeding sin carrera con respuesta de defaults del backend
- Sincronizar scroll horizontal entre tabla header/rows y tabla add-row mediante registry compartido — resuelve falta de cálculo de anchos per-column en Chrome con `table-layout: fixed`
- Extraer lógica de scroll-sync en hook `useLinesAddRowScrollSync` — reduce complejidad cognitiva para gate de Sonar

## Defectos corregidos
- Inline add-row no guardaba al hacer click fuera en popup (tres guards en DataTable trataban cualquier dialog abierto como superpuesto)
- Inline add-row con único campo tocado y limpiado aún se guardaba (touched rastreaba edición, no valor actual)
- Escape dentro de popup cerraba todo en lugar de cancelar inline add-row primero (Radix escucha en capture phase)
- Dirección guardada se silenciaba hasta reload en ambas ventanas (caché stale de 30s en post-save refresh)

## Deuda dejada
- OCR flow ya no prefilla campos de dirección (residen en tab hijo, `initialData` no alcanza)
- Brecha de plataforma: editing de row en secondary tab acepta campo requerido en blanco
