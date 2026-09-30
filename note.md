---
task: ETP-4954
note: ETP-4954/c9c82207
kind: backfill
date: 2026-09-15T15:36:36.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 972b26a36e
  - d5c370b4f3
  - 22f6a56534
  - d9dcdc8cea
  - 9d3033fb4d
  - 24e64e2bbe
  - 63bd85db84
  - 1479412ff4
  - bed916f322
  - 8745b40c36
  - 6b6ee0b803
  - 0849a2a132
files:
  - docs/generated-custom-windows/financial-account.md
  - tools/app-shell/src/components/attachments/useAttachments.js
  - tools/app-shell/src/lib/formatBytes.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/__tests__/importRowValidators.vitest.js
  - tools/app-shell/src/windows/custom/__tests__/importTemplateRoundTrip.vitest.js
  - tools/app-shell/src/windows/custom/financial-account/ImportStatementModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/ManualStatementModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportStatementModal.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ManualStatementModal.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/bankStatementImportPipeline.vitest.js
  - tools/app-shell/src/windows/custom/financial-account/__tests__/statementAmount.vitest.js
  - tools/app-shell/src/windows/custom/financial-account/__tests__/statementDate.vitest.js
  - tools/app-shell/src/windows/custom/financial-account/bankStatementImportFields.js
  - tools/app-shell/src/windows/custom/financial-account/bankStatementImportPipeline.js
  - tools/app-shell/src/windows/custom/financial-account/statementAmount.js
  - tools/app-shell/src/windows/custom/financial-account/statementDate.js
  - tools/app-shell/src/windows/custom/financial-account/useStatementImportReview.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - e2e/tests/flows/financial-account-import-statement.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/useWindowImportDialog.js
  - tools/app-shell/src/windows/custom/financial-account/ImportedStatementsTab.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.defaultSort.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/MovementsTable.jsx
  - e2e/tests/flows/contacts-import-category-resolution.mocked.spec.js
  - e2e/tests/flows/product-import-category-resolution.mocked.spec.js
  - e2e/tests/flows/contacts-import-category-resolution.integration.spec.js
  - e2e/tests/flows/product-import-category-resolution.integration.spec.js
---

## Resumen
Importación de estados de cuenta con mapeo de columnas, plantillas descargables multiidioma y validación en el navegador. El motor de importación reutiliza el genérico de app-shell-core en lugar de crear uno nuevo.

## Decisiones
- Parsear en el navegador y POSTear a `?action=create` existente — evita reimplementar resolución de columnas obligatorias, tipo documento, numeración y agregados
- Rechazar `.xls` deliberadamente en el picker — sin el archivo visible en el selector, el usuario no veía el mensaje de re-guardar como `.xlsx`
- Reutilizar el motor genérico de importación — ya impulsaba dos ventanas, no justificaba un tercero
- Plantillas con headers en nombres de FIELD — caracteres idénticos a columnas en pantalla para auto-mapeo multiidioma
- Ordenamiento por DocumentNo descendente — único incremento estricto disponible
- Fechas en ISO en todos los idiomas — evita contradicciones entre formato de ejemplo y parser day-first
- Montos exactamente en un lado — rechaza filas con ambos lados llenos; un cero explícito sigue válido para no hacer inimportable la plantilla ejemplo

## Descartado
- Crear segundo motor de importación — código duplicado innecesario

## Deuda dejada
- Cuaderno 43 removido (C43 records de ancho fijo no tienen columnas para mapear) — regresión funcional aceptada como decisión producto
- Pin a preview CI de schema_forge_core (0.3.49-preview.feature-ETP-4954.*) — debe reemplazarse cuando el PR del core aterrice y publique versión real; preview no debe llegar a develop
- Tres divergencias documentadas en parseStatementAmount vs Utility.stringToBigDecimal
