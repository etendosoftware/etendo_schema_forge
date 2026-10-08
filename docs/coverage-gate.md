# Coverage-decrease gate (`--compare-coverage`)

## What it protects

Sonar's Quality Gate only evaluates **new code**, so a PR can pass it while still
lowering the project's **overall** coverage — typically by adding new source files
with too few tests. This gate closes that gap: `run-sonar.sh --compare-coverage`
(invoked by the pre-push hook) blocks a push that would drop overall coverage.

It mirrors Jenkins' "Compare Coverage Results" stage (`sonarUtils.compareCoverage`),
so the local pre-push and CI apply the same rule.

## The rule

Given the branch's **overall** coverage (`current`) and the base branch's **overall**
coverage (`base`), both read live from Sonar's `coverage` metric:

1. `current < COVERAGE_MINIMUM` → **block outright**, with no base comparison.
2. `current < base − COVERAGE_TOLERANCE` → **block** (dropped more than the tolerance).
3. otherwise → **pass**.

Both thresholds are environment variables with defaults:

| Variable | Default | Meaning |
|---|---|---|
| `COVERAGE_TOLERANCE` | `1` | percentage points the branch may sit below the base without failing |
| `COVERAGE_MINIMUM` | `70` | absolute floor; below it the push fails regardless of the base |

The tolerance also absorbs the run-to-run wobble of the aggregate coverage metric
(a flaky unit test can move the total by a fraction of a point), so a small
fluctuation on an otherwise-identical commit no longer flips the gate.

## Behaviour

| Situation | Result |
|---|---|
| `current ≥ base − tolerance` and `current ≥ minimum` | ✅ pass |
| `current < minimum` | ❌ block (add tests, then re-push) |
| `current < base − tolerance` | ❌ block (add tests, then re-push) |
| current coverage not readable on Sonar | ⚠️ skip — not blocking |
| base branch not yet analysed on Sonar | ⚠️ skip (matches CI treating a missing baseline as 0%) |

Bypass a block with `git push --no-verify` (WIP only, and by a human in their own
terminal — the committed `PreToolUse` hook `.claude/hooks/block-push-no-verify.sh`
denies that flag when an agent tries it through Claude Code's Bash tool. The
companion `.claude/hooks/block-coverage-threshold-overrides.sh` also denies
agent-run assignments or exports of `COVERAGE_MINIMUM` and
`COVERAGE_TOLERANCE`; adjust their reviewed defaults in `run-sonar.sh` instead.
See **Agent Guardrails** in `CLAUDE.md`).

## Where it runs

- **`etendo_schema_forge` / `run-sonar.sh`** and **`com.etendoerp.go` / `run-sonar.sh`** — each repo's pre-push hook calls it with `--compare-coverage`.
- **Jenkins** — `sonarUtils.compareCoverage` (shared pipeline library) applies the same tolerance + minimum on the CI side, so local and CI agree.

## Where the coverage data is produced

The gate compares Sonar's `coverage` metric, which is fed by the LCOV that
`make test-ci-coverage` writes. That target needs only Node 22 and the npm
dependencies (no `.env`, no database) and produces:

- `coverage/merged-lcov.info` — the Node test-runner LCOVs plus Vitest's, merged by `scripts/merge-lcov.js`;
- `test-results/*.xml` — one JUnit report per suite (`cli`, `scripts`, `appshell-node`, `artifacts`, `vitest`).

Two CI jobs run it today:

| Job | Trigger | What happens to the outputs |
|---|---|---|
| Jenkins `Node Tests` stage (`etendo-go/schemaforge/Jenkinsfile` in the separate `com.etendoerp.jenkins.pipelines` repo) | Its `GenericTrigger` fires on push to `develop` / `main`, PRs `mergeblock/*` → `develop`, and PRs `hotfix/*` → `main` or `develop`. `feature/*` PRs do **not** trigger it. Heavy stages are skipped when a non-hotfix PR carries the `local-validated` label | Feeds the `SonarQube Analysis` (branch analysis) and `Compare Coverage Results` stages |
| GitHub Action `Tests` (`.github/workflows/test.yml`) | `pull_request` (opened / synchronize / reopened) and push to `main` / `develop` | JUnit published as the "Test Results" check; both files uploaded as the `unit-coverage` workflow artifact (7-day retention) |

The Action checks out the PR **head** commit (`github.event.pull_request.head.sha`),
the same sha Jenkins analyzes, not the merge ref, so its `unit-coverage` artifact is
interchangeable with Jenkins' own output. Because it tests the head sha rather
than the merge ref, the `Tests` check does not cover integration with the base
branch. A consumer must only use `unit-coverage` from a run whose conclusion is
`success` for that head sha: on failure the artifact may be partial or lack
`coverage/merged-lcov.info`. This is the first step of moving the slow
Jenkins `Node Tests` stage off Jenkins (ETP-5678): once the Action's timing is
measured, Jenkins can download `unit-coverage` instead of re-running the suites.
Until then both run, and `.github/workflows/sonar-scan.yml` is unchanged.
