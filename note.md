---
task: ETP-5431
note: ETP-5431/12bdd644
kind: backfill
date: 2026-09-22T16:21:41.000Z
authors:
  - RubenEtendo
agents:
sessions:
commits:
  - 9cdcd0016a
  - be947f30dc
  - e7bf70765a
  - e1745df016
  - ceca6ef8a6
  - e2745bcfcb
  - c91083997b
  - 34da05a13b
  - d73efa31f6
  - 849cb3eb95
  - 0d196b0c40
  - 50653772ff
  - 9fb1a8dbba
  - ea2d9d5a4d
  - 3b4c91264b
  - a90b8235a7
  - c94560e1eb
files:
  - docs/generated-custom-windows/fiscal-models.md
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/fm303Layouts.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmBoxes303.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.bankIbanRequiredWhen.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.bankVisibilityReactivity.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.requiredFields.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.box111Autocomplete.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.negativeBoxClamp.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.requiredFieldGate.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.computeBox111.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.boxMerge.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/AeatSubmitFlow.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/AeatSubmitFlow.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.calcularPersists.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.identChangeSyncsBox111.vitest.jsx
---

## Resumen
Se implementó el manejo de la excepción Nota 3 para box 111 (datos bancarios): la sección se oculta cuando se marca `baja_domiciliacion`. Se agregó gating de campos bancarios por marca SEPA (requiere SWIFT-BIC en marca 2+, datos extranjeros en marca 3). Se automatizó el cálculo de box 111 desde boxes 69/70/71, se bloquearon negativos en boxes 109/70, y se sincronizaron overrides manuales en tres puntos críticos (cambio de identidad, cálculo, envío a AEAT).

## Decisiones
- Constante `_BANK_RECTIFICATIVA_BRANCH` compartida para garantizar que visibilidad y requerimiento no diverjan
- Marca SEPA como select (-, España, UE SEPA, Resto) en lugar de input libre, reflejando el dominio real (0/1/2/3)
- De Morgan (`_NOT_NOTA3`) sin sintaxis nueva en matchers
- Autocompletar box 111 en `recomputeDerivedBoxes`, invocado en múltiples puntos (UI, Calcular)
- Guardar valores ocultos al cambiar marca para preservar trabajo del usuario

## Descartado
- Entrada libre de marca SEPA: requería validación post-hoc; select previene inválidos en UI
- Limpiar campos ocultos: destruiría trabajo tipado en cambios de marca

## Deuda dejada
- 13 tests Nota 3 que escribían directo en box 111 se invalidan por autocompletar; documentados pero no reescritos (pendiente generador)

## Pendiente
- Generador de tests para escenarios Nota 3 con cálculo automático
