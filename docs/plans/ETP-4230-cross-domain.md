# ETP-4230 — Cross-domain plan

**Feature:** Fix spec amortization — line `asset` default bug, header `name`
and `accountingDate` defaults.

This PR is scoped to the `amortization` window artifacts. It is declared
cross-domain because the backend fixes that make these AC pass live in the
`com.etendoerp.go` module (a separate repo, committed in parallel under the same
branch). No shared Schema Forge components, generators, or other windows are
modified in this repo.

## Domains touched

### `window:amortization`

- `artifacts/amortization/decisions.json` — two changes:
  1. `entities.header.javaQualifier: "amortizationHeaderHandler"` — wires the new
     backend handler that computes the dynamic `name` default.
  2. `entities.header.fields.accountingDate.defaultExpr: "@#Date@"` — sets the
     NEO default for the accounting date to the current system date.
- `artifacts/amortization/contract.json`, `artifacts/amortization/contract.mcp.json`
  — regenerated to reflect the decisions changes. No structural change beyond the
  new `javaQualifier` / default.
- `docs/generated-custom-windows/amortization.md` — updated with the ETP-4230
  section (line asset fix, header defaults, deferred FK note).

### Backend (com.etendoerp.go — parallel repo, same branch)

- `NeoDefaultsService.java` — generic fix so the link-to-parent default only
  applies to the column referencing the parent tab's table (fixes the line
  `asset` returning the header id).
- `AmortizationHeaderHandler.java` (new) — computes the dynamic header `name`
  default on the `DEFAULTS` endpoint from the `assetId` query param.
- `ETGO_SF_ENTITY.xml`, `ETGO_SF_FIELD.xml` — sourcedata reflecting the
  `javaQualifier` and `@#Date@` default after `push-to-neo` + `export.database`.

## Tests

- `AmortizationHeaderHandlerTest` — 14 unit tests: dynamic name from asset,
  fallback when `assetId` absent / asset not found / name empty, null date,
  CP-B6 no-overwrite guard, non-DEFAULTS pass-through. All pass.
- `NeoDefaultsServiceTest` — 5 new tests for the parent-link discriminator,
  including the key case where `A_Asset_ID` → false (locks in the bug fix).
  All pass.
- Full module test run via gradle: 0 failures (compiles + green).

## Rollback

- **Header defaults:** remove `javaQualifier` and `accountingDate.defaultExpr`
  from `decisions.json`, re-run `make regen ONLY=amortization PUSH_TO_NEO=1`,
  run `./gradlew export.database`. No data loss — defaults only affect the
  defaults endpoint, not persisted records.
- **Backend handler:** delete `AmortizationHeaderHandler.java`; the `name`
  default reverts to empty. Revert `NeoDefaultsService.java` to restore the
  previous link-to-parent behavior. No persisted data is affected.
- **Doc:** revert the ETP-4230 section in `amortization.md`.

## Out of scope (deferred)

- Issue 3 — direct FK from the amortization header to the asset. Requires a new
  AD column on `A_Amortization`; tracked as a follow-up pending the column
  creation decision.
