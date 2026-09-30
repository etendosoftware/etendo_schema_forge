---
task: ETP-5528
note: ETP-5528/844dd9fb
kind: backfill
date: 2026-09-29T13:30:22.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 829ee35412
  - 83acd37d24
files:
  - docs/generated-custom-windows/sales-quotation.md
---

## Resumen
Se documentó la funcionalidad de reactivación de órdenes de cotización en el backend, con un refinamiento posterior que restringe el alcance best-effort a casos con fallos reportados.

## Decisiones
- Se documentó la reactivación de órdenes de cotización — nueva funcionalidad que requería registro en la documentación de ventas
- Se estrechó el alcance a fallos reportados — limita el mejor-esfuerzo a casos documentados en lugar de cubrir todos los escenarios

## Deuda dejada
- Documentación es generada automáticamente — la fuente de verdad está en otro lugar; cambios posteriores pueden sobrescribir estos ajustes si no se actualiza la fuente
