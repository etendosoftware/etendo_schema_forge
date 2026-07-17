# Agentic Feature Quality and OKRs

## Purpose

Schema Forge already supports agentic delivery. The next step is to make every
feature traceable, measurable, and release-eligible only when quality evidence
is complete.

The operating principle is:

> A feature is not complete because code was merged. A feature is complete when
> it was delivered through the agentic flow, validated by blocking quality gates,
> and measured through product or technical telemetry.

## Operating Model

Every feature must pass three gates:

1. Agentic delivery gate.
2. Mixpanel measurement gate.
3. Blocking publication quality gate.

These gates apply to PRs, release candidates, and production publication. The
depth of validation depends on risk, but the existence of evidence is mandatory.

## Agentic Delivery Gate

Every feature must include evidence that the agentic workflow was followed.

Required evidence:

- Context read before implementation.
- Skill or workflow used when applicable.
- Files changed.
- Functional requirement covered.
- Tests executed with exact commands and results.
- Documentation updated when behavior changes.
- Handoff with risks, open items, and QA status.

Window-specific changes must also prove that the generated window guide was
checked and updated when needed.

## Mixpanel Measurement Gate

Every feature must declare how success will be measured.

Required evidence:

- KPI ID or explicit reason why no KPI applies.
- Mixpanel event name.
- Allowed low-cardinality properties.
- Expected user or system action that emits the event.
- Dashboard, board, query, or validation procedure.
- Status: `Developed`, `Mixpanel ready`, `Backend pending`, or
  `Definition pending`.

Feature instrumentation must avoid record IDs, document numbers, names, labels,
raw URLs, free-form user input, secrets, or provider payloads.

## Publication Quality Gate

Publication must be blocked when required validation fails.

Required checks should include, by risk level:

| Risk | Examples | Required gate |
| --- | --- | --- |
| Low | Docs, copy, tests-only changes | Lint/doc checks and focused tests when applicable |
| Medium | Frontend behavior, generated windows, shared UI, generators | Unit tests, contract tests, build, focused Playwright/E2E |
| High | Accounting, stock, auth, migrations, email, data integrity, deployment infra | Full CI, integration tests, Playwright smoke/regression, QA signoff, rollback plan |

The default rule is that CI failures, missing tests, missing documentation, or
missing telemetry validation block publication.

## Recommended PR Template Section

```md
## Agentic Delivery
- Workflow or skill used:
- Context read:
- Files changed:
- Requirement covered:
- Edge cases:

## Quality Gate
- Risk level: low / medium / high
- Unit tests:
- Integration or contract tests:
- Playwright/E2E:
- Build:
- Documentation:
- QA:

## Mixpanel Validation
- KPI:
- Event:
- Properties:
- Dashboard or query:
- Expected signal:
- Status: Developed / Mixpanel ready / Backend pending / Definition pending

## Release Readiness
- CI status:
- Rollback plan:
- Known risks:
- Owner:
```

## Recommended CI Gates

The publication pipeline should make these checks required where applicable:

- Repository tests: `make test`.
- Frontend unit/component tests.
- Contract integrity tests.
- Generated-output drift checks.
- Window documentation freshness checks.
- Build.
- Playwright smoke for feature-critical flows.
- Sonar/security/dependency checks where enabled.
- Post-deploy smoke before production publication is considered complete.

## OKRs

### Objective 1: Make every Schema Forge feature agentic, traceable, and measurable

KR1: 100% of new features include agentic delivery evidence in the PR or delivery
handoff: workflow used, context read, files changed, tests run, documentation
status, and open risks.

KR2: 100% of new features declare a Mixpanel KPI or an explicit non-applicable
justification before merge.

KR3: At least 80% of shipped features show a real Mixpanel usage or validation
signal within 30 days, or have a documented follow-up explaining the missing
signal.

### Objective 2: Turn quality and publication into blocking gates

KR1: 100% of PRs require passing CI checks before merge, with no silent bypass
for failed tests, failed builds, stale generated outputs, or missing required
documentation.

KR2: 100% of medium and high-risk features include focused Playwright/E2E,
integration, or contract validation that proves the user-facing requirement.

KR3: 0 production releases happen without release readiness evidence: CI status,
QA status or explicit pending QA, owner, rollback plan, and post-deploy smoke
result.

### Objective 3: Validate product quality through usage, performance, and integrity telemetry

KR1: Instrument task-flow telemetry for at least five critical flows, including
flow start, successful completion, failure or abandonment, and duration.

KR2: Instrument screen or operation performance telemetry for dashboard and the
main generated-window flows, with p95 targets defined for load and write
operations.

KR3: Implement at least three blocking backend integrity or precision KPIs for
critical domains such as accounting, stock, onboarding roles, OCR, or document
processing.
