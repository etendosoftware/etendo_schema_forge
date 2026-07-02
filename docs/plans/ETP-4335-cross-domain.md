# Cross-Domain Plan — ETP-4335: Asset Category window

## Domains

| Domain | Files | Reason |
|--------|-------|--------|
| `window:asset-group` | `artifacts/asset-group/**` | New window onboarded from scratch |
| `platform-change` | `tools/app-shell/src/menu.json`, `tools/app-shell/src/windows/registry.js` | Register window in Finance menu and lazy-load registry |
| `app-shell-core` | `packages/app-shell-core/src/locales/en_US.json`, `es_ES.json` | i18n labels for window title, new-record button, and field labels |
| `generator-change` | `cli/config/regen-windows.json` | Register window for `make regen` |
| `docs` | `docs/generated-custom-windows/asset-group.md`, `INDEX.md` | New window guide + index entry |

## Tests

- `make validate-pipeline --scope=asset-group` → 0 violations (run and verified before push).
- Manual smoke test: create Asset Group record via NEO Headless API (POST `/sws/neo/asset-group/assetCategory`) → HTTP 200, record persisted with Etendo DAL defaults.
- Manual UI test: Finance → Asset Category shows list with Name + Description columns; detail form shows Name, Description, Depreciate checkbox with conditional depreciation-type fields; Accounting subtab with inline editing.

## Rollback

1. Revert this commit in both `schema_forge` and `com.etendoerp.go`.
2. Run `push-to-neo.js asset-group --delete` (or manually delete the `ETGO_SF_SPEC` row with id `71B73430E9AF4CCFA52FF7037D6C150D`) to remove the NEO spec.
3. Run `./gradlew export.database` in Etendo root to persist the deletion.
4. The `asset-group` entry in `menu.json` and `registry.js` is removed by the revert — no further action needed for the frontend.
