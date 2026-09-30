---
task: ETP-5009
note: ETP-5009/8419fb9a
kind: backfill
date: 2026-09-17T17:23:16.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 0a9f50a115
  - f1d35f1b52
  - a54145344a
  - 824a57d6de
  - 7cd754650b
  - 323fdffec7
  - ff7eff82df
files:
  - docs/walkthrough-flows.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/walkthrough/__tests__/flow-revisions.test.js
  - tools/app-shell/src/walkthrough/flows/create-contact.json
  - docs/list-filters.md
  - tools/app-shell/src/components/contract-ui/ListView.jsx
  - tools/app-shell/src/components/contract-ui/__tests__/ListView.sessionState.vitest.jsx
  - tools/app-shell/src/lib/__tests__/listViewSession.test.js
  - tools/app-shell/src/lib/listViewSession.js
  - tools/app-shell/src/test/setup.js
  - tools/app-shell/src/windows/custom/goods-receipt/index.jsx
  - tools/app-shell/src/windows/custom/goods-shipment/index.jsx
  - tools/app-shell/src/windows/custom/purchase-invoice/index.jsx
  - tools/app-shell/src/windows/custom/sales-invoice/index.jsx
  - tools/app-shell/src/windows/custom/shared/__tests__/deepLinkWindowsFlag.test.js
  - tools/app-shell/src/windows/custom/shared/__tests__/pendingDeliveryFilter.test.js
  - tools/app-shell/src/windows/custom/shared/pendingDeliveryFilter.js
  - tools/app-shell/src/hooks/__tests__/useBulkActionToast.vitest.jsx
  - tools/app-shell/src/hooks/useBulkActionToast.js
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/hooks/__tests__/useBulkActionToast.test.js
  - tools/app-shell/src/components/contract-ui/__tests__/lookupCreateTargets.vitest.js
---

## Resumen
Se implementó persistencia de filtros y ordenamiento en listas de contratos, restaurando el estado al navegar desde formularios. Los parámetros de URL tienen precedencia sobre el estado guardado, con acceso protegido a sessionStorage.

## Decisiones
- **Crear `listViewSession`** — Utilidad centralizada para manejar lógica de persistencia del grid state, separándola de la componente ListView
- **URL filters precedentes** — Los parámetros en URL anulan el estado guardado, permitiendo enlaces directos
- **sessionStorage guarded** — Proteger acceso en hooks ante entornos donde sessionStorage no está disponible (renderizado servidor, tests)
- **Localización del tutorial** — Actualizar strings en es_AR y es_ES además de en_US

## Deuda dejada
- Test flaky en `lookupCreateTargets` mitigado con hoisting de import, pero la causa raíz no se resolvió
- Patrón de guarding de sessionStorage aplicado puntualmente, sin abstracción centralizada
- Cobertura de edge cases con sessionStorage no guardado/quota excedida no documentada explícitamente

## Pendiente
- Refactorizar guarding de sessionStorage en un hook reutilizable si hay más casos de uso
- Investigar causa del test flaky si persiste
