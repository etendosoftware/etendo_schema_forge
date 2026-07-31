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

**Published preview selected by the current functional branch:**
```bash
make dev
```
`make dev` maps the current branch (for example `feature/ETP-4730`) to the
newest immutable Core preview whose SemVer branch identifier matches
(`preview.feature-ETP-4730.*`). It installs all consumed lockstep packages with
`--no-save --package-lock=false`, so neither manifest nor lockfile changes.
Use `CORE_BRANCH=<branch>` when the Core and functional branch names differ, or
`CORE_PREVIEW_VERSION=<exact-version>` to reproduce a specific snapshot. If the
branch has no published preview, the command reports it and continues with the
Core versions recorded in `package.json`; use `make dev-pinned` to select that
mode explicitly.

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
