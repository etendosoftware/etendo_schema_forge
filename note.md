---
task: ETP-4948
note: ETP-4948/23242c39
kind: backfill
date: 2026-09-21T20:29:02.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - e39dcba5be
  - d51ef2ff36
  - b4ef5e9b95
  - 9304002364
  - 0812367dfa
  - a752a1f4ea
  - 8dbdf6b5e5
  - 1806f9e8f9
  - 92b229c9f2
  - 9372a81c10
  - 6a804f9da8
  - aa3da979cf
  - 581e80de06
  - 4ddb32a730
  - 43eec3db14
  - b8bfcd0e20
  - a1648716f5
  - 2fc223dfb5
  - 56b4ee5cb2
  - 5f77c954d5
  - 87d468bd86
files:
  - docs/generated-custom-windows/not-posted-documents.md
  - artifacts/fiscal-calendar/decisions.json
  - docs/generated-custom-windows/calendar.md
  - tools/app-shell/src/windows/custom/calendar/PeriodsExpandablePanel.jsx
  - tools/app-shell/src/windows/custom/calendar/__tests__/PeriodsExpandablePanel.vitest.jsx
  - artifacts/open-close-period-control/contract.json
  - artifacts/open-close-period-control/contract.mcp.json
  - artifacts/open-close-period-control/decisions.json
  - artifacts/open-close-period-control/generated/web/open-close-period-control/PeriodControlTable.jsx
  - artifacts/fiscal-calendar/contract.json
  - artifacts/fiscal-calendar/contract.mcp.json
  - artifacts/fiscal-calendar/generated/web/fiscal-calendar/YearPage.jsx
  - tools/app-shell/src/lib/__tests__/dateOnly.test.js
  - tools/app-shell/src/lib/dateOnly.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/calendar/__tests__/index.vitest.jsx
  - tools/app-shell/src/windows/custom/calendar/index.jsx
  - docs/generated-custom-windows/INDEX.md
  - tools/app-shell/src/windows/custom/calendar/useYearHasPeriods.js
  - tools/app-shell/src/windows/custom/calendar/__tests__/useYearHasPeriods.vitest.jsx
  - tools/app-shell/src/windows/custom/calendar/AccountingPanel.jsx
  - tools/app-shell/src/windows/custom/calendar/YearCloseStatusBadge.jsx
  - tools/app-shell/src/windows/custom/calendar/YearTableWithCloseStatus.jsx
  - tools/app-shell/src/windows/custom/calendar/__tests__/AccountingPanel.vitest.jsx
  - tools/app-shell/src/windows/custom/calendar/__tests__/YearCloseStatusBadge.vitest.jsx
  - tools/app-shell/src/windows/custom/calendar/__tests__/YearTableWithCloseStatus.vitest.jsx
  - tools/app-shell/src/windows/custom/calendar/__tests__/useYearCloseStatus.vitest.jsx
  - tools/app-shell/src/windows/custom/calendar/useYearCloseStatus.js
  - e2e/tests/flows/calendar.mocked.spec.js
  - cli/src/data-fixes/sql/20260921T120000Z__R38-mixed-period-open.sql
  - cli/test/data-fixes-report-regression.test.js
  - cli/src/data-fixes/sql/20260921T120000Z__R39-mixed-period-open.sql
---

## Resumen
Mejora integral de la gestión de períodos fiscales en el calendario: reordenó la UI (Periods como primer tab), ocultó la creación cuando existen períodos, arregló datos inconsistentes (estado Mixed stuck) y se alineó con políticas de autenticación. Incluyó 21 commits de UI, lógica, documentación y correcciones de datos.

## Decisiones
- **Periods tab primero** — mejor flujo de usuario
- **Ocultar Create Periods cuando hay períodos** — evita redundancia
- **Migrar a useApiFetch** — cumplimiento obligatorio de política de autenticación (CLAUDE.md)
- **Remover UI per-document-type de cierre de período (frontend-only)** — la transacción Abrir/Cerrar Período ya cubre todos los tipos; los handlers backend se dejan intactos para minimizar riesgo
- **Data fix R39 para Mixed periods** — 387 filas de C_PeriodControl abiertas en 9 períodos Previously-Mixed del tenant aaa; validado en vivo

## Descartado
- Remover handlers backend (PeriodControlDocOpenCloseHandler, AD Process 168) — se mantuvo para evitar regresiones potenciales, solo se eliminó frontend

## Deuda dejada
- Handlers backend per-document-type sin usar (quedan en código sin referencia)
- ETP-5096 (JWT/session org resolution) flagged como riesgo residual conocido en documentación
- ETP-5416 (toast Spanglish de fallback compartido) — raíz causa documentada pero depende de fix global

## Pendiente
- Considerar cleanup posterior de handles backend cuando se tenga mayor confianza en estabilidad
