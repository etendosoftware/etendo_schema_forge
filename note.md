---
task: ETP-5350
note: ETP-5350/1a17258d
kind: backfill
date: 2026-09-21T01:38:22.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 4663bbd482
  - 0746c72433
  - 16c6f1cedf
files:
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - artifacts/contacts/decisions.json
  - artifacts/contacts/generated/web/contacts/BusinessPartnerPage.jsx
  - artifacts/product/contract.json
  - artifacts/product/contract.mcp.json
  - artifacts/product/decisions.json
  - artifacts/product/generated/web/product/ProductPage.jsx
  - docs/generated-custom-windows/contacts.md
  - docs/generated-custom-windows/product.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/components/contract-ui/useWindowImportDialog.js
  - tools/app-shell/src/locales/__tests__/etp5350-fk-popover-keys.vitest.js
  - tools/app-shell/src/locales/__tests__/etp5350-template-example-keys.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/contacts/contactsFkResolvers.js
  - tools/app-shell/src/windows/custom/product/productFkResolvers.js
  - e2e/tests/flows/contacts-import-category-resolution.mocked.spec.js
  - e2e/tests/flows/contacts-razon-social-prefill.mocked.spec.js
  - e2e/tests/flows/product-import-category-resolution.integration.spec.js
  - e2e/tests/flows/product-import-category-resolution.mocked.spec.js
  - tools/app-shell/src/__tests__/tailwind-purge-guard.vitest.js
  - tools/app-shell/src/components/contract-ui/__tests__/etp5374-lookup-does-not-logout.vitest.js
  - tools/app-shell/src/components/copilot/ocr/ingest/__tests__/useBatch.vitest.jsx
  - tools/app-shell/src/components/copilot/ocr/ingest/useBatch.js
  - tools/app-shell/src/lib/__tests__/importExportColumns.vitest.js
  - tools/app-shell/src/lib/importDateCell.js
  - tools/app-shell/src/locales/__tests__/etp5350-import-transport-error-keys.vitest.js
  - tools/app-shell/src/locales/__tests__/etp5350-product-cost-import-keys.vitest.js
  - tools/app-shell/src/windows/custom/__tests__/importRowValidators.vitest.js
  - tools/app-shell/src/windows/custom/__tests__/importTemplateRoundTrip.vitest.js
  - tools/app-shell/src/windows/custom/contacts/ContactTypeToggle.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactTypeToggle.test.js
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactTypeToggle.vitest.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/contactsImportDescriptor.vitest.js
  - tools/app-shell/src/windows/custom/contacts/contactsImportDescriptor.js
  - tools/app-shell/src/windows/custom/financial-account/statementDate.js
  - tools/app-shell/src/windows/custom/product/__tests__/productImportDescriptor.vitest.js
  - tools/app-shell/src/windows/custom/product/productImportDescriptor.js
---

## Resumen
Se mejoró la lectura de importaciones de contactos y productos en múltiples idiomas de Active Directory mediante consolidación de lógica, validaciones de fecha y abstracción de helpers de traducción fallback.

## Decisiones
- Crear descriptores de importación separados (contactsImportDescriptor, productImportDescriptor) — aislar la lógica específica de cada dominio
- Extraer helpers de traducción fallback como módulo — reutilizar fallback logic sin duplicación
- Agregar validaciones de celda de fecha (importDateCell.js) — manejar casos de error de transporte e importación de costos

## Descartado
- No hay alternativas explícitas descartadas en la evidencia

## Deuda dejada
- Nuevos tests vitest específicos de ETP-5350 (etp5350-fk-popover-keys, etp5350-template-example-keys, etp5350-import-transport-error-keys, etp5350-product-cost-import-keys) acumulan comportamiento de casos de uso; podrían necesitar generalización posterior
- ContactTypeToggle fue refactorizado extensamente (96 líneas modificadas) pero los tests previos se redujeron de 448 a 38 líneas de Vitest; verificar cobertura
- statementDate.js se redujo de 80 a modo no especificado — confirmar que la lógica se migró

## Pendiente
- Revisión de cobertura en ContactTypeToggle tras cambio de framework de tests
