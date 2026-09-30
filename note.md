---
task: ETP-5415
note: ETP-5415/061e75e3
kind: backfill
date: 2026-09-29T17:32:13.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 66744adc59
  - 45b903a95f
  - cc141e884a
  - 55f030abe9
  - d96f711ed0
  - 2cd3ee954a
  - dfab8b55b9
files:
  - Makefile
  - docs/index.md
  - docs/ops/server-logs.md
  - scripts/tail-experimental-logs.sh
  - scripts/tail-logs.sh
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - .claude/agents/mcp-ticket-resolver.md
  - .claude/agents/reviewer.md
  - .claude/agents/schema-forge-developer.md
  - CLAUDE.md
  - docs/plans/2026-09-28-entity-customization-migrations.md
---

## Resumen
Se generalizó el soporte para consultar logs CloudWatch según entorno y servicio, se formalizó la regla sobre customizaciones de entidades en código compartido, y se documentó el inventario de migraciones pendientes para completar la transición a bindings por entidad.

## Decisiones
- Tabla de búsqueda explícita en lugar de interpolación de strings: los nombres de log groups no son uniformes entre servicios.
- Documentar la regla de entity-customization en CLAUDE.md como canonical: asegura criterio uniforme entre agentes y revisores.
- Medir migraciones contra código vivo, no estimarlas: permite programación precisa de tickets posteriores.
- AWS CLI setup integrado en la herramienta con validación y mensajes de corrección específicos.

## Descartado
- Mantener scripts hardcodeados: no escalan a múltiples entornos ni servicios.

## Deuda dejada
- Cinco migraciones pendientes: 92 customizaciones de annotation binding, 29 identidad literals, 80 handlers fuera de handlers/, compensaciones en write-path, 12 selector policies.
- RDS Proxy production expone solo ciclo de conexiones, no queries.
- Dos loose ends sin diagnóstico: grossUnitPrice como 0 en ambos paths; warehouse default difiere entre paths.
- 4 filas de divergence list fueron incorrectas hasta medirse.

## Pendiente
- Ejecutar las cinco migraciones (no bloquean merge; coexisten ambos bindings).
- Re-habilitar instance log exports para RDS production (fuera del repo).
