---
task: ETP-5426
note: ETP-5426/2496dd46
kind: backfill
date: 2026-09-30T17:18:51.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - 32d8b26f1d
  - 400d937ce8
files:
  - docs/etendo-ad/onboarding-gaps.md
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - tools/app-shell/src/pages/OnboardingPage.jsx
  - tools/app-shell/src/pages/__tests__/OnboardingPage.vitest.jsx
---

## Resumen
Se añadió la opción de aceptación de datos de muestra en el flujo de onboarding con soporte multiidioma (en_US, es_AR, es_ES) y se fijó la dependencia core a una versión preview.

## Decisiones
- Agregar traducciones para opt-in de datos de muestra en tres idiomas — garantizar coherencia multilingüe desde el inicio
- Fijar core a commit e4fbaef preview — usar una versión de desarrollo específica para testing

## Deuda dejada
- Dependencia core fijada a versión preview (e4fbaef) — puede no ser estable en producción
- Documento onboarding-gaps.md creado — indica que el flujo de onboarding tiene brechas documentadas pero no cerradas

## Pendiente
- Evaluar cuándo promocionar core del preview a una versión estable
- Resolver los gaps documentados en onboarding-gaps.md
