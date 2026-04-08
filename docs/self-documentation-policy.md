# Self-Documentation Policy

**Core rule: code changes and documentation updates are a single atomic unit.** A PR that modifies the pipeline, CLI tools, data flow, or repository structure MUST include updates to ALL documentation and diagrams that reference the changed component. No PR is complete until the docs reflect reality.

## What triggers a documentation update

Any change to:
- **Pipeline steps** (new step, removed step, reordered steps, changed step behavior) in `cli/src/pipeline.js`
- **CLI tools** (new tool, renamed tool, changed inputs/outputs, removed tool) in `cli/src/`
- **Repository structure** (new directories, moved files, renamed folders)
- **Data flow** (new data sources, changed artifact formats, new webhook endpoints)
- **Runtime components** (new NeoHandler, changed URL patterns, new DB tables)
- **Architecture** (new loops, changed integration points, new external dependencies)

## What must be updated

When a trigger fires, check and update **all** of the following that reference the changed component:

**Always check:**
| Document | What it contains |
|----------|-----------------|
| `docs/architecture-overview.md` — Repository Structure | Directory tree, file descriptions |
| `docs/architecture-overview.md` — Data Flow | ASCII flow diagrams |
| `docs/architecture-overview.md` — Java Classes table | Component names, purposes, descriptions |
| `docs/architecture-overview.md` | System overview, ASCII diagrams, CLI tools inventory, data flow |
| `docs/TDD.md` | Technical design, repository structure layout |
| `docs/PRD.md` | Pipeline diagram, tool references |

**Check if relevant:**
| Document | When to check |
|----------|--------------|
| `docs/flow-diagram.md` | If pipeline flow changed |
| `docs/diagrams/complete-pipeline.mmd` | If pipeline steps changed |
| `docs/diagrams/webhook-config-flow.mmd` | If webhook/config flow changed |
| `docs/diagrams/request-lifecycle.mmd` | If request handling changed |
| `docs/conventions.md` | If CLI behavior or edge cases changed |
| `docs/plans/process-and-report-pipeline.md` | If process pipeline changed |
| `docs/index.md` | If new docs were added |

## Rules for volatile data

- **Do NOT hardcode line counts** (e.g., "NeoServlet (953 lines)"). These go stale instantly. Describe purpose instead.
- **Do NOT duplicate information across docs.** Use cross-references (e.g., "See `docs/architecture-overview.md`") instead of copying content that will diverge.
- **ASCII diagrams must match the code.** If you add a pipeline step, the diagram gets a new box. If you remove a CLI tool, it disappears from the tree.

## Pipeline phase responsibilities

- **DEV phase**: The developer making the change MUST update all affected documentation in the same PR. This is not optional — incomplete docs = incomplete work.
- **REVIEW phase**: The reviewer MUST verify that documentation was updated. If the PR changes something documented in CLAUDE.md or docs/, and the docs were NOT updated, this is a **rejection reason**.
- **DOCS phase**: Sage validates that cross-references are consistent, diagrams match reality, and no stale data remains.

## Checklist for PRs that modify pipeline/tools/structure

Before marking a PR as ready:
- [ ] CLAUDE.md sections updated (Repository Structure, Data Flow, Components)
- [ ] `docs/architecture-overview.md` updated if architecture changed
- [ ] Mermaid diagrams in `docs/diagrams/` updated if flow changed
- [ ] `docs/TDD.md` updated if technical design changed
- [ ] No hardcoded line counts or stale snapshot data
- [ ] Cross-references between docs are still valid
- [ ] New files/tools are referenced in the appropriate index (`docs/index.md`, CLAUDE.md tree)
