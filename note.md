---
task: ETP-5405
note: ETP-5405/dfdd3511
kind: backfill
date: 2026-09-18T17:25:54.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 6f4955fa60
  - 4394c9f579
  - fd258340c5
files:
  - .gitignore
  - Makefile
  - mcp-usage/README.md
  - scripts/mcp-usage-dump.sh
  - docs/plans/2026-09-18-mcp-usage-batch-1-fixes.md
---

## Resumen
Se agregaron herramientas de exportación de telemetría MCP y se documentó un plan exhaustivo de correcciones basado en análisis de 253 filas de exportaciones iniciales, verificado mediante agentes de IA sin contexto previo.

## Decisiones
- Usar agentes de IA sin contexto previo (5 ejecuciones) para verificar defectos de forma objetiva — valida que el comportamiento observado no sea artefacto de la descripción del defecto
- Organizar correcciones por categoría (CODE, METADATA, DOCS) primero, luego por dependencias — unblocks más claro que severidad pura
- Excluir explícitamente read-path parity para 80 entidades backed por tabs de este batch — reduce scope

## Descartado
- Verificación de C1, C2 (procesos Classic/OBUIAPP no alcanzados en pruebas), M11 (sesión expirada no forzable bajo demanda), C6 (limitaciones de producción)

## Deuda dejada
- 7 items confirmados abiertos con evidencia (M2–M3, M7–M10, D1)
- 4 nuevos defectos de errores engañosos sin implementar (C9, C11, C10, C12)
- D3: corpus de docs idéntico sin importar topic — causa en índice Context7, no en este módulo
- Varios items requieren verificación contra instancia en ejecución antes de programarse

## Pendiente
- Implementar correcciones para items confirmados abiertos
- Cerrar defectos de errores misleading (impiden que agentes reporten trabajo inexistente)
- Escribir documentación faltante (D1)
