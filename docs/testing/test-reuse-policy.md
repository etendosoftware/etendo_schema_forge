# Test Reuse Policy (reuse-first protocol)

**Status:** active since ETP-5511. **Applies to:** every agent or human that writes, extends or
reviews a test in `etendo_schema_forge` or `com.etendoerp.go` — `tester-functional`, `tester-go`,
the developer writing its bugfix repro test, and Alex when reviewing.

This is the single source of the protocol. The agent files reference it and never copy it.

## Why

Most test requests used to produce a new file, even when an existing test covered the same unit
and only needed one more case. The result: 1,694 test files in the functional repo and 617 in
`com.etendoerp.go`, assertion-less smoke tests, fragile source-reading, expectations that lock
bugs in, and a slow suite. The rule below makes *extend* the default and *new file* the exception
that has to be justified.

## The protocol

1. **Locate.** Before writing anything, run `make find-tests FILE=<path|JavaClass>` (see
   [`make find-tests`](#make-find-tests)) and list every existing test for the unit in your report.
   An empty result is a finding too — say so.
2. **Decide** one of the following, with a one-line justification:
   - **Extend** — add a case or a `describe` to an existing file. **This is the default.**
   - **Rewrite** — an existing test is obsolete or wrong: rewrite it so it guards the current
     behavior. Never delete coverage (the coverage gate, `docs/coverage-gate.md`, fails the push).
   - **New file** — only when no file covers the unit, or the existing file is clearly about a
     different behavior. Name the file you considered and why it does not fit.
3. **Declare coverage.** Every new or modified test file carries `@covers` (format below).
4. **Name by behavior, never by ticket.** New files named after a ticket
   (`etp-1234-*.test.js`, `*-etp1234.spec.js`, `Etp1234Test.java`) are forbidden. The ticket goes
   in the commit message.
5. **Every test asserts something observable.** A smoke test is allowed only with at least one
   real assertion — the root element rendered with its `data-testid`, a key text, a returned value.
   An assertion-less `renders without crashing` or `handles null gracefully` is not a test.
6. **When a correct new test fails against the source: stop.** Do not commit it, do not weaken the
   expectation, do not skip or disable it. Report the suspected bug to the coordinator with the
   test as the repro. The coordinator decides whether it is fixed now or ticketed. Adjusting an
   expectation to match what the code happens to do is how tests end up codifying bugs.
7. **Source-reading is only for wiring contracts.** Reading a source file as text and matching it
   with a regex is allowed for imports, props forwarded to generated components, and policy
   guardrails (`no-raw-fetch`, `auth-header-policy`, …). Behavior is tested by executing it
   (Vitest, Node test runner, JUnit).
8. **Report** this line, with the justification for each new file:

   ```
   Extended: N · Rewritten: N · New: N
   ```

   Alex checks it. A new file with no valid justification, or one where an existing file covering
   the same unit could have been extended, is a REVIEW rejection.

## `@covers` format

One structured line per covered production file, with the path **from the repo root**.

JavaScript / JSX (Node test runner, Vitest, Playwright) — at the top of the file:

```js
// @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
// @covers tools/app-shell/src/lib/saveGate.js
```

Java (`com.etendoerp.go`) — in the test class Javadoc, the fully qualified class name:

```java
/**
 * Unit tests for {@link NeoCrudHandler}.
 *
 * @covers com.etendoerp.go.schemaforge.handlers.NeoCrudHandler
 */
class NeoCrudHandlerTest {
```

Rules:

- **Required on every new or modified test file** from ETP-5511 on. Existing untouched files are
  backfilled later (Part 2 of the plan), not as a side effect of unrelated work.
- The path (or class) must exist. A `@covers` that points nowhere is flagged by CI.
- A Playwright spec covers the component(s) or custom files whose behavior it drives; list the
  main ones, not every transitive import.
- `@covers` names what the test *guards*, not what it happens to import. A mocked module is not
  covered.

## `make find-tests`

```bash
make find-tests FILE=tools/app-shell/src/lib/formatCurrency.js     # functional file
make find-tests FILE=NeoCrudHandler                                  # Java simple class name
make find-tests FILE=com.etendoerp.go.schemaforge.NeoServlet         # Java FQN
make find-tests FILE=../modules/com.etendoerp.go/src/com/etendoerp/go/rest/EtendoGoJwtServlet.java
```

`scripts/find-tests.js` detects the repo from the argument (a `.java` path, a path under
`com.etendoerp.go`, or a bare class name means Java) and merges three sources:

| Source | Functional repo | `com.etendoerp.go` |
|---|---|---|
| `@covers` | `// @covers <path>` equal to the file | `@covers <FQN>` equal to the class |
| imports | `import` / `export … from` / dynamic `import()` / `require()` resolving to the file (relative, `@/`, `@generated/`); `vi.mock()` does **not** count | `import <FQN>;`, `import static <FQN>.…;`, or a reference to the simple name from a test in the same package |
| `readFileSync` | a file that reads sources as text and names the file in a path literal | — |

It works before any backfill because most tests are found through their imports, and it gets
sharper as `@covers` spreads. Pass `--json` for machine-readable output. `com.etendoerp.go` is
expected at `../modules/com.etendoerp.go` (override with `GO_ROOT=<path>`).

A `readFileSync` hit marked `basename` means only the file name matched a path literal; confirm
it by opening the test.

## CI enforcement

| Check | Functional (`ratchet-guards.yml` → `scripts/check-test-hygiene.js`) | `com.etendoerp.go` (`test-hygiene.yml` → `scripts/check-test-hygiene.py`) |
|---|---|---|
| New/modified test file without `@covers` | yes | yes (Javadoc) |
| `@covers` pointing to a missing file or class | yes | yes |
| New test file named `etp-?\d{4}` (case-insensitive) | yes | yes |
| New Vitest `it`/`test` block with no `expect(` (heuristic) | yes | — |

**Rollout:** annotate-only (warnings, the job passes) until **2026-10-10**, then blocking. Each
workflow has one switch, `TEST_HYGIENE_MODE: annotate` → `block`, next to a dated comment.

The assertion heuristic accepts any `expect…(` / `assert…(` call in the block body, including
helpers such as `expectRow(...)`. If the assertion lives in a helper with another name, the
warning is a false positive; rename the helper or assert in the block.

## Related

- `testing-delivery-gate` skill — delivery evidence; it already says "extend before creating".
- `docs/coverage-gate.md` — why deleting a test fails the push.
- `docs/request-policy.md` — how a test mocks `useApiFetch` / `apiFetch` and supplies a session.
- `docs/e2e-testing-guide.md` — mandatory reading before any Playwright spec.
- `docs/testing/etendo-test-skill-review.md` — where `dev-assistant:etendo-test` conflicts with
  this policy (this policy wins).
