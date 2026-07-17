# Tax Category

## Intent
Define reusable tax-category records that group related tax-rate definitions under a named category, so that transactional documents can reference a category rather than individual rates.

## What this window should allow
Users should be able to review and update tax-category definitions. Creating a new tax-category record from the list view is disabled (`window.hideCreate: true`) and deleting records is disabled at both the API level (`window.hideDelete: true`) and in the UI (`window.hideDeleteButton: true`) — new categories are provisioned outside this window. From the current generated form and decisions, the visible window allows a user to:

- name the tax-category record
- add an optional description
- mark a category as the system default
- flag the category as applying to bills-of-materials (`As per BOM`)
- choose the tax type (enum)
- choose the transaction type (enum)
- choose the rate type (enum)
- flag whether the category is SII-declarable (`SII declarable` / `aeatsiiDeclarable`)

## Interaction model
- **Route:** `/tax-category` and `/tax-category/:recordId`.
- **Visibility:** visible from the `Settings` group in `tools/app-shell/src/menu.json` (window ID `138`).
- **Implementation type:** generated window loaded through `tools/app-shell/src/windows/registry.js`.
- **Window shape:** single-entity window (`taxCategory`) with no child entities and no declared process endpoints.
- **Screen chrome:** print and the generic More menu are hidden (`hidePrint: true`, `hideMoreMenu: true`). The list toolbar hides the generic Create/New button (`hideCreate: true`) and the Delete affordance is hidden in both the list-row hover actions and the detail toolbar (`hideDeleteButton: true`), with delete also disabled at the contract/API level (`hideDelete: true`).

## Reactive behavior and dependencies
This is a standalone definition window. No parent/child behavior is visible in the current implementation. The visible fields are independent — changing one does not trigger callouts or defaults on others.

The `default` boolean marks one category as the system-wide default for new documents. Only one category should carry this flag in practice, but no UI-level guard enforces uniqueness; enforcement happens at the database or application layer.

## Gap assessment
- The window captures category classification inputs, but the current evidence does not show how tax types, transaction types, and rate types feed into downstream documents or tax-calculation logic.
- No validation rules are visible that prevent invalid combinations of tax type, transaction type, and rate type.
- The SII-declarable flag links to the Spanish e-invoicing submission system, but no in-app guidance is shown for when to set it.

## Manual verification
1. Open `/tax-category` from the Settings menu and confirm the list view loads.
2. Confirm the list shows the `Name` and `Default` columns.
3. Open `/tax-category/<recordId>` and confirm the form exposes: `Name`, `Description`, `Default`, `As per BOM`, `Tax type`, `Transaction type`, `Rate type`, and `SII declarable`.
4. Confirm the list toolbar does NOT show a Create/New (`+`) button.
5. Hover a list row and confirm the Delete (trash) icon is NOT present in the row quick actions.
6. Open `/tax-category/<recordId>` and confirm the detail toolbar does NOT show a Delete button.
7. Confirm print and More actions are not present in the detail view chrome.

## Create/Delete disabled — ETP-4464

Applied the same combo used on the `tax` window to Tax Category:

- `window.hideCreate: true` — removes the Create/New button from the list toolbar.
- `window.hideDeleteButton: true` — hides the Delete button/icon in BOTH the detail toolbar (`DetailView.jsx`) and the list-row hover actions (`RowQuickActions.jsx`, via `DataTable`'s `rowQuickActions.hideDeleteButton`), for every record regardless of status.
- `window.hideDelete: true` — disables the CRUD delete capability at the contract/API level (defense in depth).

Generator support ships in `@etendosoftware/schema-forge-cli@0.3.6` (already installed). Regenerated via `make regen ONLY=tax-category SKIP_EXTRACT=1`. `artifacts/tax-category/generated/web/tax-category/TaxCategoryPage.jsx` now emits `hideCreate` and `hideDeleteButton` on `ListView`, `rowQuickActions={{"hideDeleteButton":true}}` on the list table, and `hideDeleteButton` on `DetailView`; `contract.json` exposes `apiPrediction.crud.taxCategory.delete: false`. `sf-validate-pipeline --scope=tax-category` reports 0 violations.
