# Warehouse

## Intent

Use this window to maintain warehouse master records and understand what is physically stored in and moving through each warehouse. Beyond basic setup, the window surfaces operational stock data — total valuation, products with stock, per-product quantities — and provides a full transaction history tracing how stock arrived, moved, or left the warehouse.

## What this window should allow

- Create, review, and update a warehouse header with Search Key, Name, Location / Address, and Description.
- After creation, observe that a default storage bin is automatically created with the coordinate pattern `<searchKey>-0-0-0`.
- Open a saved warehouse and use the detail surface as an operational workspace: view stock data in the sidebar, inspect per-product stock in the Products tab, and trace movements in the Transactions tab.
- Follow navigable links from transaction rows directly to the source document (goods receipt, goods shipment, goods movement, or physical inventory) when a GO window exists for that document type.
- Attach files to a warehouse record via the Attachments tab.

## Interaction model

- Route: `/warehouse` for the list, `/warehouse/:recordId` for detail.
- Visibility: visible from the Inventory menu as **Warehouse**.
- Implementation type: custom window. `tools/app-shell/src/windows/registry.js` resolves `warehouse` through `customLoaders`. The custom wrapper (`tools/app-shell/src/windows/custom/warehouse/index.jsx`) mounts the generated `WarehousePage` with overridden table, sidebar, secondary tabs, and layout props.
- Window shape: single-entity master with custom secondary tabs. `decisions.json` declares `detailEntity: null`; the detail page combines the warehouse header form with stock-derived surfaces (sidebar summary, Products tab, Transactions tab), the generated **Accounting** tab (see "Accounting subtab" below), and the standard Attachments tab.

## List view

The list uses `WarehouseCustomTable` in place of the default generated table. Columns:

| Column | Behavior |
|--------|----------|
| **Name** | Bold, `font-semibold`, color `#121217` |
| **Identifier** (Search Key) | Pill badge: `bg-[#F5F7F9]`, rounded-lg, `text-xs`, color `#3F3F50` |
| **Location** | Resolved from `locationAddress$_identifier`, falls back to raw `locationAddress`. Not sortable. |
| **Products** | Dynamic count cell (`WarehouseProductCountCell`): fetches storageBins then binContents per warehouse row, aggregates via `aggregateProducts`, displays count of products with `qty != 0` (includes negative stock, excludes exact zero — see "Stock filtering semantics" below). Shows `—` while loading or on error. Not sortable. |

Print and Link buttons are hidden (`hidePrint`, `hideLink`). Custom sort and refresh icons match the Products window style (`SortIcon`, `RefreshIcon` from `@/components/ui/custom-icons`). List toolbar and table use 8 px horizontal/vertical padding throughout (`listbarPaddingX="px-2"`, `tablePaddingX="px-2"`, etc.).

Search filters on `searchKey` and `name`.

## Detail view

### Layout

The detail page uses a split layout:

- **Left side**: header form + tabs below it.
- **Right sidebar** (30% width, `w-[30%]`): contains only `WarehouseSummary`. The sidebar is constrained to the area above the tabs (`sidebarAboveTabsOnly`), so tabs span the full width below the form.

Visual separators: `toolbarBorderBottom` draws a line between the toolbar and the form area; `tabsSeparator` draws a line between the form/sidebar and the tabs strip. The form area uses `p-2` (`formCardPadding`), scroll areas use `px-2` (`formScrollPaddingX`), and the tab content area uses `p-2 overflow-y-auto max-h-[calc(100vh-380px)]`.

`noHeaderBorder` removes the default form card border.

### Form fields

4-column layout (`formCols: 4`). Visible fields in sequence order:

| Field | seq | span | Notes |
|-------|-----|------|-------|
| Search Key | 1 | 1 | Searchable, shown in grid |
| Name | 2 | 1 | Searchable, shown in grid |
| Location / Address | 3 | 2 | Shown in grid |
| Description | 4 | 4 (full row) | `rows: 1` (single-line height) |

Discarded fields (not shown anywhere): `warehouseRule`, `storageBinSeparator`, `shipmentVehicle`, `shipperCode`, `fromDocumentNo`, `toDocumentNo`, `mReturnlocatorID`, `allocated`. The `discardPatterns: ["EM_*"]` rule additionally suppresses all Etendo module extension fields from the header form.

### After-create behavior

On successful warehouse creation, the wrapper calls `createDefaultStorageBin`, which POSTs to `/sws/neo/warehouse/storageBin` with:

```json
{
  "warehouse": "<warehouse.id>",
  "organization": "<warehouse.organization>",
  "searchKey": "<warehouse.searchKey>-0-0-0",
  "rowX": "0", "stackY": "0", "levelZ": "0",
  "relativePriority": 50,
  "default": true
}
```

If this POST fails, the warehouse remains saved and a `toast.warning` is shown — no rollback of the warehouse itself.

## Sidebar — Stock Data

`WarehouseSummary` renders above the tabs on the right side. It calls `useWarehouseStock` and displays two metrics:

| Metric | i18n key | Value |
|--------|----------|-------|
| Total Valuation | `warehouseTotalValuation` | Sum of `etgoValuation` across all aggregated products with `qty > 0`, formatted via `formatCurrency(currencyCode, totalValuation)`. Currency from `useCurrency()`, defaults to `USD`. |
| Products with Stock | `warehouseProductsWithStock` | Count of products with `qty > 0`, filtered by `WarehouseSummary` itself from the full `aggregateProducts` output. Deliberately positive-only — see "Stock filtering semantics" below, this differs on purpose from the `!= 0` predicate used by the Products tab and list column. |

Each metric has a badge below the value:

- Valuation badge (`warehouseValuationBadge`): `bg-[#F5F7F9]`, text `#3F3F50` — label "Stock × current cost" / "Stock × coste actual".
- Products badge (`warehouseProductsWithStockBadge`): `bg-emerald-50`, text `emerald-700` — label "In stock > 0" / "Con existencia > 0".

While data is loading, the sidebar shows a loading message (`warehouseLoadingStock`). On error, it shows an error message (`warehouseStockError`).

## Data layer — `useWarehouseStock`

Both `WarehouseSummary` and `WarehouseProductsTab` share this hook. `WarehouseTransactionsTable` also uses it for the `transactions` slice.

Fetch sequence on warehouse selection:

1. In parallel: fetch all storage bins (`/storageBin?parentId=<warehouseId>&_startRow=0&_endRow=100`) and UOM translations (`/binContents/selectors/uOM?_startRow=0&_endRow=500`).
2. For each bin, in parallel: fetch `binContents` (up to 1 000 rows per bin) and `productTransactions` (up to 2 000 rows per bin).
3. Flatten all bin contents, call `aggregateProducts(allContents, uomMap)` to produce the `products` array.
4. Flatten all transaction rows, expose as `transactions`.

`aggregateProducts` (`warehouseUtils.js`): deduplicates `M_Storage_Detail` rows by `product` ID, summing `quantityOnHand` and `etgoValuation` (the latter injected live per row by `BinContentsHandler` — see Valuation mechanism). It returns **all** aggregated products, including zero and negative summed quantities — it applies no qty filter itself. UOM is resolved from the `uomMap` selector cache first, then from `uOM$_identifier`, then from the raw UOM ID. Each consumer applies its own qty predicate on the returned array; see "Stock filtering semantics" below.

The `WarehouseCustomTable` product-count cell runs the same fetch sequence independently (no shared state with the detail hook).

### Stock filtering semantics

`aggregateProducts` is filter-agnostic by design — the list count, the Products tab, and the KPI card each need a different qty predicate, so each consumer filters the array itself instead of relying on a filter baked into the shared helper:

| Consumer | Predicate | Rationale |
|---|---|---|
| Products list column (`WarehouseCustomTable`) | `qty != 0` | Counts anything physically imbalanced, including negative stock (e.g. a shipment posted ahead of its receipt). Exact-zero stock is excluded. |
| Products tab (`WarehouseProductsTab`) | `qty != 0` | Same rule as the list column — the detail table should show every product with a non-zero balance, negative or positive. |
| "Products with Stock" KPI (`WarehouseSummary`) | `qty > 0` | Deliberately narrower — the KPI answers "how many products do I actually have on hand", so negative and zero balances don't count. |

This is an intentional, permanent split, not an inconsistency to "unify": the list/detail views and the KPI answer different questions. Do not make the KPI use `!= 0` or make the list use `> 0` without confirming the semantic change is wanted.

The NEO backend (`BinContentsHandler`) already returns negative and zero rows unfiltered; the `!= 0` vs `> 0` split above is a frontend-only concern, applied at each call site after `aggregateProducts`.

## Tabs

### Products tab

Registered as secondary tab with key `products`, label `warehouseProductsTab`, panel `WarehouseProductsTab`.

Renders a plain `<table>` — no DataTable component, no sort arrows, no search. Columns:

| Column | Alignment | Notes |
|--------|-----------|-------|
| Product | left | `product$_identifier` |
| UOM | left | Resolved from `uomMap` or `uOM$_identifier` |
| Valuation | right, tabular-nums | `formatCurrency(currencyCode, p.valuation)`. Shows `—` when valuation is falsy. |
| Stock | right, tabular-nums | Quantity on hand, formatted to 2 decimal places (`fmtQty`). |

Data comes from the `products` slice of `useWarehouseStock` — aggregated from `M_Storage_Detail` (via `binContents` endpoint) across all of the warehouse's storage bins, then filtered to `qty != 0` by `WarehouseProductsTab` itself (includes negative stock, excludes exact zero — see "Stock filtering semantics" above). No image column. Empty state shows `warehouseNoStock` centered message.

Calls `onCount(products.length)` after load so the tab strip can display a count badge.

### Transactions tab

Registered as secondary tab with key `productTransactions`, label `warehouseTransactionsTab`, panel `WarehouseTransactionsTable`. The `productTransactions` entity in `decisions.json` declares `javaQualifier: "productTransactionsHandler"`, which routes NEO Headless through the `ProductTransactionsHandler` NeoHandler bean. That handler joins `M_Transaction` to its source line and header, injecting three fields onto each transaction row:

- `etgoDocHeaderId` — ID of the source document header
- `etgoDocWindow` — slug of the GO window that handles that document type
- `etgoDocLabel` — human-readable document identifier (document number, or `name` for physical inventories)

The tab fetches transactions from the `transactions` slice of `useWarehouseStock` (collected from all bins via `productTransactions?parentId=<binId>`), then sorts client-side by `movementDate` descending. Sort is fixed — no sort arrows, no user-accessible sort controls. No search.

Columns:

| Column | Alignment | Notes |
|--------|-----------|-------|
| Date | left, `font-semibold`, tabular-nums | `DD/MM/YYYY` format |
| Type | left, `text-muted-foreground` | Resolved from `movementType$_identifier` or mapped via `TYPE_KEY_MAP` i18n key |
| Document | left | Navigable `DocumentLink` (underline + ↗ icon) when `etgoDocWindow` and `etgoDocHeaderId` are present; plain text otherwise |
| Product | left | `product$_identifier` |
| Qty | right, tabular-nums, `font-semibold` | Positive: `emerald-600` with leading `+`. Negative: `text-destructive`. |

Movement type to source document mapping (resolved server-side by `ProductTransactionsHandler`):

| MovementType | Source join | GO window |
|---|---|---|
| `V+` | `M_InOutLine → M_InOut` | `goods-receipt` |
| `C-` | `M_InOutLine → M_InOut` (issotrx = Y) | `goods-shipment` |
| `M+` / `M-` | `M_MovementLine → M_Movement` | `goods-movements` |
| `I+` / `I-` | `M_InventoryLine → M_Inventory` | `physical-inventory` (identifier = `name` column, not `documentno`) |
| `P+` / `P-` | `M_ProductionLine → M_Production` | No GO window yet — plain text |
| `D-` / `D+` | `M_Internal_ConsumptionLine → M_Internal_Consumption` | No GO window yet — plain text |

`documentLabel()` prefers `etgoDocLabel`, then falls back to `goodsShipmentLine$_identifier`, `movementLine$_identifier`, `physicalInventoryLine$_identifier`, or `productionLine$_identifier`.

Empty state shows `warehouseNoTransactions` centered message.

Calls `onCount(transactions.length)` after load.

## Valuation mechanism

Each `binContents` row exposes `etgoValuation = qtyonhand × current cost`, where the
current cost is the most recent permanent, active, not-yet-expired `M_Costing` row for
the product. This value is **computed at read time**, not read from a persisted column.

- **`BinContentsHandler`** (`@Named("binContentsHandler")`, NEO post-hook on the
  `binContents` entity): `afterHandle` injects `etgoValuation` into every row of a GET
  response via one batched native SQL query (`qtyonhand × current cost`). Because it
  computes live from the current quantity on hand and the current cost, the value is
  always correct regardless of how stock moved. The `binContents` entity declares
  `javaQualifier: "binContentsHandler"` in `decisions.json`.

### Why read-time (and not event handlers)

The original design persisted the value in an `EM_ETGO_VALUATION` column maintained by
EventHandlers, but that left the column stale after any stock-out. Two facts make DAL
event handlers unreliable for stock valuation:

1. Outbound documents (shipments, internal consumption) do **not** create an `M_Costing`
   row in Average costing, so a costing-event handler never fires on a sale.
2. `M_Storage_Detail.qtyonhand` is updated during document processing by the
   `M_Update_Inventory` database routine (raw SQL), **not** through the Java DAL — so an
   `EntityPersistenceEventObserver` on the storage detail never fires on a stock movement.

As a result the persisted column only refreshed on inbound costing events (purchase
receipt, physical inventory), never on sales. Both valuation EventHandlers
(`StorageDetailValuationHandler` and `CostingValuationHandler`) were therefore removed —
read-time computation is the single source of truth.

The `EM_ETGO_VALUATION` column still exists on `M_Storage_Detail` (its AD definition is
required for the `etgoValuation` field to exist in the contract), but nothing writes to
it anymore — it stays inert/empty. The GO frontend always uses the live value injected by
`BinContentsHandler`.

The `binContents` entity in `decisions.json` exposes `etgoValuation` as a read-only grid
column (`grid: true, form: false, visibility: "readOnly"`). The `aggregateProducts`
helper sums it across all bin-content rows for each product to produce the per-product
and warehouse-total valuations shown in the sidebar and Products tab.

## Accounting subtab (`accounting` entity)

Added by ETP-4565 (scope-expanded follow-up to ETP-4402 — "Contabilidad tab: single record + non-deletable" across 8 master-data windows). The native AD `Warehouse and Storage Bins` window (`AD_Window_ID = 139`) has an "Accounting" tab (`ad_tab_id = 209`, table `M_Warehouse_Acct`); it is now wired into the custom warehouse window as a `secondaryTabs` entry, the same pattern used by `product`/`asset-group`.

The Accounting tab maps to `M_Warehouse_Acct` and exposes exactly one visible field:

| Field | Notes |
|-------|-------|
| Warehouse Differences (`W_Differences_Acct`) | Editable, required, `ValidCombination` selector with the drawer-style lookup picker. |

`accountingSchema` (visibility `system`, `derivation: "fromConfig"`) and `warehouse` (visibility `system`, `derivation: "fromParent"`) drive the record but are not shown to the user. `warehouseInventory`, `inventoryRevaluation`, and `inventoryAdjustment` are discarded (not exposed).

**Declared in `decisions.json` (`window.secondaryTabs.accounting` + `entities.accounting`):**

```json
"secondaryTabs": {
  "productTransactions": { "tabOrder": 1, "label": "Transactions", "customPanel": "WarehouseTransactionsTable" },
  "accounting": { "tabOrder": 2, "label": "Accounting" }
}
```

```json
"accounting": {
  "name": "accounting",
  "hideDelete": true,
  "fields": { "warehouseDifferences": { "visibility": "editable", "grid": true, "form": true, "required": true, "lookup": true, "grow": true, "seq": 1 }, "...": "system/discarded fields omitted" }
}
```

**`entities.accounting.hideDelete: true`** — the Accounting tab's row can no longer be deleted (`apiPrediction.crud.accounting.delete: false`), the same gate used by `product`/`asset-group`'s `secondaryTabs.accounting`. **Not yet addressed:** same as `product`/`asset-group`, this window's Accounting tab uses `window.secondaryTabs` (not `detailEntity`), so there is no existing "cap at one record" mechanism (`window.maxDetailLines` only applies to the `detailEntity` pattern) — tracked as a Schema Forge Developer follow-up, not implemented in this pass.

Regenerated via `make regen ONLY=warehouse`; `sf-validate-pipeline --scope=warehouse` reports 0 violations. Regression test: `artifacts/__tests__/etp-4565-accounting-tab-restrictions.test.js`.

**Auto-creation (requirement 3) is a separate, still-open gap, independent of this wiring fix:** of the 18 most-recently-created warehouses (at the time of the original ETP-4565 investigation), 0 had a `M_Warehouse_Acct` row (older, non-GO-created warehouses in the same DB do have one — `m_warehouse_acct` had 14 rows total, all pre-dating the current onboarding flow). Backend auto-creation of the accounting row is out of scope for this frontend-wiring pass and remains flagged as follow-up work.

## Known gaps

- **Production and internal consumption not navigable**: transactions with movement types `P+`, `P-`, `D-`, `D+` have no corresponding GO window. The Document column renders plain text instead of a navigable link. This will remain until GO windows for those document types are built.
- **Default-bin uniqueness**: the after-create hook always attempts to POST `<searchKey>-0-0-0`. If a bin with that search key already exists, the POST may fail silently (user sees a warning toast). No backend uniqueness enforcement is documented here.
- **Storage bin management not surfaced**: `storageBin` is declared in `decisions.json` and available via the NEO API, but the custom warehouse page does not expose a dedicated bins tab or inline bin editing. Bin maintenance must happen through other means.
- **No bin-contents tab**: `binContents` data is consumed by the hook and aggregated into the Products tab view. There is no raw bin-contents surface exposed in the custom page.
- **Product count in list is async**: `WarehouseCustomTable` fetches product counts independently per row on render. In large lists this generates multiple parallel requests. Counts show `—` until resolved; errors also show `—` silently.
- **Transaction fetch ceiling**: the hook fetches up to 2 000 transactions per storage bin. Warehouses with very high transaction volumes may not show the full history.

## Automated evidence

- `tools/app-shell/src/windows/custom/warehouse/index.jsx` — custom wrapper, props passed to `WarehousePage`, after-create bin creation logic.
- `tools/app-shell/src/windows/custom/warehouse/WarehouseCustomTable.jsx` — list column definitions and product-count cell.
- `tools/app-shell/src/windows/custom/warehouse/WarehouseSummary.jsx` — sidebar metrics (valuation, products with stock).
- `tools/app-shell/src/windows/custom/warehouse/WarehouseProductsTab.jsx` — Products tab table.
- `tools/app-shell/src/windows/custom/warehouse/WarehouseTransactionsTable.jsx` — Transactions tab table, document navigation, movement type mapping.
- `tools/app-shell/src/windows/custom/warehouse/useWarehouseStock.js` — shared data fetch hook (bins → binContents + productTransactions, UOM resolution).
- `tools/app-shell/src/windows/custom/warehouse/warehouseUtils.js` — `aggregateProducts` helper. Returns all aggregated rows unfiltered; each consumer (`WarehouseProductsTab.jsx`, `WarehouseCustomTable.jsx` with `!= 0`, `WarehouseSummary.jsx` with `> 0`) applies its own qty predicate — see "Stock filtering semantics".
- `artifacts/warehouse/decisions.json` — field visibility, form layout (4 cols), discarded fields, `javaQualifier` for productTransactions entity, `secondaryTabs.accounting` + `entities.accounting.hideDelete` (ETP-4565).
- `artifacts/__tests__/etp-4565-accounting-tab-restrictions.test.js` — regression guard: `entities.accounting.hideDelete` must be `true`.
- `tools/app-shell/src/windows/custom/warehouse/__tests__/warehouseUtils.test.js` / `warehouseUtils.vitest.js` — unit tests for `aggregateProducts` (cross-bin summation, UOM resolution, numeric coercion; no longer filters by qty).
- `tools/app-shell/src/windows/custom/warehouse/__tests__/WarehouseProductsTab.vitest.jsx` — regression guard: list keeps negative-stock rows, hides exact-zero.
- `tools/app-shell/src/windows/custom/warehouse/__tests__/WarehouseSummary.test.js` / `WarehouseSummary.vitest.jsx` — regression guard: KPI predicate stays `> 0` (excludes negatives and zero).
- `tools/app-shell/src/windows/custom/warehouse/__tests__/WarehouseCustomTable.test.js` — regression guard: list-view product-count cell uses `!= 0`.
- `tools/app-shell/src/windows/__tests__/registry.test.js` — proves the `warehouse` slug is registered in the window map.

## Manual verification

1. Open `/warehouse` and confirm the list shows Name (bold), Identifier (pill badge), Location, and Products (async count) columns. Confirm Print and Link buttons are absent.
2. Create a warehouse with Search Key, Name, and Location / Address. Save and confirm the detail opens with the sidebar on the right (above tabs only), a 4-column form, and the tabs spanning the full width below.
3. Confirm a default storage bin is created automatically with the `<searchKey>-0-0-0` pattern. If it fails, confirm a warning toast appears and the warehouse record still exists.
4. In the sidebar, confirm Total Valuation and Products with Stock display (or zero/empty state if no stock).
5. Open the **Products** tab and confirm rows show Product, UOM, Valuation (currency-formatted), and Stock columns with no sort arrows. Confirm exact-zero-quantity products are absent, but a product with negative stock (e.g. oversold) IS listed with a negative Stock value. Confirm the Products list column count and the Products tab row count match (both use `qty != 0`).
6. In the sidebar, confirm "Products with Stock" counts only strictly-positive-quantity products — a product with negative stock should be excluded from this KPI even though it appears in the Products tab.
7. Open the **Transactions** tab and confirm rows are sorted by date descending with no user-accessible sort. Confirm the Date column renders as `DD/MM/YYYY`.
8. For a goods-receipt transaction, confirm the Document column shows a navigable link (underline + ↗) that navigates to `/goods-receipt/<id>`.
9. For a production or internal-consumption transaction, confirm the Document column shows plain text (no link).
10. Confirm positive quantities are green with a leading `+` and negative quantities are red.
11. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file, download it, and delete it. When multiple files exist, confirm **Download all (ZIP)** and **Delete all** (with confirmation dialog) appear.
12. Open the **Accounting** tab and confirm the Warehouse Differences selector is editable and required. Confirm no delete (trash) affordance is available on the accounting row.
