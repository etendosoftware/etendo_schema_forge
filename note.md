---
task: ETP-5322
note: ETP-5322/97356fd3
kind: backfill
date: 2026-09-14T17:11:24.000Z
authors:
  - sebastianbarrozo
agents:
sessions:
commits:
  - 5c730c0f53
files:
  - .github/workflows/deploy-staging.yml
  - docs/feature-flags.md
---

## Resumen
Se habilitó la clave de SDK de ConfigCat para producción en el workflow de deploy a staging. Esto permite usar feature flags de ConfigCat en el ambiente de staging con la configuración de producción.

## Decisiones
- Integrar ConfigCat en staging con la clave de producción — para validar el comportamiento de feature flags antes de ir a producción

## Deuda dejada
- El workflow de staging ahora usa la clave de producción; esto requiere vigilancia para evitar cambios accidentales de flags en staging que afecten producción
