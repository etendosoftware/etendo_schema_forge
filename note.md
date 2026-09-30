---
task: ETP-5393
note: ETP-5393/b684de53
kind: backfill
date: 2026-09-18T03:46:21.000Z
authors:
  - RubenEtendo
agents:
sessions:
commits:
  - 85423157f7
files:
  - docs/generated-custom-windows/fiscal-models.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/FmTabContent.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmTabContent.sourceRowKey.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.stringBoxCoercion.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/AeatSubmitFlow.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmBoxes303.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/AeatSubmitFlow.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmBoxes303.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.negativeBoxClamp.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.requiredFieldGate.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.bankIbanRequiredWhen.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.bankVisibilityReactivity.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.requiredFields.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/fm303Layouts.js
---

## Resumen
Se corrigieron seis bugs QA identificados en la ventana Modelo 303 (fiscal-models): colisión de claves React, valores NaN en KPIs, validación de signos negativos, requisitos condicionales de datos bancarios y soporte para cajas auto-calculadas. Se incluyó cobertura test nueva.

## Decisiones
- Implementar fixes como correcciones de lógica en componentes y utilities en lugar de refactorización mayor: los bugs eran puntuales.
- Añadir tests específicos por comportamiento (sourceRowKey, stringBoxCoercion, requiredFieldGate, bankIbanRequiredWhen, bankVisibilityReactivity) en lugar de cobertura genérica.
- Expandir la documentación (fiscal-models.md) junto con los fixes para mantener sincronía.

## Deuda dejada
- El fix del preflight guard en AeatSubmitFlow menciona "desync fix", sugiriendo una inconsistencia previa que ahora está cubierta pero podría requerir auditoría en flujos relacionados.
- Los tests nuevos cubren casos específicos; casos edge adicionales en lógica de visibilidad condicional de campos pueden existir fuera del scope actual.
