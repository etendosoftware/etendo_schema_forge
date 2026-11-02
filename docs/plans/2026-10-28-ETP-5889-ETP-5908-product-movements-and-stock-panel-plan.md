# Product Movements Tab (ETP-5889) and Stock Side Panel (ETP-5908) — Plan

> **Date:** 2026-10-28
> **Status:** Draft — part of it is blocked on definitions pending with the analyst (section 5)
> **Branch:** `feature/ETP-5889`. ETP-5908 gets its own branch, `feature/ETP-5908`, and reuses this plan.
> **Intent:** develop **both** tasks. They are related in Jira (`relates to`), share the epic ETP-3504, the label `CelulaAlmacenes` and the same design file. Neither task is optional or secondary.
>
> **Update 2026-11-02:** ETP-5889 was implemented and merged into `develop` (etendo_schema_forge#2073, com.etendoerp.go#1507), so several points that were open on 2026-10-28 are settled: the role now exists as the list property `role_groups` on every event (ETP-6043); the tab is gated by the per-account flag `product-movements-tab`, evaluated only in the backend and published as the capability `productMovements`; and the two KPIs are read by `etendo-kpis` from saved Mixpanel reports (see `docs/ops/mixpanel-kpi-emission-spec.md`). The rest of this document describes the state of 2026-10-28 and is kept as the record of the plan and its decisions, not as the current state. ETP-5908 (the side panel) is paused until ETP-5889 is closed.

---

## 1. Goal

Let a warehouse user understand a stock mismatch from the Product record without opening document after document:

- **ETP-5889** — a new read-only **Movements** tab on the Product window listing every stock movement of the product.
- **ETP-5908** — a right-hand **stock side panel** with per-warehouse stock evolution (chart, period selector, Summary / Warehouses tabs, expandable modal).

The two meet at three points: the **period** (synced between panel and tab), the **"Ver movimientos" link** (panel → tab) and the **telemetry** that measures their use.

## 2. Sources

| Source | Used for |
|---|---|
| Jira ETP-5889 | Scope 1–15, acceptance criteria, CP-01…CP-15, movement-type table, 2 KPIs |
| Jira ETP-5908 | RF-01…RF-16 (panel), no KPIs |
| GitHub `etendosoftware/etendo-ai#4` ("Historial de Movimiento por Producto (ETP-5908)") | The roadmap idea whose 2 KPIs match ETP-5889. Its title points to ETP-5908 while its content is ETP-5889's (see section 8) |
| This repo, read on 2026-10-28 | Section 3 |

## 3. What exists today (verified in the code)

- `artifacts/product/contract.json` already has a child entity `transactions` on `M_Transaction` (`tabId 289`), and `artifacts/product/generated/web/product/` has `TransactionsTable.jsx` / `TransactionsForm.jsx`. In `artifacts/product/decisions.json` it is `readOnly: true` and its grid fields include `movementDate`, `movementType`, `storageBin`, `movementQuantity`, `organization` and `totalCost`. **It is not shown in the live tab strip** (see below): it feeds the sidebar chart. It is the natural base for ETP-5889 but lacks the source-document link, the warehouse (it has `storageBin`) and the resulting stock.
- **The ETP-5908 side panel already exists**: `tools/app-shell/src/windows/custom/product/ProductSidebar.jsx` (tests in `__tests__/ProductSidebar*.vitest.jsx`), documented in `docs/generated-custom-windows/product.md`: Summary / Warehouses tabs, a shared `SidebarPeriodSelector` (3M/6M/12M), a multi-warehouse inline chart, an "Expandir" link and an expand modal with its own period. ETP-5908 is therefore a **modification** of this component, not a new one.
- **Live check on the local environment (2026-10-28, product Cerveza `SK-002`, 563 units):**
  - Tab strip is `Precio · Costo · Contabilidad · Adjuntos`; there is **no Movements tab**. ETP-5889 places it between Contabilidad and Adjuntos, which fits.
  - Panel period selector opens on **"Últimos 3 meses"** (ETP-5908 RF-01 asks for 12 months) and shows no `DD/MM/AAAA – DD/MM/AAAA` range (RF-05).
  - The Warehouses tab still shows **"Reservado"** per warehouse (RF-08 asks to remove it).
  - "2 ubicaciones" is plain text and the link reads "Expandir" with an external-link icon (RF-06, RF-07 and ETP-5889 scope 13 change these).
- **Database check (local, read-only, 2026-10-28):**
  - `M_Transaction` has **no resulting-stock column** (columns include `movementdate`, `movementtype`, `m_locator_id`, `movementqty`, `transactioncost`, `m_inoutline_id`, `m_inventoryline_id`, `m_movementline_id`, `m_internal_consumptionline_id`, `m_productionline_id`). ETP-5889 scope 7 ("already available in `M_Transaction`, no server recalculation") is **wrong**: it has to be computed, e.g. a running sum of `movementqty`. For Cerveza the running sum over all warehouses ends at 563, equal to the stock shown by the sidebar.
  - The movement-type *list* has dedicated return values (`V-`, `C+`), but **they are not used**: `docs/generated-custom-windows/warehouse.md` and `artifacts/return-material-receipt/FINDINGS.md` record that a return keeps the base `MovementType` (`C-`/`V+`) and is told apart by `C_DocType.IsReturn` of its document. This is exactly what the backend `ProductTransactionsHandler` already resolves (`etgoDocWindow` = `return-material-receipt` / `return-to-vendor-shipment`). So ETP-5889's "document type + sign" note is the right idea; the discriminator is the document type's `IsReturn` flag. (An earlier version of this plan said the opposite; corrected.)
  - `W+`/`W-` (Work Order) exist in the list and are neither in the task's type table nor in its exclusions; the Warehouse tab does not map them either.
  - `transactioncost` is stored positive even for outbound movements (e.g. quantity -12, cost 132.00).
- Product-usage telemetry is in place: `src/lib/productUsageTelemetry.js` (`trackWindowOpened`, `trackSearchPerformed`, …) over `track()` in `src/lib/observability.js`, events declared in `src/lib/observability/events.js`, Mixpanel channel, category `product_usage`.
- `src/lib/observability/payload.js` **drops every property not in `SAFE_EVENT_PROPERTY_KEYS`**. Allowed include `account_id`, `entity`, `specName`, `source`, `type`, `count`, `value`, `operation`, `position`. **Not allowed:** a role or user property. **Deny-listed:** `id`, `recordId`, `documentId`, `name`, `label`, `search`.
- `src/lib/observability/health-events.js` records that `identify()` was removed by the GDPR remediation **ETP-4352 and must stay removed**. Events are anonymous per device; the tenant is `account_id`.
- No event exists for opening a child tab. `window_opened` is fired from `ListView.jsx` only.

### Filtering and sorting constraint (what can be server-side)

The skill `stored-computed-column` states it explicitly: a value injected by `NeoHandler.afterHandle()` is invisible to the backend query, so it **cannot be filtered or sorted**; only physical columns can. `docs/public-api.md` §4.10 adds that sorting by a relationship (foreign key) sorts by the id, not by the name. Applied to the Movements tab:

| Requirement | Backed by | Server-side? |
|---|---|---|
| Filter Entradas / Salidas | `movementQuantity` `gt 0` / `lt 0` (physical) | Yes |
| Filter period | `movementDate` `gte` / `lte` (physical) | Yes |
| Sort Fecha, Cantidad, Costo | `movementDate`, `movementQuantity`, `transactionCost` (physical) | Yes |
| Filter warehouse | `storageBin` `in` (bins of that warehouse); the warehouse is not a column of `M_Transaction` | Workable, with the `in` limit of 100 values |
| Sort Almacén | warehouse name, reached through the bin: not physical | **No** |
| Sort Tipo | physical `movementType` sorts by code, not by the label shown; the return/normal distinction (`C_DocType.IsReturn`) is not physical | **Only by code** |
| Documento (label, link) | `afterHandle` (already works) | Display only; the task does not ask to sort it |
| Stock resultante | running sum computed in `afterHandle` over the whole product history | Display only; the task says it is not sortable |

**Decision (product owner, 2026-10-28): use stored computed columns on `M_Transaction` for Almacén and Tipo.** Alternatives discarded: a handler taking over the whole GET (precedent `ProductStockWarehouseHandler`, which ignores filters, sorting and paging) and dropping the sort requirement.

How the existing ones are built (checked): `EM_ETGO_VALUATION` and `EM_ETGO_COST` on `M_STORAGE_DETAIL` (Warehouse window) use the functions `ETGO_STORAGE_DETAIL_VALUATION` / `ETGO_STORAGE_DETAIL_COST`, `Computation_Mode = S`, `Refresh_Mode = S`, a dependency on the table itself (`COALESCE(NEW.id, OLD.id) FROM dual`) and one on `M_Product` that fans out to every row of the product; the window declares it as a plain field and its contract carries `computed: {mode: stored, refresh: synchronous}`, which makes it sortable and filterable like any physical column. 15 columns of this kind exist in `com.etendoerp.go`.

Proposed for `M_TRANSACTION` (not started; backend repo, see section 7):
- `EM_ETGO_WAREHOUSE_ID` (FK to `M_Warehouse`), function = the warehouse of `m_locator_id`. The app sorts a foreign key by its `$_identifier` (alphabetical), so the name needs no extra dependency. Dependencies: the row itself (watch `m_locator_id`) and `M_Locator` (watch `m_warehouse_id`; supported by the existing index `m_transaction_locator_idx`).
- `EM_ETGO_DOC_KIND` (varchar) holding the same window key the handler computes (`goods-shipment`, `return-material-receipt`, `goods-receipt`, `return-to-vendor-shipment`, `goods-movements`, `physical-inventory`, `internal-consumption`, or empty), by the `C_DocType.IsReturn` rule. Sorts and filters by that key (groups equal types together, not alphabetical by the translated label).
- Both functions must be **total** (an exception would roll back the posting of the stock document) and need the five artifacts of the `stored-computed-column` skill.

### Design review (the Claude Design board linked in both tasks, read on 2026-10-28)

Board "Producto · Panel lateral v2" (Cerveza, `SK-002`), with simulators for With movements / Without movements / Loading and a "storable product" toggle.

- **Tab** `Movimientos` with a counter (140), between `Contabilidad` and `Adjuntos`.
- **Filter bar:** `Todos / Entradas / Salidas`; a period dropdown with **Hoy · Ayer · Últimos 7 días · Últimos 30 días · Últimos 12 meses · Todo el tiempo · Personalizado** (two-month calendar, range text, Cancelar / Aplicar); `Todos los almacenes`.
- **Table:** Fecha (date, time below) ↓ · Tipo (grey/coloured badge, source-document number below as a link with a document icon) · Almacén · Cantidad (`+4` green, `−4` red) · Costo de la transacción (`5,34 €`, always **positive**, also on outbound rows) · Stock resultante (bold, not sortable). Sticky header with its own scroll.
- **Empty state:** icon, "Sin movimientos de stock", "Aquí verás cada entrada, salida, devolución y ajuste en cuanto se procese un documento con este producto.", and the tab counter at 0. A skeleton-rows state exists.
- **Side panel:** collapse button next to the tabs; period "Últimos 12 meses" with the exact range `24/10/2025 – 23/10/2026`; "Disponible · **2 ubicaciones**" as a link; the "Movimiento de stock" title with a **maximize icon** (no "Expandir" text) and a **"Ver movimientos ⇄"** link under the chart.

Differences with the written tasks:
- **Default period of the tab: the design opens on "Últimos 7 días"; ETP-5889 scope 9 says the last 3 months**, and "3 months" is not one of the design's quick ranges. Needs a decision.
- The design's quick ranges (Hoy, Ayer, 7/30 days, 12 months, Todo el tiempo) are not the ones the panel selector offers (3/6/12 months): another point for the period synchronisation question.
- Cost: the design shows it unsigned, which matches `M_Transaction.transactioncost`; the sign question is answered by the design unless the analyst says otherwise.
- The sample data is not coherent about **Stock resultante** (the two rows of one transfer both show 21, and the row before shows 25), so the design does not settle total vs per-warehouse.
- Badge colours: the sale badge looks red rather than the "orange" of the task's table.

## 4. Workstreams

### A. Movements tab (ETP-5889)
1. Adapt the existing `transactions` tab: columns in the required order (Date · Type · Warehouse · Quantity · Transaction cost · Resulting stock), source document as a link under the type label, colour badges and labels per the type table, return vs normal document resolved by document type + sign.
2. Visibility only for storable products (Type = Item); position between Accounting and Attachments; tab counter.
3. Sorting (all columns except Resulting stock), sticky header with own scroll, 50-row pages with infinite scroll.
4. Filters: All / In / Out, period (quick ranges, single date, custom range), warehouse.
5. Empty, no-results and loading (skeleton) states.
6. Read-only everywhere, **including the API** from this tab (CP-11 expects 403 or equivalent).
7. Queryable from the MCP (scope 12).
8. Rename the panel link "Expandir" → "Ver movimientos" (scope 13) — coordinated with workstream B.

### B. Side panel (ETP-5908)
1. Period selector (3/6/12 months, default 12), exact date range under it, modal that inherits the period but keeps independent state.
2. Per-warehouse series chart; month labels in the system language; X-axis rules; tooltip with sorted rows and a Total row.
3. Interactive legend (panel and modal behave differently), at least one series always visible.
4. Summary / Warehouses tabs, "N ubicaciones" link, warehouse cards, remove "Reserved".
5. Collapse to a 48 px strip, state persisted across reloads.

### C. Telemetry (shared)
Proposed events, **none implemented**:

| Event | When | Properties (all allowed today) | Needed by |
|---|---|---|---|
| `product_movements_tab_opened` | The Movements tab becomes active | `account_id`, `entity`, `specName`, `source` = `tab` or `side_panel_link` | Both KPIs of ETP-5889, whatever final wording they get |
| Filtering | Direction / period / warehouse changes | Reuse `search_performed` with `source: 'product_movements'` and `type` = `direction`, `period` or `warehouse` | ETP-5889 scope 15 |
| `product_movements_sorted` | A column header is sorted | `source`, `type` (bounded column list; may need one new allowed key) | ETP-5889 scope 15 |
| Panel events (period change, expand, collapse, legend, "Ver movimientos" click) | — | — | **Undefined**: ETP-5908 has no KPIs; decide once they exist |

Adding a property or an event requires declaring it in `events.js`, allowing it in `payload.js`, and a test modelled on `productUsageTelemetry.vitest.js`.

## 5. What can advance now vs. what is pending

### Can advance now (no dependency on the KPI definition)

| # | Work | Task |
|---|---|---|
| 1 | ~~Check what the `transactions` tab renders today~~ **Done**: not in the live tab strip (section 3) | 5889 |
| 2 | ~~Confirm whether `M_Transaction` carries resulting stock~~ **Done**: it does not; compute a running sum (section 3) | 5889 |
| 3 | Tab visibility rule (storable only), position, counter | 5889 |
| 4 | Types/labels/badges mapping and return detection by document type + sign | 5889 |
| 5 | Sorting, sticky header, 50-row infinite scroll, states, read-only enforcement | 5889 |
| 6 | MCP access to the movements | 5889 |
| 7 | `product_movements_tab_opened` with `source`, its allowlist entry and test | both |
| 8 | ~~Check whether a stock side panel already exists~~ **Done**: `ProductSidebar.jsx` exists; gaps found live (section 3) | 5908 |
| 9 | Panel visual requirements that do not depend on the KPIs (RF-01 … RF-16) | 5908 |

### Pending definition with the analyst

**Shared (blocks the KPI wording and the final telemetry):**
- **One KPI set covering both tasks.** Today ETP-5889 has 2 KPIs (weekly adoption ≥ 50 % at 3 months; opens per active user per week) and ETP-5908 has none. Decide whether the panel gets its own KPIs.
- **Identity.** "% of active users with warehouse/stock role" cannot be computed: there is no role property and no user identity. Options: measure **accounts** (`account_id`), measure **devices**, or agree with privacy how a role could be expressed without identifying people.
- Definition of **"active user"**, the **denominator** (which population, which roles) and the **release date / cohort** the 3-month target counts from.
- ETP-5889 scope 15 and CP-15 ask to record **user, role, product, date**. That conflicts with the allowlist and the GDPR remediation (section 3). Reword it before implementation.

**ETP-5889 only:**
- Confirm which of "opens, filters, sorts" must be measured, or only opens.
- Confirm the formula and **sign** of **Transaction cost**: `M_Transaction.transactioncost` is stored positive even for outbound movements, while the task shows a signed amount ("7,20 €").
- **Resulting stock with a warehouse filter:** a running sum over all warehouses, or per warehouse? The task says it "matches the real balance after each movement" and must not change when re-sorting; with the warehouse filter both readings differ.
- ~~Return types~~ Resolved by the existing backend handler (`C_DocType.IsReturn`); see section 3.
- **`W+`/`W-` (Work Order) movements:** not in the type table and not excluded; decide whether they appear and with which label.
- Whether the panel's period change counts as a "filter" event of the tab.

**ETP-5908 only:**
- KPIs, if any (e.g. use of the period selector, Expand, "Ver movimientos").
- RF-12 gives the same example for Spanish and English ("23 Oct 2026" twice); confirm the intended format per language.

**Between the two tasks (a decision is needed before either is built):**
- **Default period.** The panel opens at the last 12 months (ETP-5908 RF-01); the tab at the last 3 months (ETP-5889 scope 9). Scope 10 says they are synchronised. Which wins on first open?
- **Period mapping.** The tab supports a single date and a custom range; the panel only 3/6/12 months. What does the panel show when the tab holds a custom range?
- **The "Expandir" control.** ETP-5889 scope 13 renames the "Expandir" link to "Ver movimientos" and keeps expand-on-chart-click; ETP-5908 RF-02/RF-07 keep a button called "Expandir" with a `maximize-2` icon. Define whether these are two controls or one.

## 6. Suggested order

1. Items 1, 2 and 8 of section 5 (verification, no code) — they size the rest.
2. Workstream A items 1–6, together with telemetry item 7.
3. Workstream B once step 1 shows what is missing; the three cross-task decisions of section 5 must be closed before the "period" and "Expandir" work starts.
4. Remaining telemetry (filter, sort, panel) after the analyst closes the KPI definition.

## 7. Out of scope of this repo

- **etendo-kpis.** Reading the new event into a KPI (collector query in `src/sources/mixpanel.js`, KPI entry in `src/kpis.js`, the `measurement` link in the issue analysis) happens there, after the event is live in production. Until then the KPI shows N/D, not zero.
- Production movements, export, editing or voiding movements, non-storable products (ETP-5889 out of scope).

## 8. Risks and discrepancies to keep visible

- GitHub issue #4 is titled "(ETP-5908)" but its content and both KPIs are ETP-5889's. History: the code was added to the title by its author after the rename, with no comment or relationship. The intended task is unconfirmed; ask the issue author.
- The telemetry requirement and the privacy policy conflict (section 5, shared).
- ETP-5889 scope 7 states resulting stock is already available in `M_Transaction`: **false** (verified on the local database). It is a running sum computed on read, with a cost on large histories (the local data has ~9,000 rows in total, which says nothing about production volumes).
- Both tasks edit the same area of the Product detail view; keep one branch per Jira key (`feature/ETP-5889`, `feature/ETP-5908`) and merge the first before starting conflicting parts of the second.

## 9. Not verified

- Returns: the local database has one (`return-material-receipt`, movement type `C-`), which confirms the handler's rule; behaviour for vendor returns was not seen.
- Production-scale behaviour of the running-sum query.
- Production Mixpanel/Datadog events (only this repo and the local environment were read).
- Verified on 2026-10-28: no existing event in `events.js` clashes with the proposed names.

## 10. Progress (2026-10-28, uncommitted)

**`schema_forge`, branch `feature/ETP-5889`**
- Event `product_movements_tab_opened` + helper `trackProductMovementsTabOpened`, and the hook `windows/custom/product/useProductMovementsTabTracking.js` that fires it when the tab becomes active (not on mount, because `DetailView` mounts every custom tab and only hides the inactive ones), with tests. Not emitted yet: the tab does not exist.
- Confirmed in Mixpanel (project Etendo Go, read-only, 2026-10-28): `session_started` and `window_opened` carry `hostname`/`environment`/`app` and mostly `account_id`; neither carries a role; the event does not exist yet; an unknown event returns an empty result (the KPI collector would store 0 without a guard); weeks run Monday to Sunday.

**`com.etendoerp.go`, branch `feature/ETP-5889`** (stored computed columns on `M_TRANSACTION`, for the sortable Almacén and Tipo columns; written, **not deployed**)
- `model/functions/ETGO_TRANSACTION_WAREHOUSE.xml`, `ETGO_TRANSACTION_DOC_KIND.xml` (total functions).
- `model/modifiedTables/M_TRANSACTION.xml`: `EM_ETGO_WAREHOUSE_ID` (FK to `M_WAREHOUSE`, set null on delete, indexed), `EM_ETGO_DOC_KIND` (varchar 40, indexed).
- `sourcedata`: 2 `AD_ELEMENT`, 2 `AD_COLUMN` (S/S), 4 `AD_COLUMN_COMP_DEPENDENCY` (the row itself + `M_Locator` for the warehouse; the row itself + `M_InOut` for the kind), 8 `AD_COMPDEP_WATCHED_COL`. Generated by cloning existing records; record order and XML well-formedness checked the way `xml-order-check.yml` does.
- Logic checked read-only against the 9,198 local rows: every row resolves a warehouse; kinds add up to 9,198 (5758 `goods-shipment`, 3000 `goods-receipt`, 407 `physical-inventory`, 32 `goods-movements`, 1 `return-material-receipt`).
- **Deployed and verified on the local database (2026-10-28, after `update.database`, compile and restart):**
  - Both columns exist (`varchar(32)`, `varchar(40)`), are populated on all 9,198 rows and equal what the functions return (0 mismatches); the 4 `ad_scd_*` triggers exist (insert + update on `M_Transaction`, update on `M_Locator` and `M_InOut`); `ad_scd_check` = 0 for both and the dirty queue is empty.
  - Reaction to a real committed change, reverted afterwards (final state identical, 0 mismatches): changing a locator's warehouse updated its transaction; changing a transaction's locator updated its warehouse.
  - **Not verified:** the `M_InOut` dependency (the core refuses to change the document type of a processed document, `@20501@`, so it could not be exercised; it is probably unnecessary); the insert path with a real posted document (only the trigger definition was checked); and the load on a mass posting.
  - Known limits: a change of `C_DocType.IsReturn` does not fan out to existing transactions; the kind of a goods line whose header has no document type is null, as in the handler.

**Still to do:** declare both fields in the Product `transactions` entity (`decisions.json`) and add the handler fields (resulting stock, document), the frontend tab, i18n, the side-panel changes of ETP-5908, tests and docs.
