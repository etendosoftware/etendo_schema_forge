# Window Doc Freshness Gate

> **Status:** APPLIED in repository automation
> **Last updated:** 2026-04-23

## Context

This repository already requires behavior and documentation to move together, but window work had no deterministic check that tied a changed window to its functional guide under `docs/generated-custom-windows/`.

That gap was easy to miss during artifact regeneration or custom window edits: a PR could change `artifacts/<window>/...` or `tools/app-shell/src/windows/custom/<window>/...` and leave the corresponding functional guide stale.

## Decision

Add a dedicated GitHub Actions gate in `.github/workflows/window-doc-freshness.yml` backed by a zero-dependency CLI script in `scripts/check-window-docs.js`.

The workflow runs on pull requests only and takes the PR base and head as the diff range, then checks whether a diff changes a specific window without also changing `docs/generated-custom-windows/<window>.md` in the same range.

For now the check is warning-only: it emits a workflow warning and leaves a single bot-managed comment on the PR with the latest missing-doc report. When the warning is resolved, that managed comment is deleted.

## Detection scope

- `artifacts/<window>/...`
- `tools/app-shell/src/windows/custom/<windowDir>/...`

`<windowDir>` is normalized to kebab-case so hand-written folders like `businessPartner/` still map to `business-partner.md`.

Shared docs and shared custom helpers are intentionally excluded from satisfying the gate:

- `docs/generated-custom-windows/app-shell-functional-flows.md`
- `docs/generated-custom-windows/INDEX.md`
- `tools/app-shell/src/windows/custom/shared/...`

That keeps the rule strict for per-window documentation while avoiding false positives from generic shell work that does not identify a single affected window from the path alone.

## Contributor workflow

Before changing a window:

1. Find the existing functional guide through `docs/generated-custom-windows/INDEX.md`.
2. Change the window code/config.
3. Update the matching `docs/generated-custom-windows/<window>.md` file in the same change.

If the script finds a window without an existing doc file, it fails with a `Create docs/generated-custom-windows/<window>.md` instruction instead of silently passing.

## Files involved

- `.github/workflows/window-doc-freshness.yml`
- `scripts/check-window-docs.js`
- `scripts/__tests__/check-window-docs.test.js`
- `docs/generated-custom-windows/INDEX.md`
