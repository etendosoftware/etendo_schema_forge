---
task: ETP-5247
note: ETP-5247/93e1ee57
kind: backfill
date: 2026-09-10T14:36:03.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - e23f4e087d
files:
  - cli/src/data-fixes/sql/20260909T120000Z__R35-acreedor-bp-group-acct-accounts.sql
  - cli/test/data-fixes-report-regression.test.js
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/tenant-remediation-knowledge.md
---

## Resumen
Se agregó una datafix para corregir cuentas de Acreedor BP Group en el sistema de tenants mediante migración SQL.

## Decisiones
- Implementación como migración SQL — patrón estándar para datafixes en el proyecto

## Descartado
No hay evidencia de alternativas evaluadas.

## Deuda dejada
No se observan TODOs o atajos en el commit.

---

**Nota**: El commit no incluye descripción del problema específico ni cambios de código de lógica. La migración SQL contiene 250 líneas cuya finalidad no es evidente en el diff. Se recomienda revisar la descripción de la tarea ETP-5247 para entender el contexto completo de la corrección.
