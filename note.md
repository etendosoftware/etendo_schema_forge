---
task: ETP-5317
note: ETP-5317/1485f542
kind: backfill
date: 2026-09-29T12:11:13.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - e86722e1b0
  - 9dbddf5481
  - ac1d984185
  - 4c054dc832
  - ba8892c7a4
  - b57f6a1724
files:
  - artifacts/purchase-order/contract-changelog.json
  - artifacts/purchase-order/contract.json
  - artifacts/purchase-order/contract.mcp.json
  - artifacts/purchase-order/contract.prev.json
  - artifacts/purchase-order/decisions.json
  - artifacts/purchase-order/generated/web/purchase-order/HeaderPage.jsx
  - artifacts/purchase-order/generated/web/purchase-order/HeaderTable.jsx
  - artifacts/purchase-order/generated/web/purchase-order/mockData.js
  - artifacts/sales-order/contract.json
  - artifacts/sales-order/contract.mcp.json
  - artifacts/sales-order/decisions.json
  - artifacts/sales-order/generated/web/sales-order/HeaderPage.jsx
  - artifacts/sales-order/generated/web/sales-order/HeaderTable.jsx
  - artifacts/sales-order/generated/web/sales-order/mockData.js
  - docs/bug-reports/2026-09-24-etp5317-invoice-delivery-status-percentage-mismatch.md
  - tools/app-shell/src/windows/custom/purchase-order/index.jsx
  - tools/app-shell/src/windows/custom/sales-order/index.jsx
  - cli/cache/ad-snapshot/255a1d8008c10ff6ac0c2ebe27613983aff00eb379150de63202655776329010.json
  - cli/cache/ad-snapshot/8f0fec656617c7258be4a117b300dba1f4791d820c2451c13cf14af614e377a7.json
  - cli/cache/ad-snapshot/ed6297b4abbc26e5258faff30840b5d60f4f4930a1363f8327067f4a4efbe97e.json
  - cli/cache/ad-snapshot/d68e740d5005cee2334dc9682c1619cc10b18258b4a6825eb50d6445005b732b.json
---

## Resumen
Se reapuntaron las grillas de Orden de Compra y Venta a nuevas columnas almacenadas (`EM_ETGO_*`) que excluyen el descuento total, alineando los porcentajes mostrados entre grid y formulario. Se sincronizó cache, metadatos de configuración y control de versiones.

## Decisiones
- Usar columnas almacenadas nuevas del servidor que excluyen Total Discount — los porcentajes mostrados por grid y formulario ahora coinciden
- Actualizar `decisions.json` y arrays `LIST_COLUMNS` en `index.jsx` — estos campos no se regeneran automáticamente
- Refresca AD cache contra BD viva con `CACHE_DB=1` — asegura que pipeline offline reproduzca estado committed

## Descartado
- Seguir trackeando `purchase-order/contract.prev.json` — ya estaba en `.gitignore` (diseño correcto); su timestamp variable hacía fallar checks de pre-push en cambios no relacionados

## Deuda dejada
- Pipeline offline tuvo ciclo donde droppeó silenciosamente las nuevas columnas de `contract.json` tras primer regen (detectado en commit 2); generador presenta drift entre versiones de `contract.json` y `contract.mcp.json` requiriendo sincronización manual
- Documentación completa de análisis de causa raíz incluida (991 líneas), pero requiere consulta manual
