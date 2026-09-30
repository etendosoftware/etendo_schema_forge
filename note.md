---
task: ETP-5181
note: ETP-5181/0ca15e37
kind: backfill
date: 2026-09-10T16:40:44.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 6dd13ecbdb
  - e9b02887a3
files:
  - docs/generated-custom-windows/financial-account.md
  - tools/app-shell/src/lib/__tests__/dateOnly.test.js
  - tools/app-shell/src/lib/dateOnly.js
  - tools/app-shell/src/locales/__tests__/etp5181-fetch-interval-key.vitest.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/financial-account/EditAccountModal.jsx
  - tools/app-shell/src/windows/custom/financial-account/ImportedStatementsTab.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/EditAccountModal.vitest.jsx
  - tools/app-shell/src/windows/custom/financial-account/__tests__/ImportedStatementsTab.vitest.jsx
  - tools/app-shell/src/lib/__tests__/backendErrors.test.js
---

## Resumen
Se advierte al usuario cuando la fecha de importación solicita más historial del que el banco expone. Un banner en el panel notifica si importFromDate es anterior al límite del proveedor. Tras feedback de QA, se mejoró el wording del aviso de sincronización y se reposicionó el banner con mejor jerarquía visual.

## Decisiones
- El banner no bloquea ni edita la fecha automáticamente, solo advierte — permite que el usuario tome la decisión final
- Comparación estricta (`<`, no `≤`) en strings ISO contra el cálculo de daysDiff del módulo PSD2 — mantiene coherencia con el comportamiento de sincronización existente
- El banner de reauth ahora es azul informativo salvo en los últimos 7 días — reduce el ruido visual de un aviso ámbar permanente
- Las dos notificaciones se mantienen separadas, reposicionadas al pie del panel — resuelven la percepción de temas distintos

## Descartado
- Fusionar los banners de aviso en uno — QA los leía en extremos opuestos como problemas no relacionados
- Clamping automático de fechas — habría destruido la intención del usuario si el proveedor amplía su historial después

## Deuda dejada
- Conflicto potencial con reescritura de AccountsHeaderTable.jsx en rama ETP-5140, dejado sin resolver para evitar conflictos de merge
