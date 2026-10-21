# ETP-5707 — Product picker: wrong `totalCount` on invoices, slow open on orders/quotations

**Status:** A needs NO code change (ETP-5703 already fixes it; the price-list scoping tried first was reverted) · B implemented, tests green, verified live (uncommitted)
**Jira:** ETP-5707 (Error, Menor) · Epic ETP-3504 · Related: ETP-5670, ETP-5312, ETP-5703, ETP-3662
**Repo touched:** `com.etendoerp.go` (Java); docs in this repo
**Branch:** `feature/ETP-5707` (both repos, from `develop`)
**Date:** 2026-10-20

## 1. Problem (from the ticket and its comments)

Seen on app.etendo.ai (org Fitz Roy Adventures, 1058 products, 2 warehouses) after ETP-5670.

| | A. Invoices (sales/purchase) | B. Sales order / Sales quotation / Purchase order |
|---|---|---|
| Spec endpoint | `…/lines/selectors/M_Product_ID` | same |
| OBUISEL selector | `ProductSimple` (custom HQL, entity `Product`) | `Product` over `M_Product_Price_Warehouse_v` (`ProductByPriceAndWarehouse`) |
| Rows come from | `PricingProductPrice` ⨝ product ⨝ price-list version: one row per product × price-list version | the view: one row per product × warehouse × price |
| De-dup | after `limit`, in Java (`ProductPriceSelectorPolicy.deduplicateProductItems`) | inside the query (`SelectorQueryExecutor.buildRepresentativeRowWhere`, `min(id) … group by <valueProperty>`) |
| Symptom | `totalCount` ≈ 2× products, pages with half the items (15 of 30), footer "15 productos" | correct totals and pages, but 4–8 s to open with ~1000 products (invoices: 0.5–1.4 s) |

Thread conclusions (Valentin Vivaldi, Valeria Garcia):
- A is caused by **price-list versions**, not warehouses (a product normally has a sale-list and a purchase-list price). `ProductSimple` is a stock Core selector; Classic filters it by sale/purchase, currency and price-list version through filter expressions, GO does not.
- Neither bug was introduced by ETP-5670. A dates from April 2026 (ETP-3662), B from July 2026 (ETP-5670 only removed the per-row correlated subquery; the remaining cost is the de-dup itself, explicitly out of scope there).
- Agreed direction: **unify the product selectors across windows** (Valeria).

## 2. What `develop` already does (verified in code, 2026-10-20)

ETP-5703 (merged to `develop` via `mergeblock/ETP-5797`) changed the custom-HQL path in `SelectorQueryExecutor.executeCustomHqlQuery`: when the record-id column is a plain `.id` path and the display property is a primitive, it pages **by record** — `COUNT(DISTINCT id)`, a page of ids via `GROUP BY id ORDER BY MIN(display), id`, then the rows of those ids. `ProductSimple` qualifies (`e.id`, `e.name`).

So on `develop`, **A is expected to be already fixed in code**, and the ticket text predates that merge. This must be confirmed against what app.etendo.ai actually runs.

## 3. Live check on the local environment (develop, 2026-10-20)

`GOClient`, user GOAdmin, drafts of each document, `limit` 30 and 100, empty search and `q=p`:

| Document | items | distinct | totalCount | time |
|---|---|---|---|---|
| sales-invoice | 21 | 21 | 21 | 40–65 ms |
| purchase-invoice | 21 | 21 | 21 | 45–85 ms |
| sales-order | 21 | 21 | 21 | 95–150 ms |
| purchase-order | 21 | 21 | 21 | 80–105 ms |

(`q=p`: 14/14/14 everywhere; UI footer reads "14 productos".) `items == distinct == totalCount` on every surface, so **A does not reproduce**. But the dataset cannot discriminate: GOClient has 21 products and one version per price list (21 sale + 21 purchase rows), and B needs volume to show. A clean result here is not proof of the fix.

### 3.1 Why the local result already confirms A is fixed on `develop`

The A trigger is rows > products. In GOClient the DB holds 21 sale-list + 21 purchase-list price rows for 21 products (42 rows). Before ETP-5703 that gives `totalCount = 42` and, with `limit=30`, ~15 items per page. `develop` returns `totalCount = 21` and 21 items on one page. The trigger condition is present locally and the symptom is absent, so ETP-5703's record paging is the fix. What was missing is the Classic parity (scope to the document's price list) and a regression test.

### 3.2 After the change (built and deployed locally, 2026-10-20)

Same four documents, `limit` 30/100, empty and `q=p`: `items = distinct = totalCount` (21 / 14), no regression, 55–270 ms. Filter proof on `sales-invoice`: real price list → 21; nonexistent price-list id → 0 (was 21 before); a malformed id (fails the id pattern) → filter skipped, 21 (same lenient behaviour as the existing `ProductByPriceAndWarehouse` filter). Still unproven at volume and with a product priced in only one list: needs seed data.

### 3.3 Volume seed and measurements (local, 2026-10-20)

`etp-5707-seed/seed-products.sql` (+ `cleanup-products.sql`) adds 1000 products tagged `ETP5707-NNNN` to GOClient: 0001–0050 priced only in the purchase list, 0051–0100 only in the sale list, 0101–1000 in both. GOClient has 8 active warehouses, so `M_Product_Price_Warehouse_v` holds 15 200 rows for them.

A (invoices), all `items = distinct`, 45–150 ms:

| Case | sales-invoice | purchase-invoice |
|---|---|---|
| empty, limit 30 / 100 | 30 / 100 items, total 971 | 30 / 100 items, total 971 |
| `q=p`, limit 30 | 30 items, total 964 | 30 items, total 964 |
| `ETP5707-0007` (purchase only) | 0 | 1 |
| `ETP5707-0075` (sale only) | 1 | 0 |

971 = 950 priced in the list + the 21 original products. Page size and `totalCount` are right and the scoping is correct both ways.

B (sales-order, same seed): `q=ETP5707-0150` 1.3 s; the empty open exceeded the 45 s browser timeout (count and data queries ran for tens of seconds each). B is reproduced and is worse locally than in production because of the 8 warehouses.

### 3.4 B: EXPLAIN ANALYZE on the seeded data (sales-order selector, empty search)

SQL reconstructed from the Hibernate statement seen in `pg_stat_activity` (view ⨝ `M_ProductPrice` ⨝ `M_PriceList_Version`, org-tree predicates, price list, de-dup `IN` subquery); parameters inlined.

| Query | Execution time |
|---|---|
| **Current** count with `e.id IN (select min(id) … group by product)` | **40 268 ms** |
| Proposed `count(distinct product_id)` | 331 ms |
| Proposed page of ids (`GROUP BY product ORDER BY min(name), id LIMIT 30`) | 302 ms |
| Same with search `p` | 307 ms |

Why the current one is slow: the plan is a *Nested Loop Semi Join* whose inner side is the `GROUP BY` subselect, re-evaluated 7 768 times (once per outer row) with 7 070 822 rows discarded by the join filter. It is quadratic in the number of view rows, and the view has one row per product × price × **warehouse** (15 200 rows here: 8 active warehouses). The remaining ~300 ms of the proposal is the two `AD_ORG_ISINNATURALTREE` calls per view row.

### 3.5 B implemented and verified live (local, seeded data, 2026-10-20)

Implementation: option (a), `SelectorQueryExecutor.executeValuePagedRichQuery` (+ an array branch in `NeoSelectorExecutionHelper.bindNamedParameters`, found by the first live pass: `OBQuery` keeps the readable-org filter as `String[]` and the first build answered 500 on every affected selector).

Same battery before and after (ids, order, `_aux`/price values, totals, `hasMore`): **23 of 23 cases identical** (sales-order, sales-quotation, purchase-order, return-from-customer, return-to-vendor lines with code and 10-product searches; sales/purchase paging pages 1, 2 and 4; product costing, stock, transactions, warehouse binContents / productTransactions, G/L journal, payment details with no price context).

| Case (1000 products, 8 warehouses) | Before | After |
|---|---|---|
| Open the picker, sales-order / quotation / purchase-order | > 45 s (count alone 40.3 s) | 1.2–1.4 s |
| Return-from-customer / return-to-vendor open | not measured | 1.2–1.3 s |
| Search `p` | not measurable | 1.3–1.4 s |
| Walk every page of sales-order, limit 100 | n/a | 10 pages, 971 unique, 0 repeated, `totalCount` 971 |
| Unfiltered `product/costing` open | n/a | 1021 total (1000 seeded + 21) |

SPA, sales-order draft: picker opens in about 2 s with prices; `p` → 30 items; scroll → `offset=30` request, footer 60 products; all 200. Invoices (custom-HQL path, untouched): unchanged. No selector error in `openbravo.log` after the fix.

Not exercised live (unreachable or needs data): `ETRX_OrgsByRole`, `ETRX_RolesByUser`, the commission-line and discount-schema `Product` selectors, a 1-warehouse org, and hidden system-category products. Java coverage only.

### 3.6 Proof that A needs no change (local, 1021 products, requests WITHOUT `priceList`, so without any scoping)

Source of the invoice selector (`ProductSimple`: price × price-list version, active, non-generic): **1942 rows for 1021 products** (921 products on two rows, sale + purchase list). Before ETP-5703 this gave `totalCount` about 2× and half-filled pages (the ticket's 2117 and 15 of 30).

| Request | Result |
|---|---|
| sales-invoice, empty, limit 30 / 100 | 30 / 100 items, all distinct, `totalCount` 1021 |
| sales-invoice, `q=p`, limit 30 | 30 items, `totalCount` 1014 |
| purchase-invoice, same three | identical figures |
| walk of every page, limit 100 (both) | 11 pages, 1021 unique, 0 repeated, `totalCount` 1021 |

Times 56–517 ms. `totalCount` counts products, not rows; every page is full; no repeats or gaps. Note: the build that was running still contained the (now reverted) scoping class, but it only acts when a `priceList` is in the request and these requests carry none, so it was inactive. 

Re-run with the final build (scoping reverted, Tomcat restarted), requests WITH the document's `priceList` as the SPA sends them: sales-invoice and purchase-invoice both give `totalCount` 1021 (`q=p` 1014), full pages (30 / 100), 11-page walk with 1021 unique and 0 repeated; 45–124 ms. `ETP5707-0007` (purchase-list only) is visible again on the sales invoice, `ETP5707-0075` (sale-list only) on the purchase invoice: the price-list scoping is gone, as intended, and the symptom of the ticket is still absent.

Final B check on the same build: 23 of 23 baseline cases identical; open of sales-order / quotation / purchase-order / return-from-customer / return-to-vendor 1.2–1.8 s (> 45 s before); 10-page walk of sales-order, 971 unique, 0 repeated.

Test suite (`com.etendoerp.go.mcp.*` + every class named `*Selector*`): 2545 tests, 30 failures, 3 skipped. All 30 are Etendo Core HTTP tests (`WebserviceTestSuite` 15, `SelectorPickListFieldsDataSourceTest` 4, `SelectorFieldPropertySelectorDSTest` 4, `OrganizationSelectorDataSourceTest` 4, `ProductSelectorDataSourceTest` 2, `TestSelectorDefaultFilterActionHandler` 1) expecting 200 and getting 404: `config/Openbravo.properties` has `context.url=http://localhost:8080/etendo` while the app runs at `/etendocorepg` (`/etendo/` answers 404). 0 failures in `com.etendoerp.go` (334 suites, 251 of them `mcp`). Not run on a clean `develop` baseline.

Operational note: running `./gradlew test` rewrites `build/classes` under a running Tomcat and breaks it (`ClassNotFoundException` cached by the webapp loader) until it is restarted.

### 3.7 Live MCP pass (etendo-mcp-local, final build, 2026-10-20)

Tool `etendo_selectors` (route R2) with the document's `priceList` as parent context, and `etendo_create` / `etendo_delete` (route R3, FK-by-name inside the write transaction):

| Call | Result |
|---|---|
| sales-order/lines, `ETP5707-011` | `totalCount` 10, 10 items, sale-list prices (30–39) |
| sales-order/lines, empty | `totalCount` 971, `hasMore` true, 50 items (MCP cap) |
| sales-quotation/quotationLine, `ETP5707-011` | `totalCount` 10 |
| purchase-order/lines, `ETP5707-011` | `totalCount` 10, purchase-list prices (35–44) |
| sales-invoice/lines, `ETP5707-011` | `totalCount` 10 (20 source rows, 10 products), prices from the sale list |
| sales-invoice/lines, `ETP5707-0007` (purchase list only) | 1, visible: no scoping, as before the change |
| purchase-invoice/lines, `ETP5707-0075` (sale list only) | 1, visible |
| product/costing (no price list), `ETP5707-0150` | `totalCount` 1 (view has a row per warehouse) |
| create sales-invoice line, product `ETP5707 Producto 015` | 422 `ambiguous_fk`, "matched 10 records", nothing written |
| create sales-invoice line, `ETP5707 Producto 0150` | created: price 70, tax and amounts derived; then deleted, invoice back to 3 lines |
| create sales-order line, `…015` | 422 `ambiguous_fk`, 10 unique candidates |
| create sales-order line, `…0150` (value-paged selector inside a write) | created: price 70, tax derived; then deleted, order back to 6 lines |
| create purchase-order line, `…0007` (purchase list only) | created: price 12, "Adquisiciones IVA 21%"; then deleted, order back to 2 lines |

The return-from-customer and return-to-vendor order specs are not exposed by this MCP (only `return-material-receipt` and `return-to-vendor-shipment`), so those two were covered through REST only.

## 4. Proposed fix

### A — invoices (NO CODE CHANGE; the scoping below was implemented, then reverted)

**Outcome:** the symptom of the ticket is already fixed on `develop` by ETP-5703. The price-list scoping described under point 2 was implemented and then reverted: it is not needed for the reported symptom and it changes which products can be selected (SPA line selectors, and the MCP FK-by-name resolution of products in writes, where a product without a price in the document's list would stop resolving). If Classic parity is wanted it belongs in its own ticket, tested with an MCP write of a product without a price. Live evidence in 3.6.

Original proposal, kept for the record:
1. Reproduce at volume (section 5). If `develop` returns correct `totalCount`/page sizes, A is closed by ETP-5703 and this ticket only needs a regression test pinning it (two price-list versions per product, 2 warehouses → `totalCount == N`, `items == limit`).
2. Implemented: `ContextParamSelectorPolicy` now supports entity `Product` and, when the context carries a valid `priceList`, returns the semi-join `e.id in (select ppl.product.id from PricingProductPrice ppl where ppl.priceListVersion.priceList.id = :priceListId and active…)`. The id is pattern-validated and bound as a parameter (existing `:priceListId` binding in `NeoSelectorService.executeSelectorQuery`). Caveat: the registry returns the first non-null filter and this policy is first, so it would shadow `GoodsMovementProductSelectorPolicy` for `Product` whenever a `priceList` is in context; goods movements do not send one. Original idea: scope `ProductSimple` rows by the document's `priceList` (already in the request context, `priceList=<id>`): add `plv.priceList.id = :priceList` when present. This removes the repeated rows at the source, so paging no longer depends on collapsing them, and the aux prices stop belonging to "an arbitrary version" (today `ProductPriceSelectorPolicy` overwrites them afterwards). Must stay structural, not an identity branch on `"ProductSimple"` (CLAUDE.md, NeoHandler pattern): do it via the generic context-parameter binding of the selector filter, not a spec/selector-name literal.

### B — orders/quotations (cheaper de-dup)
Apply the ETP-5703 technique to the **rich** path (`executeRichQuery`), replacing `buildRepresentativeRowWhere`:
- count: `COUNT(DISTINCT e.<valueProperty>)` over the plain filtered query;
- page: `SELECT e.<valueProperty> … GROUP BY e.<valueProperty> ORDER BY MIN(e.<display>), e.<valueProperty>` with offset/limit;
- rows: the filtered rows of those ids, one kept per id (deterministic order).

This drops the `id IN (select min(id) … group by …)` that re-applies the whole filter (including the `AD_ORG_ISINNATURALTREE` calls) a second time. Keep the stock-breakdown exception (`isStockBreakdownSelector`) untouched: it must keep every per-locator row.
Fallback if the measurement says the grouping is still slow: skip de-dup when document context already pins one row per product (a price list plus a warehouse), decided from selector metadata, not from a window name.

### Unification (agreed in the ticket)
Out of the box this is a product decision, see question 1 in section 6. Whatever the answer, the dedup/paging logic lives once, in `SelectorQueryExecutor`, for both paths (it already does for count + page; the Java post-limit de-dup in `ProductPriceSelectorPolicy` must stop being the thing that decides page size).

## 5. Verification plan

1. Seed a scratch volume in the local DB (≈1000 products, 2 warehouses, a sale and a purchase list version each), tagged so it can be deleted. Needs the user's OK (section 6, question 2).
2. Measure the four documents + quotation before the change: `totalCount`, `items`, time for empty, `q=p`, `q=<code>`.
3. `EXPLAIN (ANALYZE, BUFFERS)` of the B count and data SQL before/after.
4. Implement B, re-measure; target ≤ ~1.5 s empty/`p` with ~1000 products (ticket).
5. 1-warehouse regression (ticket "other test cases").
6. Tests via `tester-go`: `make find-tests FILE=SelectorQueryExecutor` first, extend `SelectorQueryExecutorTest` / `ProductPriceSelectorPolicyTest`; no ticket-named files. Per the user's rule, no tests run mid-session until asked.

## 6. Open questions for the user

1. **Unification target:** put invoices on the same selector as orders (`ProductByPriceAndWarehouse`, with stock/price columns, view-backed), or the other way (orders onto `ProductSimple`)? Or keep both selectors and only share the paging/de-dup code? The plan above assumes the third (least risk).
2. **OK to seed ~1000 scratch products** in the local `GOClient` to measure B, and delete them afterwards?
3. **Jira links:** link A to ETP-3662 as Valentin proposed (not ETP-4429, which is the depreciation window)?

## 7. Impact analysis of B (changing `executeRichQuery`'s de-dup)

The change replaces `buildRepresentativeRowWhere` in `SelectorQueryExecutor.executeRichQuery`. It is reached only when `shouldDistinctByValue(meta)` is true: rich (OBUISEL) selector, **not** custom HQL, value field is not the PK, and not a stock-breakdown selector (`_QTY`/`_LOC` aux).

### 7.1 Selectors affected (all 143 OBUISEL selectors in the local DB checked)

| Group | Selectors | Effect |
|---|---|---|
| **Affected** | `Product` 2E64F5… on `M_Product_Price_Warehouse_v` (referenced by 67 AD columns) | the case of this ticket |
| **Affected** | `Product` 37CC93… (commission line) and D47A36… (discount schema line), same view | no GO spec uses them today |
| **Affected** | `ETRX_OrgsByRole` (`organization.id`), `ETRX_RolesByUser` (`role.id`) | used by `user › rxServicesAccess` (`Defaultorg`, `Defaultrole`) |
| Unaffected | 127 selectors whose value field is the PK or unset | guard is false, query byte-identical |
| Unaffected | 7 custom-HQL selectors (incl. `ProductSimple`) | separate path, already paged by record (ETP-5703) |
| Unaffected | `Product Complete` ×2 on `M_Product_Stock_V` | stock-breakdown exception |
| Unaffected | non-rich selectors (`executeQuery`) | untouched |

GO specs whose forms/grids reach the affected `Product` selector through `M_Product_ID`: the order-line family with price-list context (**sales-order lines, sales-quotation quotationLine, purchase-order lines, return-from-customer customerReturnLine, return-to-vendor lines**) plus about 45 more spec entities (accounting dimensions, costing, stock, transactions, binContents, G/L journal, payment details, intrastat…), mostly filters and grids with no price context.

### 7.2 Code routes that reach it (all through `NeoSelectorService` → `SelectorQueryExecutor.execute`)

| # | Route | Limit | Notes |
|---|---|---|---|
| R1 | REST `NeoSelectorEndpoint.querySelector` (the SPA picker, filters) | up to MAX_LIMIT, offset/hasMore | main user path |
| R2 | MCP selector tool, `McpToolRouter` ~1159 | 50 | `McpSelectorContextHelper` reads `totalCount` for diagnostics |
| R3 | FK-by-name in writes, `McpFkResolver` (create 716, update 937, batch 1705) | 10 | runs **inside the write transaction**: an invalid HQL marks it rollback-only, so no fallback and the new queries must be valid for every affected entity |
| — | `NeoDefaultsService` | — | skips OBUISEL selectors (`hasObuiselSelector`), unaffected |
| — | `resolveSelectorAuxForId` (callout cascade) | — | own path by id, unaffected |

Post-query enrichment runs on the response after paging, so it interacts: `ProductPriceSelectorPolicy` (its dedup becomes a no-op), `ProductSystemCategorySelectorPolicy` (filters hidden system-category products **after** the page and lowers `totalCount` only by what it removed from that page: an existing inaccuracy, unchanged here), `InventoryProductSelectorPolicy` (`Product*` with `parentId`), `InvoiceLineTaxSifSelectorPolicy`, `enrichTranslations`.

Reachability found while preparing the live pass (2026-10-20): `user › rxServicesAccess` is `isincluded = N`, so `/sws/neo/user/rxServicesAccess/selectors/*` answers 404 "Entity not found"; `ETRX_OrgsByRole` / `ETRX_RolesByUser` cannot be exercised live through REST (the local MCP server was down). The commission-line and discount-schema `Product` selectors have no spec at all. These three get Java coverage only.

### 7.3 Technical findings that shape the design

1. `OBQuery` cannot take a `GROUP BY`: it splits at ` order by` and appends the readable-client/org/active filters at the end of the WHERE. Plain `session.createQuery` would drop those filters. Options in section 9.
2. `displayProperty` for the price view resolves through `findIdentifierProperty`, which skips non-primitive properties; the view's identifier is the association `product`, so it probably falls back to `id`. Ordering and `MIN(display)` must be checked against the real value before relying on it (ETP-5703 requires a primitive display property).
3. Representative row: today it is the minimum `id` among the filtered rows. Without a `priceList` in context (R2, R3, filters) the `_aux` prices come from that row, so the new row pick must keep `min(id)` or aux values change.

### 7.4 Invariants the change must keep (each is a test)

I1 one item per distinct value · I2 `totalCount` = distinct values · I3 page = `min(limit, remaining)`, no repeats or gaps across pages · I4 kept row = min `id` of the filtered rows · I5 search applies to the rows being grouped · I6 readable client/org/active filters preserved · I7 order by display, stable · I8 stock exception untouched · I9 PK-valued selector untouched · I10 empty result and `limit` > distinct count · I11 named parameters bound (search, `priceListId`, context org, language).

### 7.5 Test matrix

| Layer | What | Count (est.) |
|---|---|---|
| JUnit `SelectorQueryExecutorTest` | **rewrite** the 3 `buildRepresentativeRowWhere` tests and 2 dedup tests (`…SearchesItsOwnRows…`, value-field count/data) | 5 |
| JUnit same class | **new**: I1–I5, I7, I10, I11, display-property fallback, stock and PK guards kept | ~10 |
| JUnit `NeoSelectorServiceTest` / policies | price-list context + enrichment chain on a record-paged response | 2 |
| JUnit MCP | `McpFkResolver` ambiguity with a product that has several rows; `McpSelectorContextHelper` `totalCount` | 2 |
| Integration (`OBBaseTest`) | real view, 2 products × 3 warehouses: total, pages, readable filters (I6) | 1–2 |
| Live (SPA, seeded data) | 5 order-line windows × (open, `p`, code search, page 2) | 20 |
| Live | `user` default org / role pickers; MCP create by product name; 1-warehouse regression; hidden system-category product | 4 |
| Playwright (mocked) | picker footer count and scroll paging | 1–2 |

## 8. Out of scope

Stock-breakdown selectors (goods movements, internal consumption); the picker showing a failed request as "Sin resultados" (stays in ETP-5312).

## 9. Design fork to decide before coding B

How to build the grouped query without losing `OBQuery`'s readable client/org/active filters:
- **(a) Recommended:** build the filtered HQL with `OBQuery.setSelectClause(...).createQuery(...).getQueryString()` (filters already inlined), then append `group by` / `order by` and run it on the session with the same named parameters. Keeps every filter, one small helper.
- (b) Raw `session.createQuery` with the client and org filters re-added by hand, as the custom-HQL path does. More code and a security-relevant duplication.
- (c) `SELECT DISTINCT value, display ORDER BY display, value` through `OBQuery` only. No hack, but wrong whenever the display value differs between rows of one product.
