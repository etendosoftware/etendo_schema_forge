---
task: ETP-5437
note: ETP-5437/c623e688
kind: backfill
date: 2026-09-22T16:54:16.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 615b33855d
  - e656bf39d7
  - 8796b3332d
  - 1ed8d6bd11
files:
  - artifacts/goods-receipt/custom/GoodsReceiptActions.jsx
  - artifacts/goods-receipt/custom/__tests__/GoodsReceiptActions.test.js
  - artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
  - artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js
  - tools/app-shell/src/windows/__tests__/registry.vitest.jsx
  - tools/app-shell/src/pages/__tests__/DevLifecyclePage.vitest.jsx
  - e2e/tests/flows/assets.integration.spec.js
---

## Resumen
Correcciones de tests y limpieza de código derivadas de cambios previos. Se eliminan duplicados de `apiFetch` introducidos en ETP-5410, se ajustan argumentos en tests del registry, se añaden esperas en assertions asincrónicas y se sincronizan labels en tests e2e con cambios de ETP-5414.

## Decisiones
- Remover declaraciones duplicadas de `apiFetch` — fueron introducidas accidentalmente en la integración anterior
- Agregar `wait for load()` antes de assertions — garantizar que campos estén cargados antes de validar valores
- Sincronizar label de sidebar en test e2e — mantener consistencia con cambios de nomenclatura en ETP-5414
- Arreglar argumento posicional `reportAccess` en registry tests — corregir invocación incorrecta

## Descartado
No hay evidencia de alternativas consideradas y descartadas.

## Deuda dejada
No hay atajos ni TODOs identificables en los cambios.

## Pendiente
No hay trabajo pendiente evidente.
