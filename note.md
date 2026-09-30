---
task: ETP-5491
note: ETP-5491/485dc895
kind: backfill
date: 2026-09-24T18:03:13.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 654d891aa6
files:
  - artifacts/goods-movements/decisions.json
  - docs/generated-custom-windows/goods-movements.md
---

## Resumen
Se documentó el timing de asignación del `docNo` (número de documento) en movimientos de bienes. Los cambios incluyen actualización del archivo de decisiones arquitectónicas y regeneración de la documentación generada.

## Decisiones
- Documentar en `artifacts/goods-movements/decisions.json` — formalizó la decisión en el registro de decisiones del módulo
- Incluir en documentación generada — aseguró que los consumidores tengan claridad sobre cuándo se asigna el identificador
