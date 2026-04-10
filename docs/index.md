# Documentation Index

## Architecture

| File | Description |
|------|-------------|
| [architecture-overview.md](architecture-overview.md) | System architecture: Schema Forge (tooling) + Etendo Go (runtime), data flow, component inventory |
| [NEO Headless API Reference](../modules/com.etendoerp.go/docs/neo-headless.md) | Full API reference for the runtime module (NeoServlet, selectors, processes, webhooks) |
| [NEO Headless Extensibility Guide](neo-headless-extensibility.md) | How to extend/customize NEO Headless: NeoHandler hooks, configuration, patterns |
| [Widget Endpoints Guide](widget-endpoints.md) | How to create widget endpoints: handler pattern, XML registration, frontend `useWidget` hook, response contracts |
| [Architecture Radar (sf-radar)](architecture-radar.md) | Guide for the sf-radar CLI tool — query and update architecture decisions (optional repo) |

## Testing

| File | Description |
|------|-------------|
| [e2e-testing-guide.md](e2e-testing-guide.md) | E2E testing guide: discover with agent-browser, automate with Playwright |

## Field & Pipeline Reference

| File | Description |
|------|-------------|
| [decisions-reference.md](decisions-reference.md) | **Complete reference for all `decisions.json` options**: visibility, draftMode, sections, selectors, rules, discard patterns |
| [field-visibility-types.md](field-visibility-types.md) | Field visibility types (editable, readOnly, system, discarded): behavior across pipeline, NEO Headless, and frontend |
| [ui-customization.md](ui-customization.md) | **UI customization guide**: all extension points driven by `decisions.json` (statusBar, listKpiCards, customComponents, menuActions, layoutType, etc.) with real examples and decision tree |

## Design Specs

| File | Description |
|------|-------------|
| [PRD.md](PRD.md) | Product requirements, decision map, pipeline, scope |
| [PRD-anex.md](PRD-anex.md) | API versioning model (conceptual) |
| [TDD.md](TDD.md) | Technical design, data models, validation rules, generator specs |
| [TDD-anex.md](TDD-anex.md) | API versioning implementation details |
| [conventions.md](conventions.md) | Edge case conventions (13 rules for extraction, validation, DB access) |
| [decisions-versioning.md](decisions-versioning.md) | Decisions.json versioning system: writing migrations, batch upgrades, FAQ |

## Etendo AD Reference

General findings about how the Etendo Application Dictionary works. Not window-specific.

| File | Description |
|------|-------------|
| [etendo-ad/index.md](etendo-ad/index.md) | Index of AD reference documents |
| [etendo-ad/schema-mappings.md](etendo-ad/schema-mappings.md) | AD table relationships: callouts, logic columns, tab clauses |
| [etendo-ad/process-mechanisms.md](etendo-ad/process-mechanisms.md) | The 3 process mechanisms: tab_process, classic_process, obuiapp_process |
| [etendo-ad/display-logic-variables.md](etendo-ad/display-logic-variables.md) | The 6 types of variables in DisplayLogic: fields, auxiliary inputs, session, preferences, acct dimensions |

## Internationalization

| File | Description |
|------|-------------|
| [i18n-guide.md](i18n-guide.md) | **i18n reference**: hooks (`useUI`, `useLabel`, `useMenuLabel`), locale JSON structure, rules for adding translations, decision tree |

## Guides

| File | Description |
|------|-------------|
| [developer-tools.md](developer-tools.md) | CLI tools used by the team: RTK (token optimization) and GWS (Google Workspace CLI) |
| [claude-md-best-practices.md](claude-md-best-practices.md) | Best practices for writing effective CLAUDE.md files (research compilation) |
| [self-documentation-policy.md](self-documentation-policy.md) | Self-documentation policy: triggers, checklists, and phase responsibilities for keeping docs in sync with code |

## Plans & Evaluations

Plans follow a lifecycle: active in `plans/`, completed in `plans/completed/YYYY-MM-DD/`, discarded in `plans/discarded/`.

| File | Description |
|------|-------------|
| [plans/completed/2026-03-12/process-and-report-pipeline.md](plans/completed/2026-03-12/process-and-report-pipeline.md) | Process & Report Pipeline — **All 4 phases complete** (processes, reports, form detection, unified entry point) |
| [plans/neo-report-endpoint.md](plans/neo-report-endpoint.md) | NEO Headless Report Endpoint — **Implemented** (NeoReportService, binary responses, OpenAPI docs) |
| [plans/2026-03-05-vertical-slice-design.md](plans/2026-03-05-vertical-slice-design.md) | Vertical slice design |
| [plans/2026-03-05-vertical-slice-plan.md](plans/2026-03-05-vertical-slice-plan.md) | Vertical slice execution plan |
| [plans/evaluations/architecture-review.md](plans/evaluations/architecture-review.md) | Architecture review |
| [plans/evaluations/day-1-decisions.md](plans/evaluations/day-1-decisions.md) | Day 1 decisions |
| [plans/evaluations/decisions-resolved.md](plans/evaluations/decisions-resolved.md) | Resolved design decisions |
| [plans/evaluations/onboarding.md](plans/evaluations/onboarding.md) | Onboarding notes |
| [plans/evaluations/risk-assessment.md](plans/evaluations/risk-assessment.md) | Risk assessment |
| [plans/evaluations/risk-register.md](plans/evaluations/risk-register.md) | Risk register |
| [plans/evaluations/scope-review.md](plans/evaluations/scope-review.md) | Scope review |
