# ETP-4239 — Cross-domain plan: financial-account R→W (agentic accounts)

## Summary

Convert the `financial-account` NEO spec from report-style (`SPEC_TYPE=R`, handler-routed
`?action=` endpoints) to a generic **W (window) spec** over the core Financial Account AD
window, so MCP agents can list and create financial accounts (Bank/Cash/Card) through the
standard `neo_list` / `neo_create` tools. The business logic of the former handler moves to
a `NeoHandler` pre/post hook (`financialAccountHeaderHandler`), and the MCP write path is
wired through entity hooks (it previously bypassed them for ALL specs).

## Domains touched

| Repo | Changes |
|------|---------|
| `schema_forge` (frontend + tooling) | `artifacts/financial-account/decisions.json` (javaQualifier, required name/currency, country→system) + regenerated `contract.json`; `tools/app-shell/src/hooks/useAccountMutations.js` rewritten to W CRUD URLs (`POST/PUT/DELETE /sws/neo/financial-account/account[...]`, selector+defaults for currencies); hook vitest rewritten; e2e mocked spec routes migrated; window doc updated. |
| `com.etendoerp.go` (runtime) | `FinancialAccountHandler` refactored from `?action=` router to W pre/post hook (`@Named("financialAccountHeaderHandler")`): POST validates + injects `country` (from IBAN) and default `matchingAlgorithm` into the body pre-insert; PUT/PATCH name-uniqueness + IBAN→country sync; DELETE soft-archive with open-reconciliations guard. `McpToolRouter` runs entity `NeoHandler` hooks around `neo_create`/`neo_update`/`neo_delete` (parity with the REST CRUD path). `FinancialAccountHandlerTest` rewritten to the hook contract. |

Both changes are one feature: the W spec only works end-to-end with the hook + MCP wiring
on the runtime side and the decisions/contract + SPA rewrite on the schema_forge side.

## Tests

- `tools/app-shell` vitest: `useAccountMutations.vitest.jsx` rewritten (20 tests) + 4 consumer
  suites verified unchanged (52 passing total).
- `e2e/tests/flows/financial-account-create.mocked.spec.js` route mocks migrated to W endpoints.
- `com.etendoerp.go` JUnit: `FinancialAccountHandlerTest` rewritten to the hook contract
  (routing, create validation/enrichment incl. country-from-IBAN and matching-algorithm
  injection, update sync, soft-archive paths).

## Rollback

Revert both branches (`feature/ETP-4239` in each repo). DB-side: re-run
`push-to-neo financial-account --type report` semantics do not apply — restore the previous
`ETGO_SF_SPEC/ENTITY` sourcedata XML (spec back to `SPEC_TYPE=R`, qualifier
`financial-account`) and re-import; the pre-ETP-4239 handler restores the `?action=` API.
