# Coverage-decrease gate (`--compare-coverage`)

## What it protects

Sonar's Quality Gate only evaluates **new code**, so a PR can pass it while still
lowering the project's **overall** coverage — typically by adding new source files
with too few tests. This gate closes that gap: `run-sonar.sh --compare-coverage`
(invoked by the pre-push hook) blocks a push that would drop overall coverage, and
the GitHub `Sonar Build` check fails a pull request that does.

It mirrors Jenkins' "Compare Coverage Results" stage (`sonarUtils.compareCoverage`),
so the local pre-push and CI apply the same rule. In this repo the rule, its
default thresholds and its messages live in **one** script,
`scripts/compare-sonar-coverage.js`, called by both `run-sonar.sh` and
`.github/workflows/test.yml`. **Known duplicate:** `com.etendoerp.go/run-sonar.sh`
still carries its own Python copy of the rule and of the defaults; a threshold
change must be made in both repos until that copy is removed.

## The rule

Given the branch's **overall** coverage (`current`) and the base branch's **overall**
coverage (`base`), both read live from Sonar's `coverage` metric:

1. `current < COVERAGE_MINIMUM` → **block outright**, with no base comparison.
2. `current < base − COVERAGE_TOLERANCE` → **block** (dropped more than the tolerance).
3. otherwise → **pass**.

Both thresholds are environment variables; in this repo their defaults are
defined only in `scripts/compare-sonar-coverage.js` (see the known duplicate above):

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
| base branch not yet analysed on Sonar (404, or no `coverage` measure) | ⚠️ skip (matches CI treating a missing baseline as 0%) |
| base coverage unreadable for any other reason (401/403, 5xx, timeout, network) | ⚠️ skip — not blocking |
| Sonar rejects the token (401/403) while polling the analysis task | ⚠️ skip — not blocking (polling stops at once) |
| `node` not on `PATH` | ❌ block, with a readable message (`run-sonar.sh` checks before calling the script) |

The table describes the pre-push (`--context push`, the default). In the GitHub
`Sonar Build` job (`--context ci`) the thresholds and messages are the same, minus
the push-only hints, but a gate that cannot be evaluated **fails** instead of
skipping: unreadable current coverage, a missing `.scannerwork/report-task.txt`,
or an analysis that Sonar reports `FAILED`/`CANCELED` or does not process within
the wait timeout (600 s), or a `ceTaskUrl` whose origin differs from
`SONAR_HOST_URL` (refused so the token is never sent to another host), or a
base coverage that cannot be read for any reason other than "not found". The
GitHub compare step authenticates with the `SONAR_READ_TOKEN` secret (a user
token of the read-only Sonar user `github-actions-ro`) because the analysis
token in `SONAR_TOKEN` cannot read measures; if that secret is revoked, the
first 401/403 on the analysis task stops the polling at once and the step fails
closed (it does not wait out the 600 s), and if it is missing the step fails
with `SONAR_HOST_URL and SONAR_TOKEN must be set`. Before reading any measure,
the CI run waits for the scanner's Compute Engine task (`ceTaskUrl` in
`report-task.txt`) to finish, so it never compares a stale measure; a 5xx or a
network error while polling is retried until that timeout.

Only a base that is genuinely absent passes: a `404` (component or branch not
found) or an analysis without a `coverage` measure is `no-base` and passes with
a warning line. Any other failure to read the base — `401`/`403`, `5xx`, a
timeout or a network error — fails the CI step with `::error`, because treating
it as "first analysis" would let a coverage drop through unchecked. When the PR
targets a branch other than `develop` or `main` (which are analysed on every
push) and that branch has no coverage, the step still passes but emits a
`::warning::` annotation saying the coverage drop was **not** checked.

Bypass a block with `git push --no-verify` (WIP only, and by a human in their own
terminal — the committed `PreToolUse` hook `.claude/hooks/block-push-no-verify.sh`
denies that flag when an agent tries it through Claude Code's Bash tool. The
companion `.claude/hooks/block-coverage-threshold-overrides.sh` also denies
agent-run assignments or exports of `COVERAGE_MINIMUM` and
`COVERAGE_TOLERANCE`; adjust their reviewed defaults in
`scripts/compare-sonar-coverage.js` instead.
See **Agent Guardrails** in `CLAUDE.md`).

## Where it runs

- **`etendo_schema_forge` / `run-sonar.sh`** and **`com.etendoerp.go` / `run-sonar.sh`** — each repo's pre-push hook calls it with `--compare-coverage`.
- **GitHub `Sonar Build`** — the `sonar` job of `.github/workflows/test.yml` runs `scripts/compare-sonar-coverage.js --context ci` after the scan on every pull request (current = the PR analysis, `pullRequest=<number>`; base = the PR's target branch, `github.base_ref`). See below.
- **Jenkins** — `sonarUtils.compareCoverage` (shared pipeline library) applies the same tolerance + minimum on the CI side, so local and CI agree.

## Where the coverage data is produced

The gate compares Sonar's `coverage` metric, which is fed by the LCOV that
`make test-ci-coverage` writes. That target needs only Node 22 and the npm
dependencies (no `.env`, no database) and produces:

- `coverage/merged-lcov.info` — the Node test-runner LCOVs plus Vitest's, merged by `scripts/merge-lcov.js`;
- `test-results/*.xml` — one JUnit report per suite (`cli`, `scripts`, `appshell-node`, `artifacts`, `vitest`).

Two CI jobs run it today, and a third consumes its output:

| Job | Trigger | What happens to the outputs |
|---|---|---|
| Jenkins `Node Tests` stage (`etendo-go/schemaforge/Jenkinsfile` in the separate `com.etendoerp.jenkins.pipelines` repo) | Its `GenericTrigger` fires on push to `develop` / `main`, PRs `mergeblock/*` → `develop`, and PRs `hotfix/*` → `main` or `develop`. `feature/*` PRs do **not** trigger it. Heavy stages are skipped when a non-hotfix PR carries the `local-validated` label | Feeds the `SonarQube Analysis` (branch analysis) and `Compare Coverage Results` stages |
| GitHub Action `Tests` (`.github/workflows/test.yml`), job `test` | `pull_request` (opened / synchronize / reopened) and push to `main` / `develop` | JUnit published as the "Test Results" check; both files uploaded as the `unit-coverage` workflow artifact (7-day retention) |
| GitHub Action `Tests`, job `sonar` (check name `Sonar Build`) | Same triggers, runs after `test` | Downloads `unit-coverage` (only when `test` succeeded) and runs the SonarQube scan, which reads `coverage/merged-lcov.info` via `sonar-project.properties` |

The Action checks out the PR **head** commit (`github.event.pull_request.head.sha`),
the same sha Jenkins analyzes, not the merge ref, so its `unit-coverage` artifact is
interchangeable with Jenkins' own output. Because it tests the head sha rather
than the merge ref, the `Tests` check does not cover integration with the base
branch. A consumer must only use `unit-coverage` from a run whose conclusion is
`success` for that head sha: on failure the artifact may be partial or lack
`coverage/merged-lcov.info`. This is the first step of moving the slow
Jenkins `Node Tests` stage off Jenkins (ETP-5678): once the Action's timing is
measured, Jenkins can download `unit-coverage` instead of re-running the suites.
Until then both run.

The `Sonar Build` check (a required status check on `develop`) is the `sonar` job
of `test.yml`: it runs after `test` (`needs: test`; on a PR it always runs unless
the run is cancelled, on a push only when `test` succeeded) and downloads `unit-coverage` only when `test` succeeded, so Sonar is
never fed a partial LCOV. PR analyses, and the branch analyses of pushes to
`develop` / `main`, therefore carry real coverage on SonarQube. When `test` fails,
a PR still gets the required check — scanned without coverage and **failed** (see
the end of this section) — but a push to
`develop` / `main` is not scanned at all, so a 0% branch baseline is never written
for `run-sonar.sh --compare-coverage` to compare against. Because the scan waits
for `test`, the required `Sonar Build` check (and then `SonarQube Code Analysis`)
reports only after `test` finishes (about 22 minutes on the first run) — a
deliberate trade-off for real coverage. The job replaces the former
`.github/workflows/sonar-scan.yml`, which scanned with no coverage at all; that
workflow's branch-push analyses of `feature/**`, `epic/**`, `release/**` and
`master` were dropped on purpose: those branches are no longer analyzed on push,
nothing consumed those analyses and they never carried coverage.
Sending coverage cannot fail the Sonar quality gate itself: its `new_coverage`
condition is `< 0`.

After the scan, on pull requests whose `test` job succeeded, the same job runs the
coverage-decrease rule against the PR's target branch and fails with the current
%, the base % and the threshold when coverage drops. This applies to **every** PR,
`feature/*` included — which until now only had the bypassable pre-push check —
and since `Sonar Build` is a required check on `develop`, a coverage drop now
blocks the merge. Pushes to `develop` / `main` are not compared (there is no other
branch to compare against), as in Jenkins: the `Compare Coverage Results` stage of
`etendo-go/schemaforge/Jenkinsfile` (`com.etendoerp.jenkins.pipelines` repo) skips
when `compareBranch == SCHEMA_FORGE_BRANCH`, i.e. on pushes to `develop` / `main`.

The base is the **latest** analysis of the target branch, while the PR is measured
at its head commit. On a long-lived branch, a `COVERAGE DECREASED` can therefore
come from `develop` having moved on (new tests landed there) rather than from the
PR itself: merge `develop` into the branch and push again before adding tests.

When `test` fails (or is cancelled or skipped) on a pull request, `Sonar Build`
fails closed: the job still runs and scans, the comparison step is skipped, and
its last step, `Fail when the tests did not succeed`, exits 1 with an `::error`
annotation naming the `test` result. A PR with failing tests therefore cannot get
a green required check from this job, whether or not the `Tests` check itself is
required. A push to `develop` / `main` whose `test` fails is still not scanned.

### Workflow hardening

- **Permissions** are least-privilege: `contents: read` at the top level; the
  `test` job adds `packages: read` (npm install from GitHub Packages) and
  `checks: write` (the dorny reporter's "Test Results" check); the `sonar` job
  has `contents: read` only (Sonar decorates PRs through its own GitHub App, not
  `GITHUB_TOKEN`).
- **The scan action is pinned** to a full commit sha with its release as a
  comment (`sonarsource/sonarqube-scan-action@<sha> # vX.Y.Z`), never `@master`.
- **Concurrency** groups a PR by its number (a new push cancels the stale run) and
  every push to `develop` / `main` by its sha, so no push run — running or
  pending — is ever cancelled or replaced, and each sha keeps its own
  `unit-coverage` artifact.
