# Documentation Index

## Architecture

| File | Description |
|------|-------------|
| [architecture-overview.md](architecture-overview.md) | System architecture: Schema Forge (tooling) + Etendo Go (runtime), data flow, component inventory |
| [transactional-email-framework.md](transactional-email-framework.md) | Transactional email framework: contract-driven execution, security boundary, lifecycle, edge cases, and agent checklist |
| [email-contracts.md](email-contracts.md) | Email contracts guide: descriptor schema, request/response contract, recipient policies, versioning, and initial contract sketches |
| [document-email-contract-implementation.md](document-email-contract-implementation.md) | Agent/developer tutorial for defining document-send email contracts and wiring frontend/backend behavior |
| [NEO Headless API Reference](../modules/com.etendoerp.go/docs/neo-headless.md) | Full API reference for the runtime module (NeoServlet, selectors, processes, webhooks) |
| [NEO Headless Extensibility Guide](neo-headless-extensibility.md) | How to extend/customize NEO Headless: NeoHandler hooks, configuration, patterns |
| [NEO Entity Naming Investigation](neo-entity-naming-investigation.md) | Investigation report on `push-to-neo` naming, duplicate entities/fields, runtime endpoint resolution, and unification rule |
| [NEO Constraints](neo-pending-constraints.md) | UNIQUE constraints applied to ETGO_SF_* tables (2026-04-13) — regression guard against duplicate inserts |
| [NEO Duplicates Report 2026-04-13](neo-duplicates-report-2026-04-13.md) | Snapshot of spec/entity/field duplicates found on 2026-04-13 (pre-dedupe), plus the 54 AD-label naming cases |
| [Widget Endpoints Guide](widget-endpoints.md) | How to create widget endpoints: handler pattern, XML registration, frontend `useWidget` hook, response contracts |
| [Architecture Radar (sf-radar)](architecture-radar.md) | Guide for the sf-radar CLI tool — query and update architecture decisions (optional repo) |

## Testing

| File | Description |
|------|-------------|
| [e2e-testing-guide.md](e2e-testing-guide.md) | E2E testing guide: discover with agent-browser, automate with Playwright |

## Tooling

| File | Description |
|------|-------------|
| [sonarqube-access.md](sonarqube-access.md) | **SonarQube quick access**: bypass RTK with `rtk proxy`, project keys, useful endpoints, local scanner fallback |
| [xml-regeneration-check.md](xml-regeneration-check.md) | **XML regeneration check**: compare original module XML vs export.database output without DB access |

## Field & Pipeline Reference

| File | Description |
|------|-------------|
| [decisions-reference.md](decisions-reference.md) | **Complete reference for all `decisions.json` options**: visibility, draftMode, sections, selectors, rules, discard patterns |
| [field-visibility-types.md](field-visibility-types.md) | Field visibility types (editable, readOnly, system, discarded): behavior across pipeline, NEO Headless, and frontend |
| [ui-customization.md](ui-customization.md) | **UI customization guide**: all extension points driven by `decisions.json` (statusBar, listKpiCards, customComponents, menuActions, layoutType, etc.) with real examples and decision tree |
| [ui-design-guidelines.md](ui-design-guidelines.md) | **UI design guidelines**: z-index scale, scrim opacity, overlay/drawer patterns, monetary amount formatting (`formatCurrency` vs `formatDashboardAmount`), column alignment |
| [list-filters.md](list-filters.md) | **List view filters reference**: subset filters, quick filters, document-type filters, advanced filter popover — composition rules, URL-param hooks, when to use which |
| [pipeline-validator-reference.md](pipeline-validator-reference.md) | **Pipeline completeness validator**: rules F1–F10, artifact classification, CLI flags, exit codes, and troubleshooting |
| [contract-generation-ownership.md](contract-generation-ownership.md) | **Contract/generated output ownership**: producers, consumers, regeneration triggers, and split-ready artifact rules |
| [line-pricing-model.md](line-pricing-model.md) | **Line pricing model**: client-side lineGrossAmount calculation for orders/quotations, field roles, callout vs client-side split, invoice refactor checklist |

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

| Path | Description |
|------|-------------|
| [i18n-guide.md](i18n-guide.md) | **i18n reference**: hooks (`useUI`, `useLabel`, `useMenuLabel`), locale JSON structure, rules for adding translations, decision tree |

## Generated/custom windows

| Path | Description |
|------|-------------|
| [generated-custom-windows/INDEX.md](generated-custom-windows/INDEX.md) | Functional docs for generated/custom windows, including the app-shell flows guide |
| [fiscal-models-303-layout.md](fiscal-models-303-layout.md) | **Modelo 303 box layout system**: BASE structure, patch ops reference, how to add a new year, i18n keys, visual verification via debug panel |

| [generated-custom-windows/2026-04-23-epic-etp-3504-merge-changelog.md](generated-custom-windows/2026-04-23-epic-etp-3504-merge-changelog.md) | Change log for the `epic/ETP-3504` -> `develop` window-level merge deltas documented in generated/custom windows |
## Guides

| File | Description |
|------|-------------|
| [developer-tools.md](developer-tools.md) | CLI tools used by the team: RTK (token optimization) and GWS (Google Workspace CLI) |
| [claude-md-best-practices.md](claude-md-best-practices.md) | Best practices for writing effective CLAUDE.md files (research compilation) |
| [self-documentation-policy.md](self-documentation-policy.md) | Self-documentation policy: triggers, checklists, and phase responsibilities for keeping docs in sync with code |
| [feedback.md](feedback.md) | Known bug patterns and root-cause lessons: double-discount on line PATCH, callout price suppression for invoices, add-line row field key alignment, ETP-4007 discount display fixes (etgoDiscount field name, listPrice vs unitPrice, grossAmount vs lineNetAmount, taxAmount formula, missing PDF discount breakdown rows), ETP-4277 empty numeric field saved as backend default (DataTable/InlineLinesPanel defaultValue substitution) |

## Operations

| File | Description |
|------|-------------|
| [ops/cloudfront-alb-routing.md](ops/cloudfront-alb-routing.md) | CloudFront + ALB routing for the SPA, same-origin `/etendo/*` forwarding, and deployment runbook |
| [ops/transactional-email-security.md](ops/transactional-email-security.md) | Transactional email security runbook: secrets, throttle, suppression, kill switches, incident response, and metrics |
| [ops/copilot-pr-review.md](ops/copilot-pr-review.md) | Copilot-aligned PR review gate: review instructions, deterministic findings, PR comments, and request-changes behavior |
| [ops/window-doc-freshness.md](ops/window-doc-freshness.md) | Window-specific doc freshness warning: diff-based CI review for `docs/generated-custom-windows/<window>.md` |
| [ops/epic-rollup-report.md](ops/epic-rollup-report.md) | Develop-targeted epic rollout report: included feature PRs, prior review findings, and aggregated release-risk summary |
| [ops/app-shell-observability.md](ops/app-shell-observability.md) | App Shell observability: providers, env vars, v1 events, privacy rules, and extension guide |
| [ops/mixpanel-kpi-emission-spec.md](ops/mixpanel-kpi-emission-spec.md) | Mixpanel KPI emission spec: frontend/backend runtime config, emitted events, advanced KPI gaps, and validation evidence |
| [ops/saas-kpis/README.md](ops/saas-kpis/README.md) | Etendo SaaS KPI instrumentation catalog grouped by dimension, with Mixpanel-ready contracts and backend/definition gaps |

## Proposals

Design proposals and RFCs awaiting review and approval. See [proposals/INDEX.md](proposals/INDEX.md) for lifecycle details.

| File | Status | Description |
|------|--------|-------------|
| [proposals/etendo-go-apps.md](proposals/etendo-go-apps.md) | Draft | External apps framework for Etendo Go (Jira Connect-style) — executive summary |
| [proposals/etendo-go-apps-technical-annex.md](proposals/etendo-go-apps-technical-annex.md) | Draft | External apps framework — technical annex (architecture, descriptor, JWT+JWKS, BFF, SDK) |
| [plans/2026-04-17-etendo-go-apps-f1-spike-plan.md](plans/2026-04-17-etendo-go-apps-f1-spike-plan.md) | Ready | F1 spike execution plan (10 tasks, validates JWT+JWKS+BFF end-to-end) |
| [proposals/initial-organization-setup-accounting.md](proposals/initial-organization-setup-accounting.md) | Reviewed / Pending plan | Initial Organization Setup accounting proposal — global package reuse, org wiring, completeness validation, and standard `AD_Org_Ready` finish |

## Presentations

Slide-deck style walkthroughs (Marp Markdown). See [presentations/INDEX.md](presentations/INDEX.md) for how to render.

| File | Description |
|------|-------------|
| [presentations/etendo-apps-sdk-demo.md](presentations/etendo-apps-sdk-demo.md) | Etendo Apps SDK + `quick-order-app` demo — architecture, JWT bridge, styling, trade-offs |

## Plans & Evaluations

Plans follow a lifecycle: active in `plans/`, completed in `plans/completed/YYYY-MM-DD/`, discarded in `plans/discarded/`.

| File | Description |
|------|-------------|
| [plans/completed/2026-03-12/process-and-report-pipeline.md](plans/completed/2026-03-12/process-and-report-pipeline.md) | Process & Report Pipeline — **All 4 phases complete** (processes, reports, form detection, unified entry point) |
| [plans/neo-report-endpoint.md](plans/neo-report-endpoint.md) | NEO Headless Report Endpoint — **Implemented** (NeoReportService, binary responses, OpenAPI docs) |
| [plans/2026-03-05-vertical-slice-design.md](plans/2026-03-05-vertical-slice-design.md) | Vertical slice design |
| [plans/2026-03-05-vertical-slice-plan.md](plans/2026-03-05-vertical-slice-plan.md) | Vertical slice execution plan |
| [plans/ETP-4214-saas-kpi-instrumentation-plan.md](plans/ETP-4214-saas-kpi-instrumentation-plan.md) | Etendo SaaS KPI instrumentation execution plan and Jira task breakdown |
| [plans/evaluations/architecture-review.md](plans/evaluations/architecture-review.md) | Architecture review |
| [plans/evaluations/day-1-decisions.md](plans/evaluations/day-1-decisions.md) | Day 1 decisions |
| [plans/evaluations/decisions-resolved.md](plans/evaluations/decisions-resolved.md) | Resolved design decisions |
| [plans/evaluations/onboarding.md](plans/evaluations/onboarding.md) | Onboarding notes |
| [plans/evaluations/risk-assessment.md](plans/evaluations/risk-assessment.md) | Risk assessment |
| [plans/evaluations/risk-register.md](plans/evaluations/risk-register.md) | Risk register |
| [plans/evaluations/scope-review.md](plans/evaluations/scope-review.md) | Scope review |
