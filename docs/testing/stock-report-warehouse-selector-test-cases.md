# Stock Report warehouse selector — corner test cases (ETP-5573)

Manual/live test cases for the Stock Report **Warehouse** scope selector after it was changed to scope a
warehouse by its own organization instead of by an `ad_org_warehouse` assignment row. The Jira ticket carries
no test cases; these cover its first problem (new warehouses missing from the selector) and the edge cases
around the changed SQL. Plan and rationale: `docs/plans/2026-10-13-etp-5573-stock-report-warehouse-selector.md`.

- **Executed:** 2026-10-13, local environment (Tomcat `:8080/etendocorepg`, Vite `:3100`), user `goadmin@etendo.software`
  (role GOClient Admin), client GOClient, build of branch `feature/ETP-5573` in `com.etendoerp.go` and `etendo_schema_forge`.
- **Endpoint under test:** `GET /sws/report-selectors/warehouse?q=&limit=&offset=&selectedOrgId=` called **directly on
  Tomcat** (the Java servlet). `localhost:3100` serves this route from the Vite dev plugin (`report-api.js`), so
  servlet cases must not go through Vite.
- **Dataset (GOClient):** `Almacen GO`, `Almacén Secundario`, `Almacén Terciario` (org `*`; each with an
  `ad_org_warehouse` row) and `Prueba local 1`, `ETP-5573 Prueba GO`, `ETP-5573 Almacén post-fix` (org GOOrg,
  **no** `ad_org_warehouse` row). 6 active warehouses for the client, 102 active in the whole database.

## Summary

| # | Case | Result |
|---|------|--------|
| TC-1 | Inactive warehouse is excluded and comes back when reactivated | Pass |
| TC-2 | Search: case, partial match, accents, wildcards, hostile input | Pass (2 observations) |
| TC-3 | Tenant and organization isolation, `selectedOrgId` edge values | Pass |
| TC-4 | Pagination and limit/offset clamping | Pass |
| TC-5 | End to end in the UI: pick a warehouse without an assignment and generate the report | Pass (1 observation) |

Reference baseline: before the change, the servlet returned only the 3 warehouses with an `ad_org_warehouse`
row; a warehouse created from the Warehouse window was never listed.

## TC-1 — Inactive warehouse

- **Precondition:** `ETP-5573 Prueba GO` is active, org GOOrg, no assignment row.
- **Steps:** (1) `q=ETP`. (2) Set `m_warehouse.isactive='N'` for that row. (3) `q=ETP`. (4) Set it back to `'Y'`. (5) `q=ETP`.
- **Expected:** step 1 lists `ETP-5573 Almacén post-fix` and `ETP-5573 Prueba GO`; step 3 lists only the post-fix one;
  step 5 lists both again.
- **Actual:** 2 → 1 → 2 items, as expected. The row was restored to active.

## TC-2 — Search input

- **Steps / actual** (200 in every case, never a 500):

| `q` | Items | Note |
|---|---|---|
| `etp`, `ETP-5573` | 2 | case-insensitive |
| `Prueba` | 2 (`ETP-5573 Prueba GO`, `Prueba local 1`) | partial match |
| `almac` | 4 | |
| `almacén`, `ALMACÉN` | 3 (only the accented names) | |
| `almacen` | 1 (`Almacen GO` only) | **observation O-1** |
| `%`, `_`, empty | 6 (all) | **observation O-2** |
| `'; DROP TABLE m_warehouse;--`, `"`, `xyz-no-existe` | 0 | |

- **Expected:** parameterized search, no SQL error, no side effect.
- **Result:** pass; `m_warehouse` still exists after the injection attempt.
- **O-1:** the search is accent-sensitive (`ILIKE`): typing `almacen` does not find `Almacén …` and vice versa. Pre-existing
  behavior, not changed here; relevant to the ticket's accent complaint because users may type either form.
- **O-2:** `%` and `_` behave as `ILIKE` wildcards (match everything). Pre-existing, harmless (no injection).

## TC-3 — Tenant and organization isolation

- **Steps / actual:**

| Request or action | Expected | Actual |
|---|---|---|
| `q=` | only GOClient warehouses | 6 (DB has 102 active across all clients; the 96 other-client warehouses are not listed) |
| `selectedOrgId=<GOOrg>` | GOOrg ones + root-org ones | 6 |
| `selectedOrgId=0` | only root-org (`*`) ones | 3 (`Almacen GO`, `Almacén Secundario`, `Almacén Terciario`) |
| `selectedOrgId=<valid hex, unknown org>` | only root-org ones | 3 |
| `selectedOrgId=zzz` (not hex) | ignored, no error | 6 |
| `selectedOrgId=0' OR '1'='1` | ignored, no injection | 6 |
| Move `ETP-5573 Prueba GO` to an organization of **another client** (not readable by the role), then `q=ETP` | disappears | 1 item (only `ETP-5573 Almacén post-fix`) |
| Restore its organization (GOOrg), then `q=ETP` | reappears | 2 items |

- **Result:** pass; the row's organization was restored to GOOrg. This also confirms the readable-organization
  predicate (`m_warehouse.ad_org_id IN (:roleOrgIds)`) does hide warehouses of non-readable organizations.
- **Not covered live:** a login with a role limited to GOOrg (no credentials available). Core source says readable
  organizations always include `'0'` (`OBContext.setReadableOrganizations`), so such a role would see its own
  organization's warehouses plus the `*` ones.

## TC-4 — Pagination

- **Steps / actual** (`q=` empty, 6 warehouses):

| Query | Items | `totalCount` | `hasMore` |
|---|---|---|---|
| `limit=2&offset=0` | 2 | 6 | true |
| `limit=2&offset=2` | 2 | 6 | true |
| `limit=2&offset=4` | 2 | 6 | false |
| `limit=2&offset=6`, `limit=2&offset=100` | 0 | 6 | false |
| `limit=0`, `limit=-5` | 1 (clamped to 1) | 6 | true |
| `limit=1000` | 6 (clamped to 100, only 6 exist) | 6 | false |
| `limit=abc&offset=xyz`, `offset=-3` | 6 (defaults) | 6 | false |

- **Expected:** `totalCount` independent of the page; `hasMore` true only while more rows follow; bad values fall back to
  defaults or clamp, never an error.
- **Result:** pass.

## TC-5 — End to end in the UI

- **Steps:** (1) Open Inventario → Informes → Reporte de Stock. (2) Open the Almacén selector, type `Prueba local`; the
  popup filters to `Prueba local 1` (a warehouse with **no** assignment row). (3) Tick it, confirm. (4) Turn on
  "Incluir productos sin stock". (5) Generar informe.
- **Expected:** the warehouse is selectable; the report header shows it as the warehouse filter; labels in Spanish with
  their accents (`Almacén`, `Agrupar por`).
- **Actual:** the header reads "Almacén: Prueba local 1 · Incluir productos sin stock: Sí · Agrupar por: Almacén".
  Pass.
- **Observation O-3:** the report body is empty because the warehouse has no stock rows; whether "include products
  without stock" should list products for an empty warehouse is existing report behavior, outside this ticket.
- **Also seen in the UI popup:** the full list of 6 warehouses, including the three without an assignment row, and a
  newly created warehouse (`ETP-5573 Almacén post-fix`, created from the Warehouse window) appearing immediately.

## Not covered

- PDF / Excel / CSV output and the English locale (they read the same report contract labels).
- A restricted-role login (see TC-3).
- The five specs not published in the local NEO (packing, requisition, stock-reservation, inventory-quality-inspection,
  warehouse-picking-list), whose selectors were not exercised.

## Side effects left in the local database

Three test warehouses in GOClient: `Prueba local 1`, `ETP-5573 Prueba GO`, `ETP-5573 Almacén post-fix`. Every temporary
change made by the cases (inactive flag, organization) was restored.
