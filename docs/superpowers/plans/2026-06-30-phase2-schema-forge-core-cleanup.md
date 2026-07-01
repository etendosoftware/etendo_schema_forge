# Phase 2: schema_forge_core Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the new `schema_forge_core` repo (a byte-identical history mirror of `etendo_schema_forge`, created in Phase 1), remove every functional/backend-adjacent path, relocate the 19 test files whose subject-under-test doesn't stay, rename and complete the `cli/` package for publishing, and extend the existing publish workflow to cover it — leaving a self-contained tooling repo with zero references to window content.

**Architecture:** All work happens in a **fresh local clone of `schema_forge_core`** at `/Users/sebastianbarrozo/Documents/work/epic/schema_forge_core` — a different directory and a different repo from `schema-forge-ar`/`etendo_schema_forge`. Nothing in this plan touches the `schema-forge-ar` checkout. Deletions are plain `git rm -r`; the `cli/` package gets a rename + additive `bin` entries; the publish workflow gets one new job step appended to the existing pattern.

**Tech Stack:** Node 22, npm workspaces, GitHub Actions, GitHub Packages (`npm.pkg.github.com`).

## Global Constraints

- All versioned content (code, comments, commit messages) in English.
- This is a **new repo without an established Jira-linked commit convention yet** — do not use the `Feature ETP-4346: ...` prefix from `etendo_schema_forge`'s `CLAUDE.md`; use plain, descriptive commit messages instead (e.g. `Remove functional content per split design spec`).
- Never force-push. Never merge to `main` directly — this plan produces a branch and leaves the PR/merge to a later phase (Phase 4 review), same as Phase 0's convention.
- Every deletion must be followed by a test run before the next deletion — if something unexpected breaks, stop and report rather than deleting further.
- Source of truth for what moves/stays: `docs/superpowers/specs/2026-06-30-schema-forge-core-split-design.md`'s Boundary section and Disposition Table (both already resolved, in `etendo_schema_forge`'s `feature/ETP-4346` branch — read them there before starting, they are not duplicated into this plan).

---

## Task 1: Clone `schema_forge_core`, create the working branch, establish baseline

**Files:** none (setup only).

- [ ] **Step 1: Clone into a fresh directory next to `schema-forge-ar`**

```bash
mkdir -p /Users/sebastianbarrozo/Documents/work/epic
cd /Users/sebastianbarrozo/Documents/work/epic
git clone https://github.com/etendosoftware/schema_forge_core.git
cd schema_forge_core
git checkout -b cleanup/remove-functional-content main
```

Expected: clone succeeds, new branch created off `main`.

- [ ] **Step 2: Install dependencies and record the pre-change baseline**

```bash
npm install
npm test 2>&1 | tee /tmp/schema_forge_core-baseline.log | tail -30
```

Expected: this runs `cli/test/*.test.js` (135 files today). Record the pass/fail counts from the last lines of output — some tests may already be failing or skipped for reasons unrelated to this plan (e.g. requiring live DB access); that's fine, this step exists to give later tasks something to compare against, not to require a fully green baseline.

- [ ] **Step 3: No commit for this task** — nothing was changed, only cloned and measured. Proceed to Task 2.

## Task 2: Remove the 19 test files whose subject-under-test is moving to `etendo_schema_forge`

An investigation during planning found 19 of `cli/test/`'s 135 files have a **real** runtime dependency on `artifacts/`, `tools/app-shell/`, or `e2e/` content (not just the string "artifacts" used as a representative path) — either because they test utility code that physically lives under `tools/app-shell/src/windows/custom/**` (and moves there), or because they test `cli/`'s generator/validator logic using real committed window data as a fixture. Per the human's explicit decision, both groups move to `etendo_schema_forge` in a later phase (Phase 3) rather than being rewritten against synthetic fixtures here — this task only removes them from `schema_forge_core`.

**Files:**
- Delete: 19 files listed in Step 2 below.
- Create: `phase3-relocated-tests.md` at the repo root — a tracking note for Phase 3, listing exactly what was removed and why, since Phase 3 runs in a different repo and needs this record.

**Interfaces:** none (no code produced).

- [ ] **Step 1: Write the tracking note for Phase 3**

```markdown
# Tests Relocated to etendo_schema_forge (Phase 3 TODO)

Removed from schema_forge_core's cli/test/ during Phase 2 cleanup because their subject-under-test
lives in content that moved to etendo_schema_forge. Phase 3 must re-add these, adapted to import
from the installed `@etendosoftware/schema-forge-cli` package instead of relative `../src/*.js`
paths where they test cli/ logic, and relocated to sit next to their source under
`tools/app-shell/src/windows/custom/<window>/__tests__/` where they test functional utility code.

## Group A — tests functional-side utility code (relocate next to source, adapt to that area's test runner)

- `bottom-panels-rollout.test.js` — tests bottom-panel wiring across artifacts/tools/app-shell custom dirs for goods-movements, goods-receipt, goods-shipment, internal-consumption, physical-inventory, return-material-receipt, return-to-vendor-shipment.
- `eval-tab-readonly.test.js` — tests `tools/app-shell/src/components/contract-ui/evalTabReadOnly.js`.
- `fiscal-monitor.mockdata.test.js` — tests `tools/app-shell/src/windows/custom/fiscal-monitor/fiscalMonitorMockData.js`.
- `fiscal-config.utils.test.js` — tests `tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js` and reads several fiscal-config page source files plus `registry.js`.
- `fiscal-monitor.utils.test.js` — tests `tools/app-shell/src/windows/custom/fiscal-monitor/fiscalMonitor.utils.js`.
- `useFiscalMonitor.test.js` — reads `tools/app-shell/src/windows/custom/fiscal-monitor/useFiscalMonitor.js` source text.
- `useFiscalConfig.test.js` — reads `tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js` source text.
- `warehouse-aggregate.test.js` — tests `tools/app-shell/src/windows/custom/warehouse/warehouseUtils.js`.
- `pipeline-window-steps.test.js` — writes/reads/restores `tools/app-shell/src/windows/custom/<throwaway>/*` and `tools/app-shell/src/windows/registry.js`.

## Group B — tests cli/ generator/validator logic against real window data (re-add importing the installed CLI package)

- `contract-all.test.js` — walks the real `artifacts/*/contract.json` tree.
- `etendogo-agentic-risk-integration.test.js` — imports `tools/app-shell/src/lib/selectorContext.js`, reads several windows' `contract.json`.
- `generate-frontend-extra-tabs.test.js` — reads `artifacts/*/generated/...`, `artifacts/*/decisions.json`, sales-invoice/purchase-invoice custom index files.
- `generate-frontend-statusbar-coverage.test.js` — reads `artifacts/sales-order/generated/web/sales-order/*.jsx`.
- `labels-naming.test.js` — reads several windows' `decisions.json` and `tools/app-shell/src/windows/custom/sales-quotation/index.jsx`.
- `purchase-invoice-readonly.test.js` — reads `artifacts/purchase-invoice/{contract.json,decisions.json,generated/web/purchase-invoice/HeaderForm.jsx}`.
- `purchase-invoice-labels.test.js` — reads `artifacts/purchase-invoice/decisions.json` and its custom index file.
- `processes-valid.test.js` — reads `artifacts/sales-order/processes.json`.
- `validate-field-names.test.js` — writes its fixture inside the real `artifacts/` directory.
- `wiring-completeness.test.js` — walks the whole `artifacts/` tree and reads `tools/app-shell/src/{menu.json,windows/registry.js,App.jsx}`.
```

- [ ] **Step 2: Delete the 19 files**

```bash
git rm cli/test/bottom-panels-rollout.test.js \
  cli/test/eval-tab-readonly.test.js \
  cli/test/fiscal-monitor.mockdata.test.js \
  cli/test/fiscal-config.utils.test.js \
  cli/test/fiscal-monitor.utils.test.js \
  cli/test/useFiscalMonitor.test.js \
  cli/test/useFiscalConfig.test.js \
  cli/test/warehouse-aggregate.test.js \
  cli/test/pipeline-window-steps.test.js \
  cli/test/contract-all.test.js \
  cli/test/etendogo-agentic-risk-integration.test.js \
  cli/test/generate-frontend-extra-tabs.test.js \
  cli/test/generate-frontend-statusbar-coverage.test.js \
  cli/test/labels-naming.test.js \
  cli/test/purchase-invoice-readonly.test.js \
  cli/test/purchase-invoice-labels.test.js \
  cli/test/processes-valid.test.js \
  cli/test/validate-field-names.test.js \
  cli/test/wiring-completeness.test.js
```

Expected: 19 files removed, no errors (all paths must exist — if `git rm` reports a path not found, STOP and report BLOCKED rather than guessing at the correct path).

- [ ] **Step 3: Run the suite and confirm no new failures beyond the 19 removed files**

```bash
npm test 2>&1 | tail -30
```

Expected: 116 test files run (135 − 19). Compare the pass count against Task 1's baseline minus whatever the 19 removed files had contributed — no *other* file should newly fail (a newly-failing file here would mean something else imports one of the 19 removed files, which the investigation didn't catch — stop and report if so, don't delete further to "fix" it).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Remove test files whose subject-under-test moves to etendo_schema_forge"
```

## Task 3: Remove functional and backend-adjacent content

Per the Disposition Table in `docs/superpowers/specs/2026-06-30-schema-forge-core-split-design.md`: everything assigned to `etendo_schema_forge`, marked "Out of scope" (backend-adjacent), or "N/A" (untracked) does not belong in `schema_forge_core`.

**Files:** many, listed exactly in Step 1-2 below.

- [ ] **Step 1: Delete whole directories**

```bash
git rm -r artifacts docs/generated-custom-windows docs/etendo-ad \
  tools/app-shell e2e core-maps infra pipelines pending tests
```

(`tests/` here is the root-level directory containing only `test-sales-order-endpoints.sh` — it hits `com.etendoerp.go`'s NEO Headless API directly, confirmed backend-adjacent, not schema_forge tooling. `presentations/` and `caps/` are NOT included here — confirmed via `git ls-files` during planning that neither has any git-tracked content, so there is nothing to remove; `git rm -r` on them would error with "did not match any files" — skip them.)

Expected: all nine paths removed. If any of `presentations/` or `caps/` still shows tracked files (contradicting the planning-time check), do NOT delete blindly — stop and report what's actually tracked there.

- [ ] **Step 2: Delete individual files**

```bash
git rm quality-gate.config.json \
  domain-boundary-report.json domain-boundary-report.md \
  proposal.md review-report.json pr-test-coverage-analysis.md
```

Expected: six files removed. (`cli/src/quality-gate/*.js`, the runner code, is NOT touched — only its consumer-side config file moves away.)

- [ ] **Step 3: Triage `feedback.md` by hand — do not delete it wholesale**

Read `feedback.md` in full (83 lines, ~5 dated entries as of Phase 2 planning). For each entry, classify:
- **Tooling-relevant** (describes a bug/behavior in `cli/`'s generators, validators, or `push-to-neo.js` itself) → keep in `schema_forge_core`'s `feedback.md`.
- **Window/backend-relevant** (describes a specific window's business behavior, or a NEO Headless/backend API bug) → remove from this file, but paste the full entry text into your task report under a "Feedback entries to hand off to Phase 3" heading — these describe real, already-diagnosed issues and must not be silently lost.

Rewrite `feedback.md` to contain only the tooling-relevant entries, keeping the original header (`# Feedback Log` and the append-only convention line) unchanged.

- [ ] **Step 4: Confirm nothing left in `cli/`/`packages/*` references a deleted path**

```bash
grep -rn "\.\./\.\./artifacts\|\.\./\.\./tools/app-shell\|\.\./\.\./e2e\|\.\./\.\./core-maps\|\.\./\.\./infra" cli/src cli/test packages 2>/dev/null
```

Expected: no output. If this finds something, STOP — do not delete more or edit the referencing file to "fix" it yet; report exactly what was found, since the Disposition Table's classification may have missed a real dependency and that needs a decision, not a quick patch.

- [ ] **Step 5: Run the full remaining suite**

```bash
npm test 2>&1 | tail -30
```

Expected: same pass count as Task 2 Step 3's result — removing non-code content and backend-adjacent files should not change `cli/test/`'s pass/fail state at all.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Remove functional and backend-adjacent content per split design spec"
```

## Task 4: Remove now-irrelevant CI workflows and adapt git hooks

Task 3 deleted `artifacts/`, `tools/app-shell/`, and `e2e/` — several existing CI workflows and both git hooks invoke checks against those exact paths and would error on every push/PR in this repo if left untouched.

**Files:**
- Delete: 5 workflow files listed in Step 1.
- Modify: `.github/workflows/test.yml`, `.github/workflows/sonar-scan.yml`, `.githooks/pre-push`.

**Interfaces:** none (CI/hook configuration only).

- [ ] **Step 1: Delete the workflows that validate/deploy content no longer in this repo**

Per the Disposition Table, these five all validate or deploy `artifacts/<window>`/the running `tools/app-shell` app — all moved to `etendo_schema_forge`:

```bash
git rm .github/workflows/offline-regen-check.yml \
  .github/workflows/pipeline-validate.yml \
  .github/workflows/window-doc-freshness.yml \
  .github/workflows/deploy-staging.yml \
  .github/workflows/ratchet-guards.yml
```

Expected: five files removed. (`domain-boundary-check.yml`, `core-approval.yml`, `pr-architecture-alert.yml` are deliberately NOT touched here — the design spec flags all three as needing a separate governance decision about whether to retire them; leave them in place for now even though `domain-boundary-check.yml` may behave oddly with no functional content left to check against. Note this as a known follow-up in your task report, don't decide it yourself.)

- [ ] **Step 2: Read `.github/workflows/test.yml` and remove the `tools/app-shell`-specific steps**

Read the file first — it currently has a `test` job whose steps include (among others) `run: npm test --workspace=packages/schema-forge-core`, `run: npm test --workspace=packages/app-shell-core`, `run: npm run test:consumer --workspace=packages/app-shell-core`, then a step running `cd tools/app-shell && npx vitest run`, then a step running `npm run build --workspace=tools/app-shell`. Remove exactly the two steps that reference `tools/app-shell` (the `vitest run` step and the `build --workspace=tools/app-shell` step) — leave the `schema-forge-core`/`app-shell-core` steps and the `xml-regeneration-check` job untouched unless reading it reveals it also references a deleted path (if so, treat it the same way: remove only the parts referencing deleted paths, not the whole job, unless the whole job turns out to be about deleted content).

- [ ] **Step 3: Read `.github/workflows/sonar-scan.yml` and remove any step scanning deleted paths**

Read the file's `build` job. If any step's `run:` or `with:` block references `tools/app-shell`, `artifacts`, or `e2e` (e.g. a Sonar scan property pointing `sonar.sources` at those paths, or a build step compiling `tools/app-shell`), remove that step. If the workspace-level `sonar-project.properties` (not this workflow file) is what actually lists source paths, note in your report that `sonar-project.properties` still needs a matching edit — don't guess at rewriting it blind in this task; a Sonar project key change usually needs a corresponding change in the Sonar server config too, which is outside this plan's reach.

- [ ] **Step 4: Adapt `.githooks/pre-push` to remove the offline-regen-check step and fix the data-testid check's target**

Read the file. Remove the step that runs (or references) `make regen-check FROM_CACHE=1 REGEN_CHECK_PREV_XML_DIR=...` — `make regen-check` itself lived in the `Makefile` and operated on `artifacts/`, which no longer exists; this step can only fail or error now. Leave the `make domain-boundary-check` step untouched (deferred governance decision, same as Step 1).

For the `npm run check:data-testid` step: this invokes `scripts/check-add-data-testid.sh`, whose target defaults to `tools/app-shell/src` when called with no argument — that directory no longer exists. Retarget it explicitly to the one directory in this repo that still has meaningful JSX: `npm run check:data-testid -- packages/app-shell-core/src` (check `scripts/check-add-data-testid.sh`'s argument handling first to confirm it accepts a positional path argument the way `package.json`'s script invocation expects — if it doesn't, pass the path via the correct mechanism that script actually supports).

- [ ] **Step 5: Confirm no remaining workflow or hook references a deleted path**

```bash
grep -rln "tools/app-shell\|artifacts/\| e2e/" .github/workflows/*.yml .githooks/pre-push .githooks/pre-commit
```

Expected: no output, or only matches inside comments explaining historical context (read any hit before deciding it's fine — a comment mentioning a deleted path is harmless, an active `run:`/`with:` step referencing one is not).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Remove CI workflows and hook checks that validated deleted content"
```

## Task 5: Rename and complete the `cli/` package definition

**Files:**
- Modify: `cli/package.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: the package publishes as `@etendosoftware/schema-forge-cli` (not `@schema-forge/cli`) with `bin` entries for every CLI command, including nine that were missing today. Phase 3 (in `etendo_schema_forge`) depends on this exact package name and these exact bin names.

- [ ] **Step 1: Confirm the nine additional commands are genuine CLI entry points, not internal modules**

Already confirmed during planning: `generate-frontend.js`, `generate-reports-manifest.js`, `menu-cache.js`, `method-budget.js`, `regen-all.js`, `window-leak-budget.js`, `xml-apply-delta.js`, `resolve-curated.js`, `validate-pipeline.js` are all invoked directly via `node cli/src/<name>.js ...` from `Makefile` or documented directly in `CLAUDE.md`/`docs/` as commands (seven of the nine already carry a `#!/usr/bin/env node` shebang; `generate-frontend.js` and `resolve-curated.js` lack one but are still invoked the same way). `db.js` is a shared DB-connection helper imported by other scripts, not a standalone command — it does NOT get a bin entry.

- [ ] **Step 2: Rewrite `cli/package.json`**

```json
{
  "name": "@etendosoftware/schema-forge-cli",
  "version": "0.1.0",
  "type": "module",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "engines": {
    "node": ">=22"
  },
  "dependencies": {
    "@clack/prompts": "^1.5.1",
    "pg": "^8.13.0"
  },
  "bin": {
    "sf-extract-db": "./src/extract-from-db.js",
    "sf-extract": "./src/extract-fields.js",
    "sf-extract-rules": "./src/extract-rules.js",
    "sf-validate": "./src/validate-schema.js",
    "sf-classify": "./src/pre-classify.js",
    "sf-contract": "./src/generate-contract.js",
    "sf-push-neo": "./src/push-to-neo.js",
    "sf-pipeline": "./src/pipeline.js",
    "sf-test": "./src/run-contract-tests.js",
    "sf-gen-log": "./src/generation-log.js",
    "sf-test-report": "./src/test-report-html.js",
    "sf-check-version": "./src/check-version.js",
    "sf-lock": "./src/lock-window.js",
    "sf-report-contract": "./src/report-contract.js",
    "sf-report-serve": "./src/report-serve.js",
    "sf-report-preview": "./src/report-preview.js",
    "sf-quality-gate": "./src/quality-gate.js",
    "sf-xml-regeneration-check": "./src/xml-regeneration-check.js",
    "sf-generate-frontend": "./src/generate-frontend.js",
    "sf-generate-reports-manifest": "./src/generate-reports-manifest.js",
    "sf-menu-cache": "./src/menu-cache.js",
    "sf-method-budget": "./src/method-budget.js",
    "sf-regen-all": "./src/regen-all.js",
    "sf-window-leak-budget": "./src/window-leak-budget.js",
    "sf-xml-apply-delta": "./src/xml-apply-delta.js",
    "sf-resolve-curated": "./src/resolve-curated.js",
    "sf-validate-pipeline": "./src/validate-pipeline.js"
  },
  "files": [
    "src",
    "!test"
  ],
  "devDependencies": {
    "@babel/parser": "^7.29.2",
    "ajv": "^8.17.0"
  }
}
```

Only additions relative to the original: `name` changed, `"private": true` removed, `publishConfig` added, nine new `bin` entries added, `files` added (so `test/` and its fixtures never ship in the published package).

- [ ] **Step 3: Verify every bin path resolves to a real file**

```bash
node -e "
const pkg = JSON.parse(require('fs').readFileSync('cli/package.json', 'utf8'));
const { existsSync } = require('fs');
const { resolve } = require('path');
let missing = [];
for (const [name, path] of Object.entries(pkg.bin)) {
  const full = resolve('cli', path);
  if (!existsSync(full)) missing.push(\`\${name} -> \${path}\`);
}
if (missing.length) { console.error('MISSING:', missing); process.exit(1); }
console.log('All', Object.keys(pkg.bin).length, 'bin entries resolve.');
"
```

Expected: `All 27 bin entries resolve.` with no `MISSING` output. If anything is missing, fix the path in `package.json` (a typo, not a missing file — every path here was confirmed to exist during planning) and re-run.

- [ ] **Step 4: Confirm the CLI's own test suite still passes with the renamed package**

```bash
npm test 2>&1 | tail -20
```

Expected: same pass count as Task 3 Step 5 — a `package.json` rename doesn't change any test's behavior, this just confirms nothing was broken by the edit (e.g. a JSON syntax error).

- [ ] **Step 5: Commit**

```bash
git add cli/package.json
git commit -m "Rename cli package to @etendosoftware/schema-forge-cli, add missing bin entries"
```

## Task 6: Extend the publish workflow to cover the CLI package

**Files:**
- Modify: `.github/workflows/publish-private-packages.yml`

**Interfaces:**
- Consumes: `cli/package.json`'s `name` field from Task 4 (`@etendosoftware/schema-forge-cli`).
- Produces: nothing consumed elsewhere in this plan — this is the last task.

- [ ] **Step 1: Add a CLI test step, alongside the existing four package test steps**

In `.github/workflows/publish-private-packages.yml`, after the existing `- name: Schema Forge stack tests` step and before the `- name: Pack packages` step, insert:

```yaml
      - name: Schema Forge CLI tests
        run: npm test --workspace=cli
```

- [ ] **Step 2: Add `cli` to the pack step**

Change:

```yaml
      - name: Pack packages
        run: |
          npm pack --workspace=packages/schema-forge-core --dry-run
          npm pack --workspace=packages/app-shell-core --dry-run
          npm pack --workspace=packages/schema-forge-agent-context --dry-run
          npm pack --workspace=packages/schema-forge-stack --dry-run
```

to:

```yaml
      - name: Pack packages
        run: |
          npm pack --workspace=packages/schema-forge-core --dry-run
          npm pack --workspace=packages/app-shell-core --dry-run
          npm pack --workspace=packages/schema-forge-agent-context --dry-run
          npm pack --workspace=packages/schema-forge-stack --dry-run
          npm pack --workspace=cli --dry-run
```

- [ ] **Step 3: Add a fifth publish step, following the exact pattern of the other four**

After the existing `- name: Publish schema forge stack` step, append:

```yaml
      - name: Publish schema forge CLI
        run: |
          DRY_RUN_ARGS=""
          if [ "${{ inputs.dry_run }}" = "true" ]; then
            DRY_RUN_ARGS="--dry-run"
          fi
          npm publish --workspace=cli --tag "${{ inputs.tag }}" $DRY_RUN_ARGS
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Validate the workflow file's YAML syntax**

```bash
node -e "
const yaml = require('js-yaml');
const fs = require('fs');
try {
  yaml.load(fs.readFileSync('.github/workflows/publish-private-packages.yml', 'utf8'));
  console.log('YAML valid');
} catch (e) {
  console.error('YAML INVALID:', e.message);
  process.exit(1);
}
"
```

If `js-yaml` is not installed in this repo, use instead: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish-private-packages.yml')); print('YAML valid')"` (Python's `pyyaml` is more likely to already be available than a one-off npm install for this single check).

Expected: `YAML valid`. Do not actually trigger this workflow (no `workflow_dispatch` invocation, no `gh workflow run`) — actually publishing a real package is a separate, deliberate action for the user to trigger themselves once this PR is reviewed and merged, not part of this cleanup task.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/publish-private-packages.yml
git commit -m "Extend publish-private-packages workflow to cover the CLI package"
```

## Task 7: Push the cleanup branch (no merge)

**Files:** none.

- [ ] **Step 1: Push**

```bash
git push -u origin cleanup/remove-functional-content
```

- [ ] **Step 2: Report the final diff stat for the human/reviewer to see the scope at a glance**

```bash
git diff --stat main...cleanup/remove-functional-content | tail -5
```

- [ ] **Step 3: Do not open a PR or merge in this task.** PR creation and review is a separate step (this plan's controller handles that after all tasks pass review, matching Phase 0's pattern of not auto-merging).

---

## What This Plan Does Not Cover

- Opening/merging the PR against `schema_forge_core`'s `main` — a separate step after this plan's tasks are reviewed.
- Phase 3 (the `etendo_schema_forge`-side cleanup, dependency wiring, and re-adding the 19 relocated test files per `phase3-relocated-tests.md`) — a distinct plan, in a distinct repo, gated on this phase's packages actually being published (not just workflow-ready).
- Actually triggering the publish workflow — that requires the GitHub Packages cross-repo auth token from the design spec's Risks section to be provisioned first, and is a deliberate action for the human to invoke.
- The three CI workflows flagged as "needs a governance decision, not resolved by rule" in the design spec (`domain-boundary-check.yml`, `core-approval.yml`, `pr-architecture-alert.yml`) — left untouched in this plan; deciding whether to retire or repurpose them is explicitly deferred.

## Addendum (discovered during Task 3 execution): SF_ROOT path-resolution consistency

Task 3's verification grep (broadened after an initial too-narrow pattern missed real matches) found:

1. **4 more test files with a genuine `artifacts/`/`core-maps/` dependency**, missed by the original 30-file investigation because it required a trailing `/` after "artifacts" and never searched for "core-maps" at all: `cli/test/core-maps.test.js`, `cli/test/i18n-integration.test.js`, `cli/test/menu-actions-policy.test.js`, `cli/test/reports-naming.test.js`. These join the Group A/B relocation list in `phase3-relocated-tests.md` — same disposition (move to `etendo_schema_forge` in Phase 3), same reasoning.

2. **A real portability bug**: 25 files in `cli/src/*.js` compute a `ROOT` constant relative to `__dirname` (the *installed script's own location* — broken once this package lives in `node_modules/@etendosoftware/schema-forge-cli/` inside a consumer repo, since `join(__dirname, '..', '..')` would then resolve to somewhere inside `node_modules`, not the consumer's repo root). 7 of the 25 already guard this correctly with `process.env.SF_ROOT || join(__dirname, '..', '..')` — an escape hatch the original authors already anticipated needing. The other 18, plus 2 more files (`generate-reports-manifest.js`, `reconcile-schema.js`) using a different but equally `__dirname`-relative pattern, do not. **Fix:** make all 27 consistently use the `process.env.SF_ROOT || <original __dirname-relative fallback>` pattern (preserving today's default behavior — running `node cli/src/X.js` from within this repo still works identically — while allowing Phase 3's `etendo_schema_forge` to set `SF_ROOT=$(pwd)` before invoking any installed `sf-*` bin). This must land before Task 5 (packaging) is considered done, since an installable CLI that resolves paths wrong is a broken deliverable, not a working one.
