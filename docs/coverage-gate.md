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
denies that flag when an agent tries it through Claude Code's Bash tool. See
**Agent Guardrails** in `CLAUDE.md`).

## Where it runs

- **`etendo_schema_forge` / `run-sonar.sh`** and **`com.etendoerp.go` / `run-sonar.sh`** — each repo's pre-push hook calls it with `--compare-coverage`.
- **Jenkins** — `sonarUtils.compareCoverage` (shared pipeline library) applies the same tolerance + minimum on the CI side, so local and CI agree.
