---
task: ETP-5222
note: ETP-5222/fb655912
kind: backfill
date: 2026-09-09T19:47:27.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 01664665d8
  - 8c4c20c582
  - 2bcf252fdb
  - 6ddfc60fb5
  - a368086e96
  - ebd4e6ce92
  - f6bee85a7e
  - e948800af7
  - 641ff37f2b
  - d225dfaebe
files:
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - docs/generated-custom-windows/product-category.md
  - docs/generated-custom-windows/product.md
  - cli/test/data-fixes-r35-invoice-price-variance-99904000-correction.test.js
  - cli/src/data-fixes/sql/20260909T150000Z__R35-invoice-price-variance-99904000-correction.sql
  - docs/etendo-ad/tenant-remediation-knowledge.md
  - artifacts/product-category/contract.json
  - artifacts/product-category/contract.mcp.json
  - artifacts/product-category/decisions.json
  - artifacts/product-category/generated/web/product-category/AccountingForm.jsx
  - artifacts/product-category/generated/web/product-category/AccountingTable.jsx
  - artifacts/product-category/generated/web/product-category/ProductCategoryPage.jsx
  - artifacts/product-category/generated/web/product-category/mockData.js
  - artifacts/product/contract.json
  - artifacts/product/contract.mcp.json
  - artifacts/product/decisions.json
  - artifacts/product/generated/web/product/AccountingForm.jsx
  - artifacts/product/generated/web/product/AccountingTable.jsx
  - artifacts/product/generated/web/product/ProductPage.jsx
  - artifacts/product/generated/web/product/mockData.js
---

## Resumen
Se completó ETP-5222: exposición del field `invoicePriceVariance` en product/category, implementación de data-fix R35 para normalizar account 99904000 con lógica de cascade desde el schema default, y cobertura de regresión con tests multi-schema.

## Decisiones
- **Cascade desde schema default, no solo account 99904000** — permite fallback a `C_AcctSchema_Default.P_InvoicePriceVariance_Acct` cuando falta 99904000, validado en producción con casos reales (35 filas corregidas sin el account).
- **Regresión de multi-schema isolation** — test asegura correlación por PK, no solo client_id, previniendo cruzamiento de datos entre schmas.
- **Documentación exhaustiva en A8b** — cataloga dataset de baseline (Item 4) y decisiones de remediation con evidencia.

## Descartado
- Documentación pre-cascade que asumía charts sin 99904000 se mantendrían en valor R34 sin fallback.

## Deuda dejada
- El proceso de corrección fue iterativo (B1, W1, W4) sobre docs ya mergeados; hay riesgo de que cambios de lógica requieran re-visitas a documentación.

## Pendiente
- Validación en otros tenants con schemas sin account 99904000 que dependían del fallback.
