# Cost Center

## Intent
Maintain the flat Cost Center master used as an accounting dimension for cost allocation, with a simple create/edit/list flow — no hierarchy or sub-cost-center behavior.

## What this window should allow
- Browse the cost center list from the Finance menu.
- Search cost centers by Search Key and Name.
- Create a cost center with Search Key (required), Name (required), Description (optional), and Active (checkbox, defaults to `true`).
- Open an existing cost center and update those same fields.
- Delete a cost center through the standard generated entity flow.
- Deactivate a cost center via the Active checkbox; inactive cost centers stop appearing in document selectors (standard `NeoSelectorService` `Active=Y` default filter — no custom selector logic in this window).

## Interaction model
- Route: `/cost-center` for the list and `/cost-center/:recordId` for record detail.
- Visibility: visible from the Finance menu as **Cost Center**.
- Implementation type: generated window route loaded from the app-shell window registry — no custom components.
- Window shape: single-entity window for `costCenter` (table `C_Costcenter`), no child/detail tabs.

## Reactive behavior and dependencies
- No cross-entity dependencies are exposed in the form — `Organization` and `Client` are system-derived from context (`fromConfig`) and never shown to the user.
- No callouts, validation rules, or display logic beyond the AD's own `@ACCT_DIMENSION_DISPLAY@` display-logic flag on the internal id field (system-only, not user-visible).
- (Client, Search Key) uniqueness is enforced by the existing DB constraint that Etendo Classic already validates — no additional frontend or backend validation was added for this window.
- Inactive-record filtering in document-level selectors (e.g. a Cost Center picker on another document) relies entirely on the standard `NeoSelectorService` default (`Active=Y`); this window does not implement or override selector behavior.

## Gap assessment
- `Summary Level` (`Issummary`) is discarded — this window does not expose tree/hierarchy behavior (contrast with Chart of Accounts, which is a tree). If a future requirement needs Cost Center hierarchies, this field and the corresponding tree UI would need to be added back.
- No accounting-schema-specific behavior (e.g. per-schema account mapping) is present — Cost Center here is a plain dimension master, matching the ETP-4892 scope.

## Manual verification
1. Open `/cost-center` from the Finance menu and confirm the list loads through the generated window route.
2. Confirm the table shows Search Key, Name, and Active.
3. Search by Search Key and Name.
4. Create a cost center and confirm Active defaults to checked (`true`).
5. Open an existing cost center at `/cost-center/:recordId` and confirm Search Key, Name, Description, and Active are all editable.
6. Uncheck Active on a cost center, save, and confirm it no longer appears in a Cost Center selector on another document/window.
7. Attempt to create two cost centers with the same Search Key for the same client and confirm the existing DB constraint blocks it (no new validation was added here — this should already work via Classic's constraint).

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `cost-center` in the Finance menu.
- `tools/app-shell/src/windows/registry.js` maps `cost-center` to the generated window loader.
- `cli/config/regen-windows.json` registers `cost-center` (windowId `79FC23AB84F04384B4B7CCCADCDD2942`) for the regen pipeline.
- `artifacts/cost-center/generated/web/cost-center/index.jsx` implements a generated single-entity list/detail flow for `costCenter`.
- `artifacts/cost-center/generated/web/cost-center/CostCenterForm.jsx` shows the editable Search Key, Name, Description, and Active fields.
- `artifacts/cost-center/generated/web/cost-center/CostCenterTable.jsx` shows the Search Key/Name/Active list columns.
- `artifacts/cost-center/contract.json` defines one `costCenter` entity, no child entities, GET/POST/PUT/PATCH/DELETE endpoints, supported filters for `searchKey` and `name`, and a 22-test manifest covering field presence, types, and visibility.
- `artifacts/cost-center/decisions.json` classifies `searchKey`/`name`/`description`/`active` as `editable`, `organization`/`client`/`id`/audit fields as `system`, and `summaryLevel` as `discarded` with rationale.

## Theme roles

The window uses only the generated `ListView`/`DetailView` shell — no custom components — so it inherits the shared semantic theme (background, card, foreground, muted, and border roles) with no local palette.
