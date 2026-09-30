---
task: ETP-5422
note: ETP-5422/72588c9e
kind: backfill
date: 2026-09-21T13:11:25.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - aacb672555
  - fd0ef49f8b
files:
  - .agents/skills/aggregate-contracts/SKILL.md
  - .agents/skills/classify/SKILL.md
  - .agents/skills/document-printables/SKILL.md
  - .agents/skills/emails/SKILL.md
  - .agents/skills/estimate/SKILL.md
  - .agents/skills/estimate/calibration-log.md
  - .agents/skills/estimate/points-table.md
  - .agents/skills/extract-hotspot-component/SKILL.md
  - .agents/skills/feature-debt/SKILL.md
  - .agents/skills/fm303-update/SKILL.md
  - .agents/skills/generate-ui.md
  - .agents/skills/innocuous-check/SKILL.md
  - .agents/skills/mcp-ace-comparison/SKILL.md
  - .agents/skills/mcp-comparison/SKILL.md
  - .agents/skills/migrate-pre-split-pr/SKILL.md
  - .agents/skills/move-to-core/SKILL.md
  - .agents/skills/schema-forge-architecture-audit/SKILL.md
  - .agents/skills/schema-forge-architecture-audit/cases/2026-05-13-dashboard-cards.md
  - .agents/skills/schema-forge-architecture-audit/patterns/INDEX.md
  - .agents/skills/schema-forge-architecture-audit/patterns/extract-card-shell.md
  - .agents/skills/schema-forge-architecture-audit/patterns/extract-empty-state.md
  - .agents/skills/schema-forge-architecture-audit/patterns/extract-leaf-icon-slot.md
  - .agents/skills/schema-forge-pipeline/SKILL.md
  - .agents/skills/sf-bug/SKILL.md
  - .agents/skills/stored-computed-column/SKILL.md
  - .agents/skills/testing-delivery-gate/SKILL.md
  - .codex/agents/alex.toml
  - .codex/agents/argos-ui.toml
  - .codex/agents/compas-ui.toml
  - .codex/agents/crisol-ui.toml
  - .codex/agents/documentarian.toml
  - .codex/agents/marco-ui.toml
  - .codex/agents/mcp-ticket-resolver.toml
  - .codex/agents/merge-block-helper.toml
  - .codex/agents/okr-architect.toml
  - .codex/agents/okr-communicator.toml
  - .codex/agents/okr-coordinator.toml
  - .codex/agents/okr-erp-sync.toml
  - .codex/agents/okr-platform-dev.toml
  - .codex/agents/okr-tracker.toml
  - .codex/agents/pixel-ui.toml
  - .codex/agents/pluma-ui.toml
  - .codex/agents/qa.toml
  - .codex/agents/schema-forge-developer.toml
  - .codex/agents/tenant-fixer.toml
  - .codex/agents/test-generator.toml
  - .codex/agents/traza-ui.toml
  - .codex/agents/vigia-ui.toml
  - .codex/agents/window-agent.toml
  - .codex/agents/workflow.toml
  - .opencode/agents/alex.md
  - .opencode/agents/argos-ui.md
  - .opencode/agents/compas-ui.md
  - .opencode/agents/crisol-ui.md
  - .opencode/agents/documentarian.md
  - .opencode/agents/marco-ui.md
  - .opencode/agents/mcp-ticket-resolver.md
  - .opencode/agents/merge-block-helper.md
  - .opencode/agents/okr-architect.md
  - .opencode/agents/okr-communicator.md
---

## Resumen
Se creó un sistema automático de sincronización que espeja la configuración de CLAUDE.md hacia AGENTS.md (Claude Code), Codex y OpenCode, traduciendo entre tres esquemas distintos. Evita el desvío manual que existía (3 skills desactualizados hace 3 meses).

## Decisiones
- Script shell + librería Python (cli/sync-agents.sh, cli/lib-gen-agents.py) — ejecutable desde CI/CD con make targets (sync-agents, sync-agents-check)
- Documentar campos no traducibles en cada mirror — preserva la intención sin duplicar datos
- Generar archivos con cabecera "GENERATED MIRROR" — permite identificar qué es automático y cómo regenerarlo
- Incluir modo --check — detecta desincronización antes de mergear

## Descartado
- No modificar nada que lea Claude Code — mantiene el flujo de verdad única sin efectos secundarios

## Deuda dejada
- OpenCode lee CLAUDE.md nativamente pero se generan mirrors de .agents/skills/ — redundancia no necesaria
- Traducción Codex-to-OpenCode (scopes→permissions, color, model: inherit) es manual en el script — frágil ante cambios de esquema
- Campos incompatibles solo se documentan en el generado — sin mecanismo si alguien cambia el valor localmente
- Validación del generador no está integrada en git hooks — riesgo de merge si se olvida ejecutar

## Pendiente
- Integrar make sync-agents-check en pre-push para forzar coherencia
