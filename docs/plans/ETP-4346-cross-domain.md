# ETP-4346 — Cross-domain plan

**Feature:** Argentina localization workspace (`tools/etendo-go-ar/`) and CLI
multi-workspace support. Creates a parallel localization environment that shares
the Schema Forge CLI tooling without code duplication, alongside Sonar code-quality
fixes in the CLI source files.

This PR spans `generator-change` (CLI refactoring for ROOT path and cognitive
complexity reduction), `repo-infra` (docs and .gitignore), and `unknown`
(new `tools/etendo-go-ar/` workspace — a net-new directory that the domain
classifier has not yet categorized).

## Domains touched

### `generator-change`

- `cli/src/extract-fields.js` — ROOT path multi-workspace fix + Sonar cognitive
  complexity reduction (extracted `mapFieldRow`, `buildEntityFromTab`,
  `groupRowsByTab`, `applyFieldMetadata` helpers).
- `cli/src/extract-from-db.js` — ROOT path multi-workspace fix.
- `cli/src/extract-rules.js` — ROOT path fix + Sonar extractions (`extractEffects`,
  `countBranches`, `countLoc`).
- `cli/src/push-to-neo.js` — ROOT path multi-workspace fix.
- `cli/src/resolve-curated.js` — ROOT path multi-workspace fix.
- `cli/src/validate-pipeline.js` — ROOT path fix + Sonar extractions.
- `cli/src/validate-schema.js` — ROOT path fix + Sonar extractions.

### `repo-infra`

- `.gitignore` — extend with AR artifact patterns and runtime-generated files.
- `docs/parallel-app-guide.md` — guide for creating parallel localization projects.
- `docs/specs/etendo-go-ar-spec.md` — full spec for the AR localization initiative.

### `unknown` (new workspace — net-new addition, no cross-domain risk)

- `tools/etendo-go-ar/` — new localization workspace for Argentina. Contains its
  own `package.json`, `Makefile`, `app-shell/`, and first onboarded window
  artifacts. Does not modify any existing window or generator — purely additive.

## Tests

- CLI suite: `make test` — 0 failures (15 867 pass).
- Pipeline validator: `make validate-pipeline` — 0 violations.
- AR workspace: isolated artifacts under `tools/etendo-go-ar/artifacts/`; no
  existing windows affected.

## Rollback

- **generator-change:** revert ROOT path change to `join(__dirname, '..', '..')`
  without `SF_ROOT` prefix; all helper extractions are behavior-preserving and
  safe to keep or revert independently.
- **repo-infra:** revert doc additions and `.gitignore` extensions.
- **tools/etendo-go-ar/:** delete the directory entirely; it is self-contained
  and has no runtime dependencies in the main monorepo.

---

## Functional cleanup follow-up

This follow-up PR performs the mechanical functional-repo cleanup for the
Schema Forge core/functional split. It is intentionally cross-domain because the
local tooling workspaces were removed from this repo and replaced by published
packages from `schema_forge_core`, while the remaining functional app-shell,
artifact tests, CI, and operational scripts had to be rewired in the same PR.

## Follow-up domains touched

### `repo-infra`

- Root `package.json` / `package-lock.json` now install the published
  `@etendosoftware/schema-forge-cli`, `@etendosoftware/app-shell-core`,
  `@etendosoftware/schema-forge-core`, and `@etendosoftware/etendo-go-core`
  packages instead of local workspaces.
- `Makefile`, `.githooks/pre-commit`, Sonar configuration, and GitHub Actions
  workflows now call installed package bins, authenticate GitHub Packages
  installs, and run only the functional-side test suites that remain here.
- `scripts/merge-lcov.js` replaces the previous network-dependent `npx
  lcov-result-merger` call so coverage merging works without fetching a package
  during CI or pre-push.

### `generator-change`

- Local `cli/` and generic `packages/*` workspaces are removed from this
  functional repo. Their history and ongoing development continue in
  `schema_forge_core`; this repo consumes the published package outputs.
- `core-maps/system-columns.json`, `core-maps/ad-reference-map.json`, and
  `core-maps/impact-messages.json` move with the core tooling. The functional
  live DB menu cache remains here.

### `platform-change`

- `tools/app-shell` remains the functional shell consumer, with package paths
  and tests updated to resolve shared app-shell, onboarding, and locale code
  from installed `@etendosoftware/*` packages.
- Tailwind, Vite, Vitest, PWA, PDF viewer, onboarding, fiscal monitor, and
  type/locale tests were adjusted where they previously assumed local package
  workspace paths.

### Window and artifact test coverage

- Per-window custom tests under `artifacts/**/__tests__` stay in this repo and
  now import or inspect installed package content where needed.
- `make regen ONLY=sales-order` was executed against the installed CLI to
  verify the functional repo can regenerate a real window end to end.

## Follow-up tests

- `node --test --test-reporter=spec tools/app-shell/test/pwa.test.js` — 12/12
  passing.
- `node --test --test-reporter=spec 'tools/app-shell/test/*.test.js'` — 117/117
  passing.
- `node --test --test-reporter=spec artifacts/sales-quotation/custom/__tests__/reject-flow-i18n.test.js`
  — 32/32 passing.
- `node --test --test-reporter=spec $(find artifacts -path '*/__tests__/*.test.js')`
  — 621/621 passing.
- `node --test --test-reporter=spec scripts/__tests__/merge-lcov.test.js` —
  1/1 passing.
- `node scripts/merge-lcov.js 'coverage/*-lcov.info' coverage/merged-lcov.info`
  — merged LCOV report written successfully.
- `make regen ONLY=sales-order` — completed end to end with installed
  `@etendosoftware/schema-forge-cli`; the only observed output drift was live DB
  translation label drift in generated sales-order contract data and was left
  uncommitted.
- `./run-sonar.sh --base-ref origin/feature/ETP-4346 --coverage
  --fail-on-gate --compare-coverage --compare-branch feature/ETP-4346` —
  local suites completed, but the final Sonar server request was blocked by
  local DNS/sandbox network restrictions. The PR's remote Sonar checks are the
  authoritative gate.

## Follow-up rollback

- Revert the functional-cleanup PR as a unit to restore local `cli/`,
  `packages/*`, generic `tools/*`, root workspace wiring, Makefile calls, and
  CI behavior.
- Published `schema_forge_core` packages are additive and do not need to be
  unpublished for rollback; this repo can simply return to local workspaces or
  pin an earlier package set in a follow-up revert.
- Local uncommitted `sales-order` contract drift from the regeneration smoke
  test is not part of this PR and should not be included in rollback scope.
