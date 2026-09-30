---
task: ETP-5318
note: ETP-5318/ab38cbc0
kind: backfill
date: 2026-09-15T00:46:42.000Z
authors:
  - RubenEtendo
agents:
sessions:
commits:
  - 21e7de877f
  - 6a4c2bd9b3
  - 2a18aed09d
  - 3b74a49c31
  - 492030c427
  - 10bef254b6
files:
  - artifacts/purchase-invoice/contract.json
  - artifacts/purchase-invoice/contract.mcp.json
  - artifacts/purchase-invoice/contract.prev.json
  - artifacts/purchase-invoice/generated/web/purchase-invoice/CashVatForm.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderTable.jsx
  - artifacts/purchase-invoice/generated/web/purchase-invoice/mockData.js
  - artifacts/sales-invoice/contract.json
  - artifacts/sales-invoice/contract.mcp.json
  - e2e/tests/flows/attachments.mocked.spec.js
  - e2e/tests/flows/fiscal-models-303-identification.mocked.spec.js
  - e2e/tests/flows/sales-invoice-discount-display.mocked.spec.js
  - tools/app-shell/src/windows/custom/shared/__tests__/tbaiStatusColumnFilterable.test.js
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/CreatableSearchSelect.jsx
---

## Resumen
Se regeneraron contratos de facturas de compra/venta desde caché, refactorizaron tests e2e para eliminar flakiness por carreras de clics y actualizaron aserciones obsoletas en tests.

## Decisiones
- Regenerar datos de contratos desde caché en lugar de generar dinámicamente — reduce complejidad de datos de prueba
- Arreglar tests flaky con timeouts y waits explícitos — estabiliza suite e2e mocked
- Actualizar filterMode a enumLabel en aserciones — alinea tests con cambio de API
- Limpiar onBlur timeout en unmount de CreatableSearchSelect — previene memory leaks

## Descartado
- Mantener filterMode: se reemplazó por enumLabel al actualizar tests

## Deuda dejada
- Commits 492030c42 y 10bef254b son duplicados (mismos cambios en CreatableSearchSelect) — podría indicar sincronización incompleta o error de cherry-pick
- Tests flaky se arreglaron en 3 specs de e2e, pero el patrón de carreras de clics puede afectar otros tests mocked no tocados

## Pendiente
- Deduplicar commits duplicados en historial
- Revisar otras suites e2e mocked por patrones similares de flakiness
