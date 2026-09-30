---
task: ETP-5037
note: ETP-5037/d2c7e4df
kind: backfill
date: 2026-09-11T16:07:41.000Z
authors:
  - jortolano
agents:
sessions:
commits:
  - b0cf145419
  - 7a7c098ba9
  - 5dfbec133a
  - c13cef13dc
files:
  - artifacts/goods-movements/contract.json
  - artifacts/goods-movements/contract.mcp.json
  - artifacts/goods-movements/decisions.json
  - artifacts/goods-movements/generated/web/goods-movements/MovementPage.jsx
  - docs/generated-custom-windows/goods-movements.md
  - docs/plans/ETP-5037-goods-movements-stock-validation-plan.md
  - tools/app-shell/src/components/contract-ui/DataTable.jsx
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DataTable.fieldHelpers.vitest.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/DetailView.inlineRowUpdate.vitest.js
  - tools/app-shell/src/hooks/__tests__/useEntity.blockingCondition.vitest.jsx
  - tools/app-shell/src/hooks/useEntity.js
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
  - tools/app-shell/src/lib/backendErrors.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
---

## Resumen
Implementación de validación de stock para movimientos de mercaderías con mejoras en UX (mensajes de rechazo específicos por producto/almacén, reset de cantidad al cambiar producto) y refactorings defensivos para mantener calidad de código.

## Decisiones
- Descartar validación reactiva per-keystroke: implementada y verificada en vivo, pero descartada por decisión de diseño tras coordinación
- Extraer `applySelectedItemMappings` a `detailViewHelpers.jsx`: reducir complejidad cognitiva de `buildInlineRowUpdateHandler` (17 → bajo límite de 15)
- Mover `pruneInheritedParentKeys` a helpers para evitar crecimiento de líneas en `DetailView.jsx` versus rama develop

## Deuda dejada
- La validación reactiva per-keystroke está descartada pero el código probablemente aún contiene traces o comentarios sobre esto; puede ser referencia útil para futuras mejoras de UX

## Pendiente
- Nada evidente: cobertura de tests completa (4007 tests sobre 203 archivos), traducciones en ambos idiomas, y verificación de drift UI/contract realizada
