# Business Partner

## Intent

Maintain a business partner header record and its attached location records in one place. The current evidence supports a reference-style maintenance window for partner identity, search key, tax and credit data, plus a child collection of address/contact rows.

## What this window should allow

- Create, search, open, update, and delete business partner header records.
- Maintain the core header fields exposed by the contract: name, search key, tax ID, description, and credit limit.
- Review read-only header state that comes from the backend, especially credit used and active status.
- From an opened business partner, add, review, edit, and remove location rows tied to that partner.
- Treat locations as subordinate records of the current partner detail view, not as a separate workflow inside this window.

## Interaction model

- Route: list route `/business-partner`; detail route `/business-partner/:recordId`.
- Visibility: retired route (ETP-5795). `menu.json` marks the window `hidden: true` with `"redirect": "/contacts"`, so `/business-partner` and `/business-partner/:recordId` replace the URL with `/contacts`; the improved `contacts` window is the only supported entry point.
- Implementation type: generated window using `ListView` for the header list and `DetailView` for the header-plus-location detail screen.
- Window shape: master-child. The master entity is `businessPartner`; the child entity is `bpLocation`. The list route shows only header records, while the detail route opens the header form with the embedded locations table/form.
- Header interaction: the header form exposes editable business partner fields, while `creditUsed` and `active` are rendered read-only in the generated form and summary.
- Location interaction: the embedded child surface exposes location name, address, city, postal code, country, and phone. In this window, location work is attached to the current parent record rather than managed as an independent record selection flow.

## Reactive behavior and dependencies

- Parent/child dependency is explicit in the generated page: the detail view binds `businessPartner` as the parent entity and `bpLocation` as the detail entity.
- Shared app-shell behavior indicates that when a child row is created, the client posts it with the current parent id and then refreshes both child rows and the header record. For this window, users should therefore expect newly added locations to appear under the open partner immediately, and any header data dependent on child writes to be re-fetched.
- The child contract requires a business partner foreign key, but in the embedded business-partner window that relationship is implicit through the parent context rather than exposed as a user-editable selector.
- Credit used and active status are observable summary/read-only fields on the header, but current evidence does not show any status-driven actions, approval flow, or conditional lock/unlock behavior tied to those values.
- No dependent selectors, tax reactions, discount reactions, child totals, or address defaulting logic are visible in the current contract or generated page. The embedded location form currently behaves like basic reference maintenance for address/contact data.

## Gap assessment

- The business meaning of multiple locations is not fully expressed. Current evidence shows generic address/contact rows only; it does not show billing-vs-shipping roles, default-location flags, or ordering rules between locations.
- The embedded location form treats `country` as plain text in the generated UI evidence. If the intended behavior is a validated country reference or country-driven regional dependency, that is not currently visible here and remains an open ambiguity.
- The standalone `bp-location` contract exposes a searchable `businessPartner` reference, but the embedded child flow in this window does not show whether users can reassign a location to another partner from the detail screen. Current evidence suggests locations are maintained under the current header only.
- There is no current evidence of business-partner-specific automation around credit exposure, activation changes, or downstream process effects. Those behaviors should be treated as unsupported or undocumented until shown elsewhere in the codebase or contracts.

## Manual verification

1. Open `/business-partner` directly and confirm the window loads even though it is hidden from the menu.
2. Open an existing record at `/business-partner/<recordId>` and confirm the detail page shows both the business partner header and the embedded locations table/form.
3. Create or edit a location row and confirm it stays attached to the currently opened business partner rather than prompting for a separate parent-selection workflow.
4. Confirm the header shows read-only `Credit Used` and `Active` values while allowing edits to the intended maintenance fields such as name, search key, tax ID, description, and credit limit.
5. If multiple locations exist, confirm they behave as simple attached records; note any billing/shipping/default semantics as a product gap unless the UI now shows explicit support.

## Custom component notes

- **`BusinessPartnerSidebar`** — the sidebar KPI cards (revenue this month, expenses this month) and the trend-chart tooltip display monetary amounts using the org's configured currency via `useCurrency()` and `formatCurrency()`. The currency symbol shown (e.g. `EUR`, `USD`) reflects the organization's setting rather than a hardcoded value.
- **`BPChartSVGContent`** — the chart SVG sub-component is now a named export (`export function BPChartSVGContent`) so that other windows (currently the contacts sidebar) can reuse the same chart rendering logic without duplicating code. It uses `niceScale`, `formatDashboardAxisTick`, `toBezierPath`, and `toBezierFillPath` from the shared `@/lib/dashboardNumberFormat` utility, which provides clean Y-axis scale values and smooth bezier curve paths for the revenue/expenses lines and fill areas.

## Automated evidence

- `artifacts/business-partner/generated/web/business-partner/BusinessPartnerPage.jsx` defines a `ListView` for `businessPartner` and a `DetailView` that pairs `businessPartner` with child entity `bpLocation`.
- `artifacts/business-partner/generated/web/business-partner/BusinessPartnerForm.jsx`, `BpLocationTable.jsx`, and `BpLocationForm.jsx` show the generated header fields, child columns, and child form fields currently exposed in the UI.
- `artifacts/business-partner/contract.json` defines the header fields, read-only `creditUsed` and `active` fields, the `bpLocation` child entity, and CRUD endpoints for both entities.
- `tools/app-shell/src/menu.json` keeps the window hidden, and `tools/app-shell/src/windows/registry.js` registers the route loader for `business-partner`.
- `docs/generated-custom-windows/app-shell-functional-flows.md` documents the shared shell behavior for generated routes, detail loading, defaults handling, and child-row refreshes. There is no business-partner-specific automated UI test in the current repo.
