# ETP-4190 — Cross-domain plan

**Feature:** Product window UX polish — image field layout fix, auto-save on
blur, sidebar redesign, ImageField drag & drop + validation, ProductPriceBar
inline redesign, plus visual fixes for the Amortization and Assets windows.

This PR is approved as cross-domain because the changes span shared
`contract-ui` components (`ImageField.jsx`, `EntityForm.jsx`, `ListView.jsx`,
`DetailView.jsx`, `SelectorChip.jsx`), `app-shell-core` locales and icons,
generator tooling, and window-specific changes to Product.

## Domains touched

### `platform-change` (shared contract-ui + platform)

Shared components used by every generated window:

- `tools/app-shell/src/components/contract-ui/ImageField.jsx` — `stretch` mode
  redesigned: full-height dashed dropzone with drag & drop (mirrors
  `UploadDropzone` pattern), file validation (type/size/dimensions), errors via
  `toast.error()`. When an image exists the layout is unchanged. Non-stretch
  mode unchanged.
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx` — removed
  `h-full` from the inline image container; image layout fix.
- `tools/app-shell/src/components/contract-ui/ListView.jsx` — added
  `data-testid="view-toggle"` to `ViewToggle` wrapper to allow reliable E2E
  and unit targeting (class-based selector was removed in a prior refactor).
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — minor fix.
- `tools/app-shell/src/components/contract-ui/SelectorChip.jsx` — minor fix.
- `tools/app-shell/src/components/contract-ui/__tests__/ImageField.test.js` —
  new source-grep test file (25 assertions for validation constants, toast
  usage, drag handlers, isDragging state).
- `tools/app-shell/src/components/contract-ui/__tests__/ListView.vitest.jsx` —
  updated `ViewToggle` test to use `data-testid` instead of removed CSS class.
- `tools/app-shell/src/windows/registry.js` — Product window registration.

### `app-shell-core`

- `packages/app-shell-core/src/locales/en_US.json`,
  `packages/app-shell-core/src/locales/es_ES.json` — 9 new i18n keys:
  `noStockMovements`, `noStockMovementsDesc`, `adjustStock`,
  `registerMovement`, `imageDropTitle`, `imageDropSubtitle`,
  `imageInvalidType`, `imageTooLarge`, `imageTooLargeDimensions`.
- `packages/app-shell-core/src/components/ui/custom-icons.jsx` — icon addition.

### `generator-change`

Generator changes required to support new Product window decisions:

- `cli/src/generate-contract.js` — minor fix.
- `cli/src/generate-frontend.js` — minor fix.
- `cli/src/resolve-curated.js` — minor fix.

### `window:product` (primary)

- `ProductSidebar.jsx` — full redesign: two tabs (Resumen/Almacenes), shared
  `SidebarPeriodSelector` (3M/6M/12M) disabled when no transactions,
  per-warehouse colored cards, stock empty state with navigation to
  `/physical-inventory`, multi-line SVG chart (`buildWarehouseSeries`, one
  line per warehouse anchored to its `quantityOnHand`), `niceScale` Y-axis,
  Expand modal with Contacts-style segmented period control and warehouse
  isolation.
- `ProductPriceBar.jsx` — inline section toggles (Venta/Compra) replace
  pencil+modal flow; row created immediately on `<select>` option change (POST),
  prices edited inline via PATCH on blur, delete via hover trash icon.
- `ProductAdditionalInfoPanel.jsx` — two-column row layout with HR divider.
- `ProductGallery.jsx`, `ProductListCells.jsx`, `ProductCustomTable.jsx`,
  `index.jsx` — gallery, list cells, custom table, and window entry point.
- `artifacts/product/decisions.json`, `contract.json`, `contract.mcp.json`,
  `generated/web/product/ProductPage.jsx`, `ProductForm.jsx` — regenerated.
- `docs/generated-custom-windows/product.md` — updated with all changes.
- `e2e/tests/flows/product-pricing.mocked.spec.js` — E2E spec rewritten to
  match the new inline pricing UI (tabs, inline select, immediate POST).
- `__tests__/ProductSidebar.test.js`, `__tests__/ProductPriceBar.vitest.jsx` —
  updated for new component shape.

### `window:amortization`

- `tools/app-shell/src/windows/custom/amortization/AmortizationLinesTable.jsx`
  — `DimensionGrid` now accepts `isCompleted` prop for visual greyed-out state.
- `docs/generated-custom-windows/amortization.md` — updated.

### `window:assets`

- `tools/app-shell/src/windows/custom/assets/AssetsDetailPanel.jsx` —
  `GroupDivider` gains `mt-5` spacing.
- `docs/generated-custom-windows/assets.md` — updated.

## Tests

- `ImageField.test.js` — 25 new source-grep assertions (all pass).
- `ListView.vitest.jsx` — updated; all 13 tests pass.
- `ProductSidebar.test.js` — 6 source-grep tests pass.
- `ProductPriceBar.vitest.jsx` — Vitest DOM tests updated; all pass.
- Full Vitest suite: 0 failures.
- E2E `product-pricing.mocked.spec.js` — rewritten for inline pricing flow.

## Rollback

- **Sidebar:** revert `ProductSidebar.jsx` to previous single-line chart and
  tab structure. No data or API change.
- **Pricing inline:** revert `ProductPriceBar.jsx` to the dialog-based flow.
  No data change; price rows are unaffected.
- **ImageField:** revert `ImageField.jsx` to remove drag & drop and
  validation; restore inline `<p>` error display. No data change.
- **Platform fixes:** revert `ListView.jsx` (remove `data-testid`),
  `SelectorChip.jsx`, and `DetailView.jsx` minor fixes independently.
- **i18n keys:** unused keys are safe to leave; removing them requires
  reverting both locale JSON files.
