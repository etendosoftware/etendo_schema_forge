---
task: ETP-5327
note: ETP-5327/60d97476
kind: backfill
date: 2026-09-14T19:53:43.000Z
authors:
  - Gremiger
agents:
sessions:
commits:
  - c77f12bfd3
  - 56289c57c9
  - ed8725958b
files:
  - e2e/tests/flows/user-invitation.email.integration.spec.js
  - docs/etendo-go-invitation-e2e-learnings.md
---

## Resumen
Se solucionó la intermitencia de un test E2E en cross-client (`stay-in-current`) mediante cambios significativos en el spec, se documentaron los aprendizajes sobre el contexto de `canStayInCurrent` y se corrigieron detalles de formato e importaciones en la suite.

## Decisiones
- **Refactorizar el test E2E** — el volumen de cambios (105 inserciones, 41 eliminaciones) sugiere una reestructuración del flujo de prueba para eliminar la condición de carrera o el timing que causaba flakiness
- **Documentar explícitamente el contexto de `canStayInCurrent`** — crear un archivo de aprendizajes reduce el riesgo de que se reintroduzca el bug o se malinterprete el comportamiento esperado en futuros cambios
- **Limpiar indentación e importaciones** — corregir la ruta de import de `persistEnvironmentSession()` asegura consistencia con el resto del codebase

## Deuda dejada
- La documentación de aprendizajes es nueva (35 líneas) pero el archivo carece de otras referencias que podrían explicar qué hizo que el test fuera "flaky" originalmente; solo registra la solución
