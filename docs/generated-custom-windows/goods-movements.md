# Goods Movements

## Intent

Goods Movements should let an inventory user register a stock transfer from one storage bin to another under a single movement header. The business intent is to capture when inventory is relocated, preserve a movement identifier and date, and process the transfer only after the line set is complete.

## What this window should allow

- browse existing movement headers by name, movement date, document number, and processed status
- create a draft movement header with at least Name and Movement Date; Document No. is auto-generated and read-only
- open a movement record and view the three principal header fields — Name, Movement Date, Document No. — in a flat, borderless form
- add one or more transfer lines to a draft movement using the custom product drawer, which auto-fills the source bin from on-hand stock data
- define each line with product, source storage bin, destination storage bin, and movement quantity; destination bin cannot equal the source bin
- review the line UOM as a read-only column in the lines grid rather than an editable field
- save a draft header with "Save" and process the completed movement with "Process" (two toolbar buttons driven by draftMode)
- see a locked banner above the form when the document is processed, with a direct link to create a new physical inventory

## Interaction model

- **Route:** `/goods-movements`, `/goods-movements/:recordId`
- **Visibility:** visible from the Inventory menu as **Goods Movement** (Spanish sidebar label: **Movimiento entre almacenes**)
- **Implementation type:** custom window wrapper at `tools/app-shell/src/windows/custom/goods-movements/index.jsx`, registered in `customLoaders` in `tools/app-shell/src/windows/registry.js`. The wrapper passes `SortIconComponent` and `RefreshIconComponent` (custom SVG icons from `@/components/ui/custom-icons`) to `GeneratedApp`. All column definitions — including `movementDate.dot: false` and the `processed` status enumLabels — are driven entirely by `decisions.json` through the generated `MovementTable`; the wrapper contains no `COLUMNS` override.
- **Window shape:** master-child. The list route shows movement headers; the record route shows one `movement` header with child `movementLine` rows.
- **List behavior:** the list shows Name, Movement Date, Document No., and Status columns. Movement Date has `dot: false` so no red/green date dot appears on that column. Filters are available on Name and Movement Date. The toolbar uses custom sort and refresh SVG icons. The toolbar padding is reduced (`listbarPaddingX: "px-2"`, `tablePaddingX: "px-2"`). The link button, print button, and "All statuses" filter pill are all hidden (`hideLink: true`, `hidePrint: true`, `listViewOptions.hideStatusFilter: true`).
- **Status column:** the `Processed` field is exposed as a status badge with the column label overridden to **Status** (EN) / **Estado** (ES) via `labelOverrides`. The badge resolves i18n keys through `enumLabels`: `false` maps to `statusDraft` → "Draft" / "Borrador"; `true` maps to `statusProcessed` → "Processed" / "Procesado". The conditional filter in the list uses the same enum keys, so the filter picker shows the localized labels rather than raw `true`/`false` values.
- **Record — header form:** the form is flat and borderless (`noHeaderBorder: true`, `whiteFormBackground: true`), matching the Assets window style. Three principal fields appear side-by-side: **Name** (editable), **Movement Date** (editable), **Document No.** (read-only, auto-generated, in the `principal` section). The former "Others" tab no longer exists: `description` is set to `form: false` so it is hidden from the header form, and `documentNo` was moved into the principal section. All three header fields become fully read-only once the document is processed.
- **Record — document status pill:** the pill in the header bar resolves the `processed` value through `statusEnumLabels: { "true": "statusProcessed", "false": "statusDraft" }`. A fix in `DocumentStatusPill.jsx` ensures the pill renders for `processed === false` (draft state, was previously hidden) and resolves the i18n key via `statusLabel`. Visible values: "Processed" / "Procesado" and "Draft" / "Borrador".
- **Record — toolbar buttons (draftMode):** `draftMode` is enabled with `processField: "processNow"`, `processValue: "Y"`, `label: "processMovements"`, `disableWhenEmpty: true`, and `completedStatuses: ["true"]`. This renders two toolbar buttons on draft documents — a gray **Save** ("Guardar") that saves the draft, and a black **Process** ("Procesar") that saves and triggers the `processNow` action. Both buttons are disabled when no lines exist. The old standalone `processNow` button is discarded (`visibility: "discarded"`). On a processed document neither button appears.
- **Record — locked banner:** when the document is processed, a gray banner appears above the principal fields (inside the form card). It shows a lock icon, the bold title "This document is locked." / "Este documento está bloqueado.", a gray explanatory message ("Stock has already been adjusted. To correct it, create a new physical inventory." / "El stock ya fue ajustado. Para corregirlo, crea un nuevo inventario."), and an underlined action link "Create new inventory" / "Crear nuevo inventario" that navigates to `/physical-inventory/new`. The banner is driven by `window.lockedAlert` and is a generic, opt-in window prop — only goods-movements activates it today but any window can declare it.
- **Record — lines tab ("Lines" / "Líneas"):** this window uses `window.linesLayout = "inlineEditable"`. Rows render at 40 px with pencil and trash hover-action icons on the right; clicking pencil flips the row into inline edit; trash removes the row after confirmation. When the add-row form is open, existing rows stay in `InlineLinesPanel` so column widths remain stable; the form renders in a header-hidden `DataTable` below that handles callouts, selectors, and focus. Clicking "Añadir línea" while a form is already open saves the current line and opens a fresh form scrolled into view. See `docs/ui-customization.md` section 13 for the full reference.
- **Record — lines grid columns:** column order is driven by `gridOrder`: Product (1), UOM (2), Source Warehouse (3), Destination Warehouse (4), Quantity (5). `lineNo` is hidden from the grid (`grid: false`). Column labels are overridden via `window.labelOverrides`: `M_Locator_ID` → "Source Warehouse" / "Almacén origen", `M_LocatorTo_ID` → "Destination Warehouse" / "Almacén destino", `MovementQty` → "Quantity" / "Cantidad". The `movementQuantity` column has `columnWidth: 160` so the "Movement Quantity" / "Quantity" header does not wrap or clip. The add-line and inline-edit pickers also respect `labelOverrides` via `useLabel(labelOverrides)` in `InlineLinesPanel` and `InlineAddRow`.
- **Record — add-line gate:** the "Añadir línea" / "Add line" button appears for draft documents. A generator fix ensures `requiredHeaderFields` excludes read-only fields, so the auto-generated `documentNo` no longer blocks the add-line gate. Required header fields are `['name', 'movementDate']`.
- **Record — product picker (shared drawer):** the `product` field declares `lookup: true`, `lookupDrawer: "product-stock"`, `lookupTitle: "Product"`, and `onSelectMappings: [{ from: "_aux._LOC", to: "storageBin", labelFrom: ["warehouse", "warehouse$_identifier", "storageBin"] }]`. This opens `ProductStockSearchDrawer.jsx`, the window-agnostic product+stock picker registered in `tools/app-shell/src/components/contract-ui/lookupDrawers.js` under the key `product-stock` (shared with `internal-consumption`). The drawer groups results by product, offers warehouse-filter pills, and expands each product to show its per-locator stock rows (warehouse name — every warehouse has exactly one locator, so the locator code adds no information); the generic no-stock row is dropped once a product has concrete stock. It is backed by the AD "Product Complete" selector (reference 800011 / `M_Product_Stock_V`); no backend change was needed. On select, it auto-fills `storageBin` (source bin) from `_aux._LOC`, labeled by warehouse name; the on-hand quantity shown is informational only. The lookup drawer registry (`lookupDrawers.js`) is a generic, opt-in mechanism — any window can reuse `product-stock` or register a custom drawer by adding an entry there. (`goods-movements-product` and `internal-consumption-product` remain as deprecated aliases of the same shared component.)
- **Record — pending-row warehouse label (ETP-5039):** on select, the drawer's `onSelectMappings` writes the warehouse name into `storageBin$_identifier`, while the `SL_Movement_Product` callout fired by the same selection returns `M_Locator_ID` with the locator's own `_identifier` (`AS-0-0-0`). The callout no longer wins: `applyOnSelectMappings` (`DataTable.jsx`) registers every mapping target as touched, and `applyCalloutUpdates` (`tools/app-shell/src/lib/applyCalloutUpdates.js`) makes a `X$_identifier` key inherit the base key `X`'s membership in `touched` and `forceCalloutFields`. Generic behavior — no window-specific code.
- **Record — destination bin exclusion:** `newStorageBin` declares `excludeValueOf: "storageBin"`. The destination selector hides the option currently selected as the source bin, in both the add-line form and inline edit. This is a generic, opt-in field prop (`excludeValueOf`) usable by any window; hard integrity is enforced by Etendo at process time.
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.

## Reactive behavior and dependencies

- Header and lines follow the shared generated entity flow documented in `docs/generated-custom-windows/app-shell-functional-flows.md`: opening a record loads both the header and its child rows, and adding a child row uses the parent record id so the line remains attached to the current movement.
- Processing is status-driven. The draftMode toolbar renders the Save / Process buttons only while `processed` is false, and `disableWhenEmpty: true` disables the Process button when no lines are attached.
- Read-only behavior is status-driven. `decisions.json` keeps `READONLY_Processed_Header` and `READONLY_Processed_Lines` rules (both `Keep`), so all header fields and all line fields become read-only once the movement is processed. The locked banner also appears at that point.
- Line numbering is defaulted from the parent context. The `lineNo` add-line entry computes the next number via `SELECT COALESCE(MAX(Line),0)+10 FROM M_MovementLine WHERE M_Movement_ID=@M_Movement_ID@`. The column is hidden from the grid (`grid: false`); users never interact with it directly.
- Source bin auto-fill: selecting a product in the custom drawer writes `storageBin` from the `_aux._LOC` field of the chosen row. Users can then override it before saving the line.
- Quantity reset on product selection (ETP-5037, DEV 5): selecting a product always forces Cantidad to `0`, overriding the classic `SL_Movement_Product` callout's own default (the on-hand quantity at the resolved locator). Applies on both the add-line form and changing an existing line's product.
- Destination bin exclusion: after a source bin is selected, the destination bin selector (`newStorageBin`) hides that exact value from its option list. This happens reactively as the source bin value changes, in both the add-line form and inline edit.
- Classic callouts for UOM conversion and product-to-UOM defaults are explicitly omitted (`decision: "Omit"` for all five callout rules). UOM is set by the backend on save; there is no immediate frontend reaction when the user changes product or quantity.
- A backend fix in `SelectorQueryExecutor.java` (in `com.etendoerp.go`) guards selectors whose filter references an outer-query alias (`td0.`), returning an empty result instead of throwing — the fix prevents a Hibernate session corruption that previously rolled back the entire line insert.

## Gap assessment

- The backend contract exposes action endpoints for `moveBetweenLocators` and `posted`. Both are intentionally discarded from the simplified UI (`decision: "Omit"`). `moveBetweenLocators` (bulk locator move) is not applicable; `posted` (accounting posting) is handled through the backend. If either is needed in future, it must be re-evaluated.
- ~~The on-hand quantity shown in the product picker drawer is informational. There is no inline stock-availability validation, negative-stock prevention, or quantity warnings in the SPA. Those remain backend-only.~~ **Closed by ETP-5037** — see "Design changes — ETP-5037" below. Descriptive stock validation now exists on line save/update and on "Procesar" (aggregate check across lines), gated per source locator by `M_InventoryStatus.overissue`. Deliberately **not** reactive: no check fires while the user is still editing a field (e.g. changing the source warehouse or typing a quantity) — only at save/PATCH/process time. A reactive variant was built and live-verified, then dropped (see the design-changes section) because it meant a backend round-trip per keystroke on the Cantidad field.
- Classic callouts for UOM autofill and quantity conversion are omitted. Users who expect immediate UOM population after product selection should be informed that UOM is resolved on save by the backend, not on field change in the UI.
- Hard destination-bin validation (bin cannot equal source bin) is enforced by Etendo at process time. The browser-side `excludeValueOf` mechanism is a UX aid that hides the offending option from the selector, but it does not guard against edge cases where the value was set programmatically before the exclusion was applied.

## Manual verification

1. Open `/goods-movements` and confirm the list shows movement headers with Name, Movement Date, Document No., and Status. Verify the Status badge reads "Draft" / "Borrador" for unprocessed records and "Processed" / "Procesado" for processed ones.
2. Create a draft movement header. Confirm the form is flat (no card border or shadow), the principal section shows Name, Movement Date, and Document No. side-by-side, Document No. is read-only and auto-generated, and there is no "Description" field or "Others" tab.
3. On a draft record, confirm the toolbar shows two buttons: a gray **Save** ("Guardar") and a black **Process** ("Procesar"). Verify that Process is disabled when no lines exist.
4. Open the product picker ("Añadir línea"). Confirm the drawer shows a flat grid with product name, search key, bin/warehouse label, and on-hand quantity. Select a product that has stock in a known bin. Confirm the Source Warehouse field is auto-filled from the selected row and Cantidad shows `0` (**not** the on-hand quantity shown in the drawer — ETP-5037, DEV 5).
5. With a source bin selected, open the Destination Warehouse selector. Confirm the currently selected source bin does not appear as an option. Select a different bin and save the line.
6. Confirm the lines grid columns appear in order: Product, UOM, Source Warehouse, Destination Warehouse, Quantity. Verify that Line No. is not visible in the grid and that the Quantity column is wide enough that its header does not wrap.
6b. Before adding any line to a draft record, confirm the lines tab shows the "No lines yet" / "+ Add lines" empty state.
7. Process the movement. Confirm: (a) header status changes to "Processed" / "Procesado"; (b) the gray locked banner appears above the principal fields with the lock icon, title, message, and underlined link; (c) all header and line fields are read-only; (d) the Save and Process buttons are gone.
8. Click the locked banner link and confirm it navigates to `/physical-inventory/new`.
9. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.
10. **(ETP-5037)** Add a line whose quantity exceeds the selected source warehouse's on-hand stock and try to save it. Confirm the save is rejected immediately (not only at "Procesar" time) with a descriptive message naming the product, the source warehouse, the available quantity, and the requested quantity. Confirm this is the ONLY point the check fires — changing the source warehouse or editing the quantity itself, without saving, triggers no request and no message.
11. **(ETP-5037)** Add two lines moving the same product from the same source warehouse, each individually within stock but whose sum exceeds it, then click "Procesar". Confirm the action is rejected with one message listing every affected product/warehouse combination, not just a line number.
12. **(ETP-5037, DEV 5)** On an already-saved line, change the product to a different one. Confirm Cantidad resets to `0` (not the new product's on-hand quantity at whatever locator gets auto-filled) — this path uses a different mechanism than step 4 above (persisted-line PATCH vs. add-line local state), so it needs its own check.

## Automated evidence

- `tools/app-shell/src/menu.json` places **Goods Movement** in the visible Inventory menu (English label). The Spanish sidebar label **Movimiento entre almacenes** is resolved from `packages/app-shell-core/src/locales/es_ES.json` under `menus["Goods Movement"]`.
- `tools/app-shell/src/windows/registry.js` registers `goods-movements` in `customLoaders` to `tools/app-shell/src/windows/custom/goods-movements/index.jsx`. The wrapper passes `SortIconComponent={SortIcon}` and `RefreshIconComponent={RefreshIcon}` (from `@/components/ui/custom-icons`) to `GeneratedApp`; it contains no `COLUMNS` override.
- `artifacts/goods-movements/decisions.json` is the source of truth for all window config. Key detail-view entries: `window.noHeaderBorder: true`, `window.whiteFormBackground: true`, `window.draftMode`, `window.statusEnumLabels`, `window.lockedAlert`, `window.labelOverrides`, `header.description.form: false`, `header.documentNo.section: "principal"`, `lines.product.lookupDrawer: "goods-movements-product"`, `lines.product.onSelectMappings`, `lines.newStorageBin.excludeValueOf: "storageBin"`, `lines.movementQuantity.columnWidth: 160`, `lines.lineNo.grid: false`.
- `artifacts/goods-movements/generated/web/goods-movements/MovementTable.jsx` reflects all list column decisions. The generated `columns` array is:
  ```js
  { key: 'name',         column: 'Name',         type: 'string', label: 'Name' }
  { key: 'movementDate', column: 'MovementDate',  type: 'date',   label: 'Movement Date', dot: false }
  { key: 'documentNo',   column: 'DocumentNo',    type: 'string', label: 'Document No.' }
  { key: 'processed',    column: 'Processed',     type: 'status', label: 'Status', enumLabels: { 'true': 'statusProcessed', 'false': 'statusDraft' } }
  ```
- `artifacts/goods-movements/generated/web/goods-movements/MovementForm.jsx` shows the current header fields: `name` (text, required, principal), `movementDate` (date, required, principal, readOnlyLogic on processed), `documentNo` (text, readOnly, principal, readOnlyLogic on processed). No description field.
- `artifacts/goods-movements/generated/web/goods-movements/MovementLineTable.jsx` shows the lines grid column array with `lookupDrawer: 'goods-movements-product'` on product, `excludeValueOf: 'storageBin'` on newStorageBin, and `minWidth: 160` on movementQuantity. Column order matches `gridOrder` in decisions.json.
- `artifacts/goods-movements/generated/web/goods-movements/MovementPage.jsx` wires the full detail view: `noHeaderBorder`, `whiteFormBackground`, `draftMode`, `statusEnumLabels`, `lockedAlert`, `labelOverrides`, `linesLayout="inlineEditable"`, `requiredHeaderFields: ['name', 'movementDate']`, `AttachmentsTab` in `customTabs` (wired to `M_Movement`), and `bottomSection={GoodsMovementsBottomPanel}`.
- `tools/app-shell/src/components/contract-ui/lookupDrawers.js` registers `GoodsMovementsProductSearchDrawer` under the key `'goods-movements-product'`. This registry is shared by both `DataTable` (add-row) and `InlineLinesPanel` (inline edit) so the custom drawer is used in both flows.
- `tools/app-shell/src/components/contract-ui/GoodsMovementsProductSearchDrawer.jsx` is the custom product picker: flat grid of product + bin rows backed by the AD "Product Complete" selector (reference 800011 / `M_Product_Stock_V`), sorted by product name, with `onSelectMappings` auto-filling `storageBin`.
- `packages/app-shell-core/src/locales/en_US.json` and `es_ES.json` contain the i18n keys used in the detail view: `statusDraft`, `statusProcessed`, `processMovements`, `goodsMovementsLockedTitle`, `goodsMovementsLockedMessage`, `goodsMovementsLockedAction`.
- `artifacts/goods-movements/contract.json` and `decisions.json` provide supporting evidence for the required-lines processing rule, processed-state read-only logic, omitted classic callouts, and omitted `moveBetweenLocators` / `posted` actions.
- Unit tests for the detail-view shared components: `__tests__/lookupDrawers.vitest.jsx` (registry mapping), `__tests__/GoodsMovementsProductSearchDrawer.vitest.jsx` (drawer render and behavior), `__tests__/DataTable.excludeValueOf.vitest.jsx` (destination-bin exclusion), `__tests__/InlineLinesPanel.test.js` (lookup drawer resolution in inline edit), and `__tests__/DetailView.extractedHelpers.vitest.js` (DocumentStatusPill wrapping).
- No dedicated window-level E2E test exists for Goods Movements; shared route and generated-window loading evidence is documented in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- `artifacts/goods-movements/custom/GoodsMovementsBottomPanel.jsx` exposes the shared `LinesEmptyState` (from `@/components/contract-ui`) as its `linesEmptyState` static (ETP-5039).

## Design changes — ETP-4656

- Set `hideDeleteWhenComplete: true` in `decisions.json` so the Form-view toolbar delete icon is hidden once the record is processed ("Solo Borrador" per the delete-UX design doc). `statusField` here is `processed`, a **boolean** field (not a string status code) — the shared gate `isDeleteVisibleForRecord` (`tools/app-shell/src/utils/recordActions.js`) was extended to treat `false` as deletable and `true` as not when the status value is a JS boolean, ahead of the existing `DELETABLE_DOC_STATUSES` string-code check. Grid hover/multi-select delete is untouched by this change (no `RowQuickActions` wired for this window's list).

## Accounting dimension visibility per section — ETP-4529

| Field | Header | Lines |
| --- | --- | --- |
| `businessPartner` (Contacto) | **Nunca** — no such field on the header | **Nunca** — no such field on the lines tab |
| `product` | *(no such field on the header)* | **Siempre** — core line field, no dimension gating |
| `project` | **Por config** — raw AD `@ACCT_DIMENSION_DISPLAY@` passthrough (`section: "other"`) | **Nunca** — no such field on the lines tab (`M_MovementLine` has no `project` column) |
| `costCenter` | **Por config** — same fix as `project` | **Nunca** — same as `project` |

**Design note (intentional reversal, confirmed by ETP-4529's acceptance criteria, approved
through REVIEW and QA):** `header.project`/`header.costCenter` were previously deliberately
discarded with the reason "Accounting dimension — not relevant for simplified inventory
movements". ETP-4529's own matrix (`Movimientos entre almacenes | Cabecera` = Por config for
Proyecto/Centro de costo) explicitly supersedes that prior decision — both fields are now
config-gated instead of hidden. The reversal is the ticket's literal requirement, not an
incidental side effect, and both REVIEW and QA passed it.

**Runtime evaluator — fixed (ETP-4529 follow-up).** Three generic bugs (the `EntityForm.jsx`
visibility filter never actually consulting the evaluate-display result, the `principal` section
hardcoding empty visibility, and no lines-scoped `useDisplayLogic` call existing at all) were
found and fixed — full write-up in `sales-invoice.md`. `header.project`/`header.costCenter` are
now genuinely config-gated at runtime. This window has no dimension fields on the lines tab at
all, so the lines-scoped part of the fix and the inlineEditable line-rendering limitation
(tracked as Jira ETP-4543 / GitHub `etendosoftware/etendo_schema_forge#895`, described in
`sales-invoice.md`) don't apply here — there is no such field in this window's `lines` entity
for that gap to affect in the first place, so the header fix is the whole story for this
window.

## Design changes — ETP-5039

- **Empty-state added to the lines tab:** `GoodsMovementsBottomPanel.jsx` now exposes the shared generic `LinesEmptyState` component (`@/components/contract-ui`) as its `linesEmptyState` static, so a draft record with no lines shows the standard "No lines yet" / "+ Add lines" empty state instead of a blank lines tab. This window has no import-from-document flow, so the generic component is used unmodified (no custom description or secondary action). No `decisions.json` change was needed for this window — only the custom `GoodsMovementsBottomPanel.jsx` component was updated, so no pipeline regeneration was required.
- Note: the mislabeled locator dropdown reported in the same ticket (ETP-5039 point 2) is a backend data issue outside Schema Forge and was intentionally not touched here.

### Header section placement fix (ETP-4529 follow-up)

`header.project` and `header.costCenter` (both already present and config-gated, confirmed —
no AD-level gap) had `"section": "other"` instead of `"section": "principal"`, making them
render in the secondary/collapsed area instead of the main visible form. Fixed by changing
`section` to `"principal"` for both fields in `decisions.json` and regenerating; confirmed in
`contract.json` (`section: "principal"`) and in the generated `MovementForm.jsx`.

## Design changes — ETP-5037

Closes the gap noted above. Most of ETP-5037 lives in hand-written `com.etendoerp.go` Java
classes and a couple of new `backendErrors.js` matchers, outside the generic entity pipeline;
the one exception is DEV 5 below, a one-line `decisions.json` addition using an existing,
generic mechanism (`onSelectMappings`), extended (not window-specifically branched) to support
it. Full design record: `docs/plans/ETP-5037-goods-movements-stock-validation-plan.md`.

- **Line-level rejection (save/edit).** `StockAvailabilityGuard.rejectIfInsufficientStock`,
  wired into `GoodsMovementLineHandler.validateWrite`, rejects any line
  create/update whose quantity exceeds on-hand stock (`M_Storage_Detail`) at the
  chosen source `storageBin`, unless that locator's `M_InventoryStatus.overissue = 'Y'`.
  Returns a translated, parameterized message (`ETGO_InsufficientStockLine`) naming the
  product, warehouse, available quantity, and requested quantity.
- **Aggregate rejection before "Procesar".** `GoodsMovementProcessGuard`, called from
  `GoodsMovementsHeaderHandler.handle()` before the classic process action runs, groups all
  of the movement's lines by `(product, sourceLocator)`, sums requested quantity per group,
  and rejects with one message (`ETGO_InsufficientStockProcess`) listing every offending
  group if any group's sum exceeds on-hand stock. Classic `M_MOVEMENT_POST.xml` /
  `M_CHECK_STOCK.xml` are untouched and remain the backstop for any path that bypasses this
  action endpoint. **Named by product, not counted by group (DEV 6):** a single product can
  span several offending lines summed into one group (e.g. two Fernet lines from the same
  warehouse, individually valid, together over the limit) — the message names the offending
  product(s) (comma-separated when more than one) instead of a group count that reads as if
  only one line were at fault. Per-violation detail uses `"Producto (Almacén): pedido >
  disponible"` (parentheses, not `"@"` — a locale-neutral separator so `details` still needs
  no per-locale handling). The "Procesar" failure toast also carries a longer, fixed 8s
  duration (`useEntity.js`'s `handleProcessFailure`) so a combined multi-product message has
  time to be read.
- **Pre-existing bug fixed as a byproduct:** `GoodsMovementLineHandler`'s `SPEC` constant did
  not match its actual NEO spec name (`"goodsMovementLineHandler"` vs. the real
  `"goods-movements"`), so `runWriteHook` never matched and **no write-hook logic had ever
  executed for this entity** — including the pre-existing, unrelated ETP-4606 Service-product
  guard. Fixed alongside DEV 1, since DEV 1 could not be verified working without it.
- **Deliberately not reactive.** A reactive frontend layer was built and live-verified —
  resetting the quantity to `0` when the source warehouse changed to one with less stock, and
  separately clamping the Cantidad field itself down to the available quantity as the user
  typed — then **fully reverted** after a design discussion between the user and Valeria. Root
  cause for dropping it: NEO Headless fires a classic-callout request on every field edit
  generically (a pre-existing platform quirk, not specific to this window), which for a
  `<select>`-style field like the source warehouse is one request per selection, but for a
  plain numeric field like Cantidad is **one request per keystroke** — confirmed live via
  network capture. Building a live-clamp on top of that meant a backend round-trip and an
  on-hand-stock query per digit typed, for a check that save time already performs once, for
  free. The team decided the save/process-time checks above are sufficient on their own; no
  reactive layer ships. Full history (what was built, the self-referential-field guard
  problem it required, the bugs found and fixed along the way, and why they're gone now) is in
  the plan doc's "Discarded: reactive frontend revalidation" section.
- **Cantidad defaults to `0` on product selection, not the on-hand quantity (DEV 5).**
  Selecting a product used to default Cantidad to the on-hand quantity at the auto-filled
  locator (classic core's `SL_Movement_Product` callout echoing back the `_QTY` aux value the
  frontend already sends) — Valeria asked for `0` instead, so the user always enters the
  quantity explicitly. Fixed by adding a second `onSelectMappings` entry on the `product` field
  (`{ "value": "0", "to": "movementQuantity" }`), a small, generic extension to the existing
  mapping mechanism (previously `from`-only, now also accepts a fixed `value`) rather than a
  window-specific branch. Applies to **both** the add-line form (`DataTable.jsx`) and the
  persisted-line inline-edit PATCH (`DetailView.jsx`'s `buildInlineRowUpdateHandler`, which
  didn't consult `onSelectMappings` at all before this — changing an existing line's product
  still showed the stale on-hand-quantity default until this was extended to that path too).
  Verified live end-to-end on both paths, with the persisted quantity confirmed at the database
  row, not just the UI.
