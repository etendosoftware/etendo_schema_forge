---
task: ETP-5256
note: ETP-5256/d7ec3fd0
kind: backfill
date: 2026-09-24T20:01:48.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - f0df8461e4
  - 8433089afe
  - 20cab2193a
files:
  - docs/agentic-validation/mcp-client-setup.md
  - tools/app-shell/src/locales/en_US.json
  - tools/app-shell/src/locales/es_AR.json
  - tools/app-shell/src/locales/es_ES.json
  - package-lock.json
  - package.json
  - tools/app-shell/package-lock.json
  - tools/app-shell/package.json
  - tools/app-shell/src/lib/__tests__/mcpClients.test.js
---

## Resumen
Se actualizaron los clientes MCP en la suite ETP-5256: mejoras en documentación, localización de interfaz y sincronización de dependencias core con una versión preview. Los tests se alinearon con cambios de nomenclatura en aliases.

## Decisiones
- Actualizar documentación de configuración MCP (`mcp-client-setup.md`) con copys y guías revisadas
- Sincronizar strings de UI en tres localizaciones (en_US, es_AR, es_ES) manteniendo consistencia
- Bumpar dependencias core a la versión preview de ETP-5256 en package.json raíz y en app-shell
- Refactorizar nombres de alias en tests mcpClients y actualizar referencias correspondientes

## Deuda dejada
- No está claro qué cambios específicos se hicieron en la documentación (commits no especifican qué secciones se modificaron)
- No se documenta qué alias fue renombrado ni por qué en los cambios de test
- Ausencia de contexto sobre impacto de la versión preview en funcionalidad
