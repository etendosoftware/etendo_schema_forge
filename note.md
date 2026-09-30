---
task: ETP-5399
note: ETP-5399/ca91d8e3
kind: backfill
date: 2026-09-25T14:40:16.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - c43aa47032
  - eef633c8f0
  - 1ad57baf80
  - 41f9e9da2d
  - ff38adfe7f
  - e4555d6d46
  - 54bd943f32
  - 5fe0f25188
  - 36373e4df8
  - 3f39c8de33
  - 51b4c94ab8
  - 113be379b5
  - bfb922d65e
  - 17c7b6e54f
  - 0af15ea980
files:
  - tools/app-shell/src/windows/custom/chart-of-accounts/AccountTreeView.jsx
  - tools/app-shell/src/windows/custom/chart-of-accounts/NewAccountModal.jsx
  - artifacts/chart-of-accounts/custom/AccountCodeField.jsx
  - tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/AccountTreeView.vitest.jsx
  - tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/NewAccountModal.vitest.jsx
  - docs/generated-custom-windows/chart-of-accounts.md
  - artifacts/chart-of-accounts/custom/AccountTreeView.jsx
  - artifacts/chart-of-accounts/custom/NewAccountModal.jsx
  - artifacts/chart-of-accounts/custom/accountTypeLabels.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - artifacts/chart-of-accounts/custom/__tests__/NewAccountModal.test.js
  - artifacts/chart-of-accounts/contract.json
  - artifacts/chart-of-accounts/contract.mcp.json
  - artifacts/chart-of-accounts/decisions.json
  - tools/app-shell/src/components/contract-ui/AccountBadgeSelect.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/AccountBadgeSelect.vitest.jsx
  - tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/AccountCodeField.vitest.jsx
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.interactions.vitest.jsx
  - docs/ui-customization.md
  - tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/newSubAccountModal.test.js
  - tools/app-shell/src/windows/custom/chart-of-accounts/accountTypeLabels.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - cli/cache/ad-snapshot/4b9dcbaf3ba32fedaf88211848edfc48cf2b79afdc45c40e2eda29013b8cf3db.json
  - cli/cache/ad-snapshot/917023ab920b7fd27a61f785a879fe7ec79a80db07b3af559d3dbbd8aec48187.json
  - cli/cache/ad-snapshot/bd2081e9eb5e4813c7c8734f21ab9a34e55b4851d8ea1aec628f519ac21ebf3f.json
  - cli/cache/ad-snapshot/d68e740d5005cee2334dc9682c1619cc10b18258b4a6825eb50d6445005b732b.json
  - cli/cache/ad-snapshot/e2ccbb82e2ce334319f25b27817ec61012a823f5ad5dea50e188a74a2eecb3a7.json
---

## Resumen
Migración de heurística a estructura real para resolver cuenta padre en plan de cuentas: cambió de 4 caracteres fijos a ElementLevel. Arreglaron duplicación de accountType en modelo extractor que causaba que cuentas nuevas se guardaran siempre como Expense.

## Decisiones
- Usar ElementLevel (Heading/Account/Breakdown/Subaccount) como punto de inserción estructural en lugar de heurística — elimina bloqueos con cuentas sufijadas (e.g. "430A")
- Agregar columna Element Level al árbol CoA — transparencia de la estructura usada internamente
- Preservar Account Type cuando cambia la cuenta padre — ley de menor sorpresa para el usuario
- Remover componentes duplicados bajo tools/app-shell/src/ — no se importaban y los tests los leían en lugar de los reales
- Hacer sticky el toolbar y filter del árbol — accesibilidad

## Descartado
- Duplicado accountType2 en contrato (phantom row con Action='P') — causa root identificada en extractor core
- Merge de develop en preview — traía cambios (ETP-5256 MCP alias) no esperados en tests

## Deuda dejada
- Verificación en tenant autenticado quedó pendiente (TestSprite no disponible)
- Versión de schema_forge_core es preview (0.3.62-preview): requiere migración a release cuando PR #258 se mergee
- Cache AD recomputado manualmente en lugar de refresh completo; una ventana (Product Category) quedó con drift local no relacionado

## Pendiente
- Esperar merge de schema_forge_core PR #258 y usar versión released
- Verificación en ambiente tenant real
