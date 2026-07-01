# ETP-4265 — Cross-Domain Plan

## Domains affected

| Scope | Files |
|---|---|
| `platform-change` | `tools/app-shell/src/components/contract-ui/ListFilterBar.jsx`, `tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx` |
| `app-shell-core` | `packages/app-shell-core/src/locales/en_US.json`, `packages/app-shell-core/src/locales/es_ES.json` |
| `window:sales-invoice` | `e2e/tests/flows/sales-invoice-overdue-filter.spec.js` |

## Reason for cross-domain change

Both `ListFilterBar` and `InlineLinesPanel` are generic platform components used across all windows.
The E2E test file (`sales-invoice-overdue-filter.spec.js`) needed to be updated to reflect the removal
of the `title` attribute from the filter button (replaced by `data-testid`), which is a direct consequence
of the platform-level change. The i18n keys are required by the platform components.

## Tests

- E2E: `e2e/tests/flows/sales-invoice-overdue-filter.spec.js` — all 4 tests pass.
- All 18 `inlineEditable` windows benefit from the click-to-edit change with no per-window test changes needed.

## Rollback

Revert the commit `Feature ETP-4265: Filter button label and click-to-edit inline rows`.
No DB migrations, no config changes — purely UI/component code.
