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
