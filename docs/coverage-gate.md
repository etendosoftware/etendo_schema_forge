# Coverage-decrease gate (`--compare-coverage`)

## What it protects

Sonar's Quality Gate only evaluates **new code**, so a PR can pass it while still
lowering the project's **overall** coverage — typically by adding new source files
with too few tests. This gate closes that gap: the GitHub `Unit tests + Sonar + coverage`
check fails a pull request that would drop overall coverage, and `run-sonar.sh --compare-coverage`
applies the same rule to a local run. The pre-push no longer runs it (ETP-5695): it
runs only the unit tests the change can affect (`make test-changed-coverage`), so its
overall figure is partial by design; the comparison needs the whole suite, which the
PR's unit tests + Sonar job runs.

It started as the rule of Jenkins' "Compare Coverage Results" stage
(`sonarUtils.compareCoverage`), so a local run and CI apply the same rule. In this repo the rule, its
default thresholds and its messages live in **one** script,
`scripts/compare-sonar-coverage.js`, called by both `run-sonar.sh` and
`.github/actions/unit-tests-sonar` (the mini and full pipelines). **Known duplicate:** `com.etendoerp.go/run-sonar.sh`
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

The table describes a local run (`--context push`, the default). In the GitHub
unit tests + Sonar job (`--context ci`) the thresholds and messages are the same, minus
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

A block is fixed, not skipped. The committed `PreToolUse` hook
`.claude/hooks/block-push-no-verify.sh` denies `git push --no-verify` when an agent
tries it through Claude Code's Bash tool, and the companion
`.claude/hooks/block-coverage-threshold-overrides.sh` denies agent-run assignments or
exports of `COVERAGE_MINIMUM` and `COVERAGE_TOLERANCE`; adjust their reviewed defaults
in `scripts/compare-sonar-coverage.js` instead. See **Agent Guardrails** in `CLAUDE.md`.

## Where it runs

- **`etendo_schema_forge` / `run-sonar.sh`** and **`com.etendoerp.go` / `run-sonar.sh`** — `--compare-coverage` for a local run on demand. Neither repo's pre-push passes it any more (ETP-5695): both run a subset of the tests (schema_forge the selection of `scripts/select-tests.js`, go the database-free `goTestUnit`), so the overall figure would always drop.
- **GitHub Actions** — `.github/actions/unit-tests-sonar` runs `scripts/compare-sonar-coverage.js --context ci --check-quality-gate` after the scan on every pull request (current = the PR analysis, `pullRequest=<number>`; base = the PR's target branch, `github.base_ref`), in the job `Mini Pipeline: Unit tests + Sonar + coverage` on PRs into `develop` and `Unit tests + Sonar + coverage` on PRs into `main`. See below.

## Where the coverage data is produced

The gate compares Sonar's `coverage` metric, which is fed by the LCOV that
`make test-ci-coverage` writes. That target needs only Node 22 and the npm
dependencies (no `.env`, no database) and produces:

- `coverage/merged-lcov.info` — the Node test-runner LCOVs plus Vitest's, merged by `scripts/merge-lcov.js`;
- `test-results/*.xml` — one JUnit report per suite (`cli`, `scripts`, `appshell-node`, `artifacts`, `vitest`).

One job runs it and analyzes its output (ETP-6375), the composite action
`.github/actions/unit-tests-sonar`, the same work com.etendoerp.go's
`Go tests + Sonar + coverage` does:

| Where | Check name | Trigger |
|---|---|---|
| `mini-pipeline.yml` | `Mini Pipeline: Unit tests + Sonar + coverage` (required on `develop`) | PRs into `develop`, pushes to `develop` |
| `full-pipeline.yml` | `Unit tests + Sonar + coverage` (required on `main`) | PRs `mergeblock/*` and `hotfix/*` into `main`, pushes to `main` |

In that job, in order: `npm install`, `make test-ci-coverage`, the app-shell build,
the "Test Results" check (JUnit) and the `unit-coverage` artifact; then, **only when
all of that passed**, the SonarQube scan (it reads `coverage/merged-lcov.info` via
`sonar-project.properties`) and, on a PR, the comparison and the quality gate. A
failing test fails the job before the scan, so Sonar never gets a partial LCOV and a
push never writes a 0% baseline. The job checks out the PR **head** commit, not the
merge ref, so it does not cover the integration with the base branch. The action itself
comes from the run's own commit (a second, sparse checkout into `.ci-actions`), so a PR
head older than the action still runs it; when that head's script predates
`--check-quality-gate`, the job compares the coverage alone and warns that the gate was
not read (ETP-6387).

Pushes keep the bases current: a push to `develop` runs the mini pipeline job (a
branch analysis of `develop`, no comparison); a push to `main` that merges a cut the
full pipeline already validated runs only `Sonar with the cut coverage`, a branch
analysis of `main` with the cut PR run's `unit-coverage`. Any other push to `main`
runs the full job.

The two names differ on purpose: a cut PR's head is `develop`'s head, which also
carries the mini pipeline check of its push to `develop`. That one never compares
coverage, so it must never meet `main`'s required check. Sending coverage cannot fail
the Sonar quality gate itself: its `new_coverage` condition is `< 0`.

After the scan, on pull requests, the job runs the coverage-decrease rule against the
PR's target branch and fails with the current %, the base % and the threshold when
coverage drops, then reads the quality gate of the same analysis
(`--check-quality-gate`, ETP-6374) and fails when it is `ERROR`, listing the failed
conditions. This applies to **every** PR, `feature/*` included, and the check is
required on `develop` and `main`, so a coverage drop or a failed gate blocks the
merge. Pushes are not compared: there is no other branch to compare against.

The base is the **latest** analysis of the target branch, while the PR is measured
at its head commit. On a long-lived branch, a `COVERAGE DECREASED` can therefore
come from `develop` having moved on (new tests landed there) rather than from the
PR itself: merge `develop` into the branch and push again before adding tests.

### Workflow hardening

- **Permissions** are least-privilege: `contents: read` at the top level; the
  unit tests + Sonar job adds `packages: read` (npm install from GitHub Packages)
  and `checks: write` (the dorny reporter's "Test Results" check). Sonar decorates
  PRs through its own GitHub App, not `GITHUB_TOKEN`.
- **Scanner timeouts** come from the organization variables `SONAR_SOCKET_TIMEOUT` and
  `SONAR_RESPONSE_TIMEOUT` (seconds; unset, 60), passed as `sonar.scanner.socketTimeout` and
  `sonar.scanner.responseTimeout` to every scan (ETP-6390). Raise them when SonarQube is slow and
  an upload fails with `SocketTimeoutException` while every test passed.
- **The scan action is pinned** to a full commit sha with its release as a
  comment (`sonarsource/sonarqube-scan-action@<sha> # vX.Y.Z`), never `@master`.
- **Concurrency** groups a PR by its number (a new push cancels the stale run) and
  every push to `develop` / `main` by its sha, so no push run, running or
  pending, is ever cancelled or replaced.
