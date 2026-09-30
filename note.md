---
task: ETP-5442
note: ETP-5442/6f8f9dc0
kind: backfill
date: 2026-09-22T16:33:28.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - ba8ef68911
files:
  - cli/src/data-fixes/sql/20260922T120000Z__R39-elementvalue-operand-backfill.sql
  - cli/test/data-fixes-report-regression.test.js
---

## Resumen
Backfill de filas faltantes en C_ELEMENTVALUE_OPERAND para tenants antiguos de Etendo GO. El gap histórico causaba que reportes de Perdidas y Ganancias y Balance de Situacion omitieran silenciosamente filas de fórmulas totales. Fix correctivo ya aplicado en onboarding; esta carga de datos corrige 232 tenants existentes.

## Decisiones
- Resolver cuentas por valor a través del árbol de cuentas del tenant (no por ID) porque estos son scoped a cliente en GOClient
- Usar DISTINCT tree ids para el insert en lugar de schema rows, evitando doble-inserts si dos esquemas comparten un árbol (C_ELEMENTVALUE_OPERAND carece de c_acctschema_id)
- get_uuid() set-based insert en lugar del placeholder del runner, porque row count varía con árboles por tenant
- Idempotente en (owner element value, seqno); rows corruptas existentes no se modifican

## Deuda dejada
- @report section detecta operands que no se crean por cuentas faltantes en el chart del tenant; estos gaps reales no se cubren
- Idempotencia solo en clave específica; rows duplicadas o malformadas quedan sin sobrescribir (intencional para evitar sumatorias incorrectas)
