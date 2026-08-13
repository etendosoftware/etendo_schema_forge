# ETP-4177 — Cross-domain plan

**Feature:** SaaS scalability — system-level taxes. Fixes for 303/349 fiscal model
handling for new SaaS tenants (TaxesOrg), plus i18n fix for the 349 no-operators
badge and a pipeline scoping fix in the push-to-neo.js generator.

This PR is approved as cross-domain because the 349 badge fix unavoidably touches
the shared i18n catalog, the generator fix touches the CLI pipeline layer, and the
investigation document belongs to repo-infra. The changes are small and each
addresses a distinct part of the same ETP-4177 scope.

## Domains touched

### `app-shell-core` (shared i18n)
- `packages/app-shell-core/src/locales/en_US.json` — adds `fm.result.info: "No operators"` key.
- `packages/app-shell-core/src/locales/es_ES.json` — adds `fm.result.info: "Sin operadores"` key.

The `fm.result.info` translation key was missing, causing the 349 list badge to
display the raw key string `"fm.result.info"` instead of a human-readable label
when a declaration has no intracomunitario operators for the period. By design,
window i18n strings live in the shared catalog and cannot be co-located with the
window component.

### `generator-change` (CLI pipeline)
- `cli/src/push-to-neo.js` — passes `ctx.schemaRawData` to
  `stepExcludeNonContractFields` so field exclusion is scoped only to columns that
  were actually extracted from AD in this run. Columns belonging to uninstalled
  extension modules no longer have their `isIncluded` state toggled by a push
  that did not extract them.
- `cli/src/extract-fields.js` — deterministic `ORDER BY` for AD_Ref_List
  (`NULLS LAST, COLLATE "C"`) to prevent non-deterministic option order across
  databases with different `lc_collate`.

### `repo-infra` (docs)
- `docs/sii-description-autofill-investigation.md` — investigation notes for the
  SII description auto-fill failure on TaxesOrg. Non-functional; documents the
  root-cause investigation for the SaaS onboarding issue.

## Tests

- Existing fiscal-models Vitest suite covers the `ResultCell`/`ResultText`
  components; the i18n key addition is a data-only change with no logic impact.
- Pipeline validator (`make test`) passes — the push-to-neo change does not alter
  the contract schema, only the set of fields considered for exclusion when
  uninstalled module columns are present.

## Rollback

All changes are additive or scoped fixes with no schema migration:

- **i18n:** Remove the two `fm.result.info` lines. The badge falls back to the
  raw key string (harmless, same as before the fix).
- **push-to-neo.js:** Revert the `schemaRawData` parameter threading. Field
  exclusion reverts to considering all known columns regardless of extraction
  scope (previous behaviour).
- **extract-fields.js:** Revert the `COLLATE "C"` / `NULLS LAST` ORDER BY.
  Option order becomes lc_collate-dependent again (acceptable for non-SaaS envs).
- **Investigation doc:** Delete the file (no code impact).
