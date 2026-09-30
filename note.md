---
task: ETP-5291
note: ETP-5291/a9295a2b
kind: backfill
date: 2026-09-14T12:39:26.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - fc9b2cc1ab
files:
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - artifacts/goods-shipment/contract.json
  - artifacts/goods-shipment/contract.mcp.json
  - artifacts/goods-shipment/custom/GoodsShipmentMoreMenu.jsx
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentMoreMenu.vitest.jsx
  - artifacts/goods-shipment/decisions.json
  - artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage.jsx
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/goods-shipment.md
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.goodsShipmentKebabMenu.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptActions.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
---

## Resumen
Se removió la opción "Descargar PDF" del menú kebab en goods-shipment y goods-receipt. Incluye eliminación del componente GoodsShipmentMoreMenu, actualización de configuración y documentación, y limpieza de 818 líneas de código y tests stale.

## Decisiones
- Actualizar decisions.json + regeneración en goods-shipment frente a edición manual en goods-receipt: respeta la arquitectura diferenciada de ambas ventanas
