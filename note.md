---
task: ETP-5511
note: ETP-5511/a27e7760
kind: backfill
date: 2026-09-28T12:04:37.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - ec68d2fd02
  - 8764dee158
  - 23fea6b32b
  - 04e7491a8a
  - 81b3e7bee6
  - f896a9b11d
  - cf36e6ed52
  - df79331fe0
files:
  - .agents/skills/classify/SKILL.md
  - .agents/skills/document-printables/SKILL.md
  - .agents/skills/estimate/calibration-log.md
  - .agents/skills/estimate/points-table.md
  - .agents/skills/extract-hotspot-component/SKILL.md
  - .agents/skills/innocuous-check/SKILL.md
  - .agents/skills/schema-forge-pipeline/SKILL.md
  - .agents/skills/sf-bug/SKILL.md
  - .claude/agents/documentarian.md
  - .claude/agents/mcp-ticket-resolver.md
  - .claude/agents/qa.md
  - .claude/agents/reviewer.md
  - .claude/agents/schema-forge-developer.md
  - .claude/agents/test-generator.md
  - .claude/agents/window-agent.md
  - .claude/skills/classify/SKILL.md
  - .claude/skills/extract-hotspot-component/SKILL.md
  - .claude/skills/generate-ui.md
  - .claude/skills/innocuous-check/SKILL.md
  - .claude/skills/schema-forge-pipeline/SKILL.md
  - .claude/skills/sf-bug/SKILL.md
  - .codex/agents/alex.toml
  - .codex/agents/documentarian.toml
  - .codex/agents/mcp-ticket-resolver.toml
  - .codex/agents/qa.toml
  - .codex/agents/schema-forge-developer.toml
  - .codex/agents/test-generator.toml
  - .codex/agents/window-agent.toml
  - .opencode/agents/alex.md
  - .opencode/agents/documentarian.md
  - .opencode/agents/mcp-ticket-resolver.md
  - .opencode/agents/qa.md
  - .opencode/agents/schema-forge-developer.md
  - .opencode/agents/test-generator.md
  - .opencode/agents/window-agent.md
  - AGENTS.md
  - CLAUDE.md
  - README.md
  - docs/parallel-app-guide.md
  - docs/pipeline-validator-reference.md
  - docs/plans/discarded/2026-03-05-generate-ui-skill.md
  - docs/specs/etendo-go-ar-spec.md
  - .agents/skills/schema-forge-architecture-audit/SKILL.md
  - .claude/agents/tester-functional.md
  - .claude/agents/tester-go.md
  - .claude/skills/schema-forge-architecture-audit/SKILL.md
  - .codex/agents/tester-functional.toml
  - .codex/agents/tester-go.toml
  - .github/workflows/ratchet-guards.yml
  - .opencode/agents/tester-functional.md
  - .opencode/agents/tester-go.md
  - Makefile
  - docs/index.md
  - docs/self-documentation-policy.md
  - docs/testing/etendo-test-skill-review.md
  - docs/testing/test-reuse-policy.md
  - scripts/check-test-hygiene.js
  - scripts/find-tests.js
  - scripts/__tests__/check-test-hygiene.test.js
  - scripts/__tests__/find-tests.test.js
---

## Resumen
Se alinearon las instrucciones de agentes con la estructura post-división de repo y se estableció un protocolo de reuso-primero para tests. Se dividió el Tester por repositorio (funcional y Go) y se crearon scripts de validación de higiene de tests.

## Decisiones
- **Agentes spawn por nombre en frontmatter** — simplificar descubrimiento y configuración tras la división
- **MANDATORY markers reducidos a tres** — reducir fricción en instrucciones simplificadas
- **Test ownership: developer escribe solo repro test, Tester escribe el resto** — clarificar responsabilidades
- **Tester hereda intencionalmente todas las tools** — permitir flexibilidad completa en generación de tests
- **Tester dividido por repo (tester-funcional y tester-go)** — adaptar instrucciones a contextos específicos

## Descartado
- project_analyzer rule — descartada de las instrucciones de agentes
- generate-ui skill — movida a docs/plans/discarded (archivada, no eliminada)

## Deuda dejada
- Límites en find-tests documentados pero no completamente resueltos
- Follow-ups en test reuse requieren acción futura (identificados pero pendientes)
- Scripts de validación pasaron pruebas pero tienen edge cases conocidos

## Pendiente
- Implementar follow-ups documentados en test-reuse-policy.md
- Completar cobertura de find-tests para casos identificados como omitidos
- Revisar y refinar reglas de validación de test hygiene según feedback de QA
