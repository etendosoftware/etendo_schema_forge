---
task: ETP-5438
note: ETP-5438/5fc4e781
kind: backfill
date: 2026-09-24T11:16:38.000Z
authors:
  - AyelenGarcia01
agents:
sessions:
commits:
  - 8fea6e65d7
  - 3037d40a25
  - fb469fb236
  - 86dc413fbf
  - 0696098595
  - d305a176f0
  - ca11c158e2
  - 14e2b81f8c
  - e495dcbe93
  - 41fa97272f
  - d7255354af
  - 681d1cd304
  - afb6093367
  - 21ae37b2ae
  - c4230ba9b6
  - ca4d6842d8
  - 1d7c30bbcc
  - fe36dcfedf
  - 6aa1745e3c
  - 0a28ed5d63
  - 38ae64fda9
  - d7c70f47ea
files:
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmListPageAutoCompute.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/FmModel349Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.render.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.submittedFreeze.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/useFiscalAutoCompute.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.submittedFreeze.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.vitest.jsx
  - docs/generated-custom-windows/fiscal-models.md
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmBoxes303.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmBoxes303.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.negativeBoxClamp.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/fm303Layouts.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmListPage.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/useFiscalAutoCompute.invalidate.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.additional.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/FiscalModelsPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FiscalModelsPage.statusChange.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/persistDeclarationStatus.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.presentRollback.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.presentRollback.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.aeatFlow.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.telematicSuccess.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.snapshotContents.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.snapshotContents.vitest.jsx
  - tools/app-shell/src/components/account/SubscriptionSection.jsx
  - tools/app-shell/src/pages/FirstStepsPage.jsx
---

## Resumen
Congelamiento de modelos fiscales (303 y 349) tras presentación: detiene recomputos automáticos de operadores y oculta botones de generación. Implementa snapshots persistidos para servir declaraciones presentadas desde caché inmutable, eliminando el problema de recolectar facturas vivas en buckets ya presentados. Se amplían validaciones de signos negativos en cajas AEAT (70, 78, 109, 110) y maxLength en campos bancarios.

## Decisiones
- **Bucket congelado separado**: declaraciones presentadas (submitted/submitted_ext/submitted_ack) en bucket propio con `checkModifiedFn` siempre falso, computadas una única vez. Ready/skipped mantienen comportamiento uno-por-mount.
- **Snapshots persistidos**: detalle de Modelo 303/349 computa declaraciones presentadas si caché vacío y escribe en caché compartida para consistencia lista-detalle.
- **Cancelación de computaciones stale**: cancelar recomputes de declaraciones ya presentadas para evitar race conditions.
- **Validaciones AEAT**: cajas 70, 78, 109, 110 clampean negativos con toast; maxLength añadido a 6 campos bancarios y nro_justificante.
- **Snapshot como single source**: ocultar detalle de factura cuando se sirve desde snapshot; mostrar Origen 349 desde snapshot (plain-text por límite tamaño).

## Descartado
- **bank_sepa a enum (4 valores)**: revertido quirúrgicamente en commit separate para evitar race conditions entre tickets. Mantenidos sign-guard de cajas y maxLength en otros campos.

## Deuda dejada
- **Complejidad en páginas detalle**: helper extraction (snapshotContents) mitiga pero lógica de frozen vs live sigue siendo densa.
- **bank_sepa pendiente**: conversión a select con validación enum queda para ticket separado.

## Pendiente
- Implementación de enum bank_sepa en ticket correlativo.
