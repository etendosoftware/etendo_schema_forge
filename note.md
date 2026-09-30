---
task: ETP-5566
note: ETP-5566/b16aedca
commit: 47f6e0cde04862d8700126566c0c7a0d12588ed1
branch: feature/ETP-5566
date: 2026-09-30T23:12:02.000Z
author: sebastianbarrozo
agent: none
files:
  - .agents/skills/why/SKILL.md
  - .claude/skills/why/SKILL.md
  - .githooks/commit-msg
  - .githooks/post-checkout
  - .githooks/post-commit
  - .githooks/post-merge
  - .githooks/pre-push
  - AGENTS.md
  - CLAUDE.md
  - docs/tasknotes.md
  - tools/tasknotes/README.md
  - tools/tasknotes/bin/tasknotes.js
  - tools/tasknotes/package.json
  - tools/tasknotes/skills/why/SKILL.md
  - tools/tasknotes/src/commands.js
  - tools/tasknotes/src/git.js
  - tools/tasknotes/src/redact.js
  - tools/tasknotes/src/sessions.js
  - tools/tasknotes/src/store.js
  - tools/tasknotes/src/summarize.js
  - tools/tasknotes/test/e2e.test.js
  - tools/tasknotes/test/unit.test.js
---

## Resumen

Se agregó `tasknotes`, un sistema que captura automáticamente el contexto detrás de cada commit (decisiones, alternativas, deuda técnica, pendientes) mediante hooks de git, almacenando resúmenes redactados con agentes IA en refs separadas (`refs/tasknotes/`).

## Decisiones

- Almacenar notas fuera del historial de branches para que no contaminen la historia y no se descarguen en clones normales
- Capturar automáticamente en `post-commit` mediante agentes IA (Claude Haiku o Codex), nunca transcripciones crudas
- Usar trailers en mensaje de commit (`Task-Note: ETP-1234/<id>`) para que sobrevivan rebases y squashes
- Permitir pushes de notas sin ejecutar las validaciones de código (no hay código para validar)
- Proporcionar skill `why` que consulta via `git blame`, ocultando notas de código ya reescrito

## Deuda dejada

- Backfill retroactivo solo funciona con sesiones locales propias; falta mecanismo para compartir notas de tareas de otros
- Los commits previos a la instalación de hooks carecen de trailer y requieren búsqueda fallback manual
- Resúmenes fallidos quedan pendientes en `.git/tasknotes/` sin notificación visual al desarrollador
- No hay manejo de reintentos automáticos si el resumen de `post-commit` falla por timeout o desconexión del agente

## Pendiente

- Documentación de recuperación ante fallos persistentes de resumen
- Estrategia de validación de calidad de resúmenes generados
