---
task: ETP-5370
note: ETP-5370/ed0323b9
kind: backfill
date: 2026-09-17T12:25:30.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 67c4b8572e
  - f7d591747a
  - 29234371d7
  - 9dd8886f70
files:
  - cli/src/data-fixes/retired.json
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - docs/etendo-ad/tenant-remediation-knowledge.md
  - tools/app-shell/src/windows/custom/financial-account/ImportedStatementsTab.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/windows/custom/contacts/ContactsTable.jsx
---

## Resumen
Se actualizó la cadencia de costing de 5 minutos a 30 segundos retirando el schedule R36 mediante `retired.json`. Se corrigieron bugs pre-existentes en comparación de fechas y atributos de testing, y se documentó la arquitectura de migración.

## Decisiones
- **Usar `retired.json` en lugar de eliminar**: `computeWatermark()` itera el catálogo en disco, eliminar afectaría el watermark de cada tenant.
- **No usar `supersededBy`**: La cadencia de 30s es garantizada por `CostingCadenceStartup`, que re-arma filas dormidas.
- **`CostingCadenceStartup` como migración one-shot**: Se marca en `ETGO_DATA_FIX_HISTORY` para ejecutarse una sola vez por tenant en lugar de cada boot.
- **Nullear `NEXT_FIRE_TIME` antes de re-armar**: Requisito para que la nueva cadencia no quede dormida.
- **Comparar instant contra Date directamente**: En lugar de `parseCalendarDate()`, evita errores con offsets UTC negativos.
- **Extraer `statementFilterDate()` como función**: Mantiene complejidad Sonar bajo 15, evitando duplicación en filtro.

## Descartado
- Eliminar R36 del catálogo: causaría degradación silenciosa del watermark.
- Integrar `statementFilterDate()` inline: superaría complejidad límite Sonar (18 > 15).

## Deuda dejada
- Commit de `importDate` está en feature branch ETP-5370 por expediencia, pertenece a área ETP-4954.
- Data-testids agregados eran deuda pre-existente desde que cambio de aplicación.

## Pendiente
- Considerar relocalizar commit de importDate a ticket separado si se prefiere.
