---
task: ETP-5504
note: ETP-5504/a92f3588
kind: backfill
date: 2026-09-28T19:45:55.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - b3376cc8db
  - 11706d295e
  - 54febfaff6
  - ea09d3f1e8
files:
  - docs/e2e-testing-guide.md
  - docs/generated-custom-windows/app-shell-functional-flows.md
  - tools/app-shell/src/components/contract-ui/DetailView.jsx
  - tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
  - tools/app-shell/src/components/layout/PageMetaContext.jsx
  - tools/app-shell/src/components/layout/TopBar/TopBar.jsx
  - tools/app-shell/src/components/layout/TopBar/__tests__/TopBar.vitest.jsx
  - tools/app-shell/src/components/layout/TopBar/breadcrumb.js
  - tools/app-shell/src/layout/AppLayout.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - e2e/tests/flows/purchases/return-to-vendor-shipment.mocked.spec.js
  - e2e/tests/flows/sales/sales-quotation-etp4006.mocked.spec.js
  - e2e/tests/flows/purchases/purchase-order-to-invoice.integration.spec.js
  - tools/app-shell/src/components/contract-ui/__tests__/detailViewHelpers.breadcrumbItems.vitest.js
  - tools/app-shell/src/components/layout/TopBar/__tests__/breadcrumb.vitest.js
  - tools/app-shell/src/components/layout/__tests__/PageMetaContext.renderLoop.vitest.jsx
---

## Resumen
Se implementó un layout responsive del TopBar para viewport de 1280x720 y menores. La búsqueda funciona como item fijo centrado, los breadcrumbs colapsan inteligentemente, y los controles se reubican en un menú de overflow.

## Decisiones
- Search como item fijo de 392px en flujo flex, posicionado entre title block (256px) y actions
- Breadcrumbs con colapso dinámico: más de 3 niveles se contraen a patrón "primero / más / actual" con dropdown para niveles ocultos
- Punto de quiebre en 1366px: page quick actions y rightExtras migran a menú overflow derecho
- Cobertura con tests unitarios (vitest) y e2e (Playwright) para validar resize y comportamientos responsive

## Deuda dejada
- Tests e2e requirieron ajustes posteriores de localizadores (commits siguientes), indicando que la interacción entre breadcrumbs y e2e no fue anticipada completamente en el primer commit
- Punto de quiebre en 1366px está establecido pero sin evidencia de validación en resoluciones intermedias (ej: 1024x768, 1440x900)
