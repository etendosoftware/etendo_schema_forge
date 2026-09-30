---
task: ETP-4353
note: ETP-4353/0ac7ce82
kind: backfill
date: 2026-09-22T17:29:50.000Z
authors:
  - Juan Funes
agents:
sessions:
commits:
  - 8aa5d6be90
  - 8b401a915b
  - e224c821e0
  - 4d3ab74db2
files:
  - docs/surveys.md
  - tools/app-shell/src/components/survey/SurveyModal.jsx
  - tools/app-shell/src/lib/surveys/survey-config.js
  - tools/app-shell/src/lib/surveys/surveys.js
  - tools/app-shell/src/lib/surveys/__tests__/survey-engine.vitest.js
  - tools/app-shell/src/components/survey/__tests__/SurveyModal.vitest.jsx
  - tools/app-shell/src/lib/surveys/__tests__/survey-config.vitest.js
  - tools/app-shell/src/lib/surveys/__tests__/surveys.vitest.js
---

## Resumen
NPS y csat_onboarding se alinearon con el mecanismo centralizado de configuración backend. NPS ahora obtiene opciones de chips desde el mismo servicio que csat, y el delay de onboarding pasó de hardcoded a configurable sin romper tenants existentes.

## Decisiones
- Reutilizar `getSurveyTypeConfig` y `minAccountAgeDays` para el delay onboarding, agregando `DEFAULT_SURVEY_ONBOARDING_DELAY_DAYS=1`
  - Evita duplicación; unifica el patrón de configuración backend
- Mantener ChipGroup en NPS (sin iconos, a diferencia de csat)
  - Preserva el comportamiento visual actual
- Codificar el chip IA antiguo de promoters como score band (8-10) en fallback offline
  - Integra lógica legacy dentro del nuevo sistema configurable

## Deuda dejada
- El default env (1 día) coexiste con el comportamiento legacy de 24h si `minAccountAgeDays` no está configurado; la documentación aclara esto pero la lógica condicional es frágil ante cambios futuros

## Pendiente
- Migración de tenants legacy a la nueva configuración backend (actualmente dependen del fallback hardcoded)
