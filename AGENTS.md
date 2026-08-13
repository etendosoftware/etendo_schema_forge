# AGENTS.md - OpenCode/Codex Instructions for Schema Forge

This file provides portable instructions for coding agents (OpenCode, Codex CLI, Cursor, Copilot).

## Language Policy

- All versioned repository content must be in English (code, comments, docs, tests, commit messages, file names).

## Core Architecture

Schema Forge defines what to expose; Etendo Go (NEO Headless) serves it at runtime.

Data flow:

`Menu Cache -> extract-from-db.js -> artifacts/{spec}/(schema-raw + rules-raw) -> decisions.json -> resolve-curated.js (in memory) -> push-to-neo.js -> ETGO_SF_* tables -> NEO Headless -> React SPA`

## Non-Negotiable Rules

1. Never hardcode or guess window/process/menu IDs. Use DB queries or `node cli/src/menu-cache.js search "<name>"`.
2. Never manually edit generated outputs in `artifacts/*/generated/`.
   - Fix generators/extractors/shared sources instead (`cli/src/generate-*.js`, `cli/src/extract-*.js`, `tools/app-shell/src/`).
3. Spec names are kebab-case using `toSpecName()` in `cli/src/push-to-neo.js`.
4. If `push-to-neo.js` is executed, run `./gradlew export.database` in the Etendo root afterward.
5. Use feature branches and PRs; do not work directly on `main`.
6. Use NEO-native configuration explicitly for window and report generation.
   - Prefer Schema Forge + NEO contracts/specs and handlers (`push-to-neo`, `ETGO_SF_*`, NEO endpoints).
   - Avoid classic AD/Jasper/classic-process patterns as the default implementation path.

## Transactional Email Rules

Transactional email must follow `docs/transactional-email-framework.md` and `docs/email-contracts.md`.

1. Never call an external email provider directly from frontend code.
2. Never commit provider endpoints, API keys, signing secrets, sender credentials, or other email provider secrets.
3. Never expose a browser endpoint that accepts an arbitrary provider payload such as `to`, `template`, and `data`.
4. Every email send must go through an explicit versioned email contract with authorization, recipient resolution, throttle, idempotency, audit, suppression, and kill switch behavior.
5. Resolve recipients server-side from trusted records by default. Caller-provided recipients are allowed only for explicit admin/support contracts.
6. `custom` email is allowed only as a controlled contract with role checks, sanitizer, strict throttle, reason capture, and audit.
7. Each email contract must document at least 3 edge cases and include behavioral/security test coverage before it is considered complete.

## Pipeline Expectations

Canonical phase order:

`DEV -> REVIEW -> QA -> DOCS`

When relevant, preserve this order and do not skip quality gates.

## Orientation Before Coding

Before making changes:
1. If the task touches a window, first find its functional guide via `docs/generated-custom-windows/INDEX.md` and open `docs/generated-custom-windows/<window>.md` before editing code or artifacts.
2. Confirm branch and repository context (`git branch --show-current`, `pwd`).
3. Read existing files before editing.
4. If DB access is needed, verify connectivity from Etendo `gradle.properties`.
5. Check existing artifacts and known issues (`artifacts/`, `feedback.md`, `docs/feedback.md` if present).

## Documentation Freshness

Behavior-changing code updates must include corresponding documentation updates in the same change.
Window-specific changes must also update the matching `docs/generated-custom-windows/<window>.md` guide.

## Testing Baseline

- CLI tests: `make test`
- E2E guidance: `docs/e2e-testing-guide.md`
- Every process should declare at least 3 edge cases.
- Every kept business rule should have behavioral test coverage.

## Deploy Reminder

Final deployment step is typically `make deploy` (or `make deploy MODULE_WEB={path}`).

## Extending NEO Headless — NeoHandler Pattern

Never add window-specific logic to `NeoSelectorService`, `NeoDefaultsService`, `NeoCrudHandler`, or `NeoServlet`.
Use the `NeoHandler` CDI extension point in `com.etendoerp.go` instead:

1. Set `Java_Qualifier` on the `ETGO_SF_ENTITY` record (e.g. `"internal-consumption-line"`).
2. Create a CDI bean annotated `@ApplicationScoped @Named("internal-consumption-line")` implementing `NeoHandler`.
3. `handle()` runs before default CRUD (return `null` to continue); `afterHandle()` runs after.
4. Place under `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/`.

Full reference: `docs/neo-headless-extensibility.md`

## Primary References

- `docs/architecture-overview.md`
- `docs/branch-workflow.md`
- `docs/decisions-reference.md`
- `docs/self-documentation-policy.md`
- `docs/developer-tools.md`
