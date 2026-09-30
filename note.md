---
task: ETP-5283
note: ETP-5283/5b7bffe3
kind: backfill
date: 2026-09-11T20:54:46.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 6a44687861
  - bb29ddb16c
  - 7bb63a936d
  - 106491bc08
  - 2eb7d21811
  - bc3fb05793
  - 7dcf863efc
files:
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - artifacts/product/contract.json
  - artifacts/product/contract.mcp.json
  - artifacts/product/generated/web/product/CostingTable.jsx
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
  - e2e/tests/flows/product-price-single-flight.mocked.spec.js
  - e2e/tests/flows/printable-download.integration.spec.js
  - e2e/tests/flows/sales-order-happy-path.integration.spec.js
  - e2e/tests/flows/sales-order-return-rectificativa.integration.spec.js
  - e2e/tests/flows/sales-quotation-full-flow.integration.spec.js
  - e2e/tests/flows/sales-quotation-happy-path.integration.spec.js
  - e2e/tests/helpers/purchase-helpers.js
  - e2e/tests/helpers/sales-helpers.js
---

## Resumen
Se repararon selectores de tests E2E rotos tras cambios previos en componentes (MaskedAmountInput reemplazó un input number nativo) y se redujeron violaciones de complejidad ciclomática en EditCell, eliminando código muerto y optimizando condicionales.

## Decisiones
- **Selectores E2E con data-testid**: El cambio anterior reemplazó el input number nativo con MaskedAmountInput (type="text"), rompiendo selectores basados en el tipo de input. Se migró a data-testid, el selector estable ya usado por suites relacionadas.
- **Eliminar código muerto en EditCell**: Una rama ternaria para inputType quedó unreachable tras cambios previos (ETP-5245 introdujo EditDateCell que retorna unconditionally), se inlineó directamente como type="text".
- **Precondición guard vs ternario**: El selector de selectorUrl fue simplificado de ternario+recheck a guard clause directo, reduciendo complejidad sin cambiar comportamiento.
- **Bump de core version**: Actualización de dependencias tras las correcciones.

## Deuda dejada
- La complejidad de EditCell se redujo a 13 (por debajo del límite de 15), con margen para futuras ediciones menores sin re-breaching del budget.
