# Warehouse Storage Bins

## Intent

Maintain storage-bin records in the context of a warehouse, so users can review a warehouse header and manage the locator rows that belong to it. This surface reads like warehouse maintenance with an embedded storage-bin detail area, not like an independent locator catalog.

## What this window should allow

Users should be able to browse warehouses, open one warehouse record, and then add or edit the locator rows assigned to that warehouse. Within each locator row, the current generated form exposes Search Key, X, Y, Z, Relative Priority, Default, and Active fields, while the warehouse header exposes warehouse identity and address information such as Search Key, Name, Description, address lines, City, Region, Postal Code, Country, and Active state.

## Interaction model

- Route: `/warehouse-storage-bins`, `/warehouse-storage-bins/:recordId`
- Visibility: Route-only (ETP-5795). `menu.json` marks the item `hidden: true` with `"routeOnly": true`, so it stays out of the sidebar but remains reachable by URL (`/warehouse-storage-bins`). Without `routeOnly` or `redirect` a hidden item is not registered and resolves to "Window not found".
- Implementation type: Generated
- Window shape: Master-child. The list level is `warehouse`, and the detail child rows are `locator`. On `/warehouse-storage-bins`, the user sees a warehouse list. On `/warehouse-storage-bins/:recordId`, the page renders a warehouse header with locator rows underneath.

## Reactive behavior and dependencies

The main dependency in current evidence is the hidden master/detail relationship itself: locator rows are shown and created in the context of the selected warehouse, and `WarehousePage.jsx` wires the detail view as `warehouse -> locator`. The add-line definition for locator rows only exposes locator fields, which implies the parent warehouse comes from the surrounding detail context rather than from a separate warehouse selector in each row.

No status-driven actions, totals, tax, discount, or process-driven reactions are visible in the generated page. The window declares no status field and no process actions. No dependent selector behavior is visible either, because the locator add/edit fields are plain text, number, and checkbox inputs with no catalog dependencies in `mockCatalogs.js`. The only visible read-only behavior is that `isActive` is marked read-only in both warehouse and locator forms.

## Gap assessment

- The business concept suggests each locator should be unambiguously attached to its warehouse, but that parent assignment is implicit in the detail context rather than visibly shown in the locator form. The generated UI does not make the warehouse linkage explicit inside the child editor.
- Locator defaulting may be expected in this domain, but there is no current evidence here of automatic default locator creation, automatic coordinate suggestion, or enforcement that only one locator per warehouse can be marked as default.
- Coordinate validation may be expected because locators are defined by X, Y, and Z coordinates, but the current generated form treats X, Y, and Z as plain text fields. No format, uniqueness, or cross-field validation is visible in the window evidence reviewed.
- Because the route is hidden from the side menu, discoverability depends on direct navigation or links from elsewhere. Current evidence confirms route registration, but not what user flow is supposed to lead someone here.

## Manual verification

1. Confirm there is no visible Storage Bin entry in the Inventory menu.
2. Navigate directly to `/warehouse-storage-bins` and confirm the window loads as a warehouse list rather than as a standalone locator list.
3. Open `/warehouse-storage-bins/:recordId` for an existing warehouse and confirm the page shows warehouse header fields with locator rows underneath.
4. Add or edit a locator row and confirm the row editor exposes Search Key, X, Y, Z, Relative Priority, and Default, while Active remains read-only.
5. Check whether changing the Default flag or coordinate fields triggers any validation, auto-fill, or exclusivity behavior. If nothing happens, treat locator default enforcement and coordinate validation as current gaps rather than supported behavior.

## Automated evidence

- `tools/app-shell/src/menu.json` marks `warehouse-storage-bins` as `hidden: true`, supporting the route-only visibility claim.
- `tools/app-shell/src/windows/registry.js` includes the `warehouse-storage-bins` loader in `windowLoaders`, excludes hidden entries only from `buildMenuGroups()`, and still registers all menu items in `buildWindowMap()`, supporting direct route access for a hidden window.
- `artifacts/warehouse-storage-bins/generated/web/warehouse-storage-bins/WarehousePage.jsx` shows the actual generated structure: list entity `warehouse`, detail entity `locator`, `ListView` for the route root, and `DetailView` for `:recordId`.
- `artifacts/warehouse-storage-bins/generated/web/warehouse-storage-bins/WarehouseForm.jsx`, `LocatorForm.jsx`, `WarehouseTable.jsx`, and `LocatorTable.jsx` define the currently exposed fields, filters, and read-only `isActive` behavior.
- `docs/generated-custom-windows/app-shell-functional-flows.md` documents the shared shell behavior for generated window loading and generic entity list/detail flows. No dedicated automated test file was found for this specific window.
