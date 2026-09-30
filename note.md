---
task: ETP-5498
note: ETP-5498/9992857f
kind: backfill
date: 2026-09-28T19:09:58.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - d271f20cdc
  - 45e4146cc6
files:
  - cli/src/data-fixes/sql/20260928T120000Z__R41-generic-category-to-generico.sql
  - e2e/tests/flows/products/product-import-category-resolution.integration.spec.js
  - e2e/tests/helpers/product-helpers.js
  - cli/src/data-fixes/sql/20260928T130000Z__R42-generic-category-trl-cleanup.sql
---

## Resumen
Se renombró la categoría de producto seeded "Generic" a "Genérico" en GO Client y se limpió redundancia subsecuente. Se aplicaron dos migraciones de datos para tenants ya onboarded.

## Decisiones
- **Usar data-fixes numeradas (R41, R42) en lugar de cambio directo de schema**: proporciona trazabilidad completa y permite auditoría de cambios en el catálogo.
- **Crear R42 como fix independiente**: como R41 fue aplicada antes de detectar la necesidad de limpiar filas redundantes de "Genérico Trl", y el catálogo marca las fixes aplicadas como inmutables, se necesitó una nueva fix fechada en lugar de editar R41.

## Deuda dejada
- Las migraciones R41 y R42 asumen que el modelo de datos de categorías es lo suficientemente estable para estas operaciones; si la estructura de `Trl` cambia, podría requerir revisión de la lógica de limpieza.
