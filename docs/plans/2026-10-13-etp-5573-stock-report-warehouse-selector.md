# ETP-5573 — Stock Report: warehouse selector misses new warehouses, accent and capitalization

- **Ticket:** ETP-5573 (bug, minor), parent ETP-3504
- **Branch:** `feature/ETP-5573`, cut from `develop` in `etendo_schema_forge` and `com.etendoerp.go`
- **Status:** implemented, uncommitted, awaiting review of the diff
- **Investigated on:** app.etendo.ai and core.etendo.cloud (read-only), local environment (UI, DB, servlet called directly), and code on `develop`

## 1. The three reported problems

| # | Report | Verdict on `develop` |
|---|--------|----------------------|
| 1 | Warehouse selector (Scope section) does not list recently created warehouses | **Reproduced, fixed here** |
| 2 | "Almacen" without accent (label, placeholder, "Group by", generated report) | **Already fixed** by ETP-5492 (`a73becdb4`, 2026-10-06). Seen correct on app.etendo.ai and locally (HTML report, `es_ES`) |
| 3 | "Unidad de medida" should be "Unidad de Medida" / "Unit of Measure" | **Already fixed** by the same commit |

Not exercised live: PDF / Excel / CSV output and the English locale. The templates (`template.hbs`, `template-excel.hbs`, `template-csv.hbs`) read `meta.labels.*` from `artifacts/inventory-stock-report/report-contract.json`, which holds the right strings in both languages.

Residual note on problem 2: `Almacen Principal` comes from the onboarding sample data (`com.etendoerp.go/referencedata/sampledata/GOClient/M_WAREHOUSE.xml`, `<NAME>`). It is data, not a translation, and renaming it would also need `OnboardingAccountingWiringService` (name-based mapping) and its tests. Out of scope.

## 2. Root cause of problem 1

`ReportSelectorsServlet.buildWarehouseQuery()` listed a warehouse only if an `ad_org_warehouse` row linked it to one of the role's readable organizations (`roleOrgIds` is filled server-side from `OBContext.getReadableOrganizations()`). That table is the Classic organization↔warehouse assignment (Organization window → Warehouse tab). Etendo GO never creates the row when a warehouse is added: no core trigger, no NEO handler, no field in the GO form.

### Evidence

- **Causal test (local):** `Almacén Terciario` had 0 rows → the servlet returned 2 warehouses. After assigning it to GOOrg in Classic (1 row) → the servlet returned 3. Same user, DB and token, servlet called directly on Tomcat.
- **Classic (core.etendo.cloud):** organization Etendo G has only Principal and Secundario assigned; Central 2, Demo and terciario are not. The app.etendo.ai selector shows exactly those two. app.etendo.ai itself was not called with a token (no credentials entered on remote hosts), so production is consistent but not directly proven.
- **GO creates warehouses in the session organization:** a warehouse created from the GO UI got GOOrg (`organization` is a hidden `system` field). All records created from GO across tables and months are GOOrg; the only `*` warehouse is an older, isolated one.
- **No other GO selector has the restriction.** Live check of the warehouse selector in sales-order, purchase-order, goods-receipt, goods-shipment, physical-inventory, return-material-receipt and return-to-vendor-shipment: all list every active warehouse, including those with 0 `ad_org_warehouse` rows. Invoices have no warehouse field. GO's own default-warehouse lookups (`CreateInvoiceShipmentHandler`, `WarehouseLookupHelper`) use the warehouse's own organization. Five specs (packing, requisition, stock-reservation, inventory-quality-inspection, warehouse-picking-list) are not published in the local NEO, so they were not exercised live.
- **No documented rationale for the restriction.** It first appears in the Vite plugin in the Stock Report commit (ETP-3585, 2026-04-01), was copied verbatim into the servlet (ETP-3637, 2026-04-15), and appears in no commit body, comment, test, doc or the Jira description. The stock report has no organization parameter. The Stock Report is the only consumer of the warehouse report selector.

### Why it did not show locally

`localhost:3100` answers `/sws/report-selectors/*` from the Vite plugin `tools/app-shell/vite-plugins/report-api.js`, not from the Java servlet. The plugin only applied the filter when the client sent `roleOrgIds`/`selectedOrgId`, and the popup sends neither. All other `/sws` traffic (NEO CRUD, document selectors, handlers) is proxied to Tomcat. The plugin intercepts only the report routes (`/sws|api/report-selectors/:type`, `/api/reports`, `/api/reports/:id/data`, `/api/reports/:id/render`), and only in the dev server.

## 3. Decision

The assignment table is a Classic concept that GO does not use anywhere else, so the report selector is simplified to match the rest of GO. The creation handler and the data fix considered earlier are dropped: existing warehouses become visible with the new build, and the assignments in Classic stay a manual matter.

Rejected alternatives:

- **Handler that creates the `ad_org_warehouse` row on create (+ data fix):** adds a mechanism GO does not consume anywhere else and leaves every other creation channel (MCP, imports) uncovered.
- **Drop all organization scoping from the selector:** the servlet uses native SQL and would lose the role's organization security that the DAL gives other selectors.

## 4. Change

Both implementations scope a warehouse by its own organization and never touch `ad_org_warehouse`; they must stay in sync (same precedent as ETP-5483).

| Where | Before | After |
|---|---|---|
| `ReportSelectorsServlet.buildWarehouseQuery()` (`com.etendoerp.go`) | `EXISTS (... ad_org_warehouse ... ad_org_id = :selectedOrgId)` and `... IN (:roleOrgIds)` | `m_warehouse.ad_org_id IN (:selectedOrgId, '0')` and `m_warehouse.ad_org_id IN (:roleOrgIds)` |
| `tools/app-shell/vite-plugins/report-api.js`, `type === 'warehouse'` | same two `EXISTS` clauses | `m_warehouse.ad_org_id IN ($N, '0')` and `m_warehouse.ad_org_id = ANY($N)` |

Behavior that stays: active-only, tenant (`ad_client_id`) and name search.

Tests: `ReportSelectorsServletTest` (JUnit, `com.etendoerp.go`) and a Node test next to the other `report-api` tests, both reuse-first.

Docs: `docs/feedback.md` entry (root cause, why it hid locally, fix, lesson) and this plan.

## 5. Risks and open points

- **Readable orgs and the root org (verified from the core source, not with a restricted login):** `OBContext.setReadableOrganizations` always adds `'0'` to the readable set, after taking the natural tree of each org the role can access (`src/org/openbravo/dal/core/OBContext.java`, `readableOrgs.add("0")`). So a role limited to GOOrg (GOuser) reads GOOrg's tree plus `'0'`: it sees warehouses of its own organization and the onboarding ones in `*`, and not those of other organizations. No restricted user's credentials were available, so this was not exercised live.
- **Local Tomcat** runs classes built before the `com.etendoerp.go` `develop` was brought up to date (it was 320 commits behind when the branch was cut and was fast-forwarded afterwards): rebuild before testing the servlet change locally.
- **Unrelated finding, not addressed:** `user.defaultWarehouse` selector returns 0 items (validation rule `M_Warehouse of Role` uses `@Default_AD_Client_ID@`, no `ad_org_warehouse`). Likely a separate bug.

## 6. Verification plan

Executed test cases and results: `docs/testing/stock-report-warehouse-selector-test-cases.md` (5 corner cases, all passing, local environment).


1. Unit tests above (SQL never references `ad_org_warehouse`; own-org predicate present when `selectedOrgId` / `roleOrgIds` apply, absent otherwise; client and active filters always present).
2. After rebuilding Tomcat: call `/sws/report-selectors/warehouse?q=` directly on Tomcat with a token and confirm every active warehouse of the tenant is listed, including one with 0 `ad_org_warehouse` rows.
3. Create a warehouse from the GO Warehouse window and confirm it appears in the Stock Report selector.
4. With a role limited to GOOrg, confirm the selector shows only the expected organizations.
5. Generate the report in `es_ES` and `en_US` (HTML, PDF, Excel, CSV) and confirm "Almacén" and "Unidad de Medida" / "Unit of Measure".
6. Pipeline: Alex (review, `sf-validate-pipeline` not applicable: no `decisions.json` change), Sentinel (QA), Sage (docs). Commits follow `Feature ETP-5573: ...`; no commit until the user approves the diff.
