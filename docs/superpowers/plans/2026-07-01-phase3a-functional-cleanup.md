# Phase 3a: etendo_schema_forge Functional Cleanup (Mechanical Split) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In THIS repo (`etendo_schema_forge`, about to depend on the now-published `schema_forge_core` packages), remove all generic tooling (`cli/`, all of `packages/*`, most of `tools/*`), wire the three published packages as real dependencies, and rewrite every Makefile/CI/hook call site that referenced the now-removed local `cli/src/*.js` paths to instead call the installed CLI's bins.

**Architecture:** All work happens on branch `feature/ETP-4346-phase3-functional-cleanup` (already created off `feature/ETP-4346`'s tip) in THIS working directory — unlike Phase 2, this is the repo the human actively works in daily, so every deletion is followed immediately by a test/build check, and nothing merges without review. `docs/` and the 28 test files tracked in `schema_forge_core`'s `phase3-relocated-tests.md` are explicitly OUT of scope for this plan (see "What This Plan Does Not Cover").

**Tech Stack:** Node 22, npm workspaces, GitHub Packages (`npm.pkg.github.com`), GNU Make.

## Global Constraints

- All versioned content (code, comments, commit messages) in English.
- Commits follow `Feature ETP-4346: <description>`, first line ≤ 80 chars, no `Co-Authored-By` trailer (this repo's own convention, unlike `schema_forge_core`).
- Never force-push. Never merge to `main`/`develop` directly, never touch `feature/ETP-4346` directly either — this plan's branch gets reviewed and merged back separately.
- Every deletion must be followed by a build/test check before the next deletion — if something breaks, stop and report rather than deleting further.
- Exact published versions to pin (confirmed from the actual publish workflow log, not guessed): `@etendosoftware/schema-forge-cli@0.1.1`, `@etendosoftware/app-shell-core@0.1.0`, `@etendosoftware/schema-forge-core@0.1.0` — all on the `alpha` dist-tag. Pin exact versions (no `^`/`~`), per the design spec's Cutover Coordination policy.
- Source of truth for what moves/stays: `docs/superpowers/specs/2026-06-30-schema-forge-core-split-design.md`'s Boundary section and Disposition Table (including the corrections made during Phase 2 and Phase 3 planning — `core-maps/` splits 3-static/1-cache, `tools/app-shell` moves wholesale, `quality-gate.yml`/`data-testid-check.yml`/`epic-rollup-*.yml` dispositions corrected).

---

## Task 1: Wire root `package.json` to depend on the published packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Rewrite the workspaces array and add the three dependencies**

Current `workspaces` is `["cli", "tools/*", "packages/*", "e2e"]`. After Task 2 deletes `cli/` and all of `packages/*`, and every `tools/*` subdirectory except `tools/app-shell`, the only real workspaces left are `tools/app-shell` and `e2e`. Rewrite:

```json
{
  "name": "schema-forge",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "workspaces": [
    "tools/app-shell",
    "e2e"
  ],
  "scripts": {
    "prepare": "git config core.hooksPath .githooks",
    "test": "mkdir -p artifacts && node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=artifacts/test-report.xml 'tools/app-shell/src/**/__tests__/*.test.js' 'tools/app-shell/test/*.test.js' 'artifacts/**/__tests__/*.test.js'",
    "check:data-testid": "./scripts/check-add-data-testid.sh",
    "apply:data-testid": "./scripts/apply-add-data-testid.sh"
  },
  "devDependencies": {
    "@etendosoftware/schema-forge-cli": "0.1.1",
    "@etendosoftware/app-shell-core": "0.1.0",
    "@etendosoftware/schema-forge-core": "0.1.0",
    "esbuild": "^0.28.0",
    "handlebars": "^4.7.9",
    "jscodeshift": "^17.3.0",
    "shadcn": "^4.0.2"
  }
}
```

Do NOT do `npm install` yet — that's Task 6's final verification step, gated on `read:packages` auth being configured. Just write the file.

- [ ] **Step 2: Confirm `.npmrc` already has the registry mapping (no change needed)**

```bash
cat .npmrc
```

Expected: `@etendosoftware:registry=https://npm.pkg.github.com` — already present (used by the workspace-linked dev dependency today). No auth token line exists yet; that's provisioned separately (a `NODE_AUTH_TOKEN` env var or a personal token in `~/.npmrc`, not committed here — per the design spec's GitHub Packages Cross-Repo Auth policy).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Feature ETP-4346: Wire package.json to published core packages"
```

## Task 2: Delete generic tooling

**Files:** many, listed exactly.

- [ ] **Step 1: Delete `cli/` and all of `packages/*`**

```bash
git rm -r cli packages
```

All 7 `packages/*` directories move to `schema_forge_core` per the Boundary section (`app-shell-core`, `schema-forge-core`, `schema-forge-stack`, `schema-forge-agent-context`, `apps-sdk`, `apps-sdk-bff`, `etendo-go-core`) — none stay here.

- [ ] **Step 2: Delete the generic `tools/*` subdirectories, keeping only `tools/app-shell`**

```bash
git rm -r tools/quick-order-app tools/report-server tools/decision-panel tools/etendo-go-ar tools/ui-preview tools/spike-hello-app
```

- [ ] **Step 3: Delete the 3 static `core-maps/*.json` files that actually belong to core (per the Phase 2 correction) — keep `ad-menu-cache.json`**

```bash
git rm core-maps/system-columns.json core-maps/ad-reference-map.json core-maps/impact-messages.json
```

Expected: `core-maps/ad-menu-cache.json` remains (it's the genuine live-DB cache, correctly functional-side).

- [ ] **Step 4: Confirm nothing under `tools/app-shell` or `e2e` references a path just deleted**

```bash
grep -rln "from '\.\./\.\./cli\|from '\.\./\.\./packages\|require('\.\./\.\./cli" tools/app-shell/src tools/app-shell/test e2e 2>/dev/null
```

Expected: no output. `tools/app-shell`'s own existing dependency on `@etendosoftware/app-shell-core` was already an npm package reference (workspace-linked, becoming a real install after Task 1), not a relative filesystem path — this check is a safety net, not an expected finding.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Feature ETP-4346: Remove generic tooling (cli, packages, generic tools/*)"
```

## Task 3: Rewrite Makefile call sites to use the installed CLI bins

**Files:**
- Modify: `Makefile`

Every `node cli/src/<script>.js` call becomes `npx sf-<name>` (the bin names are fixed — this task lists the exact mapping for every call site found in the current `Makefile`). `npx` resolves installed devDependency bins without needing them globally installed or on `$PATH` manually.

- [ ] **Step 1: Replace each call site exactly**

| Current line (approximate) | Replace with |
|---|---|
| `node cli/src/validate-pipeline.js --format=text` | `npx sf-validate-pipeline --format=text` |
| `node cli/src/method-budget.js` | `npx sf-method-budget` |
| `node cli/src/window-leak-budget.js` | `npx sf-window-leak-budget` |
| `node cli/src/quality-gate.js --pr-affected --baseline-ref origin/main --format md` | `npx sf-quality-gate --pr-affected --baseline-ref origin/main --format md` |
| `node cli/src/generate-frontend.js artifacts/sales-order/contract.json` | `npx sf-generate-frontend artifacts/sales-order/contract.json` |
| `node cli/src/regen-all.js $$REGEN_ARGS` (appears twice — the `regen` target and the `regen-check` target) | `npx sf-regen-all $$REGEN_ARGS` (both occurrences) |
| `@echo "  - For a single window, you can also run: node cli/src/resolve-curated.js --window <spec> --write"` | `@echo "  - For a single window, you can also run: npx sf-resolve-curated --window <spec> --write"` |
| `env $$CACHE_ENV node cli/src/push-to-neo.js $(ONLY) --dump-delta artifacts/$(ONLY)/neo-delta.json $$DELTA_ARGS` | `env $$CACHE_ENV npx sf-push-neo $(ONLY) --dump-delta artifacts/$(ONLY)/neo-delta.json $$DELTA_ARGS` |
| `env $$CACHE_ENV node cli/src/push-to-neo.js $$spec ...` (inside `regen-check`) | `env $$CACHE_ENV npx sf-push-neo $$spec ...` (keep the rest of the line's args unchanged) |
| `node cli/src/xml-apply-delta.js ...` | `npx sf-xml-apply-delta ...` (keep the rest of the line's args unchanged) |
| `node cli/src/xml-regeneration-check.js "$$OUTDIR/prev" "$$OUTDIR/predicted" --include-dir sourcedata` | `npx sf-xml-regeneration-check "$$OUTDIR/prev" "$$OUTDIR/predicted" --include-dir sourcedata` |
| `eval node cli/src/data-fixes/run.js $$DF_ARGS` | `eval npx sf-data-fixes $$DF_ARGS` |
| `@echo "{etendo_root}/gradle.properties (see cli/src/db.js)."` | `@echo "{etendo_root}/gradle.properties (see the installed @etendosoftware/schema-forge-cli's db.js)."` |
| `@echo "  - Authoring rules + skeleton: cli/src/data-fixes/sql/README.md."` | `@echo "  - Authoring rules + skeleton: node_modules/@etendosoftware/schema-forge-cli/src/data-fixes/sql/README.md."` |
| `node cli/src/generate-reports-manifest.js` | `npx sf-generate-reports-manifest` |
| `node cli/src/menu-cache.js refresh` | `npx sf-menu-cache refresh` |
| `node cli/src/report-preview.js --artifact business-partner --report listing` | `npx sf-report-preview --artifact business-partner --report listing` |
| `node cli/src/xml-regeneration-check.js "$(ORIGINAL_DB_DIR)" "$(EXPORTED_DB_DIR)"` | `npx sf-xml-regeneration-check "$(ORIGINAL_DB_DIR)" "$(EXPORTED_DB_DIR)"` |

Use `grep -n "node cli/src\|cli/src" Makefile` after editing to confirm every occurrence was caught (the table above is exhaustive for the current file, but this repo's `Makefile` may have been touched by other in-flight work — verify against the live file, don't blindly trust the table if the grep finds something not listed here).

- [ ] **Step 2: Rewrite the four test targets (`test`, `test-all-coverage`, `test-ci`, `test-ci-coverage`) to drop CLI/package-workspace test steps**

These currently test `cli/test/*.test.js` and `packages/*` workspaces (both deleted) alongside `tools/app-shell`/`artifacts` (still here). Following the exact same pattern Phase 2 used to trim `schema_forge_core`'s versions of these targets (in reverse — keep what Phase 2 removed, remove what Phase 2 kept), rewrite:

```makefile
test: ## Run all unit tests (app-shell + artifacts + vitest)
	node --test 'tools/app-shell/src/**/__tests__/*.test.js'
	node --test 'tools/app-shell/test/*.test.js'
	node --test 'artifacts/**/__tests__/*.test.js'
	cd tools/app-shell && npx vitest run

test-all-coverage: ## Run ALL unit tests (Node + Vitest) with coverage reports
	@mkdir -p coverage
	@echo "=== App-shell Node tests ==="
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/appshell-lcov.info $(shell find tools/app-shell/src -path '*/__tests__/*.test.js' ! -name 'useEntity-helpers.test.js')
	@echo "=== App-shell extra tests ==="
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/appshell-test-lcov.info $(shell find tools/app-shell/test -name '*.test.js')
	@echo "=== Artifact custom tests ==="
	node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/artifacts-lcov.info $(shell find artifacts -path '*/__tests__/*.test.js')
	@echo "=== Vitest (React components) ==="
	cd tools/app-shell && npx vitest run --coverage --coverage.reporter=lcov && sed 's|^SF:src/|SF:tools/app-shell/src/|' coverage/lcov.info > ../../coverage/vitest-lcov.info
	@echo "=== Merging LCOV reports ==="
	npx lcov-result-merger 'coverage/*-lcov.info' coverage/merged-lcov.info
	@echo ""
	@echo "Coverage reports saved in coverage/"
	@echo "  Individual: appshell-lcov.info, appshell-test-lcov.info, artifacts-lcov.info, vitest-lcov.info"
	@echo "  Merged:     merged-lcov.info (used by SonarQube)"

test-ci: ## Run all unit tests and write JUnit XML reports (CI mode)
	@mkdir -p test-results
	node --test \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/appshell-node.xml \
	  'tools/app-shell/src/**/__tests__/*.test.js' \
	  'tools/app-shell/test/*.test.js'
	node --test \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/artifacts.xml \
	  'artifacts/**/__tests__/*.test.js'
	cd tools/app-shell && npx vitest run \
	  --reporter=junit \
	  --outputFile=../../test-results/vitest.xml

test-ci-coverage: ## Run all unit tests with JUnit XML reports + LCOV coverage (CI mode, single pass)
	@mkdir -p test-results coverage
	node --test --experimental-test-coverage \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/appshell-node.xml \
	  --test-reporter=lcov --test-reporter-destination=coverage/appshell-lcov.info \
	  'tools/app-shell/src/**/__tests__/*.test.js' \
	  'tools/app-shell/test/*.test.js'
	node --test --experimental-test-coverage \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=junit --test-reporter-destination=test-results/artifacts.xml \
	  --test-reporter=lcov --test-reporter-destination=coverage/artifacts-lcov.info \
	  'artifacts/**/__tests__/*.test.js'
	cd tools/app-shell && npx vitest run --coverage --coverage.reporter=lcov \
	  --reporter=junit \
	  --outputFile=../../test-results/vitest.xml \
	  && cp coverage/lcov.info ../../coverage/vitest-lcov.info
	@echo "=== Merging LCOV reports ==="
	npx lcov-result-merger 'coverage/*-lcov.info' coverage/merged-lcov.info
```

(Note the `--coverage.reporter=lcov` flag on both vitest invocations — Phase 2 discovered vitest's default coverage reporters don't include `lcov.info`, which `lcov-result-merger` needs. Apply the same fix here proactively rather than rediscovering it via a failed push.)

- [ ] **Step 3: Run a syntax/dry-run check on the Makefile before running anything for real**

```bash
make -n test 2>&1 | head -20
make -n regen-check 2>&1 | head -20
```

Expected: both print the commands they WOULD run (Make's dry-run mode), with no `node cli/src` anywhere in the output — confirms the rewrite is syntactically complete without actually invoking anything yet (the CLI isn't installed until Task 6).

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "Feature ETP-4346: Rewrite Makefile to call installed CLI bins"
```

## Task 4: Remove core-only CI workflows, adapt the rest

**Files:**
- Delete: 5 workflow files.
- Modify: `.github/workflows/quality-gate.yml`, `test.yml`, `sonar-project.properties`.

- [ ] **Step 1: Delete the 5 workflows confirmed core-only during Phase 3 planning**

```bash
git rm .github/workflows/publish-private-packages.yml \
  .github/workflows/base-branch-health.yml \
  .github/workflows/epic-rollup-entry.yml \
  .github/workflows/epic-rollup-report.yml \
  .github/workflows/sync-develop-to-epic.yml
```

Do NOT touch `domain-boundary-check.yml`, `core-approval.yml`, `pr-architecture-alert.yml` — deferred governance decision, unchanged from Phase 2's treatment. Do NOT touch `data-testid-check.yml` — it already defaults to `tools/app-shell/src` (the correct target for this repo), needs zero changes.

- [ ] **Step 2: Rewire `quality-gate.yml`'s CLI invocation**

Read the file first (`cat .github/workflows/quality-gate.yml`), find the step running `node cli/src/quality-gate.js --pr-affected --baseline-ref origin/main --format md --output qg-report.md` (or similar — confirm the exact current args by reading the file, don't assume they match this plan's earlier Makefile table verbatim), and change it to `npx sf-quality-gate --pr-affected --baseline-ref origin/main --format md --output qg-report.md`, preserving every other argument exactly as found.

- [ ] **Step 3: Strip the core-only steps from `test.yml`**

Read the file. Remove: the `xml-regeneration-check` job (tests `cli/test/xml-regeneration-check.test.js` — moved to `schema_forge_core`'s own `test.yml`), the "CLI tests" step (`cli/test/*.test.js`), and the three `npm test --workspace=packages/*`/`npm run test:consumer` steps. Keep everything referencing `tools/app-shell`, `artifacts`, or `e2e` untouched.

- [ ] **Step 4: Fix `sonar-project.properties`**

Remove `cli/src` from `sonar.sources` (line ~22) and `cli/test`, `packages/app-shell-core/*/__tests__`, `packages/schema-forge-core/test` from `sonar.tests` (line ~32) — these are the exact lines the Phase 3 planning investigation flagged as needing real edits. Keep `tools/app-shell/src`, `tools/app-shell/test`, `e2e` in both blocks. Update the stale header comment ("Analyzes the Schema Forge CLI tools and app-shell frontend code") to something accurate for a functional-only repo (e.g. "Analyzes the etendo_schema_forge functional module — generated windows, app-shell frontend, e2e specs").

- [ ] **Step 5: Verify no remaining workflow references a deleted path**

```bash
grep -rln "cli/src\|cli/test\|packages/schema-forge-core\|packages/app-shell-core\|packages/schema-forge-stack\|packages/schema-forge-agent-context" .github/workflows/*.yml .githooks/pre-push sonar-project.properties 2>/dev/null
```

Expected: no output, or only matches inside the 3 deliberately-deferred governance workflows (`domain-boundary-check.yml`, `core-approval.yml`, `pr-architecture-alert.yml`) or comments — read any hit before deciding it's fine.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Feature ETP-4346: Remove core-only workflows, rewire quality-gate/test/sonar"
```

## Task 5: `.githooks/pre-push` — confirm no change needed, document why

**Files:** none (verification only — Phase 3 planning already confirmed this file needs no edits).

- [ ] **Step 1: Re-confirm each of the 3 mandatory pre-push steps still resolves correctly**

```bash
grep -n "check:data-testid\|sf-domain-boundary-check\|make regen-check" .githooks/pre-push
```

Expected: Step 0 (`npm run check:data-testid`, no explicit target argument, so it uses `scripts/check-add-data-testid.sh`'s own default `tools/app-shell/src` — correct, no change). Step 1 (`make domain-boundary-check` → already calls `npx sf-domain-boundary-check` inside the Makefile — already correct, predates this split). Step 3 (`make regen-check` → fixed by Task 3's Makefile rewrite). No `.githooks/pre-push` edit is needed — this step exists to confirm that claim with fresh eyes, not to make a change.

- [ ] **Step 2: No commit** (verification-only task).

## Task 6: Final verification (gated on `read:packages` auth)

**Files:** none.

- [ ] **Step 1: Confirm local npm auth for the GitHub Packages registry is configured**

```bash
npm whoami --registry=https://npm.pkg.github.com 2>&1
```

Expected: prints a username (proves a valid, scoped token is configured — either via `NODE_AUTH_TOKEN` env var or a token line in `~/.npmrc`). If this errors with 401/authentication required, STOP — this step cannot proceed until the human has provisioned a token with `read:packages` scope (a `gh auth refresh -s read:packages` or an equivalent PAT); do not attempt to work around it.

- [ ] **Step 2: Install and confirm the three packages actually resolve**

```bash
npm install
ls node_modules/@etendosoftware/
```

Expected: `schema-forge-cli`, `app-shell-core`, `schema-forge-core` all present as real installed packages (not symlinks to a local workspace — confirm with `ls -la node_modules/@etendosoftware/schema-forge-cli` showing a real directory, not a symlink, since the old workspace-link is gone after Task 2).

- [ ] **Step 3: Confirm the installed CLI bins actually run**

```bash
npx sf-validate-pipeline --help 2>&1 | head -5
npx sf-generate-frontend --help 2>&1 | head -5
```

Expected: both print usage/help output (or run their default behavior without an ENOENT/module-not-found error) — proves the `bin` entries resolve inside `node_modules` correctly.

- [ ] **Step 4: Run `make regen` end-to-end for one already-working window**

```bash
make regen ONLY=sales-order
```

Expected: completes successfully, regenerating `artifacts/sales-order/contract.json` and `artifacts/sales-order/generated/web/sales-order/**` with no errors — this is the design spec's own Testing requirement ("`make regen ONLY=<window>` must succeed end-to-end against the installed `@etendosoftware/schema-forge-cli`"). Compare the regenerated output against `git diff artifacts/sales-order/` — expect no unexpected diff (the generator's behavior shouldn't have changed, only where its code lives).

- [ ] **Step 5: Run the full functional test suite**

```bash
make test
```

Expected: passes (compare against whatever this repo's baseline was before this branch started — some tests may already be failing/skipped for unrelated reasons; this step is about confirming nothing NEW broke).

- [ ] **Step 6: Commit only if Steps 1-5 required any fix** — if everything passed as-is, there's nothing to commit for this task.

---

## What This Plan Does Not Cover

- **`docs/` cleanup.** 60+ files under `docs/` mix generic tooling docs with functional-only content and were never individually classified — explicitly deferred to a separate pass per the human's decision during Phase 3 planning. Doesn't block the dependency wiring; `docs/` sitting temporarily unclassified doesn't break anything functionally.
- **Re-adding the 28 relocated test files** tracked in `schema_forge_core`'s `phase3-relocated-tests.md` (9 "Group A" functional-utility tests, 19 "Group B/C/D" generator-logic tests against real window data). This is real, separate work — importing from the installed `@etendosoftware/schema-forge-cli` package (deep imports like `@etendosoftware/schema-forge-cli/src/wiring-completeness.js` should work since the package has no `exports` field restricting subpath access, but this needs to be verified empirically once Task 6 confirms the package installs) rather than a relative `../src/*.js` path, for the Group B/C/D tests, and physically relocated next to their new source location for Group A. Tracked as "Phase 3b," planned separately once this plan's mechanical split is verified working.
- **Root `README.md`/`AGENTS.md`/`CLAUDE.md` rewrites** describing the new two-repo model — this is Phase 5 (Sage/Docs) per the design spec's Phasing, not this plan.

## Addendum (discovered via a broader post-deletion grep): Tailwind content glob regression

Task 2's own grep check (relative-import patterns only) came back clean, but a reviewer-suggested broader check (also searching for `tools/*`/`core-maps/*.json` references, any `../` depth) found `tools/app-shell/tailwind.config.js` still had `'../../packages/*/src/**/*.{js,jsx}'` in its `content` glob — added for ETP-4083 (a real bug: Tailwind purging `bg-popover` and other classes that only appear in `packages/app-shell-core/src`, causing a transparent popover background). With `packages/` deleted, this glob pointed at nothing, silently reintroducing the exact bug ETP-4083 fixed. Retargeted to `'../../node_modules/@etendosoftware/app-shell-core/src/**/*.{js,jsx}'` — scans the installed dependency instead of the local workspace path. Verify this renders correctly in Task 6's final verification once the package actually installs.
