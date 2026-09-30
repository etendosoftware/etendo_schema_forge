---
task: ETP-5468
note: ETP-5468/ab95464b
kind: backfill
date: 2026-09-24T13:53:14.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - e877b5b140
files:
  - agent-prompts/financial-account/spec.md
  - artifacts/financial-account/contract.json
  - artifacts/financial-account/contract.mcp.json
  - artifacts/financial-account/decisions.json
  - artifacts/financial-account/generated/web/financial-account/AccountPage.jsx
  - artifacts/financial-account/generated/web/financial-account/mockData.js
  - docs/generated-custom-windows/financial-account.md
  - docs/mcp-evaluation/mcp-improvements-registry.md
  - tools/app-shell/src/lib/__tests__/backendErrors.foreignDraft.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
---

## Resumen
Se eliminaron dos botones APRM ocultos de la cuenta financiera y se realineó el prompt del agente hacia acciones de reconciliación bancaria. Se agregaron validaciones y traducciones para manejo de errores de giro extranjero.

## Decisiones
- Descartar botones ocultos Addtransactionpd y Findtransactionspd — reducción de complejidad de la UI, probablemente no utilizados en el flujo actual
- Redirigir agent-prompt a bank-reconciliation actions — alineación explícita del flujo de reconciliación

## Deuda dejada
- Dos botones ocultos fueron removidos sin documentar si tenían usuarios o si la funcionalidad migró a otro lugar
