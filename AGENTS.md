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

## Pipeline Expectations

Canonical phase order:

`DEV -> REVIEW -> QA -> DOCS`

When relevant, preserve this order and do not skip quality gates.

## Orientation Before Coding

Before making changes:

1. Confirm branch and repository context (`git branch --show-current`, `pwd`).
2. Read existing files before editing.
3. If DB access is needed, verify connectivity from Etendo `gradle.properties`.
4. Check existing artifacts and known issues (`artifacts/`, `feedback.md`, `docs/feedback.md` if present).

## Commit and Branch Conventions (Git Police)

- Feature commit: `Feature ETP-1234: Description` (first line <= 80 chars)
- Epic commit: `Epic ETP-1234: Description`
- Hotfix commit: `Issue #N: Description` plus second message with Jira key
- Do not include `Co-Authored-By`
- Branch naming: `feature/ETP-1234`, `hotfix/#N-ETP-1234`, `epic/ETP-1234`

## Documentation Freshness

Behavior-changing code updates must include corresponding documentation updates in the same change.

## Testing Baseline

- CLI tests: `make test`
- E2E guidance: `docs/e2e-testing-guide.md`
- Every process should declare at least 3 edge cases.
- Every kept business rule should have behavioral test coverage.

## Deploy Reminder

Final deployment step is typically `make deploy` (or `make deploy MODULE_WEB={path}`).

## Primary References

- `docs/architecture-overview.md`
- `docs/branch-workflow.md`
- `docs/decisions-reference.md`
- `docs/self-documentation-policy.md`
- `docs/developer-tools.md`
