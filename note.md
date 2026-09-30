---
task: ETP-5382
note: ETP-5382/be2125fb
kind: backfill
date: 2026-09-22T16:04:13.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - d6441e2140
  - 7eb0785070
  - 82fb0c6c08
  - 44ac4c3be4
  - fc916a7819
  - 5765c588ae
  - c457bed87f
  - c9e38555ae
files:
  - artifacts/tax/contract.json
  - artifacts/tax/contract.mcp.json
  - artifacts/tax/decisions.json
  - artifacts/tax/generated/web/tax/TaxForm.jsx
  - artifacts/tax/generated/web/tax/TaxPage.jsx
  - artifacts/tax/generated/web/tax/TaxTable.jsx
  - artifacts/tax/generated/web/tax/mockData.js
  - docs/generated-custom-windows/tax.md
  - docs/decisions-reference.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
---

## Resumen
Se exponían Tax Category y Applicable To con filtrado, luego se estabilizó el sistema de claves backend (backendFilterKey, backendSortKey) pasando de auto-derivación a declaración explícita. Tax Category se revirtió a read-only por feedback de QA.

## Decisiones
- Cambiar backendFilterKey/backendSortKey de auto-derivación a declaración manual — permitir control fino sobre renombramientos que afecten el grid
- Documentar el nuevo flujo en decisions-reference.md — establecer como estándar que los renombramientos de campos grid requieren declarar explícitamente ambas claves
- Actualizar core preview con soporte para backendSortKey — necesario para que la plataforma resuelva sorts en identificadores de FK correctamente

## Descartado
- Tax Category editable — feedback de QA lo rechazó; se revirtió al estado read-only

## Deuda dejada
- El cambio de contrato (auto-derivación → manual) requirió 3 commits iterativos para estabilizar; la documentación evolucionó en paralelo
- validFromDate pierde backendFilterKey/backendSortKey al estrecharse; mientras que es intencional (nunca llega a grid query), representa comportamiento implícito que podría confundir

## Pendiente
- Validar que otros campos renombrados en grids tengan declaradas sus claves backend explícitamente
