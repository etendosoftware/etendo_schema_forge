# ETP-4229 — Cross-domain plan

**Feature:** Fix spec assets: defaults + callout depreciationEndDate.

This PR is approved as cross-domain because it touches `docs/decisions-reference.md`
(repo-infra docs) alongside window-specific artifacts for `assets`. The doc change
documents pre-existing `processOverrides` properties (`columnName`, `requiresLines`,
`requiresFieldMax`) that were already supported by the generator but undocumented.
No shared components, generators, or other windows are modified.

## Domains touched

### `repo-infra`

- `docs/decisions-reference.md` — added documentation for three pre-existing
  `processOverrides` properties that were supported by `generate-frontend.js` but
  never documented: `columnName`, `requiresLines`, `requiresFieldMax`. No behavior
  change — documentation only.

### `window:assets`

- `artifacts/assets/decisions.json` — two changes:
  1. `entities.assets.fields.depreciate.defaultExpr: "Y"` — sets the NEO default
     so `neo_defaults` returns `depreciate: true` instead of null.
  2. `entities.assets.fields.calculateType.defaultExpr: "TI"` — sets the NEO
     default to Time-based instead of the wrong Percentage value.
  3. `entities.assets.javaQualifier: "assetsHandler"` — wires the new
     `AssetsHandler` CDI bean to the assets entity.
- `artifacts/assets/contract.json`, `artifacts/assets/contract.mcp.json` —
  regenerated to reflect the above decisions changes. No structural change.

## Tests

- `AssetsHandlerTest.java` — 26 new unit tests covering POST, PATCH (partial and
  full), OBDal fallback, tolerant numeric parse, null/missing record, invalid date,
  and zero usableLifeMonths. All pass.
- `NeoDefaultsServiceTest.java` — 11 new tests for `coerceBooleanDefault`: null
  entity, non-String value, null property, non-primitive, null type, non-Boolean
  type, `"Y"` → true, `"true"` → true, `"N"` → false, `"false"` → false,
  exception caught. All pass.
- Full test suite: 141 tests, 0 failures.

## Rollback

- **Defaults:** remove `defaultExpr` entries from `decisions.json` for `depreciate`
  and `calculateType`, re-run `make regen PUSH_TO_NEO=1`, run
  `./gradlew export.database`. No data loss — defaults only affect new records.
- **AssetsHandler:** remove `javaQualifier` from `decisions.json`, re-run the same
  pipeline, and delete `AssetsHandler.java`. `depreciationEndDate` reverts to
  manual-only entry. No existing records are affected.
- **Doc change:** revert the three added rows in `docs/decisions-reference.md`.
  No functional impact.
