# Design Spec: Schema Forge Core/Functional Repo Split

- Date: 2026-06-30
- Branch: feature/ETP-4346
- Author: Forge (brainstorming session with sebastianbarrozo)

## Problem

`etendo_schema_forge` currently mixes two things that need independent release cycles:

- **Tooling**: the generator/pipeline engine (`cli/`, reusable packages, generic app-shell runtime) — changes when the *tool* evolves.
- **Functional content**: generated windows and their derivatives (`artifacts/<window>/**`, per-window docs, per-window custom UI, per-window e2e specs) — changes when *Etendo business config* evolves.

Today both ship together, so a tooling change and a window content change always land in the same repo/version history, even though they have nothing to do with each other.

## Goal

Split into two repos that each get their own commit history and release cadence, starting from the same point-in-time history:

- **`schema_forge_core`** (new repo) — the tool.
- **`etendo_schema_forge`** (existing repo, same remote — continues unbroken) — the functional module, depending on packages published from `schema_forge_core`.

Non-goals: this spec does not cover open-sourcing either repo, multi-tenant/multi-client reuse of `schema_forge_core` beyond Etendo, or rewriting/squashing git history. Both repos keep 100% of the current history; they diverge from this point forward.

## Repo Identity

| Repo | Origin | Role |
|------|--------|------|
| `etendosoftware/etendo_schema_forge` | Already exists, same remote, unchanged identity | Functional module — survives as-is, gets cleaned up in place |
| `etendosoftware/schema_forge_core` | New, created as a full mirror of the current history | Core tooling — diverges from the mirror point via a cleanup PR |

Both repos carry the full current history (no `git filter-repo`/path rewriting). The split is implemented as ordinary commits/PRs in each repo's own timeline, which keeps every step reversible.

## Package Naming

`@etendosoftware/schema-forge-core` (hyphenated) already exists today and means something specific and narrow: the `sf-domain-boundary-check` tool published from `packages/schema-forge-core`. Reusing that exact name for the much broader CLI/pipeline tooling would silently expand its scope and risk breaking whatever already consumes it.

Least-disruptive resolution: leave `packages/schema-forge-core` and its published name `@etendosoftware/schema-forge-core` exactly as they are — it simply becomes one of several packages that live in the new `schema_forge_core` repo, unchanged. The CLI/pipeline tooling (`cli/`) is published as a **new, distinct package**: `@etendosoftware/schema-forge-cli`. `@etendosoftware/app-shell-core` also keeps its existing name (its scope is expanding, per the App Shell Composition Spike below, but the name and package boundary stay the same).

So `etendo_schema_forge` ends up depending on three packages published from `schema_forge_core`, none of them newly named in a colliding way:

- `@etendosoftware/schema-forge-cli` (new) — pipeline commands (`extract-from-db`, `generate-contract`, `generate-frontend`, `resolve-curated`, `push-to-neo`, `validate-pipeline`, etc.), exposed as published `bin` entries.
- `@etendosoftware/app-shell-core` (existing, expanded scope) — the shell runtime, now including the App/router/page composition and a registry-injection API (see below).
- `@etendosoftware/schema-forge-core` (existing, unchanged scope) — `sf-domain-boundary-check`, kept as-is for CI policy checks.

## Boundary

### `schema_forge_core` keeps (everything that is NOT a generated window or its derivative)

- `cli/` in full — extractors, generators, pipeline, validators (`extract-from-db.js`, `generate-contract.js`, `generate-frontend.js`, `resolve-curated.js`, `push-to-neo.js`, `validate-pipeline.js`, etc.)
- `packages/*` — `app-shell-core`, `schema-forge-core`, `schema-forge-stack`, `schema-forge-agent-context`, `apps-sdk`, `apps-sdk-bff`, `etendo-go-core`
- `tools/app-shell` generic shell only — providers, layout, build config, registry *loader* — no window-specific registry entries or custom component folders
- `tools/quick-order-app`, `tools/report-server`, `tools/decision-panel`, `tools/etendo-go-ar`, `tools/ui-preview`, `tools/spike-hello-app`
- Generic docs (`architecture-overview.md`, `decisions-reference.md`, `pipeline-validator-reference.md`, `ui-customization.md`, `window-templates.md`, `e2e-testing-guide.md`, `conventions.md`, etc.)
- `scripts/`, `Makefile`, `schemas/`, `templates/`, generator-level tests, CI for `cli/`/`packages/*`

### `etendo_schema_forge` keeps (generated windows and their derivatives)

- `artifacts/<window>/**` in full — `schema-raw.json`, `rules-raw.json`, `decisions.json`, `contract.json`, `contract.mcp.json`, `contract-changelog.json`, `generated/web/<window>/**`
- `docs/generated-custom-windows/**` (including `INDEX.md`)
- `tools/app-shell/src/windows/custom/<window>/**` and the per-window registry overlay/entries
- `e2e/tests/flows/*` specific to a window
- `docs/etendo-ad/**`
- Adds `@etendosoftware/schema-forge-cli` as a real published dependency (replacing today's workspace-linked `cli/`), and upgrades its existing `@etendosoftware/app-shell-core` dependency to the version that ships the registry-injection API (see App Shell Composition Spike)

## Split Mechanics (non-destructive)

1. Create the empty GitHub repo `etendosoftware/schema_forge_core`.
2. `git clone --mirror` the current `etendo_schema_forge` and `push --mirror` it into the new repo. Both repos now share byte-identical history.
3. In `schema_forge_core`, on a feature branch: one cleanup PR that removes everything functional (`artifacts/`, `docs/generated-custom-windows`, `tools/app-shell/src/windows/custom/*`, per-window e2e specs, `docs/etendo-ad`). Merge.
4. In `etendo_schema_forge`, on a feature branch: one cleanup PR that removes everything core (`cli/`, the `packages/*` listed above, the generic tools listed above, generic docs/scripts/Makefile that belong to the tool), wires the real dependency on the published `@etendosoftware/schema-forge-cli`, and rewrites `Makefile` targets to call the installed `bin` commands instead of `node cli/src/*.js` paths. Merge.
5. Publish `schema_forge_core`'s packages (`@etendosoftware/schema-forge-cli`, `@etendosoftware/app-shell-core`, `@etendosoftware/schema-forge-core`) to GitHub Packages (`npm.pkg.github.com`) so step 4's dependency resolves against a real published version, not a local workspace symlink.
6. Split CI: `cli/`/`packages/*` tests and the publish workflow live in `schema_forge_core`'s CI. `pipeline-validate` and per-window tests live in `etendo_schema_forge`'s CI, invoking the installed `@etendosoftware/schema-forge-cli` bin commands instead of local script paths.

Steps 3 and 4 must not be merged independently of step 5 — `etendo_schema_forge` must not spend any time on `main` with `cli/` removed and no working dependency in its place (it would have a broken pipeline). Step 4's PR is only mergeable once step 5 has published a real version it can pin.

Every step here is an ordinary commit/PR inside each repo's own history — nothing here rewrites or force-pushes over existing history, so any step can be reverted independently.

## App Shell Composition Spike (prerequisite, resolved via npm — not file copy)

An adversarial review (Opus subagent, 2026-06-30) found that today's `tools/app-shell` is **not** a thin shell consumer: `src/App.jsx` is a full bespoke app — its own `BrowserRouter`, layout, ~15 page components, and `WindowLoader` — and window code is wired in at build time via Vite aliases (`@generated → ../../artifacts`, `@/windows/custom/* → ./src/windows/custom`) that assume the generated artifacts live in the same repo tree. `packages/app-shell-core` currently exposes no registry/component-map injection point. "Just add the npm dependency" does not work until this is built.

This is therefore a **prerequisite spike**, done entirely inside the current (still-single) repo, before the mirror is created (Phase 0 below — see Phasing):

1. Move `App.jsx`, the router, the ~15 page components, and `WindowLoader` out of `tools/app-shell/src` and into `packages/app-shell-core`, behind a new exported entry point (e.g. `AppShell`) that accepts a **window registry** as a runtime prop/config: a map of `windowName → { Generated: LazyComponent, Custom?: LazyComponent }`, plus whatever auth/locale/report config it already takes.
2. Reduce `tools/app-shell` to: `package.json` depending on `@etendosoftware/app-shell-core`, and a small entrypoint that builds the registry from its own local `artifacts/*/generated/web/<window>` and `src/windows/custom/<window>` (via the *same* Vite aliases, now resolving purely within `etendo_schema_forge`'s own tree — never crossing the repo boundary) and renders `<AppShell registry={registry} ... />`.
3. Acceptance criteria: `packages/app-shell-core` test suite passes; `tools/app-shell` builds and at least one already-working window renders end-to-end identically to today, sourced entirely through the new injection API; no Vite alias or import in `tools/app-shell` points outside `etendo_schema_forge`'s own tree.

Once this spike lands and is validated in the current repo, `npm install` is sufficient going forward: the generic shell crosses the repo boundary as a versioned dependency, and the registry/custom-window wiring stays 100% local to `etendo_schema_forge`. No compose/copy script, no extra Makefile or CI step is needed to merge the two halves at that point.

## Phasing

0. **Schema Forge Developer** — App Shell Composition Spike (see above), landed and validated inside the *current*, still-single repo, before any mirror is created.
1. **Clerk** — create `schema_forge_core`, perform the mirror push.
2. **Schema Forge Developer** — cleanup PR in `schema_forge_core` (remove functional-only paths); define `@etendosoftware/schema-forge-cli` with published `bin` entries for every pipeline command; publish workflow for all three packages.
3. **Schema Forge Developer** — cleanup PR in `etendo_schema_forge` (remove core-only paths), wire the dependency on `@etendosoftware/schema-forge-cli`, rewrite `Makefile`/CI to call installed bins, update docs. Gated on phase 2's packages being published.
4. **Alex (Review) + Sentinel (QA)** — confirm both repos build/test green independently, and that `make regen` works end-to-end in `etendo_schema_forge` against the published packages.
5. **Sage (Docs)** — update `architecture-overview.md`, `README.md`, and `CLAUDE.md` in both repos to describe the two-repo model and the new dependency direction.

## Risks / Open Items

Resolved by this revision (package naming, App Shell Composition) — tracked below are the remaining items an adversarial review flagged that the implementation plan must still produce concrete answers for; none of them change the architecture above, but each is large enough to derail a phase if left implicit:

- **Boundary list is not exhaustive.** Not yet assigned to either repo: `e2e/` (its own npm workspace — only `e2e/tests/flows/*` per-window specs are addressed, the generic harness is not), `tests/`, `pipelines/`, `core-maps/`, `infra/`, `presentations/`, `caps/`, `pending/`, `quality-gate.config.json`, `sonar-project.properties`/`run-sonar.sh`, `domain-boundary-report.{json,md}`, `proposal.md`, `review-report.json`, `pr-test-coverage-analysis.md`, `feedback.md`, `.githooks/`, root `README.md`/`AGENTS.md`, and the 16 `.github/workflows/*` (12 reference `cli/`/`artifacts/`/`packages/` paths directly). The implementation plan must produce a path-by-path disposition table covering all of these before phase 2/3 start.
- **GitHub Packages cross-repo auth.** The existing `publish-private-packages.yml` is `workflow_dispatch`-only and uses `secrets.GITHUB_TOKEN`, which is scoped to its own repo. `etendo_schema_forge`'s CI needs a separate PAT (or GitHub App token) with `read:packages` on `schema_forge_core` to install its private packages — this must be provisioned before phase 3.
- **Cutover coordination.** Open branches/PRs at cutover time (e.g. this very `feature/ETP-4346`, with ~40 modified artifacts) target paths that are about to move. The plan needs an explicit freeze/merge window for in-flight branches before phase 2/3, plus a version-pin policy for the new dependency (recommendation: exact version, not a range, with a dist-tag for the active release line).

## Testing

- `schema_forge_core`: existing `cli/test/*` and `packages/*/test/*` suites must pass standalone, with no relative imports into the old `artifacts/`.
- `etendo_schema_forge`: `make regen ONLY=<window>` must succeed end-to-end against the installed `@etendosoftware/schema-forge-cli`, and the installed `validate-pipeline` bin must report the same result as `node cli/src/validate-pipeline.js` did before the split, for at least one already-working window.
- App Shell Composition Spike (phase 0): at least one already-working window must render identically through the new `AppShell` registry-injection API before the spike is considered done.
- Both repos: CI green on their own cleanup PR before phase 4 review starts.

## Rollback

Each phase is an isolated PR in its own repo's history. Any single phase can be reverted independently without affecting the other repo, except phases 2/3, which must be rolled back together if step 3's dependency wiring needs to be undone (see Risks).
