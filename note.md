---
task: ETP-5400
note: ETP-5400/668d1e97
kind: backfill
date: 2026-09-21T03:49:06.000Z
authors:
  - ivanrobledofutit
agents:
sessions:
commits:
  - 76b52fe902
files:
  - tools/app-shell/src/pages/ReportViewerPage.jsx
---

## Resumen
Se corrigió el problema de selectores de dimensión atascados en estado "Loading" en la página de visualización de reportes. El cambio reduce significativamente la complejidad del componente ReportViewerPage.

## Decisiones
- Refactorización del componente con eliminación de 122 líneas frente a 36 agregadas — simplificar la lógica parece haber sido la ruta para resolver el bloqueo

## Deuda dejada
- No se puede determinar de la evidencia disponible qué lógica específica causaba el bloqueo o si hay casos edge pendientes sin cubrir
