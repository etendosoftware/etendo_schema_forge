---
task: ETP-5481
note: ETP-5481/9a864fb3
kind: backfill
date: 2026-09-25T14:57:05.000Z
authors:
  - RubenEtendo
agents:
sessions:
commits:
  - ca32cea21e
  - b62fda7122
files:
  - cli/src/data-fixes/sql/20260924T120000Z__R40-aeatsii-cause-exemption-catalog.sql
  - cli/test/data-fixes-r40-aeatsii-cause-exemption-catalog.test.js
  - docs/etendo-ad/onboarding-and-datafixes-map.md
  - docs/etendo-ad/onboarding-gaps.md
  - docs/etendo-ad/tenant-remediation-knowledge.md
---

## Resumen
Se reinició el catálogo AEATSII_CAUSE_EXEMPTION como filas de sistema para la release R40 y se documentó un hallazgo sobre AD_MODULE.STATUS. La implementación incluye migración SQL, tests automatizados y actualización de documentación de remediación de inquilinos.

## Decisiones
- Crear migración SQL dedicada para el reseed del catálogo, separada de la lógica de aplicación
- Agregar tests de validación del reseed en la suite de pruebas existente
- Documentar el cambio en tres guías: mapa de datafixes, brechas de onboarding y conocimiento de remediación
- Registrar el hallazgo sobre AD_MODULE.STATUS como descubrimiento de refutación en la documentación de remediación

## Deuda dejada
- La documentación de onboarding-gaps sugiere que existen más brechas identificadas (78 líneas agregadas), lo que implica trabajo adicional de remediación aún no implementado
