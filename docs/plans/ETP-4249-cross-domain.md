# ETP-4249 — Cross-domain plan

**Feature:** Tax Category window — onboard the `tax-category` window into NEO
Headless, register it in the navigation menu and app shell, and add E2E window
visibility tests (TC-33–TC-35, TC-37).

This PR is approved as cross-domain because onboarding any new window into the
app unavoidably spans multiple scopes: the window artifact itself
(`window:tax-category`), platform registration (`platform-change`), the
generator window list (`generator-change`), and the matching E2E spec (`e2e`).
All changes are cohesive — they collectively deliver the single `tax-category`
window; no unrelated intent is mixed in.

## Domains touched

### `window:tax-category`

- `artifacts/tax-category/decisions.json` — window configuration.
- `artifacts/tax-category/contract.json`, `contract.mcp.json` — generated contract.
- `artifacts/tax-category/generated/web/tax-category/index.jsx` — generated entry.
- `artifacts/tax-category/generated/web/tax-category/mockCatalogs.js` — mock catalog data.
- `artifacts/tax-category/generated/web/tax-category/mockData.js` — mock row data.
- `artifacts/tax-category/generated/web/tax-category/TaxCategoryForm.jsx` — generated form.
- `artifacts/tax-category/generated/web/tax-category/TaxCategoryPage.jsx` — generated page.
- `artifacts/tax-category/generated/web/tax-category/TaxCategoryTable.jsx` — generated table.

### `generator-change`

- `cli/config/regen-windows.json` — register `tax-category` for `make regen`.
- `core-maps/ad-menu-cache.json` — updated menu cache with the Tax Category entry.

### `platform-change` (app-shell)

- `tools/app-shell/src/App.jsx` — wire `tax-category` mock data into
  `loadAllMockData`.
- `tools/app-shell/src/menu.json` — add Tax Category to the navigation menu
  under the fiscal/taxes group.
- `tools/app-shell/src/windows/registry.js` — register the `tax-category`
  window so the app shell can route to it.

### `e2e`

- `e2e/tests/flows/window-visibility-etp4249.mocked.spec.js` — mocked E2E
  tests covering window visibility test cases TC-33–TC-35, TC-37.

### `docs`

- `docs/generated-custom-windows/tax-category.md` — functional window guide
  (intent, interaction model, field list, manual verification steps).
- `docs/generated-custom-windows/INDEX.md` — index entry for the new guide.

## Tests

- `e2e/tests/flows/window-visibility-etp4249.mocked.spec.js` — Playwright
  mocked spec validating that the Tax Category window is visible and navigable
  under the expected menu path.
- `make regen ONLY=tax-category` is byte-stable (regenerates with no diff).
- `make validate-pipeline` passes with 0 violations.

## Rollback

- **window:tax-category:** remove `tax-category` from `regen-windows.json`,
  `menu.json`, and `registry.js`; remove the `loadAllMockData` entry from
  `App.jsx`; delete `artifacts/tax-category/`. No other window depends on it.
- **generator-change:** revert `regen-windows.json` and `ad-menu-cache.json`
  commits — additive only, no existing window is affected.
- **platform-change:** revert the `App.jsx`, `menu.json`, and `registry.js`
  changes. The changes are strictly additive registrations.
- **e2e:** delete `window-visibility-etp4249.mocked.spec.js`; no shared
  fixtures or helpers were added.
