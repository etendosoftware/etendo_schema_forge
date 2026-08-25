# Product

## Intent
Product lets a user maintain the commercial and inventory identity of an item, then continue into the product-specific surfaces that matter after the master record exists: pricing, stock visibility, transaction history, and the contract-backed child datasets attached to the selected product.

On `origin/develop`, the visible product page is still a generated route with custom surfaces embedded into it: a gallery list, a grouped `Additional Info` panel, a pricing tab, and a product-specific inventory sidebar.

## Theme roles

The product form, pricing controls and inventory sidebar use the shared
semantic theme for surfaces, controls and state feedback. The stock chart's
per-warehouse `DOT_COLORS` palette is intentionally excluded: it encodes the
identity of separate data series and is not a UI status or theme role.

## What this window should allow
- Browse products from the Inventory menu and recognize them quickly by image, name, search key, and category.
- Create or update the core product definition, including search key, name, description, product type, category, UOM, image, tax category, sale/purchase flags, stocked flag, weight, UOM for weight, attribute set, brand, lifecycle status, returnable flag, active flag, and UPC/EAN.
- Move between a main `General` tab and a separate `Additional Info` tab so commercial and logistics settings are grouped instead of mixed into one form.
- Review and edit pricing from a dedicated `Price` tab without leaving the product page. Pricing tables are entered via per-table pencil icons (one for Sales lists, one for Purchase lists) that open a focused dialog.
- Click a product image to open a lightbox for full-size inspection. Upload, replace, and remove the image from within the same field in the form grid.
- Inspect stock availability and stock movement context from the custom sidebar.
- Maintain the product's GL accounting accounts (Fixed Asset, Product Expense, Product Revenue, Product COGS) per accounting schema from the generated **Accounting** tab, the first tab in the unified secondary tab strip (Accounting, Price, Attachments).
- Use the contract-backed product children and actions when the generated page exposes them, while treating the exact visible tab set beyond the custom surfaces as partially evidenced.

## Interaction model
- **Route:** `/product` and `/product/:recordId`.
- **Visibility:** visible from the `Inventory` section as `Product`.
- **Implementation type:** generated window route loaded through `tools/app-shell/src/windows/registry.js`, with product-specific custom surfaces embedded in the generated page: `ProductGallery`, `ProductAdditionalInfoPanel`, `ProductPriceBar`, and `ProductSidebar`.
- **Window shape:** master-child workspace. The selected product is the master entity, and product-related child datasets are attached to that record.

The list surface is gallery-based rather than a plain grid. Product cards show the image when one exists and fall back to a package icon when no image is available. Opening a record takes the user into a detail screen with two primary tabs: `General` and `Additional Info`.

The detail screen also changes the standard generated behavior in four visible ways:
- the product's GL accounting accounts are surfaced through an **Accounting** tab (classic grid+form, `AccountingTable`/`AccountingForm`), declared via `secondaryTabs` in `decisions.json`
- pricing is surfaced through a custom **Price** tab (`ProductPriceBar`), declared via `customPanelTabs` in `decisions.json`
- the sidebar is product-specific (`ProductSidebar`)
- print and the generic More menu are hidden

**Accounting**, **Price**, and **Attachments** render together in one unified tab strip, in that order — Accounting first because `secondaryTabs` entries are appended before `customPanelTabs` entries in the generated tab array (see `resolveSecondaryTabDefs` / `DetailView.jsx`; there is no decisions.json-level control over relative order between the two groups, and no way to put a `secondaryTabs` entry after a `customPanelTabs` entry without changing `DetailView.jsx`/`generate-frontend.js` — tracked as a follow-up in ETP-4415). Before ETP-4402's follow-up, Accounting was wired as `window.detailEntity`, which rendered it in a separate block above this tab strip instead of inside it.

The product image field is `inline: true` in `decisions.json`, which keeps it inside the four-column form grid spanning two rows (`row-span-2`) rather than rendering it separately above the form. The field renders with an upload button inside the container, a hover overlay with zoom and remove/replace actions, and a lightbox via a portal to `document.body` (ESC to close). When an image is present the cursor is `cursor-zoom-in`.

The image preview uses `position: absolute; inset: 0` inside a `relative flex-1 min-h-[176px]` wrapper when `stretch` mode is active. This takes the preview out of the CSS flow so it never contributes to grid track sizing — a large image file cannot expand the surrounding grid rows. The wrapper grows with the form height (driven by the other columns), and the preview fills that space exactly. When no image is loaded the wrapper is at least 176 px tall (the "Sin imagen" placeholder height). The manual Save button is required to persist image changes — the image field is explicitly excluded from the `autoSaveOnBlur` trigger.

## Reactive behavior and dependencies
- **Master/child dependency:** the selected product drives price, stock, and transaction loading through `parentId=<productId>`.
- **Gallery/detail dependency:** selecting a product card in the gallery navigates into that product's detail route.
- **Additional Info grouping:** the `Additional Info` tab is a custom panel rendered as two-column row sections. Each row section has a left column (148 px wide) containing a section title and description, and a right column (`flex-1`) holding an `EntityForm`. The `Commercial` row groups `Tax Category`, `Sale`, and `Purchase`; an HR divider separates it from the `Logistics` row, which groups `Almacenable` ("Stocked"/`IsStocked` — relabeled from "Almacenado" in ETP-4943), `Returnable`, `Weight`, and `UOM for Weight`. The outer wrapper applies `[&_input]:bg-white` so all input fields, including `Weight`, render on a white background.
- **Logistics hidden for Service products (ETP-4943):** the entire `Logistics` row (divider included) does not render when `productType === 'S'` — a Service product has no physical existence, so weight/UOM/stock fields do not apply. Mirrors the rule `ProductSidebar.jsx` already applies to hide the stock sidebar for Service products (ETP-4606). While editing, switching the type to Service also force-sets `stocked`/`returnable` to `false` via `onChange` (only when they were not already false), so a Service product can never be saved with either flag on. Switching back to a stockable type (e.g. Article) re-shows the row with whatever values are currently on the record.
- **Selector dependencies:** the current evidence shows selector-backed maintenance for category, tax category, UOM, UOM for weight, attribute set, brand, lifecycle status, warehouse, currency, characteristic, characteristic subset, storage bin, and price-list-version references where relevant.
- **Pricing tab states:**
  - When the product has not been saved yet, the `Price` tab shows a save-first message and blocks pricing maintenance.
  - Once saved, the tab is a single inline surface (the former `PricingDialog` / `Set Pricing` flow was removed in ETP-4420). A left-hand `Venta` / `Compra` toggle switches the active section; rows are split by the `priceListVersion$salesPriceList` flag that `ProductPriceHandler` adds to every row. Each row is a read-only `Nombre` input plus `Unit price` and `List price` steppers and a hover-revealed delete button. Committing a stepper `PATCH`es only the changed column; delete fires `DELETE /price/<id>` and re-fetches the rows.
  - **Row and option labels show the TARIFF name** (`priceList$_identifier`, i.e. `M_PriceList.Name`), with the version identifier as fallback for unenriched payloads. The two differ in real data — an onboarding-created list is `Lista de venta (sin impuestos)` while its version is `Version Lista de venta (sin impuestos)`, and legacy demo data has `Customer A USD` / `Customer A USD 2014` — so preferring the version identifier displayed the wrong name (fixed in ETP-4605).
  - **The section itself never scrolls.** The rows list has no height cap: growth is absorbed by the detail content column, which is already `flex-1 min-h-0 overflow-auto` and is a **sibling** of the sidebar column (`DetailView.jsx` — "Scrollable content + optional sidebarContent"), so scrolling the tariffs never moves the `Resumen` / `Almacenes` summary.
  - The add action lives in the **section header**, on the same line as the title and the count badge, **right-aligned over the `List price` column** so its right edge matches the right edge of every list-price stepper below (the header mirrors the rows' 300 / 201 / 201 `gap-5` grid). Left-aligning it at the *start* of that column aligned it with nothing and read as accidental. The add row opens at the **top** of the list, directly under the column headers. Both therefore stay put however many tariffs the product has — no need to scroll to the bottom to add one. It renders through the shared `AddLineButton` (`@/components/ui/add-line-button.jsx`, the same control as `+ Add line` in the order/invoice lines panels). That component hardcodes `data-testid="action-add-line"`, which is **not unique in this window** (the Accounting secondary tab renders one too, and every custom tab panel stays mounted), so it is wrapped in a `data-testid="price-add-tariff"` span; selectors targeting the DetailView-rendered one must scope through its `[data-inline-add-portal="true"]` wrapper.
  - **Add / create tariff:** the `+ Add new tariff` row renders a `CreatableSearchSelect` (not a plain `<select>`). It lists the existing price-list versions for the active side (sales vs. purchase) **and** a pinned `+ Create tariff` action. Picking an existing option links it via `POST /price`. Choosing `+ Create tariff` opens a name-only `InlineCreateModal`: on submit it `POST`s to the `price-list/priceList` endpoint with `{ name, salesPriceList: <active side>, costBasedPriceList:false, priceIncludesTax:false, default:false }` — no currency, which the backend `PriceListHeaderHandler` injects from the organization currency. In Go a price list has exactly one version (auto-created with the same name by the handler); the create response returns its `priceListVersion`, which is then linked to the product via `POST /price`.
  - The selector options are fetched from `/price/selectors/<column>?limit=200` **every time the add row is opened**, not once per mount. A fetch-once cache left a tariff created in-session through `+ Create tariff` (which links the new version by id, without touching the option list) permanently out of the selector, so deleting its price could never bring it back. `limit` is explicit because the NEO selector endpoint defaults to 20 rows.
  - Tariffs that already have a price for this product are excluded from the selector (matched on price-list-version id, across **both** sections, mirroring the `(PriceListVersion, Product)` unique constraint), so the same tariff cannot be added twice. Deleting a price row puts its tariff back in the list.
  - The dropdown is left to auto-flip (`preferDown` is deliberately **not** passed). The add row is the last element of the tab, so forcing the panel downward drew it past the viewport edge — and because the panel is `position: fixed`, no amount of scrolling could reveal it.
  - When every tariff of the active side already has a price, the tab renders an explicit hint (`priceAllSalesTariffsAssigned` / `priceAllPurchaseTariffsAssigned`, `data-testid="price-no-available-tariffs"`). Without it the dropdown showed only `+ Create tariff` with no explanation, which reads as a rendering bug. The hint is gated on the fetch having resolved so it never flashes while loading.
  - Selector catalogs are not eagerly loaded (`useCatalogs` is a no-op **and** `DetailView` does not pass `catalogs` to custom tab components), so the lazy fetch above is the only live path in the running app; the eager branch is exercised only by tests.
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
- The pricing selector excludes already-priced tariffs by **price-list-version** id. Today that is exact (every price list in the inspected tenants has exactly one version, and `PriceListVersionHandler` refuses to create a second), but a legacy price list carrying two versions would appear twice in the selector under the same tariff name. Fixing it properly needs a price-list id on the row payload (`ProductPriceHandler`'s list SQL selects `pl.name` but not `pl.m_pricelist_id`).
- Variant management, service/tax helper actions, and transaction-level manual cost adjustment remain declared in metadata, but the inspected page code does not make their live entry points explicit.
- `ProductDetailHeader.jsx` still returns `null`, so any richer standalone product header is not part of the current visible behavior.

## Manual verification
1. Open `/product` and confirm the list is a gallery of product cards rather than a flat table.
2. Verify product cards show the product image when present and fall back to the package icon when no image exists.
3. Open an existing product and confirm the detail surface exposes `General` and `Additional Info`.
4. In `Additional Info`, verify the `Commercial` section contains `Tax Category`, `Sale`, and `Purchase` in a right-side `EntityForm` with a section title and description on the left. Confirm an HR divider separates it from the `Logistics` section, which contains `Almacenable` (not "Almacenado"), `Retornable`, `Peso`, and `Unidad de peso`. All input backgrounds should be white.
4a. Set the product's `Tipo` to `Servicio` and confirm the `Logistics`/`Logística` section (and its divider) disappears entirely from `Additional Info`. If `Almacenable`/`Retornable` were checked, confirm they are cleared to unchecked as soon as the type switches. Switch the type back to `Artículo` and confirm the section reappears.
5. Open `/product/new` and confirm the `Price` tab says the product must be saved before pricing can be maintained.
6. For a saved product, confirm the `Price` tab shows the `Venta` / `Compra` toggle and that the active section lists only the tariffs of that side. Change a `Unit price` and blur: only that column must be sent. Delete a row and confirm it disappears and the count badge drops.
7. Open a product whose tariff name differs from its version name (any product priced in `Lista de venta (sin impuestos)`) and confirm the row shows **`Lista de venta (sin impuestos)`**, not `Version Lista de venta (sin impuestos)`. Open the add-tariff selector and confirm the options use tariff names too.
8. With enough tariffs to overflow the tab, confirm the `+ Add new tariff` control sits on the title line (same look as `+ Add line` in a sales order), that clicking it opens the add row at the top of the list, and that the tariffs scroll with the detail content while the `Resumen` / `Almacenes` sidebar stays put. Confirm the options panel is fully visible (it flips upward when there is no room below). With every tariff of the side already priced, confirm the "all tariffs already priced" hint appears instead of an unexplained empty dropdown.
8a. Create a tariff via `+ Create tariff`, delete the price row it created, reopen the selector and confirm the tariff is offered again.
8b. In the `Sales` section, click `+ Add new tariff`, then `+ Create tariff`; enter a name and submit. Confirm a new price row appears without ever prompting for a currency, and that repeating it in the `Purchase` section creates a purchase-flagged tariff (`IsSOPriceList = N`).
9. Open a product with an image. Verify the image renders inside the form grid (not above it), spanning two rows alongside adjacent fields. Click the image and confirm the lightbox opens portal-rendered over the page. Press ESC and confirm the lightbox closes. Hover the image thumbnail in the form and confirm the overlay appears with zoom, remove, and replace actions.
10. Confirm the sidebar exposes `Summary` and `Warehouses`, and that `Stock movement` only appears when the product has transaction history. When it appears, verify the chart uses smooth curves, dashed gridlines, and a pill-style period-switch row. Click "Expand" below the chart title and verify the modal opens with the period switches and warehouse drill-down.
11. In `Summary`, confirm `Available` and `Reserved` stat cards are hidden when `reserved === 0`. Open a product that has reserved stock and confirm those cards are visible.
12. If the business depends on BOM, costing, transactions, characteristics, stock, category price rule version, alternate UOM, or variant actions, verify which of those surfaces are actually visible in the running page. Current repo evidence does not fully prove all of them.
13. Select the **Attachments** tab (sits in the same tab strip as **Accounting** and **Price**, after the primary tab strip). Upload a file, verify it shows up in the table with name, size, and upload date, and that downloading and deleting it work correctly. When multiple files exist, confirm "Download all (ZIP)" and "Delete all" appear and that "Delete all" prompts a confirmation dialog.
14. Open an existing product and confirm the secondary tab strip (below `General`/`Additional Info`) shows tabs in this exact order: **Accounting**, **Price**, **Attachments**. Select `Accounting` and confirm it renders as a classic grid+form (not a separate panel above the tab strip) with `Fixed Asset`, `Product Expense`, `Product Revenue`, `Product COGS` add/edit fields.

## Automated evidence
- Route registration and menu visibility are grounded in `tools/app-shell/src/windows/registry.js` and `tools/app-shell/src/menu.json`, which register `product` as a generated/custom window reachable from the Inventory section.
- Shared shell/route behavior is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`, especially the generated/custom window loading flow and the shared entity list/detail flow.
- Product-specific behavior is grounded in current code under `tools/app-shell/src/windows/custom/product/`:
  - `ProductGallery.jsx` for gallery browsing
  - `ProductAdditionalInfoPanel.jsx` for the two-column row layout with `Commercial` and `Logistics` sections and HR divider between them, and (ETP-4943) for hiding the `Logistics` row and force-clearing `stocked`/`returnable` when `productType === 'S'`
  - `ProductPriceBar.jsx` for product pricing fetch/create/edit behavior, including the tariff-name labels, the bounded rows scroller, the per-open selector refetch and the "all tariffs already priced" hint. Amounts render through a local `CURRENCY_SYMBOLS` map plus the row's `currencySymbol`; migrating them to the canonical `formatCurrency()` util is pending the dedicated currency-format task.
  - `ImageField.jsx` was fully redesigned for ETP-4190 and extended in a follow-up: upload button inside the container, hover overlay with zoom icon and remove/replace actions, lightbox via `createPortal(document.body)` with ESC-to-close, `cursor-zoom-in` when an image exists. When no image exists (stretch mode), the area shows a full-height dashed dropzone with an upload icon button, "Selecciona o arrastra aquí tus archivos", and the constraint hint ("Hasta 30 MB y 7680 × 4320 píxeles (JPEG, JPG, PNG)"). The dropzone supports drag & drop (highlights on `isDragging`). Validation rejects non-JPEG/PNG types, files over 30 MB, and images exceeding 7680 × 4320 px — all errors surface as `toast.error()` (no inline message). The upload button at the bottom is hidden in the empty state (the entire zone is the upload target); it reappears once an image is loaded.
  - `ProductSidebar.jsx` for stock and transaction-driven sidebar summaries, including pill-style period tabs, bezier-curve SVG chart, dashed gridlines, expand link, smaller stat cards, conditional visibility of `Available`/`Reserved` cards, and divider between sections.
- The generated product page at `artifacts/product/generated/web/product/ProductPage.jsx` wires those custom surfaces into the product window and declares the attached child CRUD endpoints.
- The product contract at `artifacts/product/contract.json` provides evidence for layout (`gallery`, sidebar layout, primary tabs), selectors, child entities, default values, and declared actions.
- `artifacts/product/decisions.json` declares:
  - `customPanelTabs` — registers `ProductPriceBar` as the `Price` tab alongside `Attachments`
  - `attachments: true` and `customTabsAfterBottom: true` — positions both tabs after the primary tab strip
  - `multiField` on the `name` grid field — declares the composite list identity column (title `name` + subtitle chip `searchKey` + `neoImage` media `image`, with `parts` for per-part sort/filter). Replaces the former bespoke `ProductNameCell`. See the ETP-4603 section below.
  - `inline: true` on the image field — keeps the image inside the four-column form grid
  - `autoSaveOnBlur: true` — all header fields (name, description, type, category, UOM, etc.) save automatically on blur, matching the behavior of Contacts, Assets, and Sales Order. The image field is explicitly excluded: image changes require the manual Save button.
  - `labelOverrides` — overrides `M_Product_Category_ID` to "Category"/"Categoría" and `ProductType` to "Type"/"Tipo" using the locale-nested format `{ "en_US": {...}, "es_ES": {...} }`
  - `sidebarClassName`, `formCardPadding`, `toolbarPaddingX`, `tabsBarPaddingX`, `listbarPaddingX`, `tablePaddingX` — layout props for 30%-width sidebar with left border, 8px horizontal padding throughout
  - `primaryTabsVariant: "pill"` — pill-style primary tab bar
  - `secondaryTabs.accounting` — exposes the GL-accounting tab (Fixed Asset, Product Expense, Product Revenue, Product COGS) in the unified secondary tab strip (`tabOrder: 1`, so it renders first, ahead of the `customPanelTabs` entries), using the classic grid+form layout (not `inlineEditable`). `detailEntity` is explicitly `null` (not omitted — an omitted key falls back to auto-selecting the first non-primary entity, which would have picked `price` and produced an unintended extra detail section)
- `tools/app-shell/src/windows/custom/product/__tests__/ProductSidebar.test.js` verifies that `ProductSidebar` uses the shared `formatDashboardAxisTick` utility for Y-axis labels and does not define a local formatting function. Beyond that, automated evidence in this repo is structural and contract-backed rather than end-to-end proof of the full product workflow.

## Pipeline regeneration — ETP-4402

Added on 2026-07-01 as part of feature/ETP-4402. New GL-accounting detail entity — no changes to the pricing, sidebar, or image-field behavior documented above.

- **New Accounting detail tab:** `window.detailEntity` changed from `null` to `"accounting"` in `decisions.json`. The `accounting` entity (backed by `M_Product_Acct`, one row per accounting schema) is no longer excluded — it is exposed as a header-level detail entity, structurally the same pattern already used by `product-category.md`'s Accounting tab.
- **Exposed fields (editable, grid):** `Fixed Asset` (`P_Asset_Acct`), `Product Expense` (`P_Expense_Acct`, required), `Product Revenue` (`P_Revenue_Acct`, required), `Product COGS` (`P_Cogs_Acct`). All four are `ValidCombination` FK selectors, matching the four exposed on Product Category.
- **`accountingSchema` (`C_AcctSchema_ID`):** classified as `system` with `addLineFromSibling: true` — a new accounting row auto-copies the accounting schema from the most recently added sibling row, sparing the user from re-selecting it every time. `addLineHiddenFromSibling` confirmed present in the generated contract.
- **Discarded fields (out of scope, mirrors Product Category's own accounting scope call):** `pDefExpenseAcct` (`P_Def_Expense_Acct`), `productDeferredRevenue` (`P_Def_Revenue_Acct`), `invoicePriceVariance`, `productRevenueReturn`, `productCOGSReturn`, `purchasePriceVariance`, `tradeDiscountReceived`, `tradeDiscountGranted` — all advanced accounting variance/return accounts, not used in day-to-day product maintenance.
- **Layout note — differs from Product Category:** `window.linesLayout` was **not** set to `"inlineEditable"` for this change, so the Accounting tab renders with the classic layout: a plain grid (`AccountingTable.jsx` → `DataTable`) plus a separate add/edit form (`AccountingForm.jsx`), not Product Category's pencil/trash inline-row editing. This was a deliberate scope boundary for this change, not an oversight — switching to `inlineEditable` here is an open follow-up decision for a human to make (it affects UX, not just data wiring).
- **Backend follow-up — resolved:** `decisions.json` declares `javaQualifier: "productAccountingHandler"` on the `accounting` entity, matching the `NeoHandler` pattern already used by Product Category's `ProductCategoryAccountingHandler`. `ProductAccountingHandler.java` (`@Named("productAccountingHandler")`) now exists under `com.etendoerp.go`, auto-filling `accountingSchema` from the client's default active `AcctSchema` on POST when the field is absent — covering the first-row case where `addLineFromSibling` has no prior sibling to copy from.

### Tab position follow-up (ETP-4402 continued)

The original ETP-4402 change above wired Accounting in as `window.detailEntity`, which rendered it in a separate panel positioned **above** the `Price`/`Attachments` tab strip (since `customTabsAfterBottom: true` moves that strip to a distinct block further down the page, disconnected from the detail-entity panel). This placement was disconnected from `Price`/`Attachments` and did not read as one cohesive tab group.

Fixed in a decisions.json-only follow-up:
- `window.detailEntity` changed from `"accounting"` to `null` (explicit, not omitted — see the `secondaryTabs.accounting` bullet above for why the explicit `null` matters).
- `window.customTabsAfterBottom: true` removed. `Price` and `Attachments` (both declared via `customPanelTabs`) now fold into the same unified tab array as `secondaryTabs` instead of rendering in a separate later block.
- `entities.accounting`'s tab wiring moved from `window.detailEntity` to `window.secondaryTabs.accounting` (`tabOrder: 1`, `label: "Accounting"`, `addLineFields: ["fixedAsset", "productExpense", "productRevenue", "productCOGS"]`, `requireSavedRecord: true`) — the same shape already used by `assets.decisions.json`'s `assetAcct` entry.
- No changes to `entities.accounting`'s own field classifications (visibility, `javaQualifier`, discarded fields) — only the tab-wiring mechanism changed.

**Result:** Accounting, Price, and Attachments now render in one unified tab strip, in that order — Accounting first, not last. **"Accounting last" is not achievable with a decisions.json-only change**: `secondaryTabs` entries are always appended before `customPanelTabs` entries in the generated tab array by `resolveSecondaryTabDefs` (`cli/src/generate-frontend.js`), and there is no decisions.json switch to invert that order. Getting "accounting last" (or otherwise interleaved) support built as a proper decisions.json-level option is tracked in **ETP-4415**; that work touches `DetailView.jsx`/`generate-frontend.js`, which are CODEOWNERS-gated core files outside the scope of this follow-up.

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

## ETP-4447 — CSV/TXT import

**Import button added to the list toolbar.** `decisions.json → window.import` (`enabled: true`, `spec: "product"`, `entity: "product"`, `formats: ["csv", "txt"]`) renders an Import action in `ListView.jsx`'s toolbar, opening the shared `ImportDialog` (dropzone → column mapping → review queue → send).

**Composite descriptor — 4 columns, product + price in one batch (ETP-4669).** The import supports exactly four CSV columns: `searchKey` (aliases `codigo`/`código`/`sku`), `name` (alias `nombre`), `description` (aliases `descripcion`/`descripción`), and `price` (alias `precio`). `productImportDescriptor.js` (registered as `product`, wired via `windows/custom/product/index.jsx`) builds a `product` create op from searchKey/name/description, plus — only when the row has a price — a second `price` op (`M_ProductPrice`) `parentRef`-linked to the product in the same `/batch` call, mirroring how `contactsImportDescriptor.js` links its child records. The single CSV `price` is written as `standardPrice`/`listPrice`/`priceLimit` against the org's default **sales** price list version, resolved ONCE per import run from `/price/selectors/M_PriceList_Version_ID` (the same version `ProductPriceBar.jsx`'s add-tariff flow lands on). A non-empty, non-numeric price fails that row with a friendly error; a priced row in an environment with no sales price list also fails clearly rather than guessing.

**Row-level dedupe by search key.** `window.import.dedupe` is `{ scope: "file", key: ["searchKey"] }` — an in-file duplicate SKU is flagged `skipped` rather than sent twice.

**FK fields (UOM/Category/Tax Category) get the same pick-a-value review UI as Contacts' country field:** a field that couldn't be matched renders as a click-to-open popover backed by SimSearch candidates, with live re-search as the user types and a "browse all" fallback when nothing matched at all — see `contacts.md`'s ETP-4447 section for the full review-queue mechanics (frozen Status column, per-field grid, skip/unskip), which is shared code, not Product-specific.

## ETP-4603 — Composite list identity column (`multiField`)

**The product list identity is now a generic, config-driven composite column.** What used to be a
bespoke per-window cell component (`ProductNameCell`) is now the generic `multiField` decorator
declared in `decisions.json` on the `name` grid field. No product-specific JSX backs the identity cell
anymore — the same `type: 'multiField'` column any window can adopt (see
[`docs/ui-customization.md`](../ui-customization.md) §18 and
[`docs/decisions-reference.md`](../decisions-reference.md) → *Composite list column (`multiField`)*).

**What the cell stacks:**
- **Title** — the product `name`, in bold (the host grid field the decorator sits on).
- **Subtitle chip** — the `searchKey`, rendered as a chip under the title (`multiField.subtitle`).
- **Media image** — the product `image`, fetched with an authenticated Bearer request via the
  `useNeoImage` hook (`media: { field: "image", kind: "neoImage", fallback: "box" }`); when the product
  has no image, it falls back to the package (`box`) glyph — the same recognizable fallback the gallery
  cards use.

**It behaves like real columns — sortable per part and filterable.** The decorator declares two
`parts`, each of which acts as a first-class column even though both render in one visual cell:
- **Sort per part:** clicking the *Identifier* header sorts the list by `searchKey`; clicking the
  *Name* header sorts by `name` — each part is its own sort header with its own `_sortBy`.
- **Filter expansion:** in the advanced filter builder, *Identifier* and *Name* each expand as their own
  filterable pseudo-column, so users filter by search key or name separately (not by one opaque
  "multiField" blob).

The two segments are relabeled via `parts[].labels` — *Identifier* / *Identificador* for `searchKey`
and *Name* / *Nombre* for `name` — so the composite header reads *"Identifier & Name"* /
*"Identificador & Nombre"* (default `partSeparator` `" & "`) rather than the raw field labels.

**Absorbed fields keep their data.** `searchKey` (subtitle) and `image` (media) no longer render as
their own standalone columns — they fold into the identity cell — but their per-row data still arrives,
because the list fetch sends no field projection (NEO Headless returns every configured entity field).
That is what lets the subtitle chip, the image, and the per-part sort/filter keep working on the
absorbed fields.

**Validation:** pipeline validator rule **F18** (in `schema_forge_core`) guards this decorator — it
blocks if `subtitle`, `media.field`, or any `parts[].field` references a field that does not exist on
the `product` entity, or if a sort-enabled part is not queryable. See
[`docs/pipeline-validator-reference.md`](../pipeline-validator-reference.md) (F18).

**`decisions.json` declaration** (on `entities.product.fields.name`):
```json
"name": {
  "grid": true,
  "searchable": true,
  "multiField": {
    "subtitle": "searchKey",
    "media": { "field": "image", "kind": "neoImage", "fallback": "box" },
    "parts": [
      { "field": "searchKey", "labels": { "en_US": "Identifier", "es_ES": "Identificador" } },
      { "field": "name",      "labels": { "en_US": "Name",       "es_ES": "Nombre" } }
    ]
  }
}
```

### Manual verification (ETP-4603)

15. Open `/product` and switch to (or open) the list view that renders rows as a table. Confirm the
    identity column shows the product **name** in bold with the **search key** as a chip below it and the
    product **image** (or a package glyph when absent) alongside — one cell, not three columns.
16. Click the *Identifier* header segment and confirm the list re-sorts by search key; click the *Name*
    segment and confirm it re-sorts by name.
17. Open the advanced filter and confirm both *Identifier* and *Name* appear as separately filterable
    fields.

**uOM / productCategory / taxCategory dropped (ETP-4669).** Earlier revisions mapped these three as SimSearch FK columns, but their free-text CSV values ("Otros", "Unidad", "Bebidas", …) don't fuzzy-match real `C_UOM`/`M_Product_Category`/`C_TaxCategory` records, so every row failed. They're now omitted from the import entirely, which is safe because each resolves server-side on its own: `productCategory` from its `M_Product_Category_ID` AD_Column `@SQL` default (the org's default category), and `uOM`/`taxCategory` via `NeoDefaultsService.tryInjectFirstFromLookup` (which picks the first active record for combo-style TableDir refs, ETP-3894). Stock is never settable at product-creation time (it's derived from inventory transactions) and is out of scope for the import.

## General tab and defaults — ETP-4670

- **`active` (`IsActive`) added to the `General` tab, editable.** New field entry in `decisions.json → entities.product.fields.active` (`visibility: "editable"`, `grid: false`, `section: "principal"`, `seq: 6`). It sits right after `uOM` (`seq: 5`, the "Unidad" field) in the principal section — the `seq` values were bumped for the fields that used to come after (`productType` and later fields shifted their own `seq` by one to make room).

### New-product defaults: UOM and Tax Category

When creating a new product, `uOM` now preselects the UOM row flagged `IsDefault = 'Y'`, and `taxCategory` preselects the tax category row flagged `IsDefault = 'Y'`. Both are resolved server-side by `ProductDefaultsHandler.java` (com.etendoerp.go), registered on the `product` header entity via `decisions.json → entities.product.javaQualifier: "productDefaultsHandler"`.

- **Resolution rule (both fields):** find the row of `C_UOM` / `C_TaxCategory` with `IsDefault = 'Y'` and `IsActive = 'Y'` for the **current client**; if none exists, fall back to the row flagged `IsDefault = 'Y'` for the **System client** (`AD_Client_ID = '0'`). The handler wires this both into `POST /product` (injects the id into the request body when the field is missing — an explicit user selection always wins) and into the `/product/defaults` preview endpoint (overwrites whatever the generic "first combo option" fallback would have picked).
- **Why this isn't a generic NEO fallback:** `uOM` and `taxCategory` are plain TableDir (reference id `19`) selector fields. Without this handler, NEO's generic default resolver (`NeoDefaultsService#resolveFirstComboOption` / `tryInjectFirstFromLookup`) would silently pick whichever row sorts first alphabetically — not necessarily the one flagged `IsDefault = 'Y'`.
- **Design decision — why this is NOT done via `AD_Column.DefaultValue`:** `productCategory` already gets its default this way (a native Etendo `@SQL=` expression on `AD_Column.DefaultValue`), and that path was evaluated for `uOM`/`taxCategory` too, then rejected. `C_UOM_ID` and `C_TaxCategory_ID` are columns owned by the **Core** dictionary (`AD_Module_ID = '0'`) and ship with no `DefaultValue` out of the box. Setting one would mean patching a Core column directly — it would require temporarily flipping Core's `IsInDevelopment` flag, would change behavior for every Etendo installation using that column (Classic and Enterprise included, not just Go), and would not be versionable from this module's own artifacts. Implementing the equivalent COALESCE logic (client's own default, falling back to System) at the NEO Headless layer keeps the behavior scoped to Etendo Go's `product` spec only.
- **`productCategory` still uses its native `@SQL=` default** — unaffected by this change. It now resolves *reliably* only because `ProductCategoryDefaultHandler` (see `product-category.md`, ETP-4670) guarantees `IsDefault` is unique per client, so the native SQL default no longer has more than one candidate row to pick from.
- Covered by `ProductDefaultsHandlerTest.java` (com.etendoerp.go): own-client default present, own-client absent falling back to System client, and neither present.

## ETP-4565 — Accounting tab: non-deletable record

**`entities.accounting.hideDelete: true`** added — the `accounting` secondary tab's row (Fixed Asset / Product Expense / Product Revenue / Product COGS) can no longer be deleted; `apiPrediction.crud.accounting.delete` is now `false`, which also removes the delete affordance from `SecondaryTableTab` in `DetailView.jsx` (both the row-level trash icon and the bulk-select delete bar gate on this same flag). **Resolved (follow-up pass):** the Accounting tab is capped at one record via the new `window.secondaryTabs.accounting.maxDetailLines: 1` decisions.json key — a generic capability added specifically for the `secondaryTabs` pattern (mirroring `window.maxDetailLines` for `detailEntity`), spanning `resolveSecondaryTabDefs`/`buildSecondaryTabPropEntry` in `generate-frontend.js` (`schema_forge_core`) and `resolveCanAddSecondaryLines(st, childrenCount)` in `DetailView.jsx` (this repo), which gates `secondaryAddLineBar`, the inline `addRow`, and the empty-state add trigger. See `docs/decisions-reference.md` → "Secondary Tabs (`window.secondaryTabs`)" and `docs/ui-customization.md` §17. Regenerated via `make regen ONLY=product`; `sf-validate-pipeline --scope=product` reports 0 violations. Regression tests: `artifacts/__tests__/etp-4565-accounting-tab-restrictions.test.js` (decisions.json assertion) and `tools/app-shell/src/components/contract-ui/__tests__/DetailView.secondaryTabsMaxLines.vitest.jsx` (behavioral).

**Also unresolved — tab order.** The ticket asks for `... → Precio → Contabilidad → ...`; today's order is `Accounting, Price, Attachments` (Accounting first). Per the "Tab position follow-up (ETP-4402 continued)" section above, inverting the relative order of `secondaryTabs` vs. `customPanelTabs` entries is explicitly **not achievable with a decisions.json-only change** — already tracked as **ETP-4415**, which touches CODEOWNERS-gated `DetailView.jsx`/`generate-frontend.js`. Not changed in this pass.

## Tariffs section fixes — ETP-4605

Four issues were reported against the `Price` tab. Investigation confirmed two of them,
found one already working, re-diagnosed one, and surfaced one more. All changes are
frontend-only (`ProductPriceBar.jsx` + locales): no `decisions.json`, contract, generated
file or Java change, so no `make regen` and no `export.database` were needed.

- **Tariff name instead of version name (real).** The row label preferred
  `priceListVersion$_identifier` (the version) over `priceList$_identifier` (the tariff),
  and the dropdown built its option label from the selector item's `label`/`name` — also
  the version. Both now prefer the tariff name. The backend already supplied it:
  `ProductPriceHandler` puts `pl.name` on every row and `pl.getIdentifier()` on every
  selector item, and `M_PriceList.Name` is that table's only identifier column, so the two
  sources agree. The bug looked intermittent because tariffs created from Go get a version
  with the same name; the divergence only shows on onboarding-created and legacy lists.
- **Options panel unreachable (real, but not the reported cause).** The rows list was never
  unreachable — the detail content container already scrolls. What could not be reached was
  the dropdown: `preferDown` disabled `CreatableSearchSelect`'s auto-flip, so with the add
  row at the bottom of the tab the `position: fixed` panel was drawn past the viewport edge.
  `preferDown` was dropped. The add action then moved into the section header (rendered with
  the shared `AddLineButton`) and the add row now opens at the top of the list, so neither
  depends on how many tariffs exist. The rows list keeps **no** inner scroller: the detail
  content column absorbs the growth, and because that column is a sibling of the sidebar,
  scrolling the tariffs leaves the summary panel untouched.
- **Already-priced tariffs shown in the selector (already worked).** The exclusion filter has
  been in place since ETP-4190 and matches on price-list-version id across both sections. It
  was simply untested; a regression test was added. See the Gap assessment note about price
  lists with more than one version.
- **Deleted price not offered again (real, different root cause).** Deleting *does* return the
  tariff to the selector when it was present in the fetched option list. The failing case was a
  tariff created in-session via `+ Create tariff`: it was linked by id without entering the
  cached option list, and the fetch-once guard prevented any refresh. Options are now fetched
  on every add-row open, with an explicit `limit=200` (the NEO selector endpoint defaults to 20).
- **No feedback when nothing is left to add (new).** With every tariff of the side already
  priced the dropdown rendered only `+ Create tariff` — `CreatableSearchSelect` shows its
  no-results text only when the user has typed something. An explicit hint was added
  (`priceAllSalesTariffsAssigned` / `priceAllPurchaseTariffsAssigned`, in all three locales).
- **Secondary tab strip divider did not reach the panel edge (new, and NOT product-specific).**
  Spotted while reviewing this tab. Fixed generically in `DetailView.jsx` so it applies to
  every window with secondary tabs — see "Secondary tab strip — full-bleed divider" in
  `docs/generated-custom-windows/app-shell-functional-flows.md`.

Coverage: 12 new cases in `ProductPriceBar.vitest.jsx` (label preference and fallback, option
labels, already-priced exclusion, hint shown/not shown, refetch-per-open, tariff appearing
between sessions, explicit `limit`, no inner scroller, add action in the header, add row above
the existing rows). The mocked E2E spec `e2e/tests/flows/product-pricing.mocked.spec.js` now
uses payloads where the version name and the tariff name differ, so it guards the label rule
end to end; its Accounting add-line locator was scoped to `[data-inline-add-portal]` because
`action-add-line` is no longer unique in this window.

## Stored computed columns kept out of the detail form — ETP-4603 follow-up

`eTGOPurchasePrice` / `eTGOSalePrice` / `eTGOStock` (`EM_ETGO_*` on `M_Product`, the stored
computed columns added by ETP-4603 to remove the per-row N+1 in the product list) were
leaking into the **detail** screen as a `SummaryBar` line — `eTGOPurchasePrice: 11,00 ·
eTGOSalePrice: 0,00 · eTGOStock: 559` — rendered under whatever secondary tab was active,
which made them look like part of **Accounting**.

They are not related to Accounting. The chain was:

1. `decisions.json` declared them `visibility: "readOnly"`, `grid: true`, `section: "other"`
   but left `form` at its default `true`.
2. The generator's `getReadOnlyFields()` selects `f.form && f.visibility === 'readOnly'`, and
   `getSummaryFields()` takes **all** of those minus the status field, so all three landed in
   the `summary` array of `ProductPage.jsx`.
3. `DetailView.jsx` renders `<SummaryBar>` when `!DetailTable && !isCustomTabActive`. Product
   has no lines panel, and **Accounting is a `secondaryTabs` entry, not a `customPanelTabs`
   one**, so the condition held there and the strip appeared. It correctly vanished on
   `Price` / `Attachments` (both custom tabs) — which is why it looked Accounting-specific.
4. The labels showed the raw camelCase names because `SummaryBar` resolves
   `t(field.column) ?? field.label ?? field.key`: there is no locale entry for
   `EM_ETGO_Purchase_Price`, and the generated summary entries carry no `label`. (In the DB
   the `AD_Element` names are fine — "Purchase Price", "Sale Price", "Stock" — but
   `AD_Column.Name` is the raw column name, as usual for `EM_` module-extension columns.)

**Fix:** `"form": false` on the three fields in `decisions.json`. They keep `grid: true`
(their actual purpose — list columns, still emitted in `ProductTable.jsx`), drop out of
`getReadOnlyFields()`, and the `summary` array becomes empty so the strip is not rendered.
They also stop appearing in the `Others` form (`ProductForm.jsx`). No generator or
`SummaryBar` change, so no other window is affected.

Regenerated with `make regen ONLY=product FROM_CACHE=1` (contract `0.26.0 → 0.26.1`;
`FROM_CACHE=1` is required in this environment or the local DB's missing `es_ES` ref-list
translations strip enum labels repo-wide). `sf-validate-pipeline --scope=product`: OK.

## Product import category resolution and auto-creation — ETP-4905

Extended the Products CSV/TXT import descriptor (`productImportDescriptor.js`) and contract (`artifacts/product/decisions.json`) so product categories can be supplied, matched to existing categories, or created automatically when absent:

- **Supported Headers / Aliases:**
  - `categoryCode` / `codigoCategoria` / `código categoría` / `codigo_categoria` / `category_code`
  - `categoryName` / `nombreCategoria` / `nombre categoría` / `nombre_categoria` / `category_name`
  - `category` / `categoria` / `categoría` (fallback column)
- **Resolution semantics:**
  1. Exact match on category `searchKey` / `code`.
  2. Normalized match on category `name` (case, trim, diacritics / accent-insensitive).
  3. If ambiguous (>1 match), rejects the row with a clear, localized ambiguity error.
  4. If no match exists, automatically creates the category using `categoryCode` (or derived uppercase slug from `name`) and links it to the imported product.
- **Reuse & Concurrency Protection:** In-flight resolutions are cached per import run (`getResolutionCache`), ensuring that multiple rows referencing the same new category create it exactly once and reuse its ID across concurrent workers.
- **Backward Compatibility:** Files without category columns retain existing behavior (server-side default category injection). Composite product-and-price batch operations remain fully functional.

## Logistics hidden for Service products + "Almacenable" label — ETP-4943

Two bugs reported against `Additional Info`, both frontend-only (`ProductAdditionalInfoPanel.jsx` + `es_ES.json`/`es_AR.json`): no `decisions.json`, contract, generated file or Java change, so no `make regen` and no `export.database` were needed.

- **Logistics section stayed visible/editable for Service-type products (real).** `ProductAdditionalInfoPanel.jsx` rendered the `Logistics` row (weight, UOM for weight, `Almacenable`/`Returnable`) unconditionally, with no check against `productType`. A Service product has no physical existence, so the row does not apply to it. `ProductSidebar.jsx` already applies the equivalent rule to hide the stock sidebar for Service products (ETP-4606: `if (data?.productType === 'S') return null`) — this fix brings `ProductAdditionalInfoPanel.jsx` in line with that precedent instead of introducing a new one. The whole row (title, description, both `EntityForm`s, `WeightStepper`, and the `CheckboxGroup`) plus its leading `<hr>` divider are now wrapped in `{!isService && (...)}`.
- **`stocked`/`returnable` were not forced to `false` for Service products (real).** Nothing anywhere — frontend or backend — reset these flags when the type switched to Service, so a product could be saved as Service while still flagged storable/returnable, producing inconsistent data. Fixed with a `useEffect` in `ProductAdditionalInfoPanel.jsx` that fires only while `editing` and `productType === 'S'`, calling `onChange('stocked', false, 'IsStocked')` / `onChange('returnable', false, 'Returnable')` — and only when `isCheckedYN` (the same truthiness helper `CheckboxGroup.jsx` uses for `'Y'`/`true`/`true` string forms) says the current value isn't already false, so it does not loop or fire spuriously in read-only view mode. Scoped to the frontend: the ticket's four Given/When/Then cases are all observable from the product form, so no `com.etendoerp.go` guard (in the style of `ServiceProductGuard.java`, ETP-4606's line-level defense-in-depth) was added in this pass — a candidate follow-up if a direct API write needs the same guarantee.
- **Checkbox mislabeled "Almacenado" instead of "Almacenable" (real).** `genericLabels.productStocked` in `es_ES.json` and `es_AR.json` read "Almacenado" (a state — "is currently stored") instead of "Almacenable" (a capability — "can be stored"), which is the functionally correct term regardless of current stock. Both locale files corrected to `"Almacenable"`. `en_US.json`'s `"Stocked"` was left as-is — out of scope for this ticket, which reported the Spanish label only.

**Reproduced live** with Playwright against a running instance before the fix: created a product, set `Tipo` to `Servicio`, confirmed the `Logistics` row stayed visible with both checks still checked and the checkbox read "Almacenado" — matching the ticket's steps exactly. Post-fix live re-verification against the reported test cases is tracked separately (pending an environment built from this branch).

Coverage: `tools/app-shell/src/windows/custom/product/__tests__/ProductAdditionalInfoPanel.vitest.jsx` (hide/show on type switch, force-false on becoming Service, no-op when already false, no-op in read-only mode, section + values reappear when switching back to a stockable type) and `tools/app-shell/src/locales/__tests__/etp4943-product-storable-label.vitest.js` (exact label value in `es_ES`/`es_AR`).
