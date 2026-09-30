---
task: ETP-5446
note: ETP-5446/2bf5300b
kind: backfill
date: 2026-09-23T17:14:36.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 48206c8127
  - addf54a388
  - 477026c8aa
files:
  - artifacts/product/contract.json
  - artifacts/product/contract.mcp.json
  - artifacts/product/decisions.json
  - artifacts/product/generated/web/product/ProductTable.jsx
  - artifacts/product/generated/web/product/mockData.js
  - docs/generated-custom-windows/product.md
  - tools/app-shell/src/windows/custom/product/ProductCustomTable.jsx
  - tools/app-shell/src/windows/custom/product/ProductListCells.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductCustomTable.filters.vitest.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductCustomTable.vitest.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductListCells.vitest.jsx
  - cli/cache/ad-snapshot/255a1d8008c10ff6ac0c2ebe27613983aff00eb379150de63202655776329010.json
  - cli/cache/ad-snapshot/8f0fec656617c7258be4a117b300dba1f4791d820c2451c13cf14af614e377a7.json
  - cli/cache/ad-snapshot/ed6297b4abbc26e5258faff30840b5d60f4f4930a1363f8327067f4a4efbe97e.json
---

## Resumen
Se agregó una columna de Costo a la lista de productos. Los cambios incluyeron actualización de esquemas, componentes React, tests y caché de snapshot; se requirió ajuste del layout para mantener visible la columna de nombre.

## Decisiones
- Asignar `minWidth` (144/152px) a las columnas `uOM` y `productType` en lugar de reducir la columna de Costo, preservando el ancho de la columna de nombre
- Regenerar el caché AD snapshot con `make regen ONLY=product CACHE_DB=1` para incluir `EM_ETGO_Cost` y que pasara el check de regen offline

## Deuda dejada
- El layout sigue optimizado para ancho de 1280px; responsividad en otros puntos de quiebre no está documentada
- La solución de minWidth es un ajuste específico que podría requerirse revisión si se agregan más columnas
