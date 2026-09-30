---
task: ETP-5275
note: ETP-5275/21a052cf
kind: backfill
date: 2026-09-10T23:08:13.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - b127d8f6b3
files:
  - cli/src/data-fixes/sql/20260910T120000Z__R36-psd2-bank-statement-schedule-removal.sql
  - cli/test/data-fixes-r36-psd2-bank-statement-schedule-removal.test.js
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/tenant-remediation-knowledge.md
  - docs/neo-headless-extensibility.md
  - docs/plans/ETP-5275-cross-domain.md
---

## Resumen
Se elimina el schedule diario de PSD2 Get Bank Statements creado durante onboarding en 127 tenants. Cambio correctivo que complementa una remoción previa en otro repositorio, con tres pruebas de regresión que validan decisiones técnicas específicas.

## Decisiones
- **ID hardcodeado vs. búsqueda por nombre** — el proceso se identifica por AD_id (F8704AB553464EFEABF8A5A82C74A308) porque una búsqueda por nombre eliminaría también el proceso "Get Bank Statements (All Clients)", que debe conservarse.
- **UPDATE antes de DELETE** — el trigger de Core bloquea DELETE si STATUS es SCH o MIS; se actualiza a UNS primero, en la misma transacción. Una prueba falla si esto se colapsa en un único DELETE.
- **Dos marcadores históricos en descripción** — se buscan ambas versiones del prefijo porque ETP-4690 renombró la constante; omitir la antigua hubiera dejado 9 de 127 filas sin eliminar.

## Deuda dejada
- **Ruido operacional en Quartz** — si se dispara un trigger entre el fix y reinicio de Tomcat, se registra violación de FK. Es solo ruido, no corrupción.
- **Cascada de eliminación intencional** — se pierden ~15.3k filas de AD_Process_Run (CASCADE). Decisión aceptada; tablas con NO ACTION (jobs_job_result, etcop_schedule) están vacías, así falla explícitamente si otro módulo depende.

## Pendiente
- Monitoreo post-deploy: confirmar que ningunos tenants tienen disparos Quartz pendientes durante el rollout.
