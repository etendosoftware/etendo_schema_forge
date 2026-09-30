---
task: ETP-5456
note: ETP-5456/1493686f
kind: backfill
date: 2026-09-25T12:40:08.000Z
authors:
  - RubenEtendo
agents:
sessions:
commits:
  - ea29e71130
  - fe94321796
  - 6bab2ca789
  - a473a75347
  - 5cff3e6a88
  - 87fa04c0dc
  - 5b18a645b8
  - 5beb1da062
  - 6164325422
  - eb142e7949
  - bb711a53ab
files:
  - docs/generated-custom-windows/fiscal-models.md
  - tools/app-shell/src/lib/formatCurrency.js
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.boxRange.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmBoxes303.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmBoxes303.hardStop.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmBoxes303.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.exactValuePreservation.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.outOfRange.vitest.jsx
  - tools/app-shell/src/lib/__tests__/formatCurrency.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/fiscal-models.css
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/FmModel349Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscal-models.css.stickyLayout.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.stickyLayout.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.stickyLayout.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/FmTabContent.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmTabContent.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.cacheInvalidation.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/FiscalModelsPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/FmOverlays.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmListPage.tipoColumn.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmOverlays.coverage.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmOverlays.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/useFiscalAutoCompute.invalidate.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/useFiscalAutoCompute.vitest.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.render.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.submittedFreeze.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/349/__tests__/FmModel349Page.substitutive.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/useFiscalAutoCompute.js
---

## Resumen
Implementación integral de validación de rangos para casillas fiscales (Modelo 303/349) con prevención de entrada inválida por keystroke, precisión exacta en valores extremos, UI mejorada con secciones sticky, y correcciones de lógica de cálculo en adquisiciones intracomunitarias.

## Decisiones
- **Hard-stop en keystroke**: rechaza entradas que excedan límites (15 dígitos enteros, 14 si negativo, 2 decimales) en lugar de validar post-entrada, haciendo imposible tipear valores inválidos.
- **BigInt + string para precisión**: valores en límite legal se preservan exactamente evitando pérdida por redondeo numérico.
- **Bloqueo de acciones**: Guardar, Generar y Registrar se bloquean si hay overflow en casillas autocalculadas, con mensajes toast singular/plural según contexto.
- **Cache invalidation**: sessionStorage de cómputo se limpia tras Guardar/Calcular para evitar servir valores calculados bajo lógica antigua del backend.

## Descartado
- Pruebas de clamp-draft removidas
- Borradores intermedios de diseño revertidos

## Deuda dejada
- Documentación de dos drafts intermedios descartados se mantiene en fiscal-models.md para contexto histórico

## Pendiente
- Ninguno
