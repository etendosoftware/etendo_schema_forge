---
name: testing-delivery-gate
description: Use when closing, preparing, reviewing, or documenting a development task, PR, delivery, bugfix, refactor, regression fix, functional change, test evidence, QA validation, or when asked if a task is done.
---

# Testing Delivery Gate

## Overview

Every development delivery must prove the requirement is covered by real tests and documented evidence. The standard is not "I added a test"; the standard is: **the requirement is covered and I can demonstrate it.**

This applies to new functionality, fixes, regressions, refactors, and changes to existing flows.

## Repository Delivery Scope Gate

Before applying this gate, identify and validate the git repository that is being delivered.

1. Detect the repository root for the delivery with `git rev-parse --show-toplevel` from the changed area.
2. Capture the active branch and changed files for that repository.
3. If more than one git repository has relevant changes, or if the requested delivery target is ambiguous, ask the owner to confirm which repository is being delivered before judging completion.
4. Read the confirmed repository's delivery instructions (`AGENTS.md`, `CLAUDE.md`, package/module docs, or equivalent) and use them to decide the required validation commands.
5. Validate only against the confirmed delivery repository. Do not use tests from a sibling repository as evidence unless the delivery explicitly spans both repositories.
6. Include the confirmed repository root, branch, changed-file scope, and repo-specific validation commands in the delivery evidence.

The repository choice determines the required pre-delivery checks. For example: a Java module delivery may require module JUnit/Gradle commands; a frontend delivery may require its package test/build commands; a docs-only repository may require documentation-specific justification instead of runtime tests.

## Hard Rule

Do not present a task as complete unless it has:

1. confirmed delivery repository and branch;
2. implementation;
3. appropriate tests: unit, functional, integration, or E2E;
4. executed verification with exact command and result from the confirmed repository;
5. evidence that the requirement is satisfied;
6. **SonarQube "Clean as You Code" check for the PR (or branch if no PR yet) — zero new BLOCKER/CRITICAL/MAJOR issues**;
7. QA validation when applicable;
8. a clear functional requirement.

If any item is missing, mark it as pending or blocked. Do not close anyway.

## SonarQube — no new issues

Run one of these and include the result in the delivery evidence:

- PR exists: `make sonar PR=<n>` (or `make sonar-pr` to auto-detect)
- No PR yet: `make sonar BRANCH=$(git branch --show-current)`
- Single Java file: `./cli/sonar-check.sh --pr <n> path/to/File.java`

Exit code 0 = clean. Exit code 1 = at least one new issue → blocker for delivery; fix and re-run.

If auth fails (`✗ SonarQube auth not configured` or `token rejected`), surface the setup instructions printed by the script (they tell you which rc file to edit) to the user. **Never commit a token.** Full reference: `docs/sonarqube-access.md`.

## Before Writing or Accepting Tests

First search for existing tests:

1. Find a nearby test matching the behavior or regression.
2. Reuse the pattern if it applies.
3. Extend that test when reasonable.
4. Create a new test only when no reasonable pattern exists.

For bugs: first ask which existing test should have caught it. Extend it if present; otherwise add a regression test.

## Requirement Clarity Checklist

Before implementing or validating functional tests, explicitly know:

- expected behavior;
- user or role executing it;
- minimum required data;
- expected result;
- important edge cases;
- what must not regress.

If unclear, stop and ask the owner or QA. Do not invent expected behavior.

## Test Type Selection

Use the narrowest test that proves the requirement, plus broader coverage when the flow crosses boundaries:

| Change type | Expected test |
| --- | --- |
| Pure logic/helper | Unit test |
| Backend behavior | JUnit unit or integration test |
| Full backend flow with persistence/rules | JUnit integration when setup exists |
| Frontend behavior | Jest or existing frontend test framework |
| Frontend/user journey/end-to-end | Playwright |
| Refactor | Characterization/regression tests proving behavior unchanged |
| Docs-only or non-functional text | Justify no new test |

Mocks are acceptable only for genuinely external, unstable, slow, or costly boundaries. Do not test mock behavior instead of production behavior.

## Required PR / Delivery Evidence

Every PR or delivery must include this structure:

```md
## Delivery repository
- repository root: ...
- branch: ...
- changed-file scope: ...
- repo-specific validation required: ...

## Added or modified tests
- ...

## Tests executed
- exact command
- result

## Functional validation
- what flow was validated
- with what data
- expected result
- evidence if applicable

## QA
- validated by Matías Bernal / Emilio Polliotti, or pending validation
```

If no new test is required, justify explicitly:

- documentation-only change;
- visual-only change without logic;
- covered by an existing test, naming it;
- internal no-functional-impact change, with verification method.

## QA Gate

Functional and integration tests require QA validation during the initial rollout of this policy.

Acceptable QA lines:

- `Validated by: Matías Bernal`
- `Validated by: Emilio Polliotti`
- `Pending validation by QA: Matías Bernal / Emilio Polliotti`

If QA validation is pending, the task is not fully closed. State that clearly.

## Completion Decision

Before saying "done", answer:

- Is the delivery repository confirmed and is the branch correct?
- Were repository-specific instructions used to choose validation commands?
- Does the test assert the actual requirement, not just implementation details?
- Are main cases and relevant regressions covered?
- Were tests executed and did they pass?
- Is exact evidence documented in the PR or delivery?
- Is QA validation present or explicitly pending?

If not, continue working or report the concrete blocker.

## Common Mistakes

| Mistake | Correct response |
| --- | --- |
| Ambiguous repository scope | Ask the owner to confirm the git repository before judging delivery |
| Tests run from sibling repo | Re-run or justify verification from the confirmed delivery repo |
| "Added one superficial test" | Prove the requirement behavior and edge cases |
| "Tests pass" without command | Include exact command and observed result |
| Functional requirement vague | Ask before validating or closing |
| Existing test nearby ignored | Extend the existing pattern first |
| Integration flow changed but only unit tested | Add or justify functional, integration, or E2E coverage |
| QA needed but absent | Mark pending QA; do not call the task closed |
| No test added | Explicitly justify why and name existing coverage or verification |

## Red Flags

Stop if you catch yourself writing:

- "I validated the module" without naming the git repository and branch
- "Tests pass" but they ran from a different repository than the delivery target
- "Should be covered"
- "Tested locally" with no command or result
- "QA can validate later" while marking complete
- "No tests needed" without explicit justification
- "Requirement is obvious" but role, data, and result are not written
- "Mock proves it" when production behavior is not exercised

These mean evidence is incomplete.
