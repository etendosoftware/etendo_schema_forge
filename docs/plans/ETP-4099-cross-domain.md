# ETP-4099 — Cross-domain plan

<!-- Justifies why this branch intentionally spans multiple monorepo domains. -->

## Summary

ETP-4099 delivers the Bank Reconciliation **matching rules** feature: a new
generic `list-modal` layout (list + modal CRUD, no drill-in), the `match-rule`
window, and the supporting backend (AD table + W spec + validation hook in
`com.etendoerp.go`). Because the feature introduces a brand-new generic layout
type, it necessarily touches several domains at once.

## Domains touched

- **platform-change** — shared contract-ui components for the new layout:
  `ListModalWindow`, `listModalCells`, `ListModalToolbarFilter`, plus
  `EntityForm`/`SelectorInput` (white inputs, `placeholderKey`,
  `emptyOptionLabelKey`) and two reusable primitives `InfoBanner` and
  `PillToggle`. Also nav wiring (`menu.json`, `registry.js`,
  `FinancialAccountsPage`, `AccountsToolbar`).
- **generator-change** — `generate-contract.js`, `generate-frontend.js`,
  `resolve-curated.js` emit the `list-modal` config and the
  `placeholderKey` / `emptyOptionLabelKey` field props.
- **app-shell-core** — i18n keys for the match-rule window (es/en).
- **window:match-rule** — artifacts (decisions / contract / generated) for the
  new window.
- **window:assets** — `AssetsDetailPanel` refactored to consume the shared
  `PillToggle` (single source for the toggle; no behavior change).
- **repo-infra / docs** — `decisions-reference.md`, `window-templates.md`,
  generated window docs.
- **window:fiscal-models** — test-only and incidental: stabilizes a pre-existing
  flaky `useFiscalAutoCompute` test (load race; asserts on `computedMap` inside
  `waitFor` instead of the call count) that blocked this branch's pre-push.

## Tests

- `tools/app-shell`: vitest contract-ui suite (`ListModalWindow`,
  `listModalCells`, `ListModalToolbarFilter`, `EntityForm`, `SelectorInput`) +
  assets suite — green.
- `cli`: node tests for the list-modal generators + wiring-completeness — green.
- Backend: `MatchRuleHandler` validation (regex timeout, priority uniqueness) —
  JUnit pending (tracked separately).

## Rollback

Revert the two ETP-4099 commits (schema_forge + com.etendoerp.go). The DB
column rename (`C_GLItem_ID → C_ElementValue_ID`) is reverted by restoring the
prior AD model XML and re-running `export.database`; no data migration is
required (the column held no data).
