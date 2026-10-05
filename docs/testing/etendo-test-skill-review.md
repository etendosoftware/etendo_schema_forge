# Review: `dev-assistant:etendo-test` vs the test reuse policy

- **Date:** 2026-09-26 (ETP-5511)
- **Skill reviewed:** `/etendo:test` from the `dev-assistant` plugin, repo
  `etendosoftware/etendo_claude_marketplace`, path `plugins/dev-assistant/skills/etendo-test/SKILL.md`
  (plugin version 1.0.0).
- **Policy it is measured against:** [`test-reuse-policy.md`](test-reuse-policy.md).

`tester-go` may use the skill as a **template reference** (component detection, `MockedStatic`
recipes, OBCriteria chains, compile-error table). Where the two disagree, the policy wins. This
document records the disagreements and the change request for the skill's owners.

## Conflicts

| # | Skill says | Policy says | Effect if the skill is followed |
|---|---|---|---|
| C1 | Goal: "Generate Java tests … with **full coverage**"; Step 1: "All public and protected methods — **each needs at least one test**". | Test the behavior you were dispatched for; extend what exists. Coverage is a consequence, not the target. | Every invocation produces a broad new suite, most of it unrelated to the change under review. |
| C2 | Step 3 "Check for existing tests" lists existing tests but **does not decide anything** with the result. Step 4 is always "Write the test file" at `{ClassName}Test.java`. | Step 0 is locating existing tests; the result decides Extend / Rewrite / New, and a new file needs a written justification. | A class that already has `FooTest` gets a second file, or `FooTest` is overwritten. |
| C3 | Coverage table: 8 test categories **per public method** (`_ValidInput`, `_NullParam`, `_EmptyInput`, `_MissingData`, …) plus component-specific extras. | Only cases that guard a real behavior; each asserts something observable. | Quantity over value: many near-duplicate tests that slow the suite. |
| C4 | Step 5: "If a test fails at runtime … **Fix assertions or mock setup, then re-run**." | A correct test that fails against the source means stop and escalate with the test as the repro. Never weaken the expectation. | Tests are bent until they match the bug, which then becomes locked in. |
| C5 | Decision tree: "Does the class use `@Inject`? → **WeldBaseTest**". | Mockito by default; `OBBaseTest`/`WeldBaseTest` only when real DAL/persistence/trigger behavior is what is under test. | Slow, DB-dependent tests for logic a mock would cover; in `com.etendoerp.go` they also hit the JVM-isolation problem (`docs/test-jvm-isolation.md`). |
| C6 | Naming: `test{Method}_{Case}`. | Name by behavior. (No conflict on ticket names — the skill never uses them.) | Minor: method-centric names describe the code, not the requirement. |
| C7 | No notion of declaring what a test covers. | `@covers <FQN>` in the class Javadoc of every new or modified test class. | CI (`test-hygiene`) flags every class the skill creates. |
| C8 | Result block reports "Test methods: N" and "Coverage: happy path, null/empty …". | Report `Extended: N · Rewritten: N · New: N` with a justification per new file. | The reviewer cannot tell whether a file was needed. |
| C9 | "If `TestConstants.java` does not exist and the test needs 3+ constants, **create one**." | No rule, but it creates a shared file as a side effect of one test. | Scope creep in an unrelated change. |

Not conflicts (kept as useful references): component-type detection, "never mix JUnit 4 and 5",
closing every `MockedStatic`, mocking `setAdminMode`/`restorePreviousMode` as no-ops, the
OBCriteria chain recipe, and the compile-error troubleshooting table.

## How `tester-go` applies it today

`.claude/agents/tester-go.md` (§ `dev-assistant:etendo-test`) tells the agent to use the skill
only for templates, to treat step 3 as step 0 with a decision, to ignore the full-coverage goal,
and to escalate instead of "fix assertions" when a correct test fails. That override works inside
this repo, but anyone invoking `/etendo:test` directly still gets C1–C9.

## Upstream change request (ready to paste)

**Title:** etendo-test: extend existing tests before creating new ones; drop the full-coverage goal

**Body:**

```markdown
## Problem

`/etendo:test` (plugins/dev-assistant/skills/etendo-test/SKILL.md) optimizes for creating a new,
exhaustive test file per class. In a module that already has a large suite this produces
duplicate files, near-duplicate cases and a slower build. In com.etendoerp.go (617 test classes)
we traced most unnecessary new test files to exactly this workflow.

Specifically:

1. The goal is "full coverage" and Step 1 requires at least one test per public/protected method,
   regardless of what changed.
2. Step 3 lists existing tests but never uses the result; Step 4 always writes `{ClassName}Test.java`,
   so an existing test class is duplicated or overwritten.
3. The coverage table asks for 8 case categories per public method.
4. Step 5 says "Fix assertions or mock setup, then re-run" when a test fails. When the test is
   correct and the code is wrong, this bends the test until it locks the bug in.
5. The decision tree sends every `@Inject` class to WeldBaseTest, even when a Mockito test would
   prove the behavior faster and without a database.

## Proposed change

1. **Reframe the goal:** "Write the tests that guard the requested behavior", not "full coverage".
   Keep coverage as a check, not the target.
2. **Make "find existing tests" step 1 and make it decide:** search `src-test` for test classes that
   import or reference the class (same package), then choose:
   - **Extend** an existing class (default),
   - **Rewrite** an obsolete test (never delete coverage),
   - **New file** only when nothing covers the class, with a one-line justification.
3. **Replace the per-method category table** with "cover the behavior's happy path, its edge cases
   and its error path; every test asserts something observable".
4. **Change the failure rule:** fix the test only when the test is wrong (bad stub, unclosed
   MockedStatic, wrong matcher). If a correct test fails against the source, stop and report the
   suspected bug with the test as the repro — do not change the expectation or disable the test.
5. **Mockito by default:** use OBBaseTest/WeldBaseTest only when the behavior depends on the DAL,
   persistence, triggers or DB rules actually running (tenancy filters, committed state, rollback).
6. **Optional hook for repos with a policy:** "If the repository documents a test policy (e.g. a
   `@covers` tag or a test-location tool), follow it; it overrides this skill."
7. **Result block:** report `Extended: N · Rewritten: N · New: N` with the justification for each
   new file, instead of only "Test methods: N".
8. Do not create shared helpers such as `TestConstants.java` as a side effect; reuse one if it
   exists, otherwise keep constants in the test class.

## Why

Smaller, behavior-focused changes to existing test classes are easier to review, keep the suite
fast, and stop tests from codifying bugs. The template content of the skill (component detection,
MockedStatic recipes, OBCriteria chains, the compile-error table) stays as is — it is the useful
part.
```

Filing it is a manual step for the user; nothing was filed from this repo.
