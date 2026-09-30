---
task: ETP-5502
note: ETP-5502/edaf4c8b
kind: backfill
date: 2026-09-28T13:05:22.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - cef7c6bf4e
  - 046788b2ff
  - 0484a0085f
files:
  - cli/src/data-fixes/sql/20260928T120000Z__R41-personal-role-owner-backfill.sql
  - cli/test/data-fixes-r41-personal-role-owner-backfill.test.js
  - cli/test/data-fixes-report-regression.test.js
  - docs/feedback.md
  - docs/generated-custom-windows/user.md
---

## Resumen
Se implementó un backfill de propietarios de roles personales mediante una data-fix SQL (R41) y se documentó el flujo de restauración basado en propietarios.

## Decisiones
- Implementar como data-fix SQL — permite ejecutar el backfill de datos históricos de forma controlada y reversible
- Describir personal role owner como clave foránea — aclara la relación estructural en la base de datos
