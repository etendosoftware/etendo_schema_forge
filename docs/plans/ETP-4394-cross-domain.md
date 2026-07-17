# ETP-4394 — Cross-domain plan: LOCAL_CORE dev profile + full regen sync

## Why this change is cross-domain

This branch bundles three independent-but-related change sets that the
domain-boundary check flags as cross-domain because they span repo-infra, a
platform config file, and eight functional windows (plus a sibling-repo XML):

1. **LOCAL_CORE opt-in dev profile** — a new, env-gated way to run the CLI and
   React from a local `../schema_forge_core` checkout instead of the published
   packages. Touches `repo-infra` (Makefile, agents, docs) and one
   `platform-change` file (`tools/app-shell/vite.config.js`), so it inherently
   crosses those scopes. It never changes the default (published) behaviour.
2. **Full-repo regeneration** — re-running the current pipeline surfaced two
   pre-existing, already-merged tooling fixes that had never been re-exported:
   additive `es_ES` enum-option labels (front-only) and the `AD_Column.IsKey`
   primary-key detection fix (commit `cde6d91e2`, 2026-07-01, in
   `schema_forge_core`). Only 8 windows produced a diff; the other 31 regenerated
   identically.
3. **Runtime XML sync** — the IsKey fix materialised into
   `com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_FIELD.xml` (custom-module
   primary keys now exposed under the canonical `id` qualifier). Tracked in the
   sibling repo on the same `feature/ETP-4394` branch.

Splitting per window is not meaningful: the regen is a single deterministic
tooling run, and the LOCAL_CORE infra is a single feature.

> **Related — preview versions.** `LOCAL_CORE` validates the *local core source*
> path but not the *published-package* path (package.json exports, shims resolving
> against the registry). Its complement is the
> [preview versions system](./2026-07-14-preview-package-publishing.md), which
> publishes throwaway `alpha` prereleases so that published-package path can be
> tested without cutting a real `latest` release. Implemented on
> `schema_forge_core@feature/ETP-4394`.

## Domains touched (dominios)

- **repo-infra** — `cli/sf-local` (new CLI dispatcher), `Makefile`
  (`SF_ROOT`, `LOCAL_CORE` gate, `dev-local-core` target), `docs/repo-topology.md`
  (new), `docs/index.md`, `CLAUDE.md`, and the 7 `.claude/agents/*.md` files
  (LOCAL_CORE workflow text).
- **platform-change** — `tools/app-shell/vite.config.js` (LOCAL_CORE alias to
  local core source, honours `SCHEMA_FORGE_CORE`; the `optimizeDeps` exclude stays
  unconditional to keep the CurrencyProvider single-instance fix on the default
  path).
- **window:{amortization, contacts, financial-account, goods-shipment,
  payment-in, payment-out, return-material-receipt, return-to-vendor-shipment}** —
  `contract.json` + `contract.mcp.json` + generated `*.jsx`: contract version
  bump `0.11 → 0.12` and additive `labels.es_ES` on enum options. No visibility,
  readOnly, or field-structure change.
- **com.etendoerp.go (sibling repo)** — `ETGO_SF_FIELD.xml`: `java_qualifier` of
  custom-module primary keys normalised to `id` (SII/TBAI/VeriFactu/PSD2/FIN
  extensions) plus two editable `EM_ETGO_*_Tolerance` fields gaining their
  camelCase qualifier + explicit `isbusinesscritical=N`.

## Tests

- **Pipeline validator** — `make validate-pipeline --scope=<8 windows>` reports
  **0 violations** (14 pre-existing F1/F2 skips, unchanged). The pre-commit hook
  re-ran it on staged artifacts and passed.
- **Regeneration determinism** — `make regen` over all 39 pushable windows:
  39/39 passed, 0 errors; only the 8 windows above produced a diff, confirming the
  run is deterministic and the other 31 are already in sync.
- **No new runtime behaviour** — es_ES labels are front-only (verified: they do
  not appear in the exported XML). The IsKey/`id` change aligns config with what
  the NEO handlers already read (`rec.optString("id")`), so no handler change is
  required.

## Rollback

Single-branch revert per repo, no data migration.

- **LOCAL_CORE infra** — additive and opt-in; reverting the commit removes the
  `sf-local` dispatcher, the `LOCAL_CORE`/`dev-local-core` Makefile plumbing, and
  the vite alias. The default published-package path is untouched, so no
  environment breaks.
- **Regen artifacts** — reverting restores the previous contract version and
  drops the additive es_ES labels; purely front-end, no NEO push implied by the
  revert.
- **Runtime XML** — reverting the `com.etendoerp.go` commit restores the previous
  `java_qualifier` values. Because the handlers already key on `id`, a revert is
  safe; a subsequent `push-to-neo` + `export.database` would re-materialise the
  fix. No schema/DDL change is involved.
