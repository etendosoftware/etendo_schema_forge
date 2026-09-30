---
task: ETP-5390
note: ETP-5390/d5b9d790
kind: backfill
date: 2026-09-17T18:03:57.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - c25ae3a8cf
  - 2626ce166c
  - 71f32be86f
files:
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx
  - tools/app-shell/src/hooks/__tests__/useBulkActionToast.vitest.jsx
  - artifacts/purchase-invoice/contract.prev.json
---

## Resumen
Sincronización de snapshots y checksums de contratos tras cambios en dependencias (schema-forge-cli 0.3.54) y resolución de deudas previas (ETP-5328, ETP-5345, ETP-5316).

## Decisiones
- **Regenerar checksums de contactos** — schema-forge-cli 0.3.54 añade soporte de `publicApi` y ETP-5328 corrige etiqueta `PO_Financial_Account_ID` en decisions.json, invalidando checksums anteriores
- **Actualizar assertions de toast** — ETP-5316 cambió estructura de argumentos (single-row: mensaje directo sin template; multi-row: description + mensaje templatizado), tests de ETP-5302 nunca se actualizaron tras merge
- **Commitear contract.prev.json sincronizado** — artifact stale causa que pre-push drift-check lo reescriba, dejando tree dirty y bloqueando run-sonar.sh; commitearlo lo hace idempotente

## Deuda dejada
- Tests de ETP-5302 quedaron desactualizados tras cambio en ETP-5316: existe riesgo de desfase cuando features se resuelven en diferente orden
- Lógica de offline regen (contract.prev.json como byproducto) genera tree sucio en checks de drift, requiere workaround de committing snapshot

## Pendiente
- Mecanismo para alinear tests de múltiples features con cambios de API (toast en este caso)
