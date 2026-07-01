# ETP-4232 — Cross-domain plan

**Feature:** New `POST /amortization/generate-plan` MCP endpoint + `businessCritical`
per-field advisory flag in `neo_schema` (ETP-4233 absorbed into this branch).

This PR touches the Schema Forge pipeline (generator changes, window:assets artifacts)
and the `com.etendoerp.go` module (new Java service, DB model column, MCP wiring).

## Domains touched

### `generator-change`

- `cli/src/resolve-curated.js` — add `businessCritical` to the per-field whitelist so
  it flows from `decisions.json` into the curated field object.
- `cli/src/generate-contract.js` — emit `businessCritical` in both `frontendContract`
  and `backendContract` field objects; also exposes it to `push-to-neo`.
- `cli/src/push-to-neo.js` — include `businessCritical` in `extractFieldsFromContract`
  projection and `fieldParams` sent to the DB upsert.
- `cli/src/neo-writer.js` — add `ISBUSINESSCRITICAL` column to the `ETGO_SF_FIELD`
  INSERT/UPDATE SQL.

### `repo-infra`

- `docs/decisions-reference.md` — document the new `businessCritical` per-field key.

### `window:assets`

- `artifacts/assets/decisions.json` — mark 12 fields `businessCritical: true`:
  `assetCategory`, `depreciationType`, `calculateType`, `annualDepreciation`,
  `amortize`, `usableLifeYears`, `usableLifeMonths`, `depreciationStartDate`,
  `assetValue`, `residualAssetValue`, `depreciationAmt`, `previouslyDepreciatedAmt`.
- `artifacts/assets/contract.json`, `artifacts/assets/contract.mcp.json` —
  regenerated to reflect the new flags. No structural change beyond the new field.

### Backend (com.etendoerp.go — parallel repo, same branch)

- `AmortizationPlanService.java` (new) — validates asset, fires native `A_Asset_Post`
  process via `NeoProcessService`, reads back the plan, returns structured output.
- `NeoBuiltInEndpointHandler.java` — REST route `POST /sws/neo/amortization/generate-plan`.
- `McpToolRouter.java` + `ToolRegistry.java` + `McpConstants.java` — MCP tool
  `neo_generate_amortization_plan` wiring.
- `McpToolRouterSupport.java` — `loadFieldMetadata` / `buildSchemaField` emit
  `businessCritical` bool per field in the `neo_schema` response.
- `ETGO_SF_FIELD.xml` (model) — new column `ISBUSINESSCRITICAL CHAR(1) DEFAULT 'N'`.
- `AD_ELEMENT.xml`, `AD_COLUMN.xml`, `sourcedata/ETGO_SF_FIELD.xml` — AD entries and
  full sourcedata export (117 rows tagged; 12 with `Y`, rest `N`).

## Tests

### Schema Forge (JS)
- `cli/test/push-to-neo.test.js` — regression guard: `extractFieldsFromContract`
  preserves `businessCritical` flag (was the exact bug fixed). 42 pass.
- `cli/test/resolve-curated.test.js` — flag flows from decision to curated field.
  16 pass.
- `cli/test/generate-contract.test.js` — flag in both frontendContract and
  backendContract; truthy-only (no false noise). 144 pass.

### Etendo Go (Java)
- `AmortizationPlanServiceTest.java` — 20 cases: 400/404/409/500 validations, happy
  path TI+PE, currency null-safe, all JSON output fields. Compiles; suite blocked by
  pre-existing error in unrelated `psd2` module.
- `NeoBuiltInEndpointHandlerTest.java` — 9 new cases: REST glue interception,
  POST-only, happy path, error propagation, invalid JSON. 48/48 pass.
- `McpToolRouterSupportTest.java` — 6 new cases: `businessCritical` true/false/null
  in `buildSchemaField` and `loadFieldMetadata`. Compiles clean.
- `ToolRegistryGenerateToolsTest.java`, `McpToolRouterRouteTest.java` — coverage for
  `neo_generate_amortization_plan` tool registration and routing.

## Rollback

- **generate-plan endpoint:** delete `AmortizationPlanService.java`; remove the
  `neo_generate_amortization_plan` case from `McpToolRouter` and `ToolRegistry`;
  remove the `generate-plan` route from `NeoBuiltInEndpointHandler`. No persisted
  data affected — the endpoint only reads and fires a native process.
- **businessCritical flag:** remove the flag from `decisions.json` for the 12 fields,
  re-run `make regen ONLY=assets PUSH_TO_NEO=1` + `./gradlew export.database`. The
  `ISBUSINESSCRITICAL` column stays in the DB (harmless `N` for all rows). To remove
  the column entirely: drop via migration script + revert model XML + export.

## Notes

- `required="false"` on `ISBUSINESSCRITICAL` is intentional: Etendo's tooling does not
  apply nullability changes to existing columns. The Java consumer uses
  `Boolean.TRUE.equals(...)` throughout — fully null-safe. Default `N` ensures no
  nulls in practice.
- `neo_schema` is MCP-only; the acceptance criteria CPs (E1/E2/E3) must be validated
  via MCP, not REST.
