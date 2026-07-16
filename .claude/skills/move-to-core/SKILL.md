---
name: move-to-core
description: >
  Build a migration PLAN for moving a generic/shared piece of the functional
  app-shell (a component, hook, or lib) from etendo_schema_forge into the
  schema_forge_core package (@etendosoftware/app-shell-core). Maps the dependency
  closure, decides what else must move, plans the shims, the package exports, the
  i18n handling, the version bump and the two-repo branch coordination — then
  emits a step-by-step plan. The HUMAN decides WHAT goes to core (it usually
  surfaces when something is generic AND used in many places); this skill takes
  that decision as given and figures out HOW to move it safely. Read-only by
  default: it produces the plan, execution is a separate approved step.
  Triggers on: "esto va al core", "esto tiene que ir al core", "mover al core",
  "llevar al core", "move to core", "esto es genérico, al core", "migrar X al
  core", "sacar esto de functional al core", "app-shell-core migration".
argument-hint: "<path-or-name of the component/hook/lib to move> [--execute]"
---

# /move-to-core — Plan a migration into `app-shell-core`

**Arguments:** `$ARGUMENTS` — the file, component, hook or lib to move (a path like
`tools/app-shell/src/components/contract-ui/AdvancedFilterBuilder.jsx`, or just a
name to resolve). Optional `--execute` to carry out the plan after it is approved
(default is **plan only**).

## What this skill is (and is not)

- **It IS** a planner. Given a thing the team has decided belongs in core, it works
  out the full, safe migration: the dependency closure, what already exists in core,
  the shims to leave behind, the package `exports` to add, the i18n story, the
  version bump, the two-repo branch/publish order — and writes it up as a plan.
- **It is NOT** the gatekeeper for the decision. **Humans decide what goes to core.**
  That decision typically surfaces when a piece is *generic* (no window/domain/client
  logic) **and** used across many places. This skill assumes the decision is already
  made and does not argue with it — it only runs a quick, **non-blocking** sanity
  check and then plans.

## Repo topology (the ground truth)

Three repos (full reference: `docs/repo-topology.md`):

```
etendo_develop/
├── schema_forge/          ← functional. Consumes core as PUBLISHED npm packages.
│   └── tools/app-shell/src/…   the React app + functional windows
├── schema_forge_core/     ← platform/tooling. Owns the shared React runtime:
│   └── packages/app-shell-core/src/…   ← DESTINATION for anything generic
└── etendo_core/modules/com.etendoerp.go/   ← Java runtime (out of scope here)
```

The functional repo already **bridges** to core with thin re-export **shims** at the
same `@/` path. Examples that exist today (read them before planning — they are the
canonical pattern):

```js
// tools/app-shell/src/components/ui/button.jsx
export * from '@etendosoftware/app-shell-core/components/ui/button.jsx';
// tools/app-shell/src/auth/AuthContext.jsx
export * from '@etendosoftware/app-shell-core/auth';
// tools/app-shell/src/i18n/index.js
export * from '@etendosoftware/app-shell-core/i18n';
```

This is why moving a file to core does **not** have to touch its consumers: leave a
shim at the old `@/…` path and every `@/…` import keeps resolving.

## Two developer profiles (matters for validation)

- **Default / servers / CI:** use the **published** `@etendosoftware/app-shell-core`.
  A core change is only visible here after **publish + version bump** in functional's
  `package.json`.
- **Core developer (opt-in, `LOCAL_CORE`):** `make dev-local-core` and
  `make <target> LOCAL_CORE=1` resolve core from the sibling **source**, so you can
  validate the move **before publishing**. Always validate with `LOCAL_CORE` first.

⚠️ **Two verified `LOCAL_CORE` gotchas that will bite mid-move:**
1. **Manual browser test = `make dev-local-core`, NOT `make dev`.** Right after the
   move, the moved subpaths are not published yet, so plain `make dev` (published
   package) throws `Failed to resolve import "@etendosoftware/app-shell-core/<subpath>"`
   / `Missing "…" specifier`. `make dev-local-core` aliases the package to local core
   source (a catch-all `@etendosoftware/app-shell-core/(.*)` → core `src/$1`) so the
   shims resolve. Tell the human to use it for manual testing until the preview is
   published + pinned.
2. **`LOCAL_CORE` may be wired into `vite.config.js` but NOT `vitest.config.js`.** The
   two configs have independent `alias` blocks. If the functional test suite is to run
   the re-angled Y tests against local core source, mirror the `LOCAL_CORE`-gated
   aliases into `tools/app-shell/vitest.config.js` too (bare + `/(.*)` catch-all for
   `@etendosoftware/app-shell-core`, plus pin `react`/`react-dom` to this repo's
   node_modules). Without this, the shims can't resolve under vitest and Y stays red.
   **You MUST also copy `resolve.dedupe`** (the full ~22-package list: react,
   react-dom, react-router-dom, sonner, lucide-react, clsx, cmdk, next-themes,
   date-fns, react-day-picker, class-variance-authority, tailwind-merge, and all
   `@radix-ui/*`) into vitest's **top-level `resolve` block** (sibling to `test`, NOT
   inside `test`). The alias pins are not enough on their own: the linked core source
   has its own `node_modules/react`, so without dedupe every rendered core component
   loads a 2nd React → `Cannot read properties of null (reading 'useMemo')`. This is a
   required infra step of the move, not optional.

   Also note: a functional `node:test` (`*.test.js`, not vitest) that imported the
   moved source **cannot** cross the shim — `node --test` ignores vitest aliases and
   `LOCAL_CORE`, so it hits the published package and fails with `ERR_MODULE_NOT_FOUND`
   on the unpublished subpath. If the same coverage now exists in core (it should — it
   moved as Z), just `git rm` the functional node:test copy; the vitest-based Y (which
   *does* honor the alias) preserves functional-side coverage.

---

## Procedure — how to build the plan

Work read-only through these steps and record the findings; the output is the plan.

### 1. Locate the target and confirm it is in functional
Resolve `$ARGUMENTS` to an actual file under `tools/app-shell/src/`. If it is already
in `packages/app-shell-core`, stop — nothing to move.

### 2. Sanity check (non-blocking — just surface, don't gate)
Report a short checklist so the human can eyeball the decision:
- Generic? No reference to a specific window / entity name / document business rule.
- No dependency on `decisions.json` / `artifacts/` / per-client Spanish literals
  (generic i18n **keys** like `op*` are fine — see §7).
- Any dependency it drags that is itself window-specific is a **red flag** (see §4).
- Window-specific companion files (e.g. in-memory client-side evaluators tied to one
  window) should **stay** in functional even if they accompany a generic component.
If something smells wrong, say so — but continue planning unless the human stops you.

### 3. Map the dependency closure (the crux)
List every `import` of the target, then classify each dependency:

| Dependency | Already in core? | Action |
|---|---|---|
| A `ui/*` primitive, `i18n`, `auth`, `react`, `lucide-react` | usually YES | none — resolve from core |
| A generic lib/hook only in functional | NO | **must move too** (add to closure) |
| A window-specific file | NO | **do NOT move** — this is a red flag on the target |

Commands to build this:
```bash
CORE=../schema_forge_core/packages/app-shell-core/src
grep -n "^import" <target>                       # what it imports
ls $CORE/components/ui $CORE/hooks $CORE/lib $CORE/i18n $CORE/auth   # what core already has
node -e "console.log(JSON.stringify(require('../schema_forge_core/packages/app-shell-core/package.json').exports,null,1))"
```
For each functional-only generic dep, recurse (map ITS imports too) until the closure
is closed. A dependency with **zero imports** (self-contained lib) is trivial to move;
one that reaches back into functional-only window code means the target is not as
generic as assumed — flag it.

### 4. Decide the final move-set
The move-set = the target **+** every generic functional-only file in its closure.
Write the list explicitly. Note for each: its destination path in core
(`packages/app-shell-core/src/…`, mirroring the functional subpath) and whether its
`@/…` imports need rewriting to core-relative paths after the move.

### 5. Plan the shims (default strategy)
For **each** moved file, plan a thin re-export left at the original `@/…` path:
```js
export * from '@etendosoftware/app-shell-core/<subpath>';
```
⚠️ **`export *` does NOT re-export a `default`.** If the moved file has a
`export default …` (most components/hooks do; pure-function libs like `gridQuery.js`
usually don't), add a second line or a consumer that imports the default breaks:
```js
export { default } from '@etendosoftware/app-shell-core/<subpath>';
```
Grep the file for `export default` to decide. This keeps all consumers untouched.
(Alternative, only if the human asks: rewrite consumers to import from
`@etendosoftware/app-shell-core/…` directly and delete the shims — cleaner long-term,
more churn now. Default is **shim**.)

### 6. Plan the package `exports` additions
Core's `exports` map is mostly **explicit** (only `./components/ui/*` is a wildcard),
so a new subpath is NOT reachable until added. For every moved file, plan an entry in
`packages/app-shell-core/package.json` `exports`, e.g.:
```json
"./components/contract-ui/*": "./src/components/contract-ui/*",
"./lib/gridQuery.js": "./src/lib/gridQuery.js",
"./hooks/useDistinctValues.js": "./src/hooks/useDistinctValues.js"
```
Prefer a directory wildcard when several files share a new dir.

### 7. Plan the i18n handling
The i18n **machinery** (`LocaleProvider`, `useUI`, `resolveUI`) lives in core, but the
**dictionaries** (`locales/en_US.json`, `es_ES.json`) live in **functional** and are
injected into the provider at runtime. So a moved component that calls
`useUI('someKey')` still resolves — **the keys stay in functional**, no data move
needed. Confirm the keys it uses already exist in both locale files; if not, that is a
separate functional change.

### 8. Plan the tests (COPY to core + RE-ANGLE in functional)
Given component **X** in functional with tests **Y** that test its code, the rule is:

1. **Copy Y → Z in core.** Z is the real **unit test**, colocated with the moved
   source in core (`packages/app-shell-core/src/**/__tests__/`), testing the code
   directly. Rewrite `@/` mock/import paths to core's convention (core tests use
   relative paths like `../../../i18n/index.js`, or the `@/` alias where core's vitest
   config defines it). Core runs vitest — Z must be green there.
2. **Keep Y in functional, but re-angle it to pull from the PACKAGE.** Y stops testing
   the local source (which no longer exists — only the shim does) and instead imports
   through the shim / `@etendosoftware/app-shell-core`. Now Y tests **from the import
   angle**: that the published package + the shim + functional's own wiring (real i18n
   dictionary, aliases, build) resolve and behave. This is the only place the real
   dictionary and the published component are exercised together — it guards the
   `exports` map, the shim, and the version pin. Do NOT delete Y.
3. **Functional-owned guards stay as-is in functional** — e.g. i18n key-presence tests
   (`opStartsWith` exists in `es_ES.json`/`en_US.json`); the dictionary is functional.

Net: the code gets unit-tested in core (Z), and the integration/published-package path
gets tested in functional (re-angled Y). Say explicitly, per test file, which becomes
Z (copied to core), which Y is re-angled, and which guards stay untouched.

> **Note on mock-heavy unit tests:** if Y mocks i18n via an identity stub
> (`useUI: () => (key) => key`) and asserts against i18n **keys** (not translated
> strings), it has **no** coupling to the functional dictionary and copies to core
> cleanly — only the mock module paths need rewriting. The re-angled Y in functional
> is then what adds the real-dictionary coverage the core copy deliberately mocks out.
> **But heads up:** once Y imports through the shim/package, the core component
> imports i18n via its OWN relative path (`../../i18n/index.js`), so Y's
> `vi.mock('@/i18n')` identity stub **no longer intercepts it** — Y must switch to a
> real `LocaleProvider` + real dictionary (and assert translated strings) or drop the
> now-inert i18n mock. Say so; don't silently weaken the assertion.

#### Core test-runner realities (VERIFIED — do not assume core == functional)
Core's vitest is configured very differently from functional's. Check these before
copying, or the Z tests silently don't run / fail on DOM bleed:
- **Discovery pattern:** core `vitest.config.js` uses `include: ['src/**/*.test.jsx']`
  — it does **NOT** match `*.vitest.jsx`. Rename copied vitest files to `*.test.jsx`
  (keep a `.vitest.` infix only to disambiguate from a sibling node:test `*.test.js`).
  (Core has ~15 legacy `*.vitest.jsx` that are effectively dead — don't mimic them.)
- **No `globals`, no `setupFiles`:** functional has both; core has neither. Each copied
  file needs explicit `import { describe, it, expect, vi, afterEach } from 'vitest'`,
  an explicit `import '@testing-library/jest-dom/vitest'`, and — the subtle one — an
  explicit `afterEach(cleanup)` (without it RTL never auto-cleans → "Found multiple
  elements" DOM bleed across tests).
- **Gate vs non-gate:** core's `npm test` (the command the publish-preview gate runs)
  is `node --test <fixed globs>`, **not** vitest, and its globs don't include
  `contract-ui`/`lib`. So `.test.jsx`/vitest files are **non-gating** by default (run
  via `npm run test:vitest`). Decide with the human whether that's acceptable (usually
  yes — matches core's existing convention) or whether to wire them into the gate.

### 9. Plan version + publish + branch coordination (PREVIEW-PACKAGE FLOW)
This is a **coordinated two-repo change** (see `docs/branch-workflow.md`). Do **NOT**
hand-bump `app-shell-core` to a made-up `x.y.z`. The real chain uses the **preview
package** mechanism (`schema_forge_core/.github/workflows/publish-preview.yml`):

1. **core branch** (`feature/ETP-XXXX`): move files, rewrite their internal imports,
   add `exports`, move tests, green vitest. **Do not touch the version by hand** —
   the workflow resolves it.
2. **Local validation first:** develop/validate with `make dev-local-core` +
   `LOCAL_CORE=1` **before** relying on any publish.
3. **Push the core branch.** The push to `feature/**` auto-triggers
   `publish-preview.yml`, which runs the full test suite and publishes a **throwaway
   preview** of all 6 packages in lockstep under the **`alpha`** dist-tag — never
   `latest`, so nobody else is affected. Version format:
   `<base>-preview.<branchid>.<timestamp>.<shortsha>`.
4. **Wait for the Action to finish.** It surfaces the exact version two ways (no need
   to open the run): a **commit status** `alpha: <version>` pinned to the SHA, and a
   **sticky PR comment** with the precise pin snippet. Grab that version.
5. **functional branch** (`feature/ETP-XXXX`, same ticket): delete originals, add
   shims, and **pin `@etendosoftware/app-shell-core` to that preview version** from
   the PR comment/status, `npm install`, keep functional-owned tests. Validate
   functional against the **published preview**.
6. **Real release later:** the actual `latest` version is cut by the core's
   `release.yml` (not this preview) once the change merges; the functional pin is then
   bumped to that real version by the normal pin-bump chore. The preview is only for
   testing the published-package path on the branch.
- Delegate git/Jira ops to **Clerk** and test work to **Tester** (per CLAUDE.md).
- ⚠️ Every fresh push to the core branch republishes a **new** preview and supersedes
  the old one — re-read the latest PR comment/status and re-pin functional if the core
  moved after you pinned.

### 10. Emit the plan
Produce the plan using the template below. If `--execute` was passed AND the human
approves, carry it out step by step (core first, then functional); otherwise stop at
the plan.

---

## Output template

```
# Migration plan: <target> → app-shell-core

## Sanity check (non-blocking)
- generic: <yes/no + note>
- no window/client coupling: <yes/no + note>
- red flags: <none | list>

## Move-set (files to relocate to core)
1. <functional path>  →  packages/app-shell-core/src/<path>   [imports to rewrite: …]
2. …

## Already in core (resolve from there, no move)
- <ui/*, i18n, auth, …>

## Shims to leave in functional (same @/ path)
- <path> → export * from '@etendosoftware/app-shell-core/<subpath>'
- …

## package.json exports to add (core)
- "<subpath>": "<./src/…>"

## i18n
- keys used: <list> — stay in functional locales (already present? yes/no)

## Tests
- copy to core as unit tests (Z): <list — rewrite mock/import paths>
- re-angle in functional to pull from the package (Y): <list — now tests the import/shim path>
- functional guards untouched: <list — e.g. i18n key-presence>

## Version & coordination (preview-package flow)
- branches: core feature/ETP-XXXX + functional feature/ETP-XXXX (one ticket)
- order: validate LOCAL_CORE → push core → publish-preview Action runs →
  read preview version from PR comment/commit status → pin functional to that
  preview (alpha) → validate functional → real `latest` cut later by release.yml
- do NOT hand-bump the version

## Risks
- <e.g. publish→bump ordering; any dep that looked generic but isn't>
```

---

## Worked example — `AdvancedFilterBuilder` (ETP-4532 follow-up)

Real result of running this procedure on the shared conditional-filter builder:

- **Move-set (4):** `components/contract-ui/AdvancedFilterBuilder.jsx`,
  `lib/gridQuery.js` (self-contained, 0 imports — trivial),
  `hooks/useDistinctValues.js` (imports `@/auth/*`, which already exists in core →
  rewrite to core-relative), `components/contract-ui/DistinctValuesList.jsx` (only
  `react` + `lucide-react`).
- **Already in core:** all `ui/*` primitives (button/input/select/popover/dialog/
  dropdown-menu), `i18n`, `auth` (`useAuth`, `buildHeaders`).
- **Shims (4):** re-exports at the same `@/…` paths → the ~10 consumers
  (`ListFilterBar`, `ListModalWindow`, `AdvancedFilterButton`, `PaymentForm`,
  `MovementsToolbar`, …) don't change.
- **exports to add:** `./components/contract-ui/*`, `./lib/gridQuery.js`,
  `./hooks/useDistinctValues.js`.
- **i18n:** `op*` keys (incl. `opStartsWith`) stay in functional locales — dictionary
  is host-injected; no move.
- **Tests:**
  - *Copy to core (Z, unit):* `AdvancedFilterBuilder.vitest.jsx`,
    `AdvancedFilterBuilder.helpers.vitest.jsx`, `gridQuery.test.js`,
    `gridQuery.vitest.jsx` — they mock `@/i18n` with an identity stub and assert
    against i18n **keys**, so zero dictionary coupling → copy clean, only rewrite the
    `@/` mock paths (`@/i18n`, `@/lib/gridQuery`, `@/hooks/useDistinctValues.js`,
    `../DistinctValuesList.jsx`) to core's convention.
  - *Re-angle in functional (Y):* keep a copy that imports through the shim /
    `@etendosoftware/app-shell-core` and renders with the **real** dictionary — the
    only place "Empieza por" (the translated `opStartsWith`) is exercised end-to-end;
    guards the exports map + shim + version pin.
  - *Functional guard untouched:* `etp4532-starts-with-key.test.js` (locale JSON is
    functional).
- **Stay in functional (red-flag companions):** the window-specific client-side
  evaluators `financial-account/advancedFilterApply.js` and
  `payment/paymentInvoiceFilter.js` (in-memory, per-window) — they keep their own
  operator maps. Note latent duplication of operator semantics as a future cleanup.
- **Version:** no hand-bump. Push the core branch → `publish-preview.yml` publishes an
  `alpha` preview (`<base>-preview.<branchid>.<timestamp>.<shortsha>`) → pin functional
  to that preview from the PR comment/commit status → real `latest` cut later by
  `release.yml`. (Local core clone read `0.3.0` vs published `0.3.9` — never derive a
  version from the local checkout; use what the Action publishes.)

## Related
- `docs/repo-topology.md` — the split, the two profiles, GitHub Packages auth.
- `docs/branch-workflow.md` — parallel branches across repos.
- `/migrate-pre-split-pr` — different job: routes a **pre-split branch's diff** to the
  correct repo. Use that when a branch predates the split; use **this** skill when you
  are deliberately promoting a generic piece from functional into core.
