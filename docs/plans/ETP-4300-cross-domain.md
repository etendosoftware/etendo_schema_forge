# ETP-4300 Cross-Domain Plan — Efficient Localization (build-time sliced labels)

## Purpose

Introduce the build-time label-slicing infrastructure for Etendo GO's frontend
(ETP-4300): a per-window label slicer, its `make regen` wiring, an F18 pipeline
validator rule that guards slice freshness, and the runtime resolution layer that
will consume the slices. This is a vertical feature slice that intentionally spans
the generator (`cli/`), the platform runtime package (`app-shell-core`), the test
harness config, and docs.

This branch lands **tooling + logic only**. It does **not** change runtime
behavior: the generated slices and `core.*` dictionaries are deliberately NOT
committed yet, the `WindowLabelsProvider` is not mounted anywhere, and
`LocaleProvider` still loads both locales eagerly. Activation (lazy `core.*`,
provider mounting, slice commit) is the Phase-2B follow-up.

## Domains Touched

| Domain | Files | Justification |
|--------|-------|---------------|
| `generator-change` | `cli/src/slice-labels.js` (new), `cli/src/regen-all.js`, `cli/src/validate-pipeline.js`, `cli/test/slice-labels.test.js`, `cli/test/validate-pipeline.test.js`, `cli/test/fixtures/pipeline-validator/**` | New build-time label slicer + `core.<locale>.json` emitter, wired into `make regen` (per-window slice in the loop, core emitted once after). New **F18** validator rule (stale-slice detection, shadow-mode) with fixtures and tests. |
| `app-shell-core` | `packages/app-shell-core/src/i18n/resolveLabel.js`, `useLabel.js`, `WindowLabelsProvider.jsx` (new), `index.js`, `__tests__/**` | Resolution layer: `resolveLabel` gains an optional `windowSlice` source (`override → slice → monolith → null`); new `WindowLabelsProvider`/`useWindowLabels`; `useLabel` threads the slice. Backward-compatible — with no provider mounted, behavior is identical to today. |
| `platform-change` | `tools/app-shell/vitest.config.js` | Add one scoped `include` glob so the app-shell-core i18n `.vitest.jsx` tests actually run (they had no runner; a previously-orphaned test now executes too). Test-config only, additive. |
| `repo-infra` | `docs/superpowers/specs/2026-06-23-efficient-localization-design.md` (new), `docs/pipeline-validator-reference.md`, `docs/plans/ETP-4300-cross-domain.md` | Design spec (reviewed), F18 documented in the canonical validator reference, and this cross-domain plan. |

## Risk Assessment

- **No runtime behavior change in this branch.** Slices and `core.*` are not
  committed; `WindowLabelsProvider` is not mounted; `LocaleProvider` is unchanged.
  `resolveLabel`/`useLabel` accept an optional window slice that is `null` in the
  absence of a provider, so resolution falls through to the monolith exactly as
  before (verified: the 157 existing i18n tests still pass).
- **F18 is shadow-mode.** It SKIPs when a window's `labels.js` is absent (the
  current state), so it cannot block any existing window; it begins enforcing only
  as slices are committed (Phase 2). Modeled on F16 (deterministic regenerate-and-
  compare), so the rule and the slicer cannot disagree.
- **`make regen` wiring is additive.** The slice step runs after frontend
  generation; `core.*` emission is idempotent and pure (no DB), safe under
  `--only` / `--skip-extract`.
- **vitest.config glob** is narrowly scoped to `packages/app-shell-core/src/i18n/__tests__/*.vitest.{js,jsx}`; it does not pull in other (pre-existing, unrelated) orphaned `.vitest.jsx`.
- No DB writes, no NEO push, no `export.database`, no dependency changes.

## Tests

- `node --test cli/test/slice-labels.test.js` — 53 pass (slicer pure functions).
- `node --test cli/test/validate-pipeline.test.js` — 73 pass (incl. 5 new F18 tests; 68 pre-existing still green).
- `node --test packages/app-shell-core/src/i18n/__tests__/*.test.js` — 157 pass (incl. 14 new `resolveLabel` window-slice tests).
- Vitest — `WindowLabelsProvider.vitest.jsx` + `useLabel-window-slice.vitest.jsx` (14 tests) pass.
- `make validate-pipeline` — F18 skips cleanly (no committed slices yet); no new violations introduced.

## Rollback

1. Revert the commits on `feature/ETP-4300` in `etendo_schema_forge`.
2. No `com.etendoerp.go` changes, no DB/NEO state, no `export.database` — nothing
   to undo there.
3. Because nothing in this branch is consumed at runtime (no provider mounted, no
   slices committed, F18 in shadow), reverting is a clean no-op for end users.
