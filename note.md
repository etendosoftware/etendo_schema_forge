---
task: ETP-5248
note: ETP-5248/a109e698
kind: backfill
date: 2026-09-14T13:06:31.000Z
authors:
  - RubenEtendo
agents:
sessions:
commits:
  - e47589b1ff
  - 4398749327
  - 12a4ad9dce
  - b4b03a2070
  - 96d8a3eb01
  - 24e9280aa0
  - 93522195fa
files:
  - artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx
  - artifacts/sales-invoice/custom/__tests__/InvoiceHeaderTable.test.js
  - tools/app-shell/src/windows/custom/fiscal-config/__tests__/useFiscalConfigForOrgs.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js
  - tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.test.js
  - tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.vitest.jsx
  - docs/feedback.md
  - docs/plans/2026-09-08-tbai-status-computed-column-migration.md
  - docs/generated-custom-windows/purchase-invoice.md
  - docs/generated-custom-windows/sales-invoice.md
---

## Resumen
Se cambió cómo se resuelven las columnas fiscales SII/VERI-FACTU en facturas: en lugar de determinarse globalmente por la org seleccionada, ahora se resuelven por la org de cada fila, en paralelo. Esto permite que grillas con múltiples organizaciones muestren las columnas correctas para cada una.

## Decisiones
- Usar `useFiscalConfigForOrgs` que resuelve fechas de cutover fiscal por cada org distinta en la página, en paralelo, reutilizando primitivas de ETP-5229
- Cada fila busca su propia org (`resolveInvoiceOrgId`) en lugar de compararse contra una única org global
- Aislar fallos de fetch por org para que la falla de una org no bloquee otras (commit b4b03a207)
- Mantener Batuz como sincrónico/org-global; solo SII pasa a async/per-row

## Deuda dejada
- La asimetría entre el comportamiento de SII (async, per-row) y Batuz (sincrónico, global) podría confundir: ambas son columnas fiscales pero con semánticas distintas
- El aislamiento de fallos por org fue descubierto después del test red (commit 12a4ad9dc), sugiere que la implementación inicial no contemplaba este escenario

## Pendiente
- Considerar si la semántica de Batuz debería alinearse con SII en futuras iteraciones
