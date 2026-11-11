# Product Movements Tab (ETP-5889) and Stock Side Panel (ETP-5908) — Plan

> **Date:** 2026-10-28 · **Updated:** 2026-11-02
> **Status:** **ETP-5889 is fully merged into `develop`** (etendo_schema_forge#2073 and #2079, com.etendoerp.go#1507 and etendo-kpis#15, #17, #23, #24; verified on 2026-11-02: nothing of `feature/ETP-5889` is outside `origin/develop`; the two PRs still open in Jira are the automatic mergeblocks #2087 and #1516 to `main`). What is left of it is the deployment, QA and the first measurement (section 5). **ETP-5908 (side panel) is in progress** on `feature/ETP-5908`, cut from `develop` at `e0fc18af9`.
> **Branch:** ETP-5889 was delivered on `feature/ETP-5889` (merged). ETP-5908 works on `feature/ETP-5908` and reuses this plan.
> **Intent:** develop **both** tasks. They are related in Jira (`relates to`), share the epic ETP-3504, the label `CelulaAlmacenes` and the same design file. Neither task is optional or secondary.
>
> **How to read this document:** sections 1 to 3 are the analysis of 2026-10-28 (kept as the record of what was found and why); sections 4 to 10 are updated to 2026-11-02 and say what was done, what was decided and what is pending.

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

- `artifacts/product/contract.json` already has a child entity `transactions` on `M_Transaction` (`tabId 289`), and `artifacts/product/generated/web/product/` has `TransactionsTable.jsx` / `TransactionsForm.jsx`. In `artifacts/product/decisions.json` it is `readOnly: true` and its grid fields include `movementDate`, `movementType`, `storageBin`, `movementQuantity`, `organization` and `totalCost`. **It is not shown in the live tab strip** (see below): it feeds the sidebar chart. It was the natural base for ETP-5889 but lacked the source-document link, the warehouse (it has `storageBin`) and the resulting stock; ETP-5889 added them (backend handler and the custom tab `ProductMovementsTab`, section 10).
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
| Sort Tipo | physical `movementType` sorts by code, not by the label shown; the return/normal distinction (`C_DocType.IsReturn`) is not physical | **Superseded (ETP-5908):** the Type header now orders by the visible label. The SPA sends the order of the translated label buckets in the active language (`typeLabelOrder`) and `ProductTransactionsHandler#orderedPage` ranks the filtered set by it on the server (see `docs/generated-custom-windows/product.md`, Movements) |
| Documento (label, link) | `afterHandle` (already works) | Display only; the task does not ask to sort it |
| Stock resultante | running sum computed in `afterHandle` over the whole product history | Display only; the task says it is not sortable |

**Decision (product owner, 2026-10-28): use stored computed columns on `M_Transaction` for Almacén and Tipo.** Alternatives discarded: a handler taking over the whole GET (precedent `ProductStockWarehouseHandler`, which ignores filters, sorting and paging) and dropping the sort requirement.

How the existing ones are built (checked): `EM_ETGO_VALUATION` and `EM_ETGO_COST` on `M_STORAGE_DETAIL` (Warehouse window) use the functions `ETGO_STORAGE_DETAIL_VALUATION` / `ETGO_STORAGE_DETAIL_COST`, `Computation_Mode = S`, `Refresh_Mode = S`, a dependency on the table itself (`COALESCE(NEW.id, OLD.id) FROM dual`) and one on `M_Product` that fans out to every row of the product; the window declares it as a plain field and its contract carries `computed: {mode: stored, refresh: synchronous}`, which makes it sortable and filterable like any physical column. 15 columns of this kind exist in `com.etendoerp.go`.

Implemented in `M_TRANSACTION` (com.etendoerp.go#1507, section 10):
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

### A. Movements tab (ETP-5889) — status 2026-11-02

| # | Work | Status |
|---|---|---|
| 1 | Columns in the required order (Date · Type · Warehouse · Quantity · Transaction cost · Resulting stock), source document as a link under the type label, badges per the type table, return vs normal by document type (`IsReturn`) | **Done** (custom tab `ProductMovementsTab`, backend `etgoDocKind` / `etgoDocLabel`) |
| 2 | Visible only for storable products, between Accounting and Attachments, with a counter | **Done** |
| 3 | Sorting (every column except Resulting stock), sticky header, 50-row pages with infinite scroll | **Done**. Same-day movements are ordered by `movementDate, transactionProcessDate, id`, the order the resulting stock is summed in |
| 4 | Filters: All / In / Out, period (quick ranges, single date, custom range), warehouse | **Done**. The warehouse list is built from the product's stock rows, so a warehouse with no stock row is not offered (known risk, registered) |
| 5 | Empty, no-results, loading (skeleton) and error (with retry) states | **Done** |
| 6 | Read-only everywhere, including the API (CP-11) | **Done**: the `transactions` entity has POST/PUT/PATCH/DELETE disabled; only GET and GET-by-id are open. Writes were not exercised with a valid CSRF token |
| 7 | Queryable from the MCP (scope 12) | **Not verified** |
| 8 | Rename the panel link "Expandir" → "Ver movimientos" (scope 13) | **Pending**, belongs to workstream B (ETP-5908, flag-gated) |
| 9 | Behind a per-account feature flag | **Done** (added during delivery, section 10) |

### B. Side panel (ETP-5908) — **in progress** (`feature/ETP-5908`, from `develop` at `e0fc18af9`, 2026-11-02)
1. Period selector (3/6/12 months, default 12), exact date range under it, modal that inherits the period but keeps independent state.
2. Per-warehouse series chart; month labels in the system language; X-axis rules; tooltip with sorted rows and a Total row.
3. Interactive legend (panel and modal behave differently), at least one series always visible.
4. Summary / Warehouses tabs, "N ubicaciones" link, warehouse cards, remove "Reserved".
5. Collapse to a 48 px strip, state persisted across reloads.

**Design verification (Claude Design board, 2026-11-02).** Checked in the board: RF-01 to RF-05, RF-09, RF-11, RF-12, RF-14 (click), RF-15 and RF-16 behave as written. Details left open:
- The Y axis rescales when a series is hidden; the RFs say nothing about it.
- Warehouse card text: the design shows "Disponible" on the left and "21 u" on the right, RF-09 says "Disponible · N u".
- RF-12 gives the same date example for Spanish and English (already listed in section 5).
- Legend hover (RF-14) and "at least one series always visible" were **not exercised** in the board.

**Current local panel vs the RFs (2026-11-02, product Fernet `SK-003`):** default period is 3M; no date range shown; "N ubicaciones" is not a link; the control reads "Expandir" with an external-link icon; no collapse button; the available quantity shows as `1,380` in the Spanish UI and the Y axis is labelled `13K/1K`. The last two are **to check** against the canonical formatter (`formatCurrency` / number utilities); not yet established as defects.

**Flag decision (2026-11-02).** ETP-5908 reuses the existing capability `productMovements`; it has no flag of its own.
- Independent of the flag (plain improvements): 12-month default, exact range, "N ubicaciones" link, warehouse cards without "Reservado", chart / axis / tooltip, legend, modal, `maximize-2` icon, collapse to 48 px.
- Dependent on the flag, each reading `isCapabilityVisible(useCapabilitiesSafe(), PRODUCT_MOVEMENTS_CAPABILITY)` and **failing closed**: the "Ver movimientos" link (with the flag off the panel keeps "Expandir"), the period synchronisation, and the `side_panel_link` telemetry source.

### C. Telemetry (shared)

| Event | When | Properties | Status |
|---|---|---|---|
| `product_movements_tab_opened` | The Movements tab becomes active (never on mount, because `DetailView` mounts every custom tab and only hides the inactive ones) | `account_id`, `category`, `entity`, `specName`, `source` = `tab` or `side_panel_link` | **Implemented and merged.** Sent whatever the role is, and only when the capability is on. Not yet emitted in production (not deployed) |
| Filtering and sorting of the tab | Direction / period / warehouse / column changes | — | **Not implemented, by decision**: ETP-5889 scope 15 and CP-15 ask for user, role, product and date, which the privacy policy (ETP-4352) does not allow. Only opens are measured, at tenant level |
| Panel events (period change, expand, collapse, legend, "Ver movimientos" click) | — | — | **Undefined**: ETP-5908 has no KPIs |

The role is not an event property of this event: it travels on every event as the list `role_groups` (ETP-6043) and is only a filter of the KPI reports.

## 5. Status and open decisions (2026-11-02)

### Decisions taken (ETP-5889)

| Question of 2026-10-28 | Decision |
|---|---|
| Identity: users, accounts or devices | Decided as **devices** (anonymous per device, ETP-4352), **but the data of 2026-11-02 show Mixpanel counts people, not devices, once they sign in** (section 11.1); the unit is open until Platform confirms what id it sends. The role is the list `role_groups` that Platform adds to every event (ETP-6043); a tenant admin carries only `["admin"]` |
| Which KPI wording and which "active user" | Adoption = devices that open the tab / devices with `session_started` that week; frequency = opens / the same devices. Monday–Sunday weeks, production hosts only. Targets unchanged (≥ 50 % at 3 months) and only meaningful while the denominator keeps the role filter |
| Where the role filter lives | In the two saved Mixpanel reports that `etendo-kpis` reads (`role_groups` contains `warehouse`), so it is changed in Mixpanel with no code. Whether the admin counts as warehouse stays open (analyst) |
| What to measure | Opens only, at tenant level (CP-15 not implemented, section 4C) |
| Sign of *Transaction cost* | Shown unsigned, as stored in `M_Transaction.transactioncost` and as in the design |
| Resulting stock with a warehouse filter | **Follows the filter**: per product and warehouse when a warehouse is selected, per product otherwise. Not computed for the count-only request |
| Return types | `C_DocType.IsReturn`, resolved by the handler |
| Sortable Almacén and Tipo | Two stored computed columns on `M_Transaction` (`EM_Etgo_Warehouse_ID`, `EM_Etgo_Doc_Kind`, `S`/`S`) |
| Default periods (decided 2026-11-02) | **Amended 2026-11-11:** the Movements tab now opens on **last 30 days** (was 7): the designer changed it in the updated design (Producto - Panel lateral v2), and it means fewer empty opens for products without recent activity. Originally decided as last 7 days; the side panel defaults to **12 months** with the exact range `DD/MM/AAAA – DD/MM/AAAA` under the selector (RF-01, RF-05). Neither default changes. The Jira text of ETP-5889 (scope item "Barra de filtros" and CP-07) was corrected by the user from "3 months" to "7 days" on 2026-11-02 |
| Flag for ETP-5908 (decided 2026-11-02) | Reuses the capability `productMovements`, no own flag; see section 4B for what depends on it |
| Who sees the tab | A per-account feature flag, `product-movements-tab` (default off), evaluated only in the backend by `ProductMovementsPolicy` and published as the capability `productMovements`. The flag gates behaviour only: it is **not** access control (with it off the `transactions` rows stay readable under the role's access; only `etgoStockAfter` and `etgoTotalRows` are withheld) |

### Pending

**ETP-5889**
- **Deployment to production** of etendo_schema_forge#2073 and com.etendoerp.go#1507. Before opening the tab in an environment: `update.database`, and check `ad_scd_check` = 0 (`ad_scd_rebuild` first if the table has more than 100k rows).
- **QA**: Matías Bernal / Emilio Polliotti.
- **Datadog**: the flag exists and has a targeting rule by account email in Production (two accounts); it must be widened for the KPIs to measure anything. A real TTL is still to be set (the registry holds a placeholder, 2027-01-31).
- **First KPI value**: the collector reports the last complete Monday–Sunday week, so the first value appears on the Monday after the first complete week in which the tab was deployed and used (for the week of 2 to 8 November, on 2026-11-09). Until the event has been seen in production the KPIs are N/D, never 0.
- **Analyst**: does the tenant admin count as a warehouse role; release date and cohort the 3-month target counts from; whether the KPI is restricted to accounts with the flag (with a gradual rollout the denominator includes devices that cannot see the tab).
- ~~Default period of the tab~~: **closed 2026-11-02** as last 7 days; **changed 2026-11-11 to last 30 days** following the updated design (fewer empty opens for products without recent activity).
- **`W+`/`W-` (Work Order) movements**: not in the type table and not excluded; not decided.
- **Not verified**: MCP access (scope 12), a product with more than one page of movements, the flag off in a hosted environment, the event reaching Datadog and Mixpanel (nothing is configured locally), and the filter of the lists (`"x" in properties[…]`) in the collector's own segmentation query.
- Optional hardening: a `RAISE WARNING` in the two PL/pgSQL functions instead of returning null on error (needs `update.database`).

**ETP-5908 (in progress)**
- KPIs, if any (use of the period selector, Expand, "Ver movimientos").
- RF-12 gives the same example for Spanish and English ("23 Oct 2026" twice); confirm the intended format per language.
- **STILL OPEN, needs the analyst: what "the period is synchronised with the side panel" means** (ETP-5889 acceptance criterion and CP-07). Facts: the design opens the panel on 12 months and the tab on 7 days; the tab has no 3/6/12-month presets (only 12 months, All time and a custom range), so the panel's 3/6/12 values do not map one to one onto the tab. **Reading 1 (recommended, not decided):** each opens on its own default and a change in one propagates to the other. Verified live on local on 2026-11-02 (product Fernet `SK-003`): changing the panel to 12 months left the tab on 7 days, so **no synchronisation exists today**. Per the flag decision, whatever is built here is gated by `productMovements`.
- **UX finding (2026-11-02):** with the 7-day default, a product with no recent activity opens the tab empty ("Sin resultados para los filtros aplicados"; the counter no longer exists, and a product with no movement at all now shows the design's empty state, told apart by a one-record probe). Not decided whether this needs a change (for example, a hint to widen the period).
- The "Expandir" control: ETP-5889 scope 13 renames it "Ver movimientos"; ETP-5908 RF-02/RF-07 keep a button called "Expandir". Resolved by the flag decision (section 4B): "Ver movimientos" with the flag on, "Expandir" with it off.
- The panel gaps found on 2026-10-28 (section 3) and 2026-11-02 (section 4B) are still there.

## 6. Next steps

1. Deploy, run `update.database`, check `ad_scd_check`, and open the tab with an account covered by the Datadog rule.
2. QA of the tab and of the flag (on and off).
3. Widen the Datadog rule; confirm in Mixpanel that `product_movements_tab_opened` and `role_groups` arrive and that the reports return values.
4. Read the first KPI values (the Monday after the first complete week with usage) with the analyst and settle the admin question.
5. ETP-5908 is under way on `feature/ETP-5908`. Build first the panel changes that do not depend on the flag (section 4B), then the three flag-gated pieces ("Ver movimientos" link, period synchronisation, `side_panel_link` telemetry).
6. Get the analyst's answer on what "synchronised" means (section 5, Pending) before implementing the synchronisation; until then it is not built.
7. Check the `1,380` and `13K/1K` rendering in the panel against the canonical formatter, and settle the open design details of section 4B (Y-axis rescale, warehouse card text).

## 7. Outside this repository

- **com.etendoerp.go** (#1507, merged): stored columns, the `ProductTransactionsHandler` additions, the flag policy and the capability.
- **etendo-kpis** (#15, #17, #23, #24 merged): both KPIs, read from two saved Mixpanel Insights reports (`93773825`, `93773827`, dashboard `11625102`, project Etendo Go); the filters of production and of the role live in those reports; documented in `etendo-kpis/docs/mixpanel-saved-reports.md`. The KPI shows N/D, not zero, until the event is live in production.
- **Datadog**: the flag `product-movements-tab` and its targeting rule.
- Production movements, export, editing or voiding movements, non-storable products (ETP-5889 out of scope).

## 8. Risks and discrepancies to keep visible

- GitHub issue #4 is titled "(ETP-5908)" but its content and both KPIs are ETP-5889's. History: the code was added to the title by its author after the rename, with no comment or relationship. The intended task is unconfirmed; ask the issue author.
- The telemetry requirement (user, role, product) and the privacy policy conflict; resolved by measuring opens only, per device and tenant (section 5). The issue and Jira still say "users".
- ETP-5889 scope 7 stated that resulting stock is already available in `M_Transaction`: **false** (verified on the local database). It is a running sum computed on read, with a cost on large histories (the local data has ~9,000 rows, which says nothing about production volumes).
- The flag is not access control (section 5).
- Both tasks edit the same area of the Product detail view; keep one branch per Jira key (`feature/ETP-5889`, `feature/ETP-5908`) and merge the first before starting conflicting parts of the second.

## 9. Not verified

- Returns: the local database has one (`return-material-receipt`, movement type `C-`), which confirms the handler's rule; behaviour for vendor returns was not seen.
- Production-scale behaviour of the running-sum query.
- The deployed behaviour of the whole chain (flag in Datadog → backend capability → tab → event → Mixpanel → KPI), which can only be checked after the deployment.
- The `M_InOut` dependency of `EM_Etgo_Doc_Kind` (the core refuses to change the document type of a processed document, so it could not be exercised; probably unnecessary), the insert path with a real posted document, and the load on a mass posting.

## 10. Delivered (2026-11-02)

**com.etendoerp.go #1507** (merged)
- `ETGO_TRANSACTION_WAREHOUSE` and `ETGO_TRANSACTION_DOC_KIND` (total functions) and the columns `EM_Etgo_Warehouse_ID` (FK to `M_Warehouse`, indexed) and `EM_Etgo_Doc_Kind` (indexed) on `M_Transaction`, with their `AD_COLUMN`, dependency and watched-column records, and the NEO entity/field configuration (`etgoWarehouse`, `etgoDocKind`).
- `ProductTransactionsHandler`: `etgoDocHeaderId`, `etgoDocWindow`, `etgoDocLabel`, `etgoStockAfter` (running sums per product and per product + warehouse, bounded by the date of the page) and the exact `etgoTotalRows` (NEO's `totalRows` is only a lower bound). The extra work runs only for the Product window and only when the flag is on; a count-only request skips the stock.
- `ProductMovementsPolicy` (the flag per account, targeted by the account email with the tenant as `clientId`) and the capability `productMovements` in `SFWindowAccessMap`.
- Tests: `ProductTransactionsHandlerTest` (45), `ProductMovementsPolicyTest` (6), `SFWindowAccessMapTest` (30). CI green.
- Local verification (2026-10-28, database): both columns populated on all 9,198 rows, equal to the functions, `ad_scd_check` = 0; a committed change of a locator's warehouse updated its transaction and was reverted.

**etendo_schema_forge #2073** (merged)
- `ProductMovementsTab` and its query builder, tracking hook, capability gate (fail closed), labels in es_ES, es_AR and en, regenerated `artifacts/product`, the flag entry in `flags-registry.json`, docs.
- Tests: the product folder of `app-shell` and the full suite; CI green (15 of 15 checks).
- Live verification (2026-11-02, local, tenant GOClient, product with 10 movements): rows, stock, warehouse / direction / period filters and the sorts of every column match SQL; same-day movements read in the order the stock was summed.

**etendo-kpis**
- Saved reports, collector, analysis `4.json`, the workbench labels and `docs/mixpanel-saved-reports.md` (see section 7).

**Known limits.** The flag entry in `flags-registry.json` registers four as deferred items: the schema must be deployed before any account is targeted; the hosted flag setting (it has since been created in Datadog, so that item is stale and the entry should be updated); with a gradual rollout the KPI denominator is diluted; the warehouse selector is fed by the stock rows. Also known: the flag is not access control (documented in `docs/feature-flags.md`); a change of `C_DocType.IsReturn` does not fan out to existing transactions; the kind of a goods line whose header has no document type is null, as in the handler.

## 11. What we learned while delivering ETP-5889 (handover for ETP-5908)

Written on 2026-11-02, after the merges. Everything here was observed; what was not verified says so.

### 11.1 The unit of the KPIs is a person once signed in, not a device

- The Mixpanel project (Etendo Go, id `4026645`, EU) uses **simplified ID merge**: events carry both `$device_id` (anonymous, per browser) and `$user_id` (set when someone signs in), and Mixpanel counts one identity per `$user_id`.
- Real data, 24 h on production hosts with the role `warehouse` (22 `session_started` events): one `$user_id` appeared from 12 different devices and counted as **one**; another from 2 devices, as one; 8 events had only a device id and counted as eight. The warehouse count of the week went from 14 to 9 after a sign-in, with nobody leaving: identities were merged, retroactively.
- Consequences: the saved reports measure **people when signed in and devices when not**; the weekly figure is provisional until the week closes (the collector reads closed weeks only); a user on three browsers counts once.
- **Open, ask Platform (Fran, who did ETP-6043):** which id is sent to `identify`. It looks like the Etendo user id (32 hex characters) but this was not verified. If it is, the statement "Mixpanel does not identify people" (ETP-4352) is not true of what is sent today and the wording of the privacy decision must be revisited. Until then this plan, `docs/ops/mixpanel-kpi-emission-spec.md` and `etendo-kpis/docs/mixpanel-saved-reports.md` still say "device".
- The Mixpanel settings page *Identity Merge* returned a 404 when opened, so the setting was inferred from the properties, not read.

### 11.2 How the KPIs read, in one example

A week with 10 active warehouse users, of whom Ana opens the tab 8 times, Luis 2, Marta once and the other seven never: adoption = 3 / 10 = **30 %** (who opened); frequency = 11 / 10 = **1.1** opens per active user (how many times, zeros included). Both share the denominator and differ in the numerator; read together they tell curiosity (high adoption, frequency near 1) from habit (both high). The Mixpanel dashboard is `11625102`; reports `93773825` (adoption) and `93773827` (frequency).

### 11.3 Testing a warehouse role on a hosted tenant

- The tenant **owner always has the Administrator role** and the screen refuses to compose other roles for them ("No se pueden componer roles adicionales"). An admin sends `role_groups = ["admin"]`, which the reports filter out. To test as warehouse, **create a second user** with the role *Inventario* (Configuración > Usuarios, `/user`) and sign in with it.
- Roles are derived from four **template roles at the system client** (Finance, Inventory, Purchasing, Sales; `Template = Y`). A personal role inherits from them in *Role Inheritance*; the system *Inventory* role id is `73581A7B4F414A2C9059C83CE7BE97BF`. Administrator roles do not inherit from any system role. (Explained by Santi, Platform.)
- A DEMO tenant on `app.etendo.ai` or `app.etendo.software` still reports to the **production** Mixpanel (the host is what the reports filter on), so test sessions add to the real figures.
- Result of the first live check (2026-11-02): the denominator of the reports moved with the new warehouse user; the tab-open numerator stays at 0 until the code is deployed **and** the account is in the Datadog rule.

### 11.4 Datadog flag, state and traps

- `product-movements-tab` (boolean, default off) has a Production rule targeting accounts by **email** (attribute `email`, lowercase). Today: the shared `goadmin@etendo.software` and the analyst's account. Experimental, Staging and Development are disabled. A new test user is **not** covered until its email is added.
- In the Datadog rule editor, the emails go in **one comma-separated field**; typing a new value in the picker replaced the existing one instead of appending (caught before saving).
- Local development: `etendo.go.flags.product-movements-tab=true` in the Etendo root `gradle.properties` (git-ignored).

### 11.5 Collector and reports (etendo-kpis)

- The collector reads the two saved Insights reports by id; the production and role filters live in the reports, not in code or variables. The variables `MIXPANEL_WAREHOUSE_ROLE_*` were removed because nobody without repository-admin rights could create them.
- Real response shape: `series[<name>]["2026-10-26T00:00:00+01:00"] = value`; weeks start Monday 00:00 Madrid time. Series names are a contract (`Adopción (%)`, `Aperturas por dispositivo`, `Dispositivos activos (denominador)`).
- Reports are N/D, never 0, when the event has not been seen in production in 90 days, when the denominator is 0, or when the report has no value for the week. The first value can appear on the first Monday after a full Monday–Sunday week with deployment and use.
- `contains` is the only operator for list properties; `role_groups` is a list.

### 11.6 Delivery lessons (apply them to ETP-5908)

- **Same-day ordering.** The running stock is summed in `movementDate, transactionProcessDate, id`; the front end normalises `_sortBy` to the `-col` / `col` convention and adds the tie-breakers (`productMovements.js`: `tieBreakers()`, `prefixed()`). A mix of `x desc` and `-y` in one request broke the order.
- **Sonar.** Cognitive complexity (S3776) in the handler was solved by extracting `enrichRow`; the nested ternary (S3358) in the tab by extracting `EmptyMovements`. New components need the `data-testid` codemod (`scripts/add-data-testid.cjs`).
- **Local Playwright.** `subscription-lifecycle` fails locally even on a clean `develop` and passes in CI; do not report it as a regression of the branch.
- **Pre-push hook.** It needs a clean working tree (untracked files block it) and skips the heavy steps for documentation-only pushes.
- **Repository rules.** Branch `feature/ETP-XXXX`, commit `Feature ETP-XXXX: …` (80 characters at most), no special characters in PR titles, **no `Co-Authored-By` or tool attribution** in commits or PRs, PR body with the testing-delivery-gate structure (QA line: Matías Bernal / Emilio Polliotti). Tests are written and reviewed by the testers (`tester-go`, `tester-functional`), not by the developer agent.
- **Flag model.** Capability pattern: the flag is evaluated only in the backend and published in `SFWindowAccessMap`; the browser reads `useCapabilitiesSafe()` + `isCapabilityVisible` and fails closed. If ETP-5908 needs its own switch, register it in `flags-registry.json` on day one (see the `feature-debt` skill).

### 11.7 For ETP-5908, to decide before coding

1. Status 2026-11-02: default period **decided** (tab 7 days, panel 12 months); "Expandir" vs "Ver movimientos" **decided** through the flag; the period mapping / synchronisation is **still open** (section 5).
2. Decided 2026-11-02: the panel reuses the `productMovements` capability, no own flag.
3. Whether to measure the panel at all (ETP-5908 has no KPIs) and, if so, per person or per tenant, after Platform answers the question in 11.1.
4. The panel link to the tab already has a `source = side_panel_link` value reserved in `product_movements_tab_opened`; the event is not sent from the panel yet.

### 11.8 Still open from the etendo-kpis viewer (not changed)

The workbench shows four entries for idea #4 (two described in the issue and two snapshots of the collector for the same purpose) and a "Sin feature" group. A proposal exists (one entry per idea indicator, with its linked KPI inside); the user will discuss it with the Platform team. `flags-registry.json` still lists the hosted flag setting as a missing precondition although the flag now exists in Datadog; the item and its reference to "etendo-kpis PR #15" are stale and should be updated by someone who may decide on deferred items.
