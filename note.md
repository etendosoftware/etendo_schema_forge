---
task: ETP-5512
note: ETP-5512/3f45eeca
kind: backfill
date: 2026-09-28T16:03:22.000Z
authors:
  - AyelenGarcia01
agents:
sessions:
commits:
  - f43506f52b
files:
  - tools/app-shell/src/windows/custom/fiscal-models/models/303/__tests__/FmModel303Page.submittedFreeze.vitest.jsx
---

## Resumen
Se sincronizó la suite de tests 303 submittedFreeze con el versionado de caché actualizado en ETP-5456. Después de bumpearse la clave sessionCacheKey a `fiscal_ac_v4_`, los tests seguían buscando la versión v3, causando timeouts en los assertions de caché.

## Decisiones
- Actualizar las claves de caché en los tests del archivo FmModel303Page.submittedFreeze.vitest.jsx — mantener consistencia con el bump de versión realizado previamente

## Deuda dejada
- No existe evidencia de auditoría de otras suites de tests que pudieran leer claves v3 deprecadas; el fix es puntual en este archivo

## Pendiente
- Revisar si hay otros tests que referencien versiones antiguas de sessionCacheKey y pudieran presentar el mismo problema
