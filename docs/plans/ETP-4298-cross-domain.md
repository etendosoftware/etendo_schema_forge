# ETP-4298 Cross-Domain Plan — Accounting: Posting & Not Posted Documents

## Purpose

Add posting capability (Post, Unpost, Bulk Post) to key financial and warehouse
windows, introduce a Not Posted Documents cross-window aggregate view, and surface
an accounting status pill on all affected windows. This is a vertical feature slice
that intentionally spans the generator, platform, multiple windows, and i18n.

## Domains Touched

| Domain | Files | Justification |
|--------|-------|---------------|
| `generator-change` | `cli/src/generate-frontend.js`, `cli/src/resolve-curated.js`, `cli/src/validate-pipeline.js`, generator tests | New `statusPills` decisions.json key, `display:yesno` support in `statusBar`, `labelKey` extension. All windows must be regenerated; generator tests updated to cover the new code paths. |
| `platform-change` | `tools/app-shell/src/components/contract-ui/DetailView.jsx`, `tools/app-shell/src/components/contract-ui/RowQuickActions.jsx`, `tools/app-shell/src/hooks/useNeoAction.js`, `tools/app-shell/src/menu.json`, `tools/app-shell/src/windows/registry.js`, related unit tests | `DetailView` extended with `type:'statusPill'` extraBadges branch; `useNeoAction` hook for NEO process calls; Not Posted Documents entry added to menu + registry. |
| `app-shell-core` | `packages/app-shell-core/src/locales/en_US.json`, `packages/app-shell-core/src/locales/es_ES.json` | i18n keys for accounting status (`accountingStatus`, `postedStatus`, `notPostedStatus`) added to both locales. |
| `window:amortization` | `artifacts/amortization/**` | Post/Unpost/Bulk Post actions + accounting status pill + `posted` boolean column. |
| `window:goods-movements` | `artifacts/goods-movements/**` | Same as amortization. |
| `window:goods-receipt` | `artifacts/goods-receipt/**`, `tools/app-shell/src/windows/custom/goods-receipt/index.jsx` | Same as amortization. Grid badge added to custom HEADER_COLUMNS array (custom loader overrides generated table). |
| `window:goods-shipment` | `artifacts/goods-shipment/**`, `tools/app-shell/src/windows/custom/goods-shipment/index.jsx` | Same as amortization. Grid badge added to custom COLUMNS array. |
| `window:physical-inventory` | `artifacts/physical-inventory/**`, `tools/app-shell/src/windows/custom/physical-inventory/index.jsx` | statusPills added to decisions.json for detail view pill; posted badge column added to custom COLUMNS array for grid view; gridOrder set on all 5 header fields. |
| `window:purchase-invoice` | `artifacts/purchase-invoice/**`, `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx` | Same as amortization. Grid badge added to custom columns useMemo array. |
| `window:sales-invoice` | `artifacts/sales-invoice/**`, `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx` | Same as amortization. Grid badge added to custom InvoiceHeaderTable columns useMemo array. |
| `window:sales-order` | `artifacts/sales-order/**` | Same as amortization. |
| `window:simple-g-l-journal` | `artifacts/simple-g-l-journal/**` | Same as amortization. |
| `window:not-posted-documents` | `artifacts/not-posted-documents/**`, `tools/app-shell/src/windows/custom/not-posted-documents/**` | New fully-custom window aggregating unposted documents with single and bulk Post actions. |
| `e2e` | `e2e/tests/flows/not-posted-documents.mocked.spec.js`, `e2e/tests/flows/document-posting.mocked.spec.js` | Mocked Playwright E2E specs for the new window and the posting flow. |
| `repo-infra` | `docs/generated-custom-windows/not-posted-documents.md`, `docs/generated-custom-windows/INDEX.md`, `docs/decisions-reference.md`, `docs/superpowers/plans/`, `cli/src/push-not-posted-documents.js` | Window guide, index entry, decisions reference update, and push helper script. |

## Risk Assessment

- Generator changes affect all windows on next `make regen`; all 8 accounting
  windows were regenerated and verified as part of this task.
- `DetailView.jsx` change is additive (`type:'statusPill'` branch is new code —
  existing `extraBadges` entries are unaffected).
- `useNeoAction` hook is new code with no callers outside the posting buttons.
- i18n keys are additive; no existing key was renamed or removed.
- `statusPills` flows through `WINDOW_TRUTHY_PROPS` — windows that do not declare
  it get an empty `extraBadges` array (no change in behaviour).
- NEO config pushed to `ETGO_SF_FIELD` for all 8 windows; `export.database` run
  and committed in `com.etendoerp.go`.

## Tests

- `make test` — full CLI test suite passes (generator + validate-pipeline tests).
- Vitest — `DetailView.neoAction.test.js`, `DetailView.neoActionMenu.vitest.jsx`,
  `useNeoAction.vitest.js` pass.
- Playwright mocked — `not-posted-documents.mocked.spec.js` (6 flows),
  `document-posting.mocked.spec.js` (posting flow updated).
- Pipeline validator: `make validate-pipeline` clean for all 8 windows.

## Rollback

1. Revert all commits on `feature/ETP-4298` in `etendo_schema_forge`.
2. Revert `Feature ETP-4298: NEO export — posted field + accounting status pill for 7 windows`
   in `com.etendoerp.go` and run `./gradlew export.database` again.
3. The accounting status pill disappears from all windows; Post/Unpost/Bulk Post
   buttons are removed; Not Posted Documents window is unregistered from the menu.
