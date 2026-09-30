---
task: ETP-3504
note: ETP-3504/c555a1ca
kind: backfill
date: 2026-09-24T00:13:05.000Z
branches:
  - epic/ETP-3504
authors:
  - github-actions[bot]
agents:
  - claude-code
sessions:
  - 2ddb8fe3-527c-4c94-9630-84caca9fb7e2
commits:
  - 4c898fcb3c
files:
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
---

## Resumen
Se actualizó el pin de `schema_forge_core` a versión 0.3.60 en las dependencias del proyecto y sus herramientas.

## Decisiones
- Usar bump automático vía bot de GitHub — mantiene las dependencias sincronizadas sin intervención manual

## Deuda dejada
- No se describe en los commit messages qué cambios o fixes trae schema_forge_core 0.3.60, ni si hay cambios requeridos en el código del proyecto para que sean compatibles
