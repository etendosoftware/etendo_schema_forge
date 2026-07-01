# Product

## Intent
Product lets a user maintain the commercial and inventory identity of an item, then continue into the product-specific surfaces that matter after the master record exists: pricing, stock visibility, transaction history, and the contract-backed child datasets attached to the selected product.

On `origin/develop`, the visible product page is still a generated route with custom surfaces embedded into it: a gallery list, a grouped `Additional Info` panel, a pricing tab, and a product-specific inventory sidebar.

## What this window should allow
- Browse products from the Inventory menu and recognize them quickly by image, name, search key, and category.
- Create or update the core product definition, including search key, name, description, product type, category, UOM, image, tax category, sale/purchase flags, stocked flag, weight, UOM for weight, attribute set, brand, lifecycle status, returnable flag, and UPC/EAN.
- Move between a main `General` tab and a separate `Additional Info` tab so commercial and logistics settings are grouped instead of mixed into one form.
- Review and edit pricing from a dedicated `Price` tab without leaving the product page. Pricing tables are entered via per-table pencil icons (one for Sales lists, one for Purchase lists) that open a focused dialog.
- Click a product image to open a lightbox for full-size inspection. Upload, replace, and remove the image from within the same field in the form grid.
- Inspect stock availability and stock movement context from the custom sidebar.
- Use the contract-backed product children and actions when the generated page exposes them, while treating the exact visible tab set beyond the custom surfaces as partially evidenced.

## Interaction model
- **Route:** `/product` and `/product/:recordId`.
- **Visibility:** visible from the `Inventory` section as `Product`.
- **Implementation type:** generated window route loaded through `tools/app-shell/src/windows/registry.js`, with product-specific custom surfaces embedded in the generated page: `ProductGallery`, `ProductAdditionalInfoPanel`, `ProductPriceBar`, and `ProductSidebar`.
- **Window shape:** master-child workspace. The selected product is the master entity, and product-related child datasets are attached to that record.

The list surface is gallery-based rather than a plain grid. Product cards show the image when one exists and fall back to a package icon when no image is available. Opening a record takes the user into a detail screen with two primary tabs: `General` and `Additional Info`.

The detail screen also changes the standard generated behavior in four visible ways:
- pricing is surfaced through a custom **Price** tab (`ProductPriceBar`), declared via `customPanelTabs` in `decisions.json`
- the sidebar is product-specific (`ProductSidebar`)
- print and the generic More menu are hidden
- both the **Price** tab and the **Attachments** tab are placed after the bottom primary tab strip (both use `customTabsAfterBottom: true`), so they are accessible without displacing the stock and sidebar surfaces that dominate the upper part of the detail page

The product image field is `inline: true` in `decisions.json`, which keeps it inside the four-column form grid spanning two rows (`row-span-2`) rather than rendering it separately above the form. The field renders with an upload button inside the container, a hover overlay with zoom and remove/replace actions, and a lightbox via a portal to `document.body` (ESC to close). When an image is present the cursor is `cursor-zoom-in`.

The image preview uses `position: absolute; inset: 0` inside a `relative flex-1 min-h-[176px]` wrapper when `stretch` mode is active. This takes the preview out of the CSS flow so it never contributes to grid track sizing — a large image file cannot expand the surrounding grid rows. The wrapper grows with the form height (driven by the other columns), and the preview fills that space exactly. When no image is loaded the wrapper is at least 176 px tall (the "Sin imagen" placeholder height). The manual Save button is required to persist image changes — the image field is explicitly excluded from the `autoSaveOnBlur` trigger.

## Reactive behavior and dependencies
- **Master/child dependency:** the selected product drives price, stock, and transaction loading through `parentId=<productId>`.
- **Gallery/detail dependency:** selecting a product card in the gallery navigates into that product's detail route.
- **Additional Info grouping:** the `Additional Info` tab is a custom panel rendered as two-column row sections. Each row section has a left column (148 px wide) containing a section title and description, and a right column (`flex-1`) holding an `EntityForm`. The `Commercial` row groups `Tax Category`, `Sale`, and `Purchase`; an HR divider separates it from the `Logistics` row, which groups `Stocked`, `Returnable`, `Weight`, and `UOM for Weight`. The outer wrapper applies `[&_input]:bg-white` so all input fields, including `Weight`, render on a white background.
- **Selector dependencies:** the current evidence shows selector-backed maintenance for category, tax category, UOM, UOM for weight, attribute set, brand, lifecycle status, warehouse, currency, characteristic, characteristic subset, storage bin, and price-list-version references where relevant.
- **Pricing tab states:**
  - When the product has not been saved yet, the `Price` tab shows a save-first message and blocks pricing maintenance.
  - When the product exists but has no price rows yet, the tab shows an empty state plus `Set Pricing`. That action opens an inline create mode with two cards labeled `Sales price` and `Purchase price`. Each card has two inputs: `Unit price` and `List price`.
  - The initial create mode requires at least one entered amount across all four inputs, but it does not ask the user to choose a price list version. `ProductPriceBar` resolves the sales price list version (`salesPriceList = true`) and the purchase price list version (`salesPriceList = false`) automatically: it reads `/price/defaults`, routes that default to the matching side, then fills any missing side from the selector catalog and finally from `/price/selectors/<column>`.
  - Each side is saved as an independent `M_ProductPrice` row in its own price list version. The sales card maps to the sales-flagged version; the purchase card maps to the purchase-flagged version. Within a single row, when only `Unit price` or `List price` is provided, the missing column falls back to the entered one so `standardPrice`, `listPrice` and `priceLimit` stay consistent. If the user leaves an entire side blank, **no row is created for that side** — values are never replicated across sales and purchase.
  - Once price rows exist, the tab switches to two summary tables: `Sales lists` and `Purchase lists`. Each table header carries a pencil icon; clicking the pencil for `Sales lists` opens `PricingDialog` with `focusedSection="sales"`, and clicking the pencil for `Purchase lists` opens it with `focusedSection="purchase"`. The dialog shows only the relevant section rather than both at once.
  - Inside the dialog, added rows are split by sales-vs-purchase selector metadata, duplicate price-list-version rows are blocked, and staged adds/edits/deletes are only applied when `Save changes` is pressed.
  - Selector catalogs are not eagerly loaded (see `useCatalogs`), so the dialog lazily fetches the available price list versions from `/price/selectors/<column>` on first open. While the fetch is in flight, the add-row dropdown is disabled and shows the loading label.
  - Closing the dialog with unsaved changes triggers a confirmation overlay offering discard vs save.
- **Sidebar reactions:**
  - The inventory sidebar has two tabs: `Summary` and `Warehouses`. A shared `SidebarPeriodSelector` (3M / 6M / 12M) sits at the top of each tab and drives the inline chart's time window. The selector is disabled when no transaction history exists.
  - `Summary` shows an **On Hand** `AvailabilityWidget` card. The widget is hidden when there are no transactions — a product that sold all its stock still has transactions and will display the widget showing `0`; a product with no history at all omits it entirely.
  - `Warehouses` shows per-warehouse flat cards (`bg-[#F5F7F9] rounded-lg`). Each card has a colored dot + warehouse name header, then two rows ("Disponible" / "Reservado") separated by a `border-t border-[rgba(18,18,23,0.05)]` divider. Colors come from `DOT_COLORS` (`['#ec4899', '#f59e0b', '#10b981', ...]`) indexed by sort order (descending on-hand).
  - A horizontal `border-t border-[#E8EAEF]` divider separates the tab section from the chart section. The divider is shown whenever a chart or an empty state is rendered.
  - When no transactions exist, a **Stock empty state** is shown instead of the chart: title "Sin movimientos de stock", subtitle, and two buttons — "Ajustar stock" (navigates to `/physical-inventory` via `useNavigate`) and "Registrar movimiento" (no-op for now).
  - When transactions exist, the **Stock movement** section shows: a header row with the title and "Expandir" link (`ExternalLink` icon, `#828FA3`), a legend row of 14×4 px colored bars with warehouse names, and the inline SVG chart below.
  - The inline chart is **multi-line**: one gradient-area-line per warehouse (`buildWarehouseSeries`), each anchored to that warehouse's current `quantityOnHand`. Colors match `DOT_COLORS[i]` (same as legend and warehouse cards). The time window is controlled by the sidebar period selector.
  - The chart uses smooth bezier curves (SVG cubic `C` command), dashed gridlines (`strokeDasharray="4,3"`), `vectorEffect="non-scaling-stroke"`, and asymmetric padding (`PAD_X=36`, `PAD_R=8`). The mini chart sets `preserveAspectRatio="none"`; the expanded modal uses the default. No permanent dot — hover dots appear only on mouse interaction. Multi-series hover shows a vertical guide + one circle per series + a compact multi-row tooltip.
  - The Y-axis uses `niceScale` from `@/lib/dashboardNumberFormat` (same as Dashboard / Contacts charts), ensuring the baseline is always 0 and tick labels are formatted as `2K`, `1.5M`, etc. Negative values are clamped to 0.
  - The **Expand modal** also uses the multi-line chart. Its period selector follows the Contacts segmented-control style (`bg-gray-100 rounded-lg p-1`, active: `bg-white text-blue-600 shadow-sm`) with the same three options (3M / 6M / 12M). The right panel lists warehouses with dot + name + current stock, and a "Total: X unidades" footer. Clicking a warehouse isolates its series in the chart. The modal's period is independent from the sidebar period selector.
- **Defaults visible in the generated contract:** bill-of-materials line number defaults to the next line sequence, bill-of-materials quantity defaults to `1`, and product category defaults from the SQL default declared in the contract.

## Gap assessment
- The generated contract declares many child datasets and actions, but the inspected page code makes only the gallery, the two primary tabs, the pricing footer, and the product sidebar explicit. Treat the exact visible availability of every child surface beyond those areas as partially evidenced.
- The footer's initial `Set Pricing` flow hides which price list version is chosen. Users only see the drafted values, while the actual target list/version comes from defaults or selector fallback.
- Variant management, service/tax helper actions, and transaction-level manual cost adjustment remain declared in metadata, but the inspected page code does not make their live entry points explicit.
- `ProductDetailHeader.jsx` still returns `null`, so any richer standalone product header is not part of the current visible behavior.

## Manual verification
1. Open `/product` and confirm the list is a gallery of product cards rather than a flat table.
2. Verify product cards show the product image when present and fall back to the package icon when no image exists.
3. Open an existing product and confirm the detail surface exposes `General` and `Additional Info`.
4. In `Additional Info`, verify the `Commercial` section contains `Tax Category`, `Sale`, and `Purchase` in a right-side `EntityForm` with a section title and description on the left. Confirm an HR divider separates it from the `Logistics` section, which contains `Stocked`, `Returnable`, `Weight`, and `UOM for Weight`. All input backgrounds should be white.
5. Open `/product/new` and confirm the `Price` tab says the product must be saved before pricing can be maintained.
6. For a saved product with no price rows, confirm the `Price` tab shows `Set Pricing` and that the inline create state exposes four inputs: `Unit price` and `List price` for `Sales price`, and the same pair for `Purchase price`. Entering values only on one side must create just that row; entering values on both sides must create two separate rows in their respective price list versions.
7. After price rows exist, confirm the `Price` tab shows separate `Sales lists` and `Purchase lists` tables, each with a pencil icon in the table header. Click the pencil on `Sales lists` and verify the dialog opens showing only the sales section. Click the pencil on `Purchase lists` and verify the dialog opens showing only the purchase section.
8. In the dialog, stage an edit or add/delete action, try closing it, and confirm the unsaved-changes overlay appears.
9. Open a product with an image. Verify the image renders inside the form grid (not above it), spanning two rows alongside adjacent fields. Click the image and confirm the lightbox opens portal-rendered over the page. Press ESC and confirm the lightbox closes. Hover the image thumbnail in the form and confirm the overlay appears with zoom, remove, and replace actions.
10. Confirm the sidebar exposes `Summary` and `Warehouses`, and that `Stock movement` only appears when the product has transaction history. When it appears, verify the chart uses smooth curves, dashed gridlines, and a pill-style period-switch row. Click "Expand" below the chart title and verify the modal opens with the period switches and warehouse drill-down.
11. In `Summary`, confirm `Available` and `Reserved` stat cards are hidden when `reserved === 0`. Open a product that has reserved stock and confirm those cards are visible.
12. If the business depends on BOM, costing, transactions, characteristics, stock, category price rule version, alternate UOM, or variant actions, verify which of those surfaces are actually visible in the running page. Current repo evidence does not fully prove all of them.
13. Select the **Attachments** tab (sits alongside the **Price** tab after the primary tab strip). Upload a file, verify it shows up in the table with name, size, and upload date, and that downloading and deleting it work correctly. When multiple files exist, confirm "Download all (ZIP)" and "Delete all" appear and that "Delete all" prompts a confirmation dialog.

## Automated evidence
- Route registration and menu visibility are grounded in `tools/app-shell/src/windows/registry.js` and `tools/app-shell/src/menu.json`, which register `product` as a generated/custom window reachable from the Inventory section.
- Shared shell/route behavior is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`, especially the generated/custom window loading flow and the shared entity list/detail flow.
- Product-specific behavior is grounded in current code under `tools/app-shell/src/windows/custom/product/`:
  - `ProductGallery.jsx` for gallery browsing
  - `ProductAdditionalInfoPanel.jsx` for the two-column row layout with `Commercial` and `Logistics` sections and HR divider between them
  - `ProductPriceBar.jsx` for product pricing fetch/create/edit behavior. Unit prices and list prices shown in the pricing tables are formatted using the org's configured currency via `useCurrency()` and `formatCurrency()`. `PricingDialog` accepts a `focusedSection` prop (`"sales"` or `"purchase"`) that controls which table is shown.
  - `ImageField.jsx` was fully redesigned for ETP-4190 and extended in a follow-up: upload button inside the container, hover overlay with zoom icon and remove/replace actions, lightbox via `createPortal(document.body)` with ESC-to-close, `cursor-zoom-in` when an image exists. When no image exists (stretch mode), the area shows a full-height dashed dropzone with an upload icon button, "Selecciona o arrastra aquí tus archivos", and the constraint hint ("Hasta 30 MB y 7680 × 4320 píxeles (JPEG, JPG, PNG)"). The dropzone supports drag & drop (highlights on `isDragging`). Validation rejects non-JPEG/PNG types, files over 30 MB, and images exceeding 7680 × 4320 px — all errors surface as `toast.error()` (no inline message). The upload button at the bottom is hidden in the empty state (the entire zone is the upload target); it reappears once an image is loaded.
  - `ProductSidebar.jsx` for stock and transaction-driven sidebar summaries, including pill-style period tabs, bezier-curve SVG chart, dashed gridlines, expand link, smaller stat cards, conditional visibility of `Available`/`Reserved` cards, and divider between sections.
- The generated product page at `artifacts/product/generated/web/product/ProductPage.jsx` wires those custom surfaces into the product window and declares the attached child CRUD endpoints.
- The product contract at `artifacts/product/contract.json` provides evidence for layout (`gallery`, sidebar layout, primary tabs), selectors, child entities, default values, and declared actions.
- `artifacts/product/decisions.json` declares:
  - `customPanelTabs` — registers `ProductPriceBar` as the `Price` tab alongside `Attachments`
  - `attachments: true` and `customTabsAfterBottom: true` — positions both tabs after the primary tab strip
  - `inline: true` on the image field — keeps the image inside the four-column form grid
  - `autoSaveOnBlur: true` — all header fields (name, description, type, category, UOM, etc.) save automatically on blur, matching the behavior of Contacts, Assets, and Sales Order. The image field is explicitly excluded: image changes require the manual Save button.
  - `labelOverrides` — overrides `M_Product_Category_ID` to "Category"/"Categoría" and `ProductType` to "Type"/"Tipo" using the locale-nested format `{ "en_US": {...}, "es_ES": {...} }`
  - `sidebarClassName`, `formCardPadding`, `toolbarPaddingX`, `tabsBarPaddingX`, `listbarPaddingX`, `tablePaddingX` — layout props for 30%-width sidebar with left border, 8px horizontal padding throughout
  - `primaryTabsVariant: "pill"` — pill-style primary tab bar
- `tools/app-shell/src/windows/custom/product/__tests__/ProductSidebar.test.js` verifies that `ProductSidebar` uses the shared `formatDashboardAxisTick` utility for Y-axis labels and does not define a local formatting function. Beyond that, automated evidence in this repo is structural and contract-backed rather than end-to-end proof of the full product workflow.

## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to the custom surfaces.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component. For this window the declared required fields are `searchKey`, `name`, `uOM`, `productCategory`, `taxCategory`, `purchase`, `sale`, `productType`, `stocked`, and `returnable` — making the existing required-field contract explicit in the generated page rather than relying on implicit form validation.
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.

## ETP-4190 changes (continued — feature/ETP-4190)

Changes added on top of the original ETP-4190 work on the same branch.

### Image field — layout fix

- `ImageField.jsx` (`stretch` mode): the preview is now `absolute inset-0` inside a `relative flex-1 min-h-[176px]` wrapper. Previously `flex-1 min-h-[176px]` was on the preview directly, which allowed large image files to push CSS Grid row heights unboundedly. The absolute approach removes the image from the layout flow: row heights are sized by the other form columns, and the preview fills the resulting cell height without contributing to it. Non-stretch usage (other windows, fixed `h-44`) is unchanged.
- `EntityForm.jsx` image branch: removed `h-full` from the container class (`row-span-2 flex flex-col`). The container now relies on CSS Grid's default `align-self: stretch` without a circular percentage-height dependency.

### Auto-save on blur

- `decisions.json` → `"autoSaveOnBlur": true` added to the `window` object.
- Regenerated `ProductPage.jsx` passes `autoSaveOnBlur` to `DetailView`.
- Image field excluded from the auto-save trigger (no `setTimeout(onFieldBlur)` in the image `onChange` handler) — image changes require the manual Save button.

## Pipeline regeneration — ETP-4190

Updated on 2026-06-08 as part of the feature/ETP-4190 branch. Significant changes to custom surfaces; regeneration was required.

- `ProductPriceBar` promoted from a footer to a `customPanelTabs` entry named `Price`. The `attachments` tab also moved into the same `customPanelTabs` array so both tabs share the `customTabsAfterBottom: true` placement.
- `Edit Pricing` button replaced by per-table pencil icons. `PricingDialog` now accepts `focusedSection` to show only the sales or purchase section on open.
- Image field set to `inline: true` so it renders inside the four-column form grid. `ImageField.jsx` was replaced with a fully redesigned component including hover overlay, lightbox, upload, and remove/replace actions.
- Sidebar redesigned: smaller stat cards, conditional visibility of `Available`/`Reserved`, pill-style period tabs, bezier-curve chart with dashed gridlines and expand link, divider between inventory overview and stock movement.
- `ProductAdditionalInfoPanel.jsx` redesigned from card-based (`FieldGroup`) to two-column row layout with HR divider between `Commercial` and `Logistics`.
- New `decisions.json` keys: `labelOverrides`, `sidebarClassName`, `formCardPadding`, `toolbarPaddingX`, `tabsBarPaddingX`, `listbarPaddingX`, `tablePaddingX`, `primaryTabsVariant`.

### Sidebar — full redesign (feature/ETP-4190 continued)

- **Tabs + shared period selector:** `Summary` and `Warehouses` share a single `SidebarPeriodSelector` (3M / 6M / 12M) at the top of each tab. The selector drives the inline chart window and is disabled when no transactions exist.
- **Summary tab:** shows an `AvailabilityWidget` (On Hand) only when transactions exist. Hides the widget entirely when the product has no history (not just zero stock).
- **Warehouses tab:** replaced the old 3-column grid with flat `#F5F7F9` cards — one per warehouse, each with a colored dot + name header and a Disponible / Reservado row pair separated by a subtle border.
- **Stock empty state:** when `transactions.length === 0` (after loading), shows "Sin movimientos de stock" + subtitle + "Ajustar stock" (→ `/physical-inventory`) + "Registrar movimiento" (no-op). The divider between the tab section and this block is preserved for visual consistency.
- **Chart header:** title in `font-normal text-[#3F3F50]`, "Expandir" as `font-medium underline` with `ExternalLink` icon, dynamic legend row (14×4 px colored bars + warehouse names).
- **Multi-line chart:** `buildWarehouseSeries` produces one cumulative series per warehouse, each anchored to its own `quantityOnHand`. `ChartSVG` accepts an optional `series` prop; when absent it falls back to single-line mode (modal path unchanged until this change). Y-axis uses `niceScale` (baseline 0, no negatives). Multi-hover: vertical guide + circle per series + compact tooltip.
- **Modal (Expandir):** updated to also use multi-series. Period selector changed from `1M/3M/6M/1Y/2Y` pills to Contacts-style segmented control (3M / 6M / 12M). Selecting a warehouse from the right panel isolates that series.
- **i18n keys added:** `noStockMovements`, `noStockMovementsDesc`, `adjustStock`, `registerMovement`.

### ImageField — empty state + drag & drop + validation (feature/ETP-4190 continued)

- **Empty state (stretch mode):** full-height dashed dropzone replaces the old centered-icon placeholder. Contains an upload icon button (32×32, white card), "Selecciona o arrastra aquí tus archivos" title, and "Hasta 30 MB y 7680 × 4320 píxeles (JPEG, JPG, PNG)" subtitle. The upload button at the bottom is removed in the empty state — the entire zone is the drop target.
- **Drag & drop:** `onDragEnter/Over/Leave/Drop` handlers (mirrors `UploadDropzone` pattern). Zone highlights to `border-[#828FA3] bg-[#F5F7F9]` while dragging.
- **File validation:** type (`image/png`, `image/jpeg` only via `IMAGE_ALLOWED_TYPES`), size (≤ 30 MB), pixel dimensions (≤ 7680 × 4320 via `readImageDimensions`). The `accept` attribute narrowed from `image/*` to `image/png,image/jpeg`. Errors surface as `toast.error()` — the inline `<p className="text-destructive">` was removed.
- **i18n keys added:** `imageDropTitle`, `imageDropSubtitle`, `imageInvalidType`, `imageTooLarge`, `imageTooLargeDimensions`.
