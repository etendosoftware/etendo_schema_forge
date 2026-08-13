---
name: innocuous-check
description: >
  Verify that pending changes are behavior-preserving (innocuous) — that a refactor
  does NOT alter observable functionality. Use after refactoring to lower cognitive
  complexity, resolve SonarQube issues, rename, extract/inline functions, or apply
  guard clauses. Analyzes the diff hunk by hunk for behavior-changing edits, flags poor
  function names (generic auto-extract names, placeholders), then runs the affected tests.
  Optionally (opt-in) places START/END extraction markers in a too-complex function or .jsx
  component to plan a behavior-preserving extract-method/extract-component refactor.
  Triggers on: "is this safe", "inocuo", "inocuidad", "refactor", "bad function names",
  "did I break anything", "behavior preserving", "Sonar fix", "bajar complejidad cognitiva",
  "check my changes", "verify diff", "marca start/end", "marcadores para extraer",
  "comentarios para extraer", "extract markers", "ayudame a extraer", "WebStorm extract".
argument-hint: "[staged | unstaged | both]  (default: both)  |  mark <function|component> in <file> [--target=N]"
---

# /innocuous-check — Behavior-Preservation Verification

**Arguments:** `$ARGUMENTS` — scope to inspect: `staged`, `unstaged`, or `both`. Default: `both`.

Goal: confirm a change is a **pure refactor** — same inputs produce the same outputs and side
effects. The intent of these changes is to lower cognitive complexity, fix SonarQube findings,
and improve readability **without changing what the code does**. This skill is the gate that
catches accidental behavior changes hiding inside a "harmless" refactor.

This is a **read-and-verify** skill: it inspects and runs tests. By default it never edits code,
never commits, never stages — it produces a verdict only.

**One opt-in exception — extraction-marker mode.** When (and only when) the user explicitly asks
to *mark* a function/component for extraction (e.g. "marcá los start/end para extraer",
"give me extract markers", "ayudame a bajar la complejidad de `runWindowPipeline`"), the skill may
insert `// ┌─ EXTRACT … ─ START` / `// └─ EXTRACT … ─ END` comment markers. Inserting comment
markers is always safe (comments change nothing). But any *enabling tweak* (a real code change that
makes a region extractable) has two hard requirements:

1. **It MUST be functionally innocuous** — the tweak by itself must be a provable behavior-preserving
   transformation (same inputs → same outputs and side effects). If you cannot prove a proposed tweak
   is innocuous, do NOT propose it as a tweak — surface it as an INTENTIONAL change for the user to
   own.
2. **It MUST be confirmed by the user before being applied.** Describe each tweak (what + why +
   why it's innocuous) and wait for an explicit go-ahead. Never apply a tweak silently. Markers may
   be inserted without that gate; tweaks may not.

This is the ONLY case where the skill edits files, and it still never commits or stages. See
**Extraction-marker mode** below. The default verification flow does NOT mark or tweak anything.

---

## Step 1 — Resolve scope and collect the diff

Pick the git command from `$ARGUMENTS` (default `both` when empty/unrecognized):

| Scope | Command |
|-------|---------|
| `staged` | `git diff --cached` |
| `unstaged` | `git diff` |
| `both` | `git diff HEAD` |

Also get the file list for the same scope (`--name-status` variant) so you know what changed:

```bash
git diff HEAD --name-status        # adjust flag per scope (--cached / no flag)
```

If the diff is empty, stop and tell the user there is nothing to check for that scope.

Only consider **source files** for behavior analysis (`.js`, `.jsx`, `.ts`, `.java`, `.py`).
Note — but do not behavior-analyze — changes to tests, docs, JSON config, and generated output.
Flag separately if the diff touches:
- `artifacts/*/generated/` → generated files must never be hand-edited (see CLAUDE.md). Warn loudly.
- `decisions.json` → this is config, not a refactor; behavior IS expected to change. Note it and skip the refactor analysis for it.

---

## Step 2 — Classify every hunk

For each changed source hunk, label it as one of:

- **PURE** — provably behavior-preserving (rename of a local, extracted helper called identically,
  reordered independent statements, dead-code removal, formatting, early-return that covers the
  exact same cases, simplified boolean that is logically equivalent).
- **RISKY** — could change behavior; needs justification or a test. (See the catalog in Step 3.)
- **INTENTIONAL** — clearly changes behavior on purpose (new feature, bugfix). Out of scope for an
  "innocuous" claim — call it out so the user knows this is NOT a pure refactor.

Reason about *semantic equivalence*, not textual similarity. A small diff can change behavior; a
large diff can be a faithful extraction.

---

## Step 3 — Behavior-change risk catalog (the core check)

These are the traps that turn a "harmless" refactor into a regression. Inspect the diff for each:

**Control flow**
- Inverted/De-Morgan'd conditionals that are subtly wrong (`!(a && b)` → `!a && !b`).
- Guard clause / early return that changes which branch runs for edge inputs.
- Changed short-circuit order (`a() && b()` → `b() && a()`) when `a`/`b` have side effects or one guards the other.
- Loop bounds shifted (off-by-one) when restructuring `for`/`while`/`map`.
- `switch` fallthrough or default branch altered.

**Values & types**
- Default values added/removed/changed (param defaults, `||` vs `??`, `?.`).
- Null/undefined/empty handling changed (a removed `if (!x) return` is a behavior change).
- Truthiness vs strict equality (`==` ↔ `===`, `0`/`''`/`NaN`/`false` edge cases).
- Return value or shape changed (returns `undefined` where it used to return `null`/a value).
- Number/string coercion differences.

**Side effects & ordering**
- Reordered statements where order matters (mutation before read, logging, I/O, DB writes).
- A side-effecting call moved inside/outside a conditional or loop, changing how often it runs.
- Caching/memoization added that can serve stale values.
- Async: `await` added/removed, `Promise.all` ↔ sequential, race conditions, unhandled rejections.

**Error handling**
- `try/catch` scope widened/narrowed; an error now swallowed or newly thrown.
- Error type or message that other code (or tests) depends on.

**Scope & visibility**
- A `const`/`let` hoisted or its scope changed; closure capture altered.
- Function/variable visibility changed (exported ↔ local) affecting other modules.
- `this` binding changed (arrow vs function, extracted method).

**Extraction fidelity (the most common refactor here)**
- Extracted function does NOT receive/return everything the inline code used (missing param, lost mutation).
- Extracted code is now called conditionally where it used to always run (or vice versa).
- A variable the extracted block mutated in the outer scope is now local to the helper.

For each RISKY hunk, write one line: *what could change* and *under which input*. If you can prove
it is actually safe, downgrade it to PURE with the reason. If you cannot, it stays RISKY and must be
backed by a passing test (Step 4) or escalated to the user.

---

## Step 4 — Naming quality of new/renamed identifiers

Automated refactor tools (and rushed manual extractions) leave bad names behind. A refactor that is
behavior-correct but ships a meaningless name is **not done** — it hurts the very readability the
refactor was meant to improve. Inspect every **newly introduced or renamed** function, method, and
significant variable in the diff and flag:

- **Generic auto-extract names** — `extracted`, `extractedMethod`, `extractedMethod1`, `extracted_2`,
  `newMethod`, `method1`, `func`, `helper`, `helperFunction`, `doStuff`, `handle`, `process`,
  `temp`, `tmp`, `foo`, `bar`, `aux`. Anything matching `/^(extracted|new|temp|tmp|aux|helper|method|func)\w*\d*$/i`.
- **Placeholder / keyboard-mash names** — gibberish like `akjsdnjajkdknasd`, `asdf`, `qwerty`, `xxx`,
  `test123`, `aaa`. Heuristics: no recognizable English word; long runs of consonants; repeated
  characters; random-looking case. When in doubt, ask "could a teammate guess what this does from
  the name alone?" — if no, flag it.
- **Misleading names** — the name claims something the body does not do (e.g. `validateInput` that
  also mutates and saves, `getX` that performs I/O). Flag the mismatch.
- **Vague / context-free names** — real English, syntactically fine, but too generic to tell *what
  domain object* they act on: `getClassName`, `getTitle`, `getValue`, `getData`, `getItems`,
  `getResult`, `getConfig`, `formatText`, `buildUrl`, `handleClick`, `mapData`, `isValid`. The test:
  if two unrelated helpers in the same file could plausibly share this name, it is too vague. Prefix
  it with the subject it operates on (`getSelectorLabelClassName`, `getReportTitle`,
  `buildProductSelectorUrl`). These are valid names — flag them as **vague**, not generic/placeholder
  — but a refactor whose goal is readability is not done while a reader must open the body to learn
  what `getTitle` titles.
- **Lost meaning on rename** — a previously descriptive name replaced by a vaguer one.

For each flagged identifier, **suggest a concrete better name** derived from what the function
actually does — its inputs, its return value, and its side effects. Prefer the verb-noun convention
already used in the surrounding file (match the codebase's style, camelCase for JS, etc.). Give 1–3
options, e.g.:

```
path/to/file.js:42  function extractedMethod1(order, lines)
  ⚠️ Generic auto-extract name.
  → suggests: calculateOrderTotal(order, lines)  |  sumLineAmounts(lines)

path/to/file.js:88  function getTitle(multi, selectedItems, displayText)
  ⚠️ Vague — "title" of what? Builds the selector button's tooltip.
  → suggests: getSelectorButtonTitle(...)  |  getSelectorTooltip(...)
```

Naming issues do **not** by themselves make a change "NOT innocuous" (behavior is unchanged), but
they DO force the verdict to at least ⚠️ REVIEW NEEDED — the refactor is incomplete until names are
fixed. List them prominently.

---

## Step 5 — Run the affected tests

Identify and run the tests covering the changed source files. Prefer **targeted** runs over the
full suite for speed; fall back to the full suite when mapping is unclear.

1. For each changed source file, find its test:
   - Same basename in `cli/test/<name>.test.js`, `tools/app-shell/**/__tests__/<name>.test.js`,
     `tools/app-shell/test/<name>.test.js`, or `artifacts/**/__tests__/`.
   - If not found by name, grep the test dirs for the module/function name to find indirect coverage.

   ```bash
   # Example: changed cli/src/quality-gate/runner.js
   ls cli/test/ | grep -i runner
   grep -rl "quality-gate/runner\|runner" cli/test/ tools/app-shell/test/ 2>/dev/null
   ```

2. Run the matching tests:
   ```bash
   cd cli && node --test 'test/<name>.test.js'        # single CLI test file
   cd tools/app-shell && npx vitest run <path>         # single React/vitest file
   ```

3. If no specific test maps to a RISKY hunk, **say so explicitly** — an unverified RISKY change is
   the headline of the report, not a footnote. Offer to run the full suite (`make test`) or to
   delegate writing a covering test to the `test-generator` subagent (Tester).

4. **Extracted-function coverage (MANDATORY for extraction refactors).** A green suite proves
   nothing if it never calls the new code. For EACH function the refactor extracted, decide whether
   the existing tests actually *exercise* it — not just whether they pass. A test that renders the
   parent but never hits the branch/component the helper lives in does **not** cover it. Verify by
   one of:
   - the helper is exported and a test imports it directly, OR
   - a test drives the code path that calls it (e.g. renders the component in the state that invokes
     the helper) and asserts on its observable output.

   List every extracted function as **covered** or **uncovered**. The goal is coverage for *all*
   extracted functions, as much as the code allows — especially any with restructured logic (not a
   verbatim move). Unexported module-private helpers with no exercising test count as **uncovered**;
   to close the gap, either export them for a unit test or add a test that drives the calling path.
   For uncovered extractions, delegate test-writing to the `test-generator` subagent (Tester) — never
   write the tests inline (CLAUDE.md delegation rule).

5. If the change touches a window's `decisions.json` or generator, the relevant verification is the
   Window Change Integrity Protocol (CLAUDE.md), not unit tests — point the user there.

Report each test command and its real pass/fail result. Never claim tests pass without running them.
A passing suite that does not exercise the extracted code is reported as such — it is not evidence
the refactor is safe.

---

## Step 6 — Verdict

Output a compact report:

```
INNOCUOUS-CHECK — scope: <staged|unstaged|both>
Files: <N source, M other>

Verdict: ✅ INNOCUOUS | ⚠️ REVIEW NEEDED | ❌ NOT INNOCUOUS

Hunks:
  PURE         <count>
  RISKY        <count>   ← each listed below with reason
  INTENTIONAL  <count>   ← behavior changes on purpose (not a pure refactor)

Risky hunks:
  • path:line — <what could change> — <covered by test? which?>

Naming issues:
  • path:line  <identifier> — <generic | placeholder | misleading | vague> → <suggested name(s)>

Tests run:
  • <command> → PASS/FAIL (X passed, Y failed)

Extracted-function coverage:
  • <fnName> — covered (which test) | uncovered

Unverified risks:
  • <any RISKY hunk with no covering test>
  • <any extracted function not exercised by a test>
```

**Verdict rules:**
- ✅ **INNOCUOUS** — every hunk is PURE (or every RISKY hunk is backed by a passing test), no INTENTIONAL hunks, AND no naming issues.
- ⚠️ **REVIEW NEEDED** — RISKY hunks without covering tests, missing tests, generated files touched, an extracted function not exercised by any test (especially one with restructured logic), OR any naming issue (generic/placeholder/misleading/vague name). A clean-behavior refactor with an `extractedMethod1` — or a too-vague `getTitle`/`getClassName`, or an untested extracted helper — is still ⚠️ until fixed.
- ❌ **NOT INNOCUOUS** — a test fails, OR a hunk demonstrably changes behavior, OR INTENTIONAL changes are present while the user claimed a pure refactor.

Be honest and specific. The value of this skill is catching the one inverted condition in a
200-line "cleanup". A false ✅ is worse than a noisy ⚠️.

---

## Extraction-marker mode (OPT-IN — only when explicitly requested)

This mode is **off by default**. Enter it ONLY when the user explicitly asks to mark a function or
component for extraction — phrases like "marcá los start/end", "dame comentarios para extraer",
"give me extract markers", "ayudame a bajar la complejidad de `X`", "WebStorm extract", or
`mark <function|component> in <file>`. If the user only asked "is this safe?" / "inocuo?", do NOT
mark anything — run the default verification flow instead.

Goal: turn one over-complex function/component into a set of **behavior-preserving** extractions a
developer can apply with one click (WebStorm *Extract Method* / *Extract Component*, or VS Code
*Extract to function*). The skill plans the cut lines, inserts the markers, and applies the minimal
*enabling tweak* — it does NOT perform the extraction itself (the user drives the IDE).

### M1 — Locate and measure the target
- Read the whole target function/component. State its current cyclomatic/cognitive complexity
  (count decision points: `if`/`else if`, `case`, `for`/`while`, `catch`, `&&`/`||`/`??`, ternary,
  optional chaining `?.`, JSX `&&`/`? :`/`.map()` callbacks). Name the requested target (default 15
  for cyclomatic, or whatever `--target=N` / the user said).
- Identify the **dominant contributors** — the blocks that, if extracted, drop the most complexity
  (a `switch` with N cases, a long `try/catch`, a deeply-conditional JSX subtree, a `.map()` row
  renderer). Extracting tiny blocks rarely helps; go for the big ones.

### M2 — Decide the cut lines (each extraction = one clean region)
A region is extractable **only if** it has a single entry and a single exit and does not smuggle
control flow out of itself. Before marking, check each candidate region for these blockers. Each
fix below is an **enabling tweak** — and every enabling tweak is subject to the two hard rules:
it must be **functionally innocuous** (provably behavior-preserving) AND **confirmed by the user
before being applied** (see the gate at the top of this skill and M2-bis below). The blockers:
- **Multiple output variables** — a block that reassigns ≥2 outer locals consumed later. IDEs emit
  awkward array/object returns. *Enabling tweak:* collapse them into one mutable object
  (`const result = {...}`) the region mutates in place → zero output variables. (This is exactly the
  `pushToNeoRan`/`frontendGenerated` → `result` tweak.)
- **`break` / `continue` / mid-block `return`** belonging to an enclosing `switch`/loop. Can't be
  extracted as-is. *Enabling tweak:* restructure to `if/else` so the region has no `break` inside,
  leaving the `break`/`continue` in the caller (e.g. early-`break` custom branch → `if/else`).
- **`await` inside** → the extracted function must be `async` and the call site `await`ed. Note it.
- **Closure-captured locals** that are declared *inside* the region are fine (they become locals of
  the new function); only those declared *before* and read *after* are inputs/outputs.

For each region, derive the **method name from what it does** (verb-noun, matching file style — never
`extractedMethod1`) and list its inferred params + whether it returns a value or mutates an object.

### M2-bis — Confirm enabling tweaks BEFORE touching code (mandatory gate)
If a region needs no tweak (it is already extractable), just mark it — comments are safe. If it needs
an enabling tweak, STOP and gate it:
1. **Prove innocuousness.** For each proposed tweak, write one line: the before→after transformation
   and *why it preserves behavior* (e.g. "`if (x) {…; break;}` + tail ≡ `if (x) {…} else {tail}`;
   same branches run, same order"). If you cannot prove it, it is NOT a valid enabling tweak — label
   it INTENTIONAL and hand it to the user; do not apply it.
2. **Ask for confirmation.** Present the list of tweaks (what + why + innocuousness proof) and wait
   for an explicit go-ahead. Use the question tool if helpful. Do NOT apply any tweak before the user
   confirms. Markers (comments only) may be inserted now; code-changing tweaks may not.
3. After confirmation, apply only the confirmed tweaks, each behind a `// TWEAK:` comment, and then
   verify them with tests (M5) — the tweak is the only real code change, so it is what the
   innocuousness verdict covers.

### M3 — Marker format (exact)
Insert a matched START/END pair around each region. Number them in **application order** — innermost
/ smallest-scope first, the big container (e.g. the whole `switch`) LAST — and say so in the marker:

```
// ┌─ EXTRACT METHOD #2: runGenerateFrontendStep(windowName, result) ─ START
... region ...
// └─ EXTRACT METHOD #2 ─ END  (mutates result.frontendGenerated; no output variable)
```

- The START line carries the **suggested signature**; the END line notes the **output contract**
  (returns X / mutates Y / none) so the developer knows what to wire up.
- If a container region (e.g. the switch) wraps inner regions, give it the highest number and a
  `(do LAST)` hint, since the inner extractions shrink it first.
- Put each tweak you applied behind a short `// TWEAK:` comment so it is reviewable in the diff.

### M4 — .jsx components (Extract Component / render helper)
React components are extracted the same way, but with extra rules — flag these explicitly:
- **Rules of Hooks are inviolable.** A region that contains a `useState`/`useEffect`/`useMemo`/etc.
  call can be pulled into a **child component** (hooks move with it) but NOT into a plain helper
  called conditionally or inside a `.map()`/loop — that would change hook order and IS a behavior
  change, not innocuous. If the region has no hooks, a plain `renderX()` helper or a child component
  both work.
- **A JSX subtree** (a block of `<.../>`) extracts into either:
  - a **child component** `function PartName({ ...props }) { return (<...>); }` — preferred when it
    has its own hooks/state or is reused; or
  - a **render helper** `const renderPart = () => (<...>);` / `function renderPart() {…}` — fine for
    a pure presentational slice with no hooks.
  Mark it: `// ┌─ EXTRACT COMPONENT: <PartName> (props: items, onSelect, isLoading) ─ START`.
- **Inputs = every identifier the subtree reads** from the parent scope (props, state, handlers,
  derived vars). List them as the new component's props. Extracting must pass them all — a missing
  prop is a behavior change (renders `undefined`). Closures over event handlers must be passed too.
- **`key` props, refs, and context**: a subtree using `useContext` keeps working in a child
  component (context flows through); a `ref` into an extracted element needs forwarding — flag it.
- **`.map()` row renderers** are the highest-value cut in list/table components: extract the row
  JSX into `<Row item={item} … />`. Each `item` becomes a prop; the `key` stays on `<Row>` at the
  call site, not inside.
- Do NOT extract a region that splits a single JSX expression such that the result no longer parses
  (e.g. half of a ternary, or an unclosed tag) — regions must be whole elements/expressions.

### M5 — After marking
- Re-estimate the complexity the target will have **after** all extractions (and each new helper's
  complexity) and confirm it clears the requested target. If a single extraction is not enough, mark
  several.
- Run the affected tests (Step 5 flow) to prove the **confirmed enabling tweak(s) alone** (the only
  real code change you made) are innocuous before the user extracts. If a needed tweak was never
  confirmed, do not apply it — mark the region as blocked-pending-confirmation in the plan. Report
  the usual verdict, plus an "Extraction plan" block: each marker #, name, signature, output
  contract, est. complexity, and which confirmed tweak (if any) it depends on.
- Remind the user the markers are comments — after extracting in their IDE they can delete them — and
  to re-run `/innocuous-check` on the post-extraction diff to confirm each extraction stayed pure.
- Still **never commit or stage**.

---

## Notes

- Stay read-only by default; the sole exception is extraction-marker mode above, and even then never
  stage, commit, or regenerate — only insert markers (always safe) plus enabling tweaks that are
  both **functionally innocuous** and **confirmed by the user first**.
- Cognitive-complexity / Sonar refactors are the primary use case: the code should be *equivalent*,
  just simpler. If you cannot convince yourself a hunk is equivalent, it is RISKY.
- Test commands and the full suite live in the project `Makefile` (`make test`) and root
  `package.json`. Targeted `node --test` / `vitest run` are preferred for fast iteration.
- To compare cognitive-complexity metrics before/after, the user can run `./cli/sonar-check.sh`
  on the changed Java files (this skill does not do that automatically).
