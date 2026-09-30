---
task: ETP-5091
note: ETP-5091/ec342ace
kind: backfill
date: 2026-09-11T01:39:36.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - d8042bd5cc
  - 756c611875
  - 771963e5d2
  - 51868136d9
  - d1d3be344d
files:
  - e2e/tests/flows/product-logistics-nonstockable-types.mocked.spec.js
  - docs/generated-custom-windows/product.md
  - tools/app-shell/src/windows/custom/product/ProductAdditionalInfoPanel.jsx
  - tools/app-shell/src/windows/custom/product/ProductSidebar.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductAdditionalInfoPanel.vitest.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductSidebar.vitest.jsx
  - artifacts/product/contract.json
  - artifacts/product/contract.mcp.json
  - artifacts/product/decisions.json
  - artifacts/product/generated/web/product/ProductPage.jsx
  - tools/app-shell/src/windows/custom/product/ProductStockDefaultsWatcher.jsx
  - tools/app-shell/src/windows/custom/product/__tests__/ProductStockDefaultsWatcher.vitest.jsx
---

## Resumen
Se corrigió un bug donde los flags de stock (Almacenable/Retornable) no se restauraban al cambiar un producto de tipo no-almacenable (Gasto/Recurso/Servicio) a Artículo. La solución fue crear un componente observador que se monta permanentemente para detectar cambios de tipo.

## Decisiones
- Crear ProductStockDefaultsWatcher en lugar de usar un efecto en ProductAdditionalInfoPanel — el panel solo está montado cuando la pestaña "Información adicional" es activa, por lo que nunca veía los cambios de productType que ocurren en la pestaña General
- Montar el observador en formFooter (headerExtra customForm) — es el único slot que DetailView mantiene montado continuamente, independientemente de la pestaña activa
- Fuerza-establecer valores: false para Service/Expense/Resource, true para Article

## Descartado
- Efecto en ProductAdditionalInfoPanel — se desmonta al cambiar de pestaña, perdiendo reactividad
- Soluciones que dependían del panel estar visible durante la edición

## Deuda dejada
- El conflicto de merge (commit 5) pudo haber descartado silenciosamente esta configuración si no se hubiese regenerado manualmente

## Pendiente
Ninguno; se verificó en vivo con 5 ciclos de guardado consecutivos sobre un producto persistido.
