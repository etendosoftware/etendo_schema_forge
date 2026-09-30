---
task: ETP-5328
note: ETP-5328/294cd048
kind: backfill
date: 2026-09-16T17:44:07.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 1293d4df5b
files:
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - artifacts/contacts/decisions.json
  - artifacts/contacts/generated/web/contacts/BusinessPartnerPage.jsx
  - docs/generated-custom-windows/contacts.md
  - e2e/tests/flows/contacts-credit-limit-single-flight.mocked.spec.js
  - e2e/tests/flows/contacts-integration.spec.js
  - e2e/tests/flows/labels-naming.mocked.spec.js
  - tools/app-shell/src/windows/custom/contacts/ContactsFinancialPanel.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactsFinancialPanel.singleFlight.vitest.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactsFinancialPanel.updatedToken.vitest.jsx
  - tools/app-shell/src/windows/custom/contacts/__tests__/ContactsFinancialPanel.vitest.jsx
---

## Resumen
Se corrigieron dos problemas en el panel financiero de contactos: el campo de límite de crédito ahora puede vaciarse correctamente y se revirtió un cambio de label en la cuenta contable.

## Decisiones
- Reemplazar el input controlado de tipo número por MaskedAmountInput, el componente canónico ya usado en ProductPriceBar, para permitir un buffer de edición genuinamente vacío mientras se edita
- El campo vacío se normaliza a 0 al confirmar; nunca se persiste como null (SO_CreditLimit es AD-mandatory)
- Revertir el label de PO_Financial_Account_ID a "Cuenta" / "Account", deshaciendo el cambio de ETP-4017
- Mantener commit(), el debounce de 400ms y step() sin cambios (son fixes previos de ETP-5263/ETP-5255)

## Deuda dejada
- El campo de crédito pierde el rol spinbutton, lo que requirió actualizar aserciones de tests que derivaban separadores numéricos del formato del componente en lugar de hardcodearlos
- Un test de integración no capturaba la ausencia del campo original (creditVisible cayó a false sin aserciones activas)

El cambio incluye updates extensos a tests unitarios e integración, y regeneración automática de artefactos de contrato.
