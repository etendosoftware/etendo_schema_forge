---
task: ETP-5192
note: ETP-5192/ced32830
kind: backfill
date: 2026-09-09T19:57:25.000Z
authors:
  - leandro.allemandi
agents:
sessions:
commits:
  - 6562589b3e
files:
  - tools/app-shell/src/pages/OnboardingPage.jsx
  - tools/app-shell/src/windows/custom/organization/BusinessTypeCards.jsx
  - tools/app-shell/src/windows/custom/organization/__tests__/OrganizationPage.vitest.jsx
---

## Resumen
Se removió la opción "Advisory" del selector de tipo de negocio en el flujo de incorporación. Los cambios incluyen actualización del componente BusinessTypeCards y sus tests asociados.

## Descartado
- Mantener la opción con estado deshabilitado — se eliminó completamente en lugar de ocultarla
