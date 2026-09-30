---
task: ETP-5469
note: ETP-5469/e1fa5e49
kind: backfill
date: 2026-09-25T11:57:41.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - fd3fe8aaeb
files:
  - agent-prompts/financial-account/spec.md
  - artifacts/financial-account/contract.json
  - artifacts/financial-account/contract.mcp.json
  - artifacts/financial-account/decisions.json
  - artifacts/financial-account/generated/web/financial-account/AccountPage.jsx
  - docs/generated-custom-windows/financial-account.md
  - docs/mcp-evaluation/mcp-improvements-registry.md
---

## Resumen
Se cerró la capacidad de escritura genérica en el módulo de declaraciones bancarias marcando dos campos como readOnly. Se sincronizó el prompt del agente financiero con la especificación ETGO_SF_SPEC y se actualizó la documentación asociada.

## Decisiones
- Marcar campos como readOnly en `decisions.json` en lugar de depender de flags `api.crud` — los flags son inertes para esta ventana personalizada
- Sincronizar el prompt del agente con ETGO_SF_SPEC — alinear especificación con realidad implementada

## Deuda dejada
- Los flags `api.crud` permanecen presentes en el contrato pero inactivos — pueden confundir futuras modificaciones
