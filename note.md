---
task: ETP-5404
note: ETP-5404/0766470c
kind: backfill
date: 2026-09-18T14:16:04.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - e35ed7c588
files:
  - docs/generated-custom-windows/goods-receipt.md
  - docs/generated-custom-windows/return-material-receipt.md
  - docs/generated-custom-windows/return-to-vendor-shipment.md
  - tools/app-shell/src/windows/custom/goods-receipt/__tests__/GoodsReceiptWindow.vitest.jsx
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/windows/custom/return-material-receipt/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/return-material-receipt/index.jsx
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/__tests__/index.test.js
  - tools/app-shell/src/windows/custom/return-to-vendor-shipment/index.jsx
---

## Resumen
Se habilitó la creación de contactos en línea en tres ventanas de recepción (Goods Receipt, Return Material Receipt, Return to Vendor Shipment), reutilizando el hook `CreateContactContext/useCreateContactModal` que ya existía en otras ventanas de la aplicación.

## Decisiones
- Reutilizar patrón existente — evita duplicación de código y mantiene consistencia con Purchase Order, Sales Order, Sales Quotation, Purchase Invoice, Sales Invoice y Goods Shipment
- No modificar generador ni decisions.json — la infraestructura existente cubrió completamente los requisitos

## Deuda dejada
Los cambios en `return-material-receipt/index.jsx` y `return-to-vendor-shipment/index.jsx` (97 y 87 líneas modificadas respectivamente) sugieren refactor además de la funcionalidad nueva. Aunque se completó correctamente, la mezcla de cambios estructurales con la característica dificulta entender exactamente qué se reformateó y por qué.
