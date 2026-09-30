---
task: ETP-5352
note: ETP-5352/6ca08f36
kind: backfill
date: 2026-09-18T19:15:08.000Z
authors:
  - Francisco Roig
agents:
sessions:
commits:
  - b8bf0d1619
  - 6d7c39bbf2
files:
  - cli/src/data-fixes/sql/20260918T120000Z__R38-org-legalentity-pointer.sql
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - cli/test/data-fixes-report-regression.test.js
---

## Resumen
Se completó el backfill de punteros de entidad legal para R38 y se integró la validación de data-fixes. Se documentaron las correcciones de brecha de datos en el flujo de onboarding.

## Decisiones
- Implementar backfill mediante script SQL — permite ejecución controlada como parte del onboarding
- Adicionar R38 al allowlist de reportes de data-fixes — valida la corrección en el flujo estándar
