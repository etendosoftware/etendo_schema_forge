# Repo Topology & Developer Profiles

After the repository split there are **three** repos. Knowing which one you are in
— and which one your change belongs to — is the first orientation step for any task.

```
etendo_develop/
├── schema_forge/          ← THIS repo (functional). Windows, artifacts, decisions,
│                            app-shell React app, Spanish localization, per-client config.
│                            Consumes the tooling as PUBLISHED npm packages.
├── schema_forge_core/     ← Platform / tooling. Generators, extractors, pipeline,
│                            the shared React runtime (packages/app-shell-core), CLI.
│                            Published to GitHub Packages; this repo installs it.
└── etendo_core/modules/com.etendoerp.go/   ← Runtime engine (NEO Headless, Java).
```

- **schema_forge** (functional) — remote `etendosoftware/etendo_schema_forge`. WHAT to expose, per client.
- **schema_forge_core** (tooling/platform) — remote `etendosoftware/schema_forge_core`. HOW the tooling works.
- **com.etendoerp.go** (runtime) — serves the configured APIs at runtime.

The functional repo **consumes** the tooling. It does not contain the generators/pipeline —
those live in `schema_forge_core` and arrive as published packages:

| Package (published, GitHub Packages) | Provides |
|--------------------------------------|----------|
| `@etendosoftware/app-shell-core`     | Shared React runtime (used by the app-shell) |
| `@etendosoftware/schema-forge-cli`   | The `sf-*` CLI bins (`sf-regen-all`, `sf-push-neo`, …) |
| `@etendosoftware/schema-forge-core`  | Core library used by the CLI |

The app-shell Tailwind configuration consumes the public
`@etendosoftware/app-shell-core/tailwind-preset`. Product code may extend that
preset, but must not duplicate its semantic theme palette; accessibility tokens
and contrast policy remain owned by the core package.

## Two developer profiles

The difference is simply **whether you have `schema_forge_core` cloned as a sibling**.

### 1. Functional-only developer (the default, and all servers / CI)
Works only in `schema_forge` (windows, decisions, artifacts, config). Uses the
**published** packages from `node_modules`. Nothing extra to set up.

```bash
make dev            # React app against the published @etendosoftware/app-shell-core
make regen ONLY=... # pipeline against the published @etendosoftware/schema-forge-cli
```

**Prerequisite — GitHub Packages auth.** The published packages live in GitHub
Packages, so `npm install` needs a token with `read:packages`:

```bash
# add to ~/.npmrc (the scope registry line is already committed in .npmrc):
//npm.pkg.github.com/:_authToken=<GITHUB_TOKEN_WITH_read:packages>
npm whoami --registry=https://npm.pkg.github.com   # should print your user
```

### 2. Core developer (also works on the tooling)
Has `schema_forge_core` cloned as a sibling of `schema_forge` and wants to run
**everything from the local core source** for hot iteration — the React runtime
*and* the CLI — instead of the published packages.

This is strictly **opt-in** and never changes the default. It is gated by the
`LOCAL_CORE` flag so servers/CI (where the core is not cloned) are unaffected.

**Prerequisite:** clone the core as a sibling *and install its deps* (the core CLI is
ESM, so it resolves its dependencies from its own `node_modules`):

```bash
cd ../schema_forge_core && npm install
```

**React (hot-reload against local core source):**
```bash
make dev-local-core
```
Resolves `@etendosoftware/app-shell-core` (and subpaths) from
`../schema_forge_core/packages/app-shell-core/src`. React/react-dom and the shared
runtime deps are pinned to this repo's copies (Vite `resolve.dedupe`) so there is a
single React instance — no "Invalid hook call". Implemented in
`tools/app-shell/vite.config.js` (see the `LOCAL_CORE` block).

**CLI (run the pipeline from local core source):**
```bash
make regen ONLY=<window> LOCAL_CORE=1
make <any-cli-target>    LOCAL_CORE=1
```
The Makefile's `SF` variable switches from `npx` (published) to `./cli/sf-local`
(dispatcher). `cli/sf-local` maps each `sf-*` bin to its script using the published
package's own bin map (single source of truth) and runs it from
`../schema_forge_core/cli/`, keeping the working directory here so the CLI operates
on this repo's `artifacts/` and config — **core code over local data**.

Override the core location with `SCHEMA_FORGE_CORE=/abs/path` if it is not the
default sibling directory.

## Where does my change go?

| Change | Repo |
|--------|------|
| Window config, decisions.json, artifacts, per-client UI | **schema_forge** (functional) |
| A generator/extractor/pipeline feature, a new `decisions.json` option, a shared UI component in app-shell-core | **schema_forge_core** (tooling) → publish + bump the package |
| Runtime API behaviour, NeoHandler, Java services | **com.etendoerp.go** (runtime) |

A tooling change is only visible to the functional repo after it is published and the
version bumped in `package.json` — **or** consumed live via `LOCAL_CORE` during
development.

## Verifying a promotion or a regeneration

Moving a module into core, or regenerating a window to prove a generator change is
inert, is verified by comparing before and after. Six things in that comparison
**produce a green result without checking what you think they check**. Each is listed
with the concrete tell, because none of them looks like a failure.

### 1. Regenerating in a bare sandbox fabricates import-path diffs

`generate-frontend.js` does not compute custom-component import paths — it *probes the
filesystem* for them, relative to the current working directory
(`resolveCustomImport`, `cli/src/generate-frontend.js:50-63`):

```js
if (existsSync(resolve(`artifacts/${specName}/custom/${component}.jsx`)))       // → '../../../custom/X'
if (existsSync(resolve(`tools/app-shell/src/windows/custom/${dir}/${component}.jsx`)))  // → '@/windows/custom/<dir>/X'
```

Regenerate into a scratch copy that has `artifacts/` but no `tools/`, and every probe
into `tools/app-shell/` misses. The generator then silently falls through to the
artifact-local default and emits `'../../../custom/X'` for components that really live
in the app-shell. The diff shows changed import paths in committed generated files —
indistinguishable from someone having hand-edited them.

**The tell:** if a regeneration diff consists *only* of custom-import specifiers
flipping between `'../../../custom/X'` and `'@/windows/custom/<dir>/X'`, suspect the
sandbox, not the files.

**The fix:** give the sandbox the directory the generator probes.

```bash
ln -s /abs/path/to/schema_forge/tools tools
```

Safe by construction: the generator's only writes are `mkdirSync`/`writeFileSync` under
`artifacts/<window>/generated/web/<window>/` (`generate-frontend.js:2787-2792`), so the
symlinked tree is read-only to it.

(`make regen-check` does not have this problem — it runs in place, in `tmp/regen-check/`.
See `docs/xml-regeneration-check.md`.)

### 2. A green `vite build` under `LOCAL_CORE` proves nothing about the exports map

The `LOCAL_CORE` aliases rewrite `@etendosoftware/app-shell-core/<subpath>` straight to
a file in the core source tree (`tools/app-shell/vite.config.js:226-227`; mirrored for
tests in `tools/app-shell/vitest.config.js:37`). The alias replaces the specifier
*before* Node's resolver runs, so the core package's own `exports` map is never
consulted. A promoted module with **no `exports` entry at all** builds, hot-reloads and
passes vitest under `LOCAL_CORE`, and then fails for every consumer the moment the
published package is used.

Validate the map separately, by resolving each `@etendosoftware/app-shell-core/*`
specifier through the package's own `exports` the way Node will post-publish. That is
already implemented: `resolveThroughExports()` in
`tools/app-shell/src/__tests__/coreShimSurface.vitest.js` reads core's `package.json`
`exports`, applies Node's longest-literal-prefix rule for wildcard patterns, and asserts
both that a subpath has an entry and that the entry points at a file that exists — so a
missing `exports` entry fails that test rather than surviving to publication.

### 3. `node --test` cannot cross a shim — and its two error codes mean different things

The Node test runner ignores the vitest alias and `LOCAL_CORE` entirely; it resolves bare
specifiers through `node_modules`. So a `*.test.js` that imports a module which has just
been promoted **is red until the pin bump**, by design, and that redness is not a defect.
Distinguish the two failures before acting:

| Error | Meaning | Action |
|---|---|---|
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | core's `exports` map has **no entry** for the subpath (`Package subpath './…' is not defined by "exports"`) | Real gap — add the entry (see #2) |
| `ERR_MODULE_NOT_FOUND` | the map resolved fine; the named file is simply **not in the currently pinned tarball** yet | Timing only — clears when the preview publishes and the pin bumps |

`ERR_MODULE_NOT_FOUND` names a concrete resolved path inside `node_modules/…`, which is
what tells you the map did its job. Both were reproduced on this branch.

### 4. `vi.mock('@/…')` stops intercepting once the module moves

Vitest matches `vi.mock` by **resolved** module, not by the specifier as written. After a
promotion, `@/components/ui/dialog.jsx` is a shim, and the module the component under
test actually loads is the core one — so a mock aimed at the `@/` path is silently not
applied, and the real component renders. Nothing errors; assertions just fail for
reasons that look unrelated (or worse, still pass).

Mock the **package subpath** instead:

```js
// vitest matches vi.mock by RESOLVED module, so name the package subpath
vi.mock('@etendosoftware/app-shell-core/components/ui/dialog.jsx', () => ({ /* … */ }));
```

This is strictly safer than mocking `@/`: because functional's `@/components/ui/*` are
themselves shims onto the same core module, one mock at the package subpath covers both
the core module and any functional consumer that goes through the shim. Worked example:
`tools/app-shell/src/windows/custom/calendar/__tests__/PeriodsExpandablePanel.vitest.jsx`.

The related hazard — moving a helper *into* a module that some test replaces with a
factory mock — is covered in `docs/reports/contract-ui-churn-analysis.md` §9.3.5.

### 5. Audit shims by export surface, never by grepping for `default`

The two shim shapes each lose exactly one thing, in opposite directions:

- `export * from '…'` forwards every **named** export and **never** the `default`.
- `export { default } from '…'` forwards the `default` and **nothing else**.

So a shim is correct only relative to what its target actually exposes. Compare the two
surfaces — the shim's statements against the target module's exports — which is what
`coreShimSurface.vitest.js` does, one assertion per shape, deriving the shim population
from file *shape* rather than from a list.

**Do not audit this with `grep -l default`.** It produces false positives on prose and
data: `packages/app-shell-core/src/lib/backendErrors.js:24` contains the translation key
`'A tariff marked as default cannot be deactivated.'` — a match with no export anywhere
near it.

### 6. Playwright with no `webServer` block tests whatever answers the port

On a machine with several checkouts this is the worst of the six, because it does not
fail at all: a mocked E2E run silently exercises another checkout's app, so a green run
proves nothing and a red one sends you hunting a regression that does not exist. Before
trusting any E2E result, confirm `e2e/playwright.config.js` still declares a `webServer`
whose `cwd` is pinned to the worktree under test, with `reuseExistingServer: false`
(`e2e/playwright.config.js:44-61`).

Measured impact and the full write-up: `docs/e2e-testing-guide.md` → "Pitfalls that fail
silently".
