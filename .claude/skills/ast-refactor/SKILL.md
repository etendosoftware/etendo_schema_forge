---
name: ast-refactor
description: >
  Use when moving, extracting, renaming or rewriting code across JS/JSX files in
  this repo — extracting helpers or components out of a god component, splitting a
  file, promoting modules to app-shell-core, updating import specifiers in bulk, or
  any change where "find every X and rewrite it" spans more than one or two sites.
  Triggers on: extract component, extract helpers, split this file, mover al core,
  refactor masivo, bulk rename, update all imports, codemod, jscodeshift, "the file
  is too big", DetailView/DataTable decomposition, Ola 3.
---

# AST refactor

## Overview

Structural edits go through the parser, not through `grep`/`sed`/line ranges.
`jscodeshift@17.3` is a declared dependency of this repo (`package.json`), and
`ts-morph`, `recast` and the `@babel/*` toolchain are installed. There is a working
precedent with tests: `scripts/add-data-testid.cjs` + `scripts/__tests__/`.

**Core principle: a text tool cannot see a node.** Every defect below came from
asking text to answer a structural question.

## When to use

Use when the edit is **structural**: moving definitions between files, changing an
export or import surface, renaming across call sites, extracting a component.

Skip when the edit is **textual and local**: fixing one string, editing a comment,
a single-site change you can read in full. A codemod for a one-liner is waste.

## The three failures this prevents

Real, from the T31 extraction of `DetailView.jsx` (2026-07-29). Each is a text tool
answering a structural question:

| What was asked | Text answer | Truth | Cost |
|---|---|---|---|
| Which names do tests import? | `grep "import {...} from '../DetailView'"` → **16** | **76** (multi-line imports invisible to a line-oriented grep) | 1021 failing tests |
| Where does a function end? | delete line range | left **106 blank lines** where bodies had been | user-visible junk |
| What functions exist? | `^function` at column 0 | missed a definition below the component and two consts | 3 red iterations of whack-a-mole |

The AST equivalents are one query each: `ImportDeclaration` → `.specifiers`
(formatting-independent), remove the `FunctionDeclaration` node (no line ranges
exist), `Scope`/`Binding` for what became unbound.

## Workflow

**1. Derive the set — never enumerate it by hand.**
Ask the AST for every match. A hand-written list is the defect this repo has
catalogued a dozen times: a check whose scope is narrower than its claim.

**2. Transform, and print the plan before writing.**
Run the codemod in dry-run first; read what it intends to change.

**3. Let the parser find what you broke.**
After the move, collect unbound identifiers from the AST rather than discovering
them one failing test at a time.

**4. Verify — this repo's specifics.**
```bash
cd tools/app-shell && SCHEMA_FORGE_CORE=<core-worktree> LOCAL_CORE=1 \
  npx vitest run src/components/contract-ui/__tests__
```
`LOCAL_CORE=1` is mandatory; the default profile resolves against the published pin
and lies. Test counts must be **identical** before and after — a structural move
that changes a count changed behaviour.

**5. If a tracked file shrank, track the destination in the SAME commit.**
Adding the new file to `cli/file-lines-budget.json` (or the leak scanner's `paths`)
must land with the extraction, before lowering any baseline. Otherwise relocation
reads as payment and the ratchet reports a win for code that just moved somewhere
unwatched.

## Preserving tests without editing them (R1)

R1 forbids editing tests to make a refactor pass. When definitions move out of a
file its suites import from, **re-export them from the original module**:

```js
export {
  helperA, helperB, /* ... */
} from './newModule.jsx';
```

Every existing import keeps resolving to the same function; only the definition
site moved. Derive that re-export list from the AST — deriving it by grep is
exactly what produced the 16-vs-76 miss.

## Beware: source-text pins make a file un-extractable

Some suites here read a component **as text** and regex its source:

```js
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');
assert.match(src, /\{showMoreMenu\s*&&\s*\(/);
```

Those assertions pin **where code lives**, not what it does. Move the matching
code to another file and they fail — behaviour identical, test red, R1 violated.
`DetailView.jsx` alone carries **85 such assertions across 12 files**.

Count them before promising an extraction:

```bash
grep -l "readFileSync" __tests__/*.js | xargs grep -l "<Component>.jsx" \
  | xargs grep -cE "assert\.(match|ok)\(|toMatch\(|toContain\("
```

If the region you want to move is pinned, the extraction is not innocuous by
R1's letter, and you have three honest options — pick one deliberately, don't
discover it halfway:

1. **Convert the pins to behavioural assertions first**, as a declared change of
   its own, then extract. This is the route ETP-4708 took for a currency-conversion
   pin: a separate commit, mutation-proven, before the refactor touched anything.
2. **Re-export won't save you.** It preserves *imports*, not *source text*. A pin
   reads the file; nothing you export changes what the file contains.
3. **Leave the region and extract elsewhere.** Cheapest when the pinned region
   isn't the bulk.

## Beware: moving into a mocked module is test-visible

If any spec does `vi.mock('<destination>')`, moving a function there changes what
the mock intercepts — behaviour-neutral, tests still break. Check before choosing
a destination:

```bash
grep -rn "vi.mock('.*<destination>" tools/app-shell/src --include=*.jsx
```

A fresh destination file is always safe; an already-mocked one is not.

## Implementation

`extract-module.cjs` in this directory extracts top-level declarations from one
module into a sibling, generating the import and the R1 re-export block. Run
`node .claude/skills/ast-refactor/extract-module.cjs --help`.

Follow `scripts/add-data-testid.cjs` for the transformer shape, and its
`scripts/__tests__/` for how to unit-test a codemod as a pure
`(file, api) => string` without the CLI.

## Common mistakes

- **Enumerating by hand** what the AST can derive. The recurring defect here.
- **Trusting a single-line regex** for anything that can span lines: imports,
  exports, JSX props, multi-line call args.
- **Deleting line ranges.** Remove nodes; let the printer emit the file.
- **Skipping the dry run** on a bulk change, then bisecting the damage.
- **Lowering a ratchet baseline** without tracking where the lines went.
