# Standalone DataTable grid views

This inventory covers app-shell production source that renders `DataTable` directly outside
`ListView`. It distinguishes independent data surfaces from table adapters whose controller
belongs to their parent. A component name, dashboard section, or attachment record is not a
NEO spec/entity identity.

## Inventory

There are **22 JSX callsites in 18 files** under `tools/app-shell/src`, excluding tests and
comments. The paths below are relative to that directory. Searches of imports, aliases, and
`createElement` found no additional direct renderers.

| Component | Sites | Context and handling |
| --- | ---: | --- |
| `pages/AccountingPage.jsx` | 4 | Sales invoices, purchase invoices, bank summary, and tax summary use generated dashboard `mockData`. No runtime spec/entity contract is supplied; personal views remain unavailable. |
| `pages/CrmPage.jsx` | 1 | Generated dashboard `mockData`; no runtime spec/entity contract. |
| `pages/HrPage.jsx` | 1 | Generated dashboard `mockData`; no runtime spec/entity contract. |
| `pages/InventoryPage.jsx` | 1 | Generated dashboard `mockData`; no runtime spec/entity contract. |
| `pages/ProjectsPage.jsx` | 2 | Time and document dashboard sections use generated `mockData`; neither supplies a runtime spec/entity contract. |
| `pages/ReportsPage.jsx` | 1 | The selected dashboard report changes the columns and mock rows; no stable runtime entity identity is supplied. |
| `components/attachments/AttachmentsTable.jsx` | 1 | Record attachments are an attachment projection; its component contract does not supply the owner spec/entity. No identifier is invented. |
| `windows/custom/calendar/AccountingPanel.jsx` | 1 | Migrated independent Calendar accounting surface, backed by `end-year-close/accounting`. |
| `windows/custom/calendar/PeriodsExpandablePanel.jsx` | 1 | Migrated independent Calendar periods surface, backed by `open-close-period-control/periodControl`. |
| `windows/custom/calendar/YearTableWithCloseStatus.jsx` | 1 | Migrated local fallback for `fiscal-calendar/year` on the combined Calendar route; an inherited controller with nonempty `availableKeys` retains ownership, including while it is loading. |
| `windows/custom/contacts/ContactsTable.jsx` | 1 | Custom table adapter; preserve the parent controller and forwarded selection, filters, and actions. |
| `windows/custom/product/ProductCustomTable.jsx` | 1 | Custom table adapter; its own column definitions override the generic parent columns. |
| `windows/custom/product/StockTableGrouped.jsx` | 1 | Dormant renderer: no production importer/reference was found. The active Product stock table is generated. Left unchanged; its grouped warehouse projection must not inherit a guessed identity. |
| `windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx` | 1 | Custom header table adapter; preserve forwarded parent state. |
| `windows/custom/shared/PaymentHeaderTableBase.jsx` | 1 | Shared incoming/outgoing payment table; the caller supplies `specName`, and parent state must retain that scope. |
| `windows/custom/user/UserHeaderTable.jsx` | 1 | Custom header table adapter; preserve forwarded parent state and inline actions. |
| `windows/custom/warehouse/WarehouseCustomTable.jsx` | 1 | Custom table adapter; preserve forwarded parent state. |
| `windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx` | 1 | Migrated cross-document posting projection, backed by `not-posted-documents/header`; it does not use individual rows' source-document specs. |

`ListModalWindow` renders its own grid, rather than `DataTable`. `InlineLinesPanel` and
`DetailView` mention `DataTable` in comments but are not additional direct renderers in this
inventory. Those components, `ListView`, `WindowLoader`, the registry, flags, `DataTable`,
`useGridView`, and `GridViewControls` are owned by separate work slices.

## Identity and preservation rules

Calendar is a combined frontend route with no `calendar` NEO spec. Its secondary panels use
their existing backing resources: `artifacts/end-year-close/decisions.json` declares the
`accounting` entity, and `PeriodsExpandablePanel` fetches the `periodControl` entity of
`open-close-period-control`. A selected year filters the rows; it does not create a new grid
identity for each year.

Not Posted Documents already fetches `/header` under its own spec. Its configured runtime
`ETGO_SF_SPEC` and `ETGO_SF_ENTITY` records identify `not-posted-documents/header`, so the
projection has a real grid identity even though its rows originate in different document
types.

Personal views configure column visibility, order, and widths through the existing
`useGridView` and `GridViewControls` APIs behind `GRID_COLUMN_VIEWS`. Sorting, filtering,
selection, row actions, and writes remain owned by the existing caller. Default widths remain
the existing defaults when no personal view applies. Fixed structural columns and inline
contracts must remain fixed; a second controller must not replace one already supplied by a
parent.

The Calendar year table supplies its own controller only when no inherited controller has
nonempty `availableKeys`. An inherited controller need not be active yet: treating loading
as absence would issue a second preference request and render duplicate controls. The six
other active custom adapters in the inventory continue to use their existing parent
`ListView` controller; this slice does not create additional controllers in them.

Accounting keeps its non-selectable rows, account renderer, currency-aware amounts, disabled
sorting and totals, tab count, and separate loading/error/empty states. Periods keeps the
year criterion, chronological fetch order, localized period/status renderers, read-only role
restrictions, eligible-row selection, row confirmations, bulk actions, and refresh behavior.
Not Posted Documents keeps its URL-backed date/type/status filters and client-side sorting,
row navigation/posting, bulk selection/posting, and fixed structural columns. Saving a grid
view does not persist those filters, selection, or business actions.

The fixed checkbox and row-quick-action cells are structural `DataTable` slots, outside the
configurable columns array. The migration does not add them to saved views. The year table
also keeps its ref, parent props, current-year tour marker, and close-status renderer.

## Attachments: blocked by the persistence contract

`components/attachments/AttachmentsTable.jsx` remains unchanged. Its attachment resource is
the cross-cutting `/attachments/{tableName}/{recordId}` endpoint, not a configured NEO
entity. Supplying the owning document's header identity would overwrite that document
list's personal view; supplying an invented `attachments` entity would fail entity lookup.
No production or test changes were made for this blocked surface.

The source investigation followed both the API and the actual hosts:

| Path inspected | Constraint |
| --- | --- |
| `../modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoBuiltInEndpointHandler.java:268-278` | Grid-view requests require a real window (`W`) spec, window access, and a configured entity resolved by `findEntity`. Lines 394-407 route attachments separately by table and record. |
| `../modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoGridViewsService.java:123-128` and `:231-234` | The service accepts only the `list` surface, and persistence scope hashes the spec/entity pair. Reusing `header` collides with the existing document list view. |
| `tools/app-shell/src/components/contract-ui/DetailView.jsx:1888-1906` | Custom-tab props pass record/data/token/API/read-only context and configured `ct.props`; there is no explicit owner spec/entity contract. |
| `../schema_forge_core/cli/src/generate-frontend.js:1390-1398` | Generated attachment configuration supplies `tableName` and `config`, without a grid identity. |
| `artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx:693`, `artifacts/purchase-invoice/generated/web/purchase-invoice/HeaderPage.jsx:1082`, and `tools/app-shell/src/windows/custom/user/index.jsx:562` | Actual generated and custom hosts use that same attachment contract. Generated files were inspected only. |
| `tools/app-shell/src/components/contract-ui/lookupCreateTargets.js:307` | The Product lookup-create attachment tab supplies `tableName: 'M_Product'` and `config: {}` only. |
| Fiscal-model 303, 349, and 390 attachment hosts, and `SifAttachmentsSection.jsx:29-47` | Bespoke fiscal-record attachment hosts likewise supply table/record context without a grid identity. |

The prerequisite is a collision-free attachment-surface persistence API contract, followed
by explicit propagation of the actual owner context through generated, custom, lookup-create,
and fiscal attachment callers. That work must establish the supported identity rather than
inventing a spec/entity in this consumer slice.

## Validation status

Authored coverage extends `AccountingPanel.vitest.jsx`, `PeriodsExpandablePanel.vitest.jsx`,
and `NotPostedDocumentsPage.vitest.jsx`, and adds
`YearTableWithCloseStatus.gridViews.vitest.jsx` under the corresponding custom-window
`__tests__` directories. These tests exercise the real table, hook, and controls with the
request boundary mocked: flag-off absence of preference requests; stable resource scopes;
column hiding and explicit save; retained loading/empty states, sort, selection, and row
actions; read-only period restrictions; and reuse of a pending or ready parent controller.
The separate Year suite is needed because the existing close-status renderer suite stubs
`DataTable` completely. Test reuse: **Extended 3 · Rewritten 0 · New 1**.

The full app-shell `npm run test:all` suite passed (1,175 Vitest files; 24,617 tests passed,
2 skipped), and `npm run build` passed. The mock-browser smoke covered Sales Order only; it
did not exercise these independent DataTable surfaces or authenticated preference persistence.
Lint/formatters and human QA remain pending.
