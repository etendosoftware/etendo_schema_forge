---
task: ETP-5391
note: ETP-5391/8fe9bed1
kind: backfill
date: 2026-09-18T11:51:06.000Z
authors:
  - AyelenGarcia01
agents:
sessions:
commits:
  - 8ab3d03d89
  - 501e246eb6
  - 74ae14b4b4
  - b47eacfd10
  - cec6b1292c
  - b2244e4ce1
  - bad3e1b752
  - 4452790f7c
  - addc1bb358
  - ce4e830c33
  - d1973cb455
files:
  - tools/app-shell/src/windows/custom/fiscal-models/FmOverlays.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/fm303Layouts.js
  - tools/app-shell/src/windows/custom/organization/OrganizationPage.jsx
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/windows/custom/fiscal-models/fiscalModelsUtils.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/FmBoxes303.jsx
  - docs/generated-custom-windows/fiscal-models.md
  - docs/generated-custom-windows/organization.md
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmOverlays.coverage.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/FmOverlays.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/__tests__/fiscalModelsUtils.additional.test.js
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmBoxes303.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.casillasSections.vitest.jsx
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/fm303Layouts.vitest.js
  - tools/app-shell/src/windows/custom/organization/__tests__/OrganizationPage.vitest.jsx
  - e2e/tests/flows/fiscal-models-303-identification.mocked.spec.js
---

## Resumen
Implementación de ETP-5391: restricción de nuevas declaraciones al año 2026, adición de casillas territoriales/información adicional en Modelo 303 (últimos períodos únicamente), integración del certificado digital organizacional y mapeo de nuevas casillas a parámetros AEAT. Incluye espejo automático de datos y validaciones de porcentaje.

## Decisiones
- **SELECTABLE_YEARS vs SUPPORTED_YEARS**: Separar años disponibles para crear nuevas declaraciones (solo 2026) de años consultables en layouts históricos. Permite cumplir regulación sin bloquear acceso a datos.
- **isLastPeriodOfYear como control**: Gatear casillas territoriales (89-92/107) y bloque información adicional solo para T4/M12, evitando lógica duplicada.
- **Mapeo directo AEAT sin backend**: Nuevas casillas (70/76/77) se envían por inputParams genéricos existentes, sin cambios en servicios.
- **Espejo casilla 107→65 automático**: Validación con clamp/round para sincronización en tiempo real.

## Deuda dejada
- **Workaround E2E**: Helper `goToExistingDeclaration()` agregado porque tests que creaban declaraciones de años históricos ahora fallan. El flujo funciona pero depende de seed manual.
- **Mock del icono Save**: Indica dependencia no resuelta del merge con develop (flujo "Guardar").

## Pendiente
- Validar merge con cambios de develop que el Save icon depende de.
