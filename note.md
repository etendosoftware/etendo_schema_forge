---
task: ETP-5447
note: ETP-5447/6f29f5ca
kind: backfill
date: 2026-09-25T18:45:24.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - f96b85c6a4
  - 4d1daa408a
  - b06c507df8
  - 24750406e0
  - 0c9bf73097
  - c627e919ce
  - d224cd8ed8
files:
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.defaultSort.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ManualStatementModal.vitest.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/financial-account/ImportedStatementsTab.jsx
  - tools/app-shell/src/windows/custom/financial-account/ManualStatementModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/formFields.jsx
  - docs/generated-custom-windows/financial-account.md
  - agent-prompts/financial-account/account.md
  - agent-prompts/financial-account/importedBankStatements.md
  - artifacts/financial-account/contract.json
  - artifacts/financial-account/contract.mcp.json
  - artifacts/financial-account/decisions.json
  - docs/mcp-evaluation/mcp-improvements-registry.md
  - docs/neo-headless-extensibility.md
---

## Resumen
Se implementó ordenamiento predeterminado para Imported Statements (fecha transacción DESC, luego creada DESC) y validación inline de campos requeridos en el modal de declaraciones manuales, consistente con EntityForm. Se wired las entidades de bank statements al handler MCP y documentó el flujo de acciones mediante actionContracts().

## Decisiones
- Validación inline en lugar de toasts en header — patrón EntityForm para consistencia con la interfaz
- Orden por fecha transacción DESC con creada DESC como tiebreak — coincide con el orden backend
- Usar javaQualifier bankStatementEntityHandler — permite acceso exclusivo a named actions y rechaza escrituras genéricas
- Documentar actionContracts() en neo-headless-extensibility 2.7.1 — reemplaza el mecanismo declaredActions (retirado)
- Actualizar prompts de agente a spec/entity bank-statements — alineación con desarrollos en ETP-5468

## Deuda dejada
- Los prompts ahora apuntan a bank-statements en spec/entity, cuyo desarrollo aparenta estar en paralelo en develop (ETP-5468)
