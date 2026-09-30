---
task: ETP-5522
note: ETP-5522/e5b6cfb2
kind: backfill
date: 2026-09-29T15:53:49.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - aecf3286f0
  - fd485ea70a
files:
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.cacheInvalidation.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/financialAccountCacheInvalidation.test.js
  - tools/app-shell/src/windows/custom/financial-account/__tests__/financialAccountCacheInvalidation.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/index.cacheInvalidation.vitest.jsx
  - docs/generated-custom-windows/financial-account.md
  - tools/app-shell/src/windows/custom/financial-account/ImportedStatementsTab.jsx
  - tools/app-shell/src/windows/custom/financial-account/financialAccountCacheInvalidation.js
  - tools/app-shell/src/windows/custom/financial-account/index.jsx
---

## Resumen
Se implementó la invalidación del cache de lista de cuentas financieras cuando hay mutaciones en detalles, y se cubrió con suite de tests exhaustiva. Resuelve el problema de que el badge de reconciliación mostraba datos obsoletos tras cambios en la cuenta.

## Decisiones
- **Invalidación reactiva vs. lazy loading** — Al mutar detalles de cuenta, se invalida el cache de la lista en lugar de esperar a que el usuario recargue. Más responsivo.
- **Módulo dedicado para invalidación** — Se extrajo la lógica en `financialAccountCacheInvalidation.js` en lugar de dejarla dispersa en componentes. Facilita reutilización y testing.
- **Cobertura test-first** — 615 líneas de tests vs. 87 líneas de código productivo. Indica que el comportamiento de cache es crítico y requería validación exhaustiva (vitest + playwright mocked e integration).
- **Documentación generada** — Se actualizó docs/generated-custom-windows/financial-account.md, probablemente auto-generada desde JSDoc.

## Descartado
No hay evidencia de alternativas consideradas en los commits.

## Deuda dejada
No se menciona código condicional, TODOs o casos no cubiertos en la evidencia disponible.

## Pendiente
No hay trabajo explícitamente marcado como pendiente.
