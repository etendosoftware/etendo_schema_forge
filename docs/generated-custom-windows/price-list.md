# Price List

## Intent
This window lets a user maintain a price-list header and then manage the product prices attached to that price list.

On `origin/develop`, the generated contract was expanded to model `priceListVersion` and `productPrice`, but the user-visible SPA still routes the detail area through the custom `Product Price` workspace. In practice, the visible workflow is still: save the price-list header first, then manage product prices for the hidden version that the custom panel resolves for that header.

## What this window should allow
- Create, review, and update price-list headers.
- Identify whether a price list is sales-oriented, tax-inclusive, cost-based, and default.
- Toggle whether the price-list header is active. The `Activo` (AD column `IsActive`) checkbox is shown in the header detail form only (not as a list column) — classified as `editable` with `form: true, grid: false` in `decisions.json`.
- Open an existing price list and inspect the product prices associated with it.
- Add a product to the selected price list and define its `Unit Price` and `List Price`.
- Select an existing product-price row, edit the two visible price fields from the side panel, and delete the row when it is no longer needed.
- Search the header list by price-list name and the custom pricing area by product.

## Interaction model
- **Route:** `/price-list` and `/price-list/:recordId`.
- **Visibility:** visible from the `System` section in `tools/app-shell/src/menu.json`.
- **Implementation type:** custom window. `tools/app-shell/src/windows/registry.js` still registers both generated and custom loaders for `price-list`, and the custom loader takes precedence.
- **Window shape:** master-child. The visible master entity is `priceList`, but the visible detail area is not the generated `Price List Version` grid. The custom wrapper disables the generated detail entity and injects a custom `Product Price` workspace instead.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies
- The pricing area depends on the header being saved first. When the record has no persistent id yet, the UI shows a save-first message instead of allowing line maintenance.
- After the header exists, the version id is read directly from `data.priceListVersion` on the header record. `PriceListHeaderHandler` (registered via `javaQualifier: "priceListHeaderHandler"` in `decisions.json`) injects this field into every GET response — both single-record and list — eliminating a second round-trip to `/priceListVersion?parentId=<priceListId>`.
- All the lifecycle of the hidden version lives in `PriceListHeaderHandler.afterHandle()` and only fires when the request enters via NEO Headless, so Etendo Classic / Enterprise users are not affected: on POST it auto-creates the version + schema if missing; on PATCH/PUT it syncs the version name with the price list name; on GET it injects the resolved version id.
- An additional `PriceListVersionHandler` (registered via `javaQualifier: "priceListVersionHandler"` on the `priceListVersion` entity) intercepts POSTs to `/priceListVersion` and returns 409 if the price list already has a version, blocking accidental duplicates from any GO API caller without affecting Classic.
- `PriceListVersionResolver` returns the first version and logs a warning if more than one is ever found (defensive, no enforcement).
- If no hidden version exists yet (e.g., price list was created outside Etendo Go), the UI shows an explicit empty state: product prices cannot be shown until that hidden version exists.
- Adding a row depends on that hidden version id. The add flow requires `Product`, `Unit Price`, and `List Price`, scopes the product selector with `parentId=<versionId>`, and posts `priceLimit: 0` together with the visible values.
- Selecting a row opens a `Price Detail` side panel with `Product` shown read-only and `Unit Price` / `List Price` editable. Saving or deleting from that panel refreshes the table immediately afterward.
- The merged generated contract now contains separate `priceListVersion` and `productPrice` entities, including version-level fields such as `Valid From Date`, `Price List Schema`, and `Base Version (Default)`, plus classic actions for `create` and `generatePriceListVersion`. The current custom wrapper suppresses those generated version surfaces, so those fields and actions are not visible from the live price-list page.

## Gap assessment
- Etendo Go assumes one version per price list but does not block multi-version scenarios at the persistence layer (so Classic / Enterprise users are not affected). If a price list created or edited in Classic ends up with multiple versions, the GO frontend silently picks the first one and a warning is logged in the server.
- `origin/develop` now models `productPrice` with additional generated fields such as `Cost` and `Algorithm`, but the custom workspace still exposes only `Product`, `Unit Price`, and `List Price`.
- The custom add flow still hardcodes `priceLimit: 0`. The current inspected code does not explain whether that is a business rule or just a technical default.
- The generated contract now declares version-level classic actions, but the current custom SPA does not surface any visible control for creating or generating price-list versions.

## Manual verification
1. Open `/price-list` from the `System` menu and confirm the list shows existing price lists.
2. Open `/price-list/new` and confirm the detail area says the price list must be saved before products can be managed.
3. Save a new price-list header and confirm the screen either resolves the custom product-pricing table or shows the explicit hidden-version warning.
4. Open `/price-list/<recordId>` for a record with product prices and confirm the detail area behaves as a custom `Product Price` workspace, not as a generated `Price List Version` grid.
5. Click `+ Add Product` and confirm the add row captures `Product`, `Unit Price`, and `List Price` only.
6. Select an existing row and confirm the `Price Detail` side panel shows read-only `Product` plus editable `Unit Price` and `List Price`, with save and delete actions.
7. Confirm there is no version switcher in the GO UI. If extra versions exist (e.g., created via Classic), the GO page transparently uses the first one returned by `PriceListVersionResolver` and the server logs a warning.
8. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence
- `origin/develop` commit `19f31dd4` regenerated the price-list window to add generated `priceListVersion` / `productPrice` entities and version-level actions.
- `origin/develop:tools/app-shell/src/windows/custom/price-list/index.jsx` keeps the user-visible page on the custom `Product Price` workspace by disabling the generated detail surface.
- `artifacts/price-list/decisions.json` now sets `javaQualifier: "priceListHeaderHandler"` on the `priceList` entity, wiring the GET response through `PriceListHeaderHandler`.
- `tools/app-shell/src/windows/custom/price-list/PriceListProductPrices.jsx` reads `data.priceListVersion` directly from the header record (no separate `/priceListVersion` fetch); shows the visible behavior: save-first gating, version-id-from-record, product-scoped add row, `Price Detail` side panel, and refresh-after-save/delete.
- `modules/com.etendoerp.go/src/.../PriceListHeaderHandler.java` owns the GO-specific version lifecycle: auto-creates the version on POST, syncs the version name on PATCH/PUT, and injects `priceListVersion` on GET responses (single-record and batch).
- `modules/com.etendoerp.go/src/.../PriceListVersionHandler.java` rejects duplicate `/priceListVersion` POSTs with 409 at the GO API boundary (Classic UI is unaffected).
- `modules/com.etendoerp.go/src/.../PriceListVersionResolver.java` centralizes the single-version lookup used by both handlers and warns when more than one version is found, without blocking Classic functionality.
- `artifacts/price-list/contract.json` now defines `priceListVersion`, `productPrice`, their selectors, and the version-level classic actions that exist in generated metadata but are not exposed by the custom wrapper.
- `artifacts/price-list/generated/web/price-list/PriceListPage.jsx`, `PriceListVersionForm.jsx`, and `ProductPriceForm.jsx` show the regenerated baseline the custom wrapper is bypassing.
- The generated `PriceListPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `M_PriceList` AD table.
## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; this window has no required header fields so the array is empty and there is no behavioral change.
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.

- **ETP-4103 — Generator fix (labelOverrides deduplication)**: `const labelOverrides` in the generated page now references `api.labelOverrides` instead of re-embedding the full object. No functional change — field labels and selectors behave identically.
