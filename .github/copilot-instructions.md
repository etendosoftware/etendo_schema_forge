# Copilot Instructions - Schema Forge

Use these repository instructions as the primary context for coding tasks.

## Core Workflow

- Pipeline order: `DEV -> REVIEW -> QA -> DOCS`.
- Use feature branches and PRs for all changes; do not target `main` directly.
- Keep behavior-changing code and documentation updates together.

## Critical Architecture Context

- Data flow: `Menu Cache -> extract-from-db.js -> artifacts/{spec}/(schema-raw + rules-raw) -> decisions.json -> resolve-curated.js -> push-to-neo.js -> ETGO_SF_* -> NEO Headless -> React SPA`.
- Schema Forge decides what to expose; Etendo Go (NEO Headless) serves it at runtime.
- Spec names are kebab-case from `toSpecName()` in `cli/src/push-to-neo.js`.

## Hard Rules

- Never hardcode or guess window/process/menu IDs. Query DB or use `node cli/src/menu-cache.js search "<name>"`.
- Never manually edit generated files in `artifacts/*/generated/`.
- If `push-to-neo.js` runs, remind to execute `./gradlew export.database` in Etendo root.
- Keep all committed content in English.
- Use NEO-native config by default for window/report generation (`push-to-neo`, contracts/specs, NEO handlers/endpoints).
- Do not default to classic AD/Jasper/classic-process configuration patterns unless explicitly requested.

## Git Police Conventions

- Feature commit: `Feature ETP-1234: Description` (first line <= 80 chars)
- Epic commit: `Epic ETP-1234: Description`
- Hotfix commit: `Issue #N: Description` and second message with Jira key
- Branches: `feature/ETP-1234`, `epic/ETP-1234`, `hotfix/#N-ETP-1234`
- Do not include `Co-Authored-By`

## Validation and Testing

- Run `make test` for CLI validation when relevant.
- Ensure every kept business rule has behavioral test coverage.
- Ensure every process includes at least 3 edge cases.

## References

- `AGENTS.md`
- `CLAUDE.md`
- `docs/architecture-overview.md`
- `docs/branch-workflow.md`
- `docs/decisions-reference.md`
- `docs/self-documentation-policy.md`
