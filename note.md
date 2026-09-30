---
task: ETP-5372
note: ETP-5372/4619f55c
kind: backfill
date: 2026-09-21T12:58:45.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - c31f05d6f2
files:
  - artifacts/general-ledger-configuration/contract.json
  - artifacts/general-ledger-configuration/contract.mcp.json
  - artifacts/general-ledger-configuration/decisions.json
  - artifacts/general-ledger-configuration/figma-spec.md
  - artifacts/general-ledger-configuration/generated/web/general-ledger-configuration/GeneralForm.jsx
  - artifacts/general-ledger-configuration/generated/web/general-ledger-configuration/mockData.js
  - cli/src/data-fixes/sql/20260921T125157Z__R38-acctschema-accrual-devengo.sql
  - cli/test/data-fixes-r38-acctschema-accrual-devengo.test.js
  - docs/generated-custom-windows/general-ledger-configuration.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/general-ledger-configuration/GeneralTab.jsx
  - tools/app-shell/src/windows/custom/general-ledger-configuration/__tests__/GeneralTab.vitest.jsx
  - tools/app-shell/src/windows/custom/general-ledger-configuration/mockCatalogs.js
---

## Resumen
Se ocultó el campo "Criterio Contable" de la interfaz de configuración porque Etendo Go no soporta Caja (cash-basis). Se agregó un data-fix correctivo (R38) que fuerza IsAccrual=Y en todos los tenants que pudieron haber modificado este valor antes del write-lock del backend.

## Decisiones
- **Usar system-visibility en decisions.json para ocultación** — forma estándar de controlar visibilidad en el sistema
- **Crear data-fix SQL (R38)** — necesario porque algunos tenants alteraron el valor antes de que existiera la protección en backend; garantiza consistencia histórica
- **Remover el campo de la pestaña custom** — coherencia con la ocultación visual principal del campo

## Deuda dejada
- El data-fix asume que el valor pudo ser "no-Y"; no queda claro si hay otros estados posibles o si fue realmente modificado en algún tenant
- Se menciona un write-lock en backend que ya existe, pero no se ve reflejado en este commit; si hay brecha temporal donde el campo sea editable, el data-fix no cubre cambios futuros

## Pendiente
- Validar que los tenants existentes tengan IsAccrual=Y después de ejecutar R38
- Monitorear si hay intentos de edición post-despliegue (el campo oculto no impide acceso directo a la API)
