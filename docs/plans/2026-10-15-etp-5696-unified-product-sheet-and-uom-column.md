# ETP-5696 — Unified product sheet and "Unit" column in document lines

- **Jira:** ETP-5696 (Story, parent ETP-3504) — assignee Jorge Ortolano
- **Branch:** `feature/ETP-5696` (from `develop`)
- **Status:** analysis + plan (no code changed yet)
- **Repos touched:** `etendo_schema_forge` (functional) — and `schema_forge_core` only if the grid tag option (Part B, step B2) is implemented as a generic core feature; `com.etendoerp.go` only if the UOM default on product change cannot be done client-side (see B3).

## 1. What the ticket asks

### Part A — Unified product sheet (window `product`)
1. Remove the `General` and `Additional Info` primary tabs; one single view.
2. Header field order:
   - Row 1: Code* · Name* · Type*
   - Row 2: Category* · Unit* · Tax category*
   - Row 3: Stock management (Stocked · Returnable) … then Active
   - Then Description; image on the right (as today).
3. Stocked / Returnable (and the stock side panel Summary/Warehouses) visible only when Type = Item.
4. Hidden: Availability (Sale/Purchase) → always saved as `true`; whole Logistics section; UOM for weight (empty by default); Weight.
5. Unchanged: bottom tabs (Price, Cost, Accounting, Attachments) and toolbar.

### Part B — "Unit" column in the lines of every transactional document
- Sales: quotation, sales order, goods shipment, sales invoice.
- Purchases: purchase proposal (requisition), purchase order, goods receipt, purchase invoice.
- Inventory: physical inventory, goods movements, internal consumption (+ any other inventory document with lines).
- Placed right after the quantity column (physical inventory: after the second quantity column, i.e. counted).
- Read-only; value comes from the product's UOM; refreshes when the line's product changes; sortable and filterable; empty when the line has no product; rendered as a neutral tag (light grey background, secondary text) showing the short UOM name.

## 2. Findings (live env `localhost:3100` on `develop` + code)

### Part A — current state
- `artifacts/product/decisions.json` → `window.primaryTabs = [general, additionalInfo(panel: ProductAdditionalInfoPanel)]`.
- `ProductAdditionalInfoPanel.jsx` (custom panel) holds: Tax category selector, Availability checkboxes (`sale`→`IsSold`, `purchase`→`IsPurchased`), the Logistics block (UOM for weight, Weight stepper, Stocked/Returnable checkboxes). Logistics is already hidden for types `S/E/R` (`NON_STOCKABLE_PRODUCT_TYPES`, ETP-4943/5091).
- `ProductStockDefaultsWatcher.jsx` (wired as `window.headerExtra.customForm`, always mounted) forces `stocked`/`returnable` on a **live** `productType` change.
- `ProductSidebar.jsx` already hides the stock widget for `S/E/R`. Product types in AD ref 270 are exactly `I, S, R, E` → "only Item" ≡ "not S/E/R", so the existing predicate already satisfies the ticket; no new type list is needed.
- Fields `taxCategory`, `stocked`, `returnable`, `sale`, `purchase`, `weight`, `uOMForWeight` are currently `section: other` in `decisions.json`, so they are not in the principal form.
- Live check: General tab currently shows Code, Name, Type, Category, Unit, Active, Description, image; "Additional Info" tab holds the rest.
- `docs/generated-custom-windows/product.md` describes the General / Additional Info split and must be updated in the same change.

### Part B — current state
- Every line entity already has a `uOM` field (`C_UOM_ID`). Today it is:
  - `visibility: system` (not shown) in sales-quotation, sales-order, goods-shipment, sales-invoice, purchase-invoice;
  - `grid: false` in purchase-order; neutral/unset in goods-receipt; `grid:false` in return-to-vendor-shipment;
  - **already a read-only grid column** in physical-inventory (`gridOrder 2`), goods-movements (`gridOrder 2`), internal-consumption — but placed *before* the quantity, not after it.
- Live check (sales order 1000034, lines tab): columns are Product, Description, Order qty, Price, Discount %, Tax, Gross amount — no unit column.
- Because `C_UOM_ID` is a real AD column of the line table, the column is filterable/sortable "for free" (see CLAUDE.md "List Columns Must Be Real Columns"): use `column:`, never a synthetic `type: 'custom'` cell.
- `goods-movements.md` documents that **UOM is set by the backend on save**, and the UOM callouts were omitted (`decision: Omit`), so the grid does not react on product change. Product selection does carry `_aux` values (`product_UOM`, see `DataTable.jsx` ~L1650, `inlineLineUpdateHandlers.js`, `lineFieldChange.js#resolveSnapshotIdentifiers`) which is the hook for an immediate client-side refresh.
- A neutral tag renderer already exists: `DataTable.cellRenderers.jsx` renders `Tag` (variant falls back to `neutral`) for `col.enumVariants`. There is no equivalent option for a foreign-key column showing its display value → needs a small generic extension.
- `purchase-order` contract: `uOM` has `readOnlyLogic: @UomManagement@='Y'` — to verify it does not interfere with the read-only requirement.
- UOM data: `C_UOM.name` (e.g. "Unit", "Kilogram", "Hour") vs `C_UOM.uomsymbol` ("kg", "h", "cm"); some UOMs have an empty symbol (e.g. "Bag"). See open question Q1.
- Routes for requisition windows: artifacts `requisition` and `manage-requisitions` exist (entities `requisition`/`requisitionLine`, no `decisions.json` in either — they are contract-only, not "worked" windows). Their status must be clarified (Q3).

## 3. Proposed solution

### Part A — unified sheet
- **A1. `decisions.json` (product):** drop `primaryTabs` (single view). Move into `section: principal` with explicit `seq`: `searchKey 1, name 2, productType 3, productCategory 4, uOM 5, taxCategory 6, active …`. Set `formCols: 3`.
- **A2. Stock management row:** `stocked` + `returnable` in the principal form grouped under a "Stock management" label, visible only when `productType === 'I'` (`displayLogic`, or the existing `CheckboxGroup` via a small custom form slot if the generated form cannot render a labelled group + trailing Active in one row). Prefer declarative `displayLogic`; fall back to a custom component in `windows/custom/product/` only if the layout cannot be expressed.
- **A3. Hidden fields:** `uOMForWeight`, `weight` → `visibility` hidden/discarded (not sent, stay empty). `sale`/`purchase` → hidden **and defaulted to `true`** (declarative `defaultValue`, plus enforcement on save so that existing products edited from the sheet also end with `true`; Q2).
- **A4. Remove `ProductAdditionalInfoPanel.jsx`** and its i18n keys (`commercial`, `commercialDescription`, `availability`, `logistics`, `logisticsDescription`, `stockManagement`… keep any still used) in both `en_US.json` and `es_ES.json`; delete or fold `WeightStepper`.
- **A5. `ProductStockDefaultsWatcher`** keeps working (it is independent of tabs); simplify its header comment (the "tab unmounts" rationale disappears). `ProductSidebar` needs no logic change.
- **A6. Regen:** `make regen ONLY=product` then Window Change Integrity Protocol steps 3–5 and `npx sf-validate-pipeline --scope=product`. Update `docs/generated-custom-windows/product.md`.
- **A7. Tests (tester-functional, reuse-first via `make find-tests`):** source-reading/Vitest for the new field order & type-dependent visibility; update existing tests that reference `ProductAdditionalInfoPanel` / `primaryTabs`; Playwright mocked spec for Item vs Service.

### Part B — Unit column
- **B1. Per-window `decisions.json`** for each line entity: `uOM` → `visibility: readOnly`, `grid: true`, `gridReadOnly: true`, `gridOrder` = quantity's order + 1 (physical-inventory: after `quantityCount`; move the existing `gridOrder: 2` entries of physical-inventory / goods-movements / internal-consumption to just after the quantity). Verify `column: 'C_UOM_ID'` filter/sort works in the advanced filter (FK column — `filterMode: 'identifier'` as in `transactionDocument`).
- **B2. Neutral tag rendering (generic, in core if shared):** new grid option for FK columns, e.g. `gridDisplay: 'tag'` (name TBD; check `docs/decisions-reference.md` and reuse an existing option if one fits), rendered via the existing `Tag` neutral variant in `DataTable.cellRenderers.jsx`; empty value → renders nothing. Must be declared in `decisions.json` (survives regen) and documented in `docs/decisions-reference.md`. If the generator/contract needs to carry it, the change lands in `schema_forge_core` (`generate-contract.js` / `generate-frontend.js`) and follows `docs/repo-topology.md` (publish + bump, or `LOCAL_CORE=1` for development).
- **B3. Refresh on product change:** on product selection/change in a line (inline add row and inline edit), set `uOM` from the selector's `_aux` `product_UOM` (the plumbing exists). If the aux value is not returned for some selectors (goods-movements/internal-consumption drawers), add it to the selector source or resolve it with a NEO defaults call; only fall back to a backend change in `com.etendoerp.go` (via `@NeoExtension`, never identity checks in shared code) if the client cannot resolve it. Lines with no product → empty.
- **B4. Persisted value:** confirm the backend stores `C_UOM_ID` correctly for lines created from the UI (today "resolved on save by the backend"); existing lines already hold it, so no data migration is expected.
- **B5. Regen all affected windows** (`make regen ONLY=<w1>,<w2>,...`), run `sf-validate-pipeline` for each, update each `docs/generated-custom-windows/<window>.md`.
- **B6. Tests:** one shared unit test for the tag renderer (empty, value, neutral variant); one decisions/contract guard asserting `uOM` is grid + read-only + placed right after the quantity column for every in-scope window; extend an existing Playwright mocked spec for the "change product → unit updates" flow.

## 4. Suggested execution order
1. A (product window, self-contained, single window) — DEV → REVIEW → QA → DOCS.
2. B2 (generic tag option) + B1 on one pilot window (sales-order) → verify live on `localhost:3100`.
3. Roll B out to the remaining windows; B3 per selector family.
4. Final cross-window verification pass over the 11 windows, with checklist from the Jira acceptance criteria.
Both parts could ship as two PRs under the same branch policy if the team prefers smaller reviews (Q4).

## 5. Risks / things to watch
- Changing generator/core files affects **all** windows → re-verify every window using the feature (CLAUDE.md).
- `sale`/`purchase` forced to `true` also affects products created through other paths (quick create drawer `ProductDrawerShell`, OCR product resolver, CSV import, MCP). Needs a single enforcement point (Q2).
- Hiding `weight`/`uOMForWeight` removes the only UI to edit them: products imported with a weight keep the stored value (we only stop showing it) — confirm that is intended.
- Sorting/filtering on an FK column sorts by identifier text, not by id — verify per window.
- `purchase-order` `uOM.readOnlyLogic` and `UomManagement='Y'` (alternative-UOM preference) may change which column is meaningful when that preference is on.
- i18n: any new label ("Unit"/"Unidad", "Stock management") in both locale files; no hardcoded strings.

## 6. Open questions (need an answer before DEV)
- **Q1 — "short name" of the unit:** show `C_UOM.name` (Unit, Kilogram, Hour) or `C_UOM.uomsymbol` (kg, h)? The ticket's examples ("Unidad, Kg, Hora") mix both. Several UOMs have an empty symbol (e.g. Bag).
- **Q2 — Sale/Purchase = true:** enforce only in the product sheet, or also server-side for every creation path (import, quick-create, MCP)? Should existing products with `false` be corrected on first save only?
- **Q3 — Purchase proposal:** is "Propuesta de compra" `requisition` or `manage-requisitions`? Neither has a `decisions.json` (not "worked" windows). Do they have to be onboarded in this ticket, and what other "inventory documents with lines" count (e.g. `inventory-quality-inspection`, `bom-production`)?
- **Q4 — PR split:** one PR for A + B, or two (A product sheet; B unit column)?
- **Q5 — Return-to-vendor shipment / return documents:** include `return-to-vendor-shipment` and the sales "Albarán de devolución" (visible in the menu) in scope?

## 7. Part A — verification matrix

Derived from `docs/generated-custom-windows/product.md` (every documented behavior), `ui-customization.md` §19 (create popup), `feedback.md` (ETP-5245 push gap) and the ETP-5676 defaults plan. Legend: **L** live in `localhost:3100`, **U** unit/vitest, **E** Playwright mocked, **SQL** DB check.

### A. The change itself (ticket acceptance criteria)
| # | Case | How |
|---|---|---|
| A1 | No `General` / `Información adicional` tabs; no "Mostrar más datos" toggle | L |
| A2 | Row order: Código · Nombre · Tipo / Categoría · Unidad · Grupo de impuesto; Grupo de impuesto required | L |
| A3 | Artículo: Almacenable, Retornable, Activo in that order; label is "Almacenable" (es_ES and es_AR), "Stocked" (en_US) | L |
| A4 | Servicio / Gasto / Recurso: only Activo; stock side panel hidden (Item only: panel visible) | L, E |
| A5 | No Peso, Unidad de peso, Disponibilidad (Venta/Compra), Logística anywhere | L |
| A6 | New Item and new Service saved: `IsSold=Y`, `IsPurchased=Y`, `C_Uom_Weight_ID IS NULL` | L + SQL |
| A7 | Legacy product with `IsSold=N` and/or `IsPurchased=N`: opening it does NOT dirty it (Guardar disabled); first edit saves both as `Y` | L + SQL, U |
| A8 | Bottom tabs (Precio, Costo, Contabilidad, Adjuntos) and toolbar (Cancelar, Eliminar, Guardar) unchanged | L |

### B. Type switching (ETP-4943 / ETP-5091 behavior that moved from the panel to the watcher)
| # | Case | How |
|---|---|---|
| B1 | Item → Servicio/Gasto/Recurso: `stocked`/`returnable` forced `false`, persisted (SQL) | L + SQL, U |
| B2 | Back to Artículo: forced `true`, row reappears | L, U |
| B3 | Between two non-stockable types: no write | U |
| B4 | Server guard still holds (`ProductDefaultsHandler`, PATCH/POST with `productType` S/E/R forces false) — switch type and save without any other edit | L + SQL |
| B5 | Autosave on blur after a checkbox click (ETP-4670) still persists; image still needs manual Guardar | L |

### C. Create flows
| # | Case | How |
|---|---|---|
| C1 | `/product/new`: UOM and Tax category preselected with the `IsDefault='Y'` rows (ETP-4670); category default; Tax category now visible in the main form | L |
| C2 | `/product/new`: Price tab says "save first"; Cost tab refuses to open until saved (ETP-5245) | L |
| C3 | After save: Price tab already lists default sales + purchase tariffs at 0 (ETP-5245) | L |
| C4 | Create-from-line popup (sales-order → product drawer → "+ Crear producto"): it mounts this window (ETP-5254), so it must show the unified sheet, no tab strip, chromeless (no stock panel), Price/Cost/Accounting/Attachments, header editable after save, product selected into the line on close | L |
| C5 | Dormant fallback form (`ProductForm.jsx` + registry copy): single panel, `IsStocked` label override, drift tests green | U |
| C6 | CSV import / export unaffected (fields kept in contract; `form:false` only hides them) | U (`productImportDescriptor`, `importExportColumns`), L optional |

### D. Surfaces that must not regress
| # | Case | How |
|---|---|---|
| D1 | Cost banner (Item + stocked + no cost): appears, clears after adding a cost line, advisory (edits still save) | L |
| D2 | Required-field gate: `requiredHeaderFields` no longer lists `purchase`/`sale`; saving with required fields empty still blocks, with a message | L |
| D3 | List/gallery, global search, advanced filter (Tipo labels in Spanish) | L |
| D4 | `sf-validate-pipeline --scope=product` (done: 0 violations); `contract.json` es_ES enum labels intact (done: `FROM_CACHE=1`) | done |
| D5 | NEO config: `decisions.json` changed only front-end properties (`form`, `section`, `seq`, `displayLogicJs`, `labelOverrides`), no visibility change, so no `sf-push-neo` is needed; confirm with `--dry-run` | CLI |

### E. Automated suites to run (once the user allows tests)
`ProductStockDefaultsWatcher.vitest.jsx`, `lookupCreateTargets.vitest.js`, `RecordCreateModal.vitest.jsx`, `ProductSidebar.vitest.jsx`, `etp4943-product-storable-label.vitest.js`, `productImportDescriptor.vitest.js`, `importExportColumns.vitest.js`, locale parity tests, `product-logistics-nonstockable-types.mocked.spec.js` (from `e2e/`, `CI=1`, project `mocked`).

### F. Open observations from the doc review
- The doc still lists `Weight` as pre-filled `0` by the SF defaults (ETP-5676 plan) — hiding it keeps whatever the DB default stores; check A6 with `Weight`.
- Product type `'O'` (Online) is mentioned in docs but is not in this DB's `AD_Ref_List` (only I/S/R/E); the server guard deliberately ignores it.
- "Gestión de stock" caption and separator from the design are NOT rendered — decided with the analyst (2026-10-15): the checks stay side by side as plain form cells. Doing it later needs a declarative group option in `EntityForm` + the generator (`schema_forge_core`).

### Part A — execution status (2026-10-15)
Cases A1–A8, B1–B5, C1–C4, D1–D4 verified live and green (details and DB evidence in `docs/generated-custom-windows/product.md` → *Verification evidence — ETP-5696*). Automated suites run and green. Pending: C6 live import/export (unit-covered), D5 NEO `--dry-run`, and Part B. The "Gestión de stock" caption/separator was dropped by decision.
