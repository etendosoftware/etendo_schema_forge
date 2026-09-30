---
task: ETP-5031
note: ETP-5031/dc0c333e
kind: backfill
date: 2026-09-14T23:40:31.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 5085b2addf
  - bb744d7cd6
  - 750a4b3f0b
  - 8915740d6d
  - 3683d72fc4
files:
  - tools/app-shell/src/components/contract-ui/__tests__/contactsFieldValidation.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/recipientEdits.test.js
  - tools/app-shell/src/hooks/__tests__/useEntity-helpers.test.js
  - tools/app-shell/src/windows/custom/organization/__tests__/OrganizationPage.vitest.jsx
  - docs/generated-custom-windows/contacts.md
  - docs/generated-custom-windows/organization.md
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/EntityForm.jsx
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - tools/app-shell/src/components/contract-ui/contactsFieldValidation.js
  - tools/app-shell/src/components/contract-ui/recipientEdits.js
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/organization/OrganizationPage.jsx
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - artifacts/contacts/decisions.json
  - artifacts/contacts/generated/web/contacts/BusinessPartnerForm.jsx
  - e2e/tests/flows/contacts-import-category-resolution.integration.spec.js
  - e2e/tests/flows/contacts-integration.spec.js
  - e2e/tests/helpers/tax-id.js
  - package-lock.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/src/__tests__/tailwind-purge-guard.vitest.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/tailwind.config.js
  - tools/app-shell/test/pwa.test.js
  - tools/app-shell/src/components/contract-ui/EntityCreationModal.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/EntityCreationModal.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/contactModalConfig.test.js
  - tools/app-shell/src/components/contract-ui/contactModalConfig.js
  - tools/app-shell/src/windows/custom/contacts/__tests__/contactsImportDescriptor.vitest.js
  - tools/app-shell/src/windows/custom/contacts/contactsImportDescriptor.js
---

## Resumen
Se implementó validación integral de campos de contacto (email, teléfono, web, tax ID) con cobertura en la ventana Contacts, formulario genérico de creación y backend. Se agregaron 312+ líneas de tests de regresión y se garantizó paridad de comportamiento entre ventanas.

## Decisiones
- Validar teléfono en keystroke con filtro de caracteres (E.164, máx 15) reutilizando primitivas existentes en lugar de crear lógica nueva
- Usar validadores genéricos de `recipientEdits.js` en `EntityCreationModal.jsx` para evitar duplicación y beneficiar todas las ventanas que reutilizan el popup
- Mapear errores del backend a claves i18n existentes en lugar de agregar strings nuevas
- Validar legacy values solo si el usuario toca el campo o su tipo, no re-validar automáticamente

## Descartado
- Incluir el mapeo de `maxLength` del generador (47 ventanas repo-wide) — separado a su propio PR por alcance

## Deuda dejada
- Core pinned en 0.3.51; el PR del generador's maxLength queda pendiente
- La resolución de ruta de `etendo-go-core` en `pwa.test.js` es un workaround a comportamiento de npm hoisting

## Pendiente
- PR del generador's maxLength para sincronizar las 47 ventanas
- Validación de custom fields más allá de los cuatro tipos core
