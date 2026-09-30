---
task: ETP-5413
note: ETP-5413/d199931a
kind: backfill
date: 2026-09-18T21:19:58.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 624dca32ec
  - 531780e473
  - 3b9286041c
  - 7147ebaba6
files:
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - e2e/tests/flows/tenant-upgrade.mocked.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.sessionState.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useBulkActionToast.vitest.jsx
---

## Resumen
Se integró un mergeblock que consolidó cuatro PRs paralelas. Durante la integración se descubrieron gaps en mocks de tests, specs obsoletos por cambios en otros PRs, y un bug preexistente en formato de test que fue reparado. Se regeneró el contrato de contactos.

## Decisiones
- Skipear 5 specs en tenant-upgrade en lugar de reescribir: se requiere reescritura contra nuevo flujo de hosted-checkout, fuera de scope de integración
- Agregar mock faltante en gridQuery: la combinación de ETP-5009 y ETP-5188 exponía una brecha que no pasaba en PRs individuales  
- Corregir braces en useBulkActionToast: bug preexistente que bloqueaba la integración

## Deuda dejada
- 5 specs en tenant-upgrade.mocked.spec.js quedan skipeados, pendiendo reescritura contra flujo hosted-checkout de ETP-5396

## Pendiente
- Reescribir 5 specs skipeados en tenant-upgrade contra nuevo flujo de checkout
