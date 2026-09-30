---
task: ETP-5050
note: ETP-5050/5803d02f
kind: backfill
date: 2026-09-17T16:06:36.000Z
authors:
  - Martin Taal
agents:
sessions:
commits:
  - 7420f69eb6
  - 10aa947b47
  - 17a31c158f
  - 8d77a1ff86
files:
  - docs/usage-measurement.md
  - docs/index.md
  - docs/neo-headless-extensibility.md
---

## Resumen
Documentación integral de medición de uso (ETP-5050): catálogo y tablas agregadas, estrategias de conteo con SPI extensible, ventana de asentamiento y sealing pass. Mejoras operacionales: run log reporta ahora errores específicos (antes Success en runs fallidos), y parámetros de fecha renombrados a terminología estándar.

## Decisiones
- **Stock vs. flow**: stocks requieren backfill (reescribir hoy contra cada día pasado) porque el origen solo contiene nivel actual sin historial.
- **Granularidad del run log**: por-run (no por-day), acumulado en memoria y escrito post-loop.
- **Naming**: parámetros alineados a terminología de Etendo (Starting/Ending Date) con búsqueda case-insensitive.
- **SPI para contadores**: @Named-only aplica al contador y NeoHandler (resolución por qualifier), pero no a observers (por event type).

## Deuda dejada
- Implementación de activeUsers como recurso stock aún sin resolver.
- Tres campos de entidad (AD) cuyos defaults causan defectos solo en output generado; no detectados por validador XML.

## Pendiente
- Definir estrategia de conteo para activeUsers.
