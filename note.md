---
task: ETP-5473
note: ETP-5473/6828cf00
kind: backfill
date: 2026-09-25T18:18:04.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - ce130b4e24
files:
  - agent-prompts/financial-account/account.md
  - agent-prompts/financial-account/spec.md
  - artifacts/financial-account/contract.json
  - artifacts/financial-account/contract.mcp.json
  - docs/generated-custom-windows/financial-account.md
  - tools/app-shell/src/hooks/useAccountMutations.js
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/financial-account/EditAccountModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/EditAccountModal.vitest.jsx
---

## Resumen
Alineación de validaciones de país para cuentas financieras entre frontend y backend. El modal de edición ahora bloquea guardar si el IBAN carece de país asignado, reflejando cambios en contratos de agentes, prompts y documentación.

## Decisiones
- Bloquear Save en EditAccountModal cuando país es nulo — mantener integridad de datos en frontend
- Requerir país en create (no solo en update) — alinear reglas entre operaciones
- Propagar cambio a agent-prompts y contratos MCP — documentar nueva restricción para agentes de IA

## Deuda dejada
- El cambio afecta el flujo de creación de cuentas bancarias sin país; comportamiento anterior permitido, nuevo flujo lo rechaza — verificar si hay cuentas existentes en estado inválido
- Tests de EditAccountModal expandidos significativamente (69 líneas añadidas); potencial falta de coverage en paths de error backend o interacciones complejas
