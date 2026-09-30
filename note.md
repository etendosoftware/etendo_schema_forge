---
task: ETP-5307
note: ETP-5307/50837ac1
kind: backfill
date: 2026-09-12T22:17:04.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - 9f4fcd65fb
  - afdfc97cce
files:
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - e2e/playwright.config.js
  - scripts/run-e2e-full.sh
---

## Resumen
Se aislaron 4 specs con fallos no-determinísticos relacionados con contención en un proyecto serial de Playwright, reduciendo el costo de serialización al 3% de la suite mocked mientras el resto mantiene paralelismo completo.

## Decisiones
- Identificar y aislar solo los 4 specs contención-sensibles (attachments, fiscal-models-303-identification, sales-invoice-discount-display, inline-lines-quotation) en proyecto serial — en lugar de serializar toda la suite mocked (~118 specs).
- Crear proyecto `mocked-serial` con `workers: 1` para estos 4 specs específicos; mantener `workers: 4` para el resto.
- Actualizar app-shell-core a preview fix (posiblemente la corrección de AuthContext de schema_forge_core PR #205, ya que el problema residual persistía aún después de esa corrección).
- Actualizar run-e2e-full.sh para ejecutar ambos proyectos coordinadamente.

## Descartado
- Serializar toda la suite mocked — costo prohibitivo de paralelismo perdido.
- Investigar causa raíz única — análisis extenso no encontró dominante común entre los 4 specs (fiscal-models no resolvió cuando attachments fue aislado).

## Deuda dejada
- 1 fallo residual raro aún presente dentro del set serializado.
- Sensibilidad en fiscal-models sin atribución clara.
- Performance de PDF build en Sales Order (ETP-5308, CPU-heavy, uncached).
- 2 flakes pre-existentes no relacionados: bp-blocking-banner, contacts-list-sort-column-width.

## Pendiente
- Investigar causa raíz del fallo residual en specs serializados.
- Dirección de ETP-5308 (performance de compilación PDF).
