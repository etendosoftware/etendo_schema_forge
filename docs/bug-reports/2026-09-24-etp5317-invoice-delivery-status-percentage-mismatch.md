# Invoice/delivery status percentage mismatch between grid, form and advanced filter

Date: 2026-09-24

Jira: [ETP-5317](https://etendoproject.atlassian.net/browse/ETP-5317) — "Estado de facturación y
recepción/entrega en grilla usa cálculo diferente al del formulario"

Status: **Part 1 (grid value) implemented, merged, and live-verified. Part 2 (advanced filter /
sort) reopened by QA, root-caused here, and now IMPLEMENTED, DEPLOYED, AND LIVE-VERIFIED end to
end: DB layer (3 new stored computed columns) + frontend grid wiring (`decisions.json` + the
hand-maintained `LIST_COLUMNS` overrides) + NEO Headless config (`push-to-neo.js`, a step
initially missed and caught live — see below) all confirmed working in the browser at
`localhost:3100`, both windows. Emilio's exact filter repro and the sort behavior he flagged are
both closed. Only remaining gaps: (1) `./gradlew export.database` still needs a re-run to persist
the NEO push; (2) the form's status badges — a separate, hardcoded read path — deliberately left on
the old Java-patched fields per explicit user choice, so the Java patch from Part 1 stays in place
for now. See "Implementation status" near the end for the full account, including three real
tooling bugs found and worked around along the way (two build-time, one at the NEO config layer).**

Branch `feature/ETP-5317` in both `schema_forge` and `com.etendoerp.go` (from `develop`, no
worktree, per explicit instruction), both fast-forwarded to latest `develop` before implementation
started. **No commits made in either repo** — working tree only, per explicit instruction.

---

## Part 1 — Original bug, fix, and live verification (DONE)

### Symptom (as originally reported)

`Estado de facturación` (invoice status %) and `Estado de recepción` (delivery status %) shown in
the Purchase Order / Sales Order **grid columns** did not match the `Facturado X%` / `Recibido X%`
badges shown in the **document form's status bar**, specifically on orders that have a **Descuento
total** (total discount) applied at the header level.

Examples from the ticket:
- 1 product line (qty 1) + discount → grid showed `1/2 = 50%` instead of `100%`.
- 1 product line (qty 10) + discount → grid showed `10/11 = 91%` instead of `100%`.

### Root cause

`com.etendoerp.go`'s "Total Discount" feature (`TotalDiscountService`) materializes a header-level
discount as a **real `C_OrderLine`/`C_InvoiceLine` row**, using a dummy product
(`ETGO_DTO`, id `E4BC94E71D664E73A066DAF78BF39DB3`). This line is filtered out of the UI's line
grid (`DiscountLineFilter`), but it is a real row in `c_orderline`/`c_invoiceline`.

The classic core `AD_COLUMN`s that compute these percentages —

| Field | Column | `AD_COLUMN_ID` | Table |
|---|---|---|---|
| Invoice Status | `InvoiceStatus` | `B5B203AE8D674B8DABC6669419815CA7` | `C_Order` |
| Delivery Status | `DeliveryStatus` | `9E82E728716246B393C40D2CDCA0133A` | `C_Order` |
| Delivery Status Purchase | `DeliveryStatusPurchase` | `9B350DD4248848A7ACC12061D151E92D` | `C_Order` |

— are **virtual computed columns** (`Computation_Mode = 'V'`, `SQLLOGIC`, `AD_MODULE_ID = 0` i.e.
**core-owned**). Their `SQLLOGIC` filters `c_orderline.c_order_discount_id IS NULL` — but
`TotalDiscountService` never sets `C_Order_Discount_ID` on the discount line it creates (that FK is
a *different*, unrelated legacy Openbravo pricing-schema discount mechanism). So the discount
line is **never excluded** by that filter, inflating the denominator (and sometimes the numerator)
of the percentage.

### Fix implemented (`com.etendoerp.go`, merged)

**Constraint honored throughout: no core changes, no shared frontend component changes, GO/NEO
backend only** (explicit user instruction — classic Etendo backoffice window was declared
out of scope).

File: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AbstractOrderHeaderHandler.java`
(shared base class for `PurchaseOrderHeaderHandler`, `SalesOrderHeaderHandler`,
`SalesQuotationHeaderHandler`).

- New `applyCorrectedStatusPercentages(JSONArray dataArr)`, called from `afterHandle()` — **last**,
  after the other GET post-processing steps (`applyTotalDiscountToRecord`, linked-documents
  annotation, pending-documents annotation) — recomputes and **overwrites** `invoiceStatus`,
  `deliveryStatus`, `deliveryStatusPurchase` in the JSON response, only for fields the caller
  actually requested (`rec.has(FIELD_X)`).
- New `batchComputeStatusPercentages(List<String> ids)`: one batched SQL query (avoids N+1,
  following the existing `batchCheckLinkedDocuments` pattern) that sums `qtyordered` /
  `qtyinvoiced` / `qtydelivered` / `qtyreserved` from `c_orderline`, **excluding the discount
  product explicitly** (`ol.m_product_id <> ?`, bound to
  `TotalDiscountService.DISCOUNT_PRODUCT_ID`) in addition to the pre-existing
  `ol.c_order_discount_id IS NULL` filter.
- `calculatePercentage(numerator, denominator, cancelled)`: `0` for a zero denominator or a
  cancelled order, else `round(numerator * 100.0 / denominator)`.

PR: [#1144](https://github.com/etendosoftware/com.etendoerp.go/pull/1144) — merged to `develop`
2026-09-21.

### Live verification (2026-09-23, `app.etendo.software`, `develop`)

| Case | Order | Expected (pre-fix) | Result |
|---|---|---|---|
| Original bug repro | 1000007 | ~83% | **100%** ✅ |
| Ticket case 1 (Purchase) | 1000011 | partial | **100% recepción** ✅ |
| Ticket case 2 (Sales) | 1000017 | partial | **100%/100%** ✅ |
| Corner: partial quantity | 1000012 | ~parcial | **40%/40% exact** ✅ |
| Corner: multi-line + 25% discount | 1000015 | ~83% (5/6) | **100% recepción** (0% facturación — invoice creation blocked by an unrelated pre-existing document-numbering collision on that shared environment, reported separately to the team) ✅ |
| Cancelled order | — | — | No cancel/void action found in this NEO window (local or remote) — untestable, known gap |

**Grid value (Part 1) confirmed fixed, both remotely and locally.**

---

## Part 2 — Advanced filter / sort still use the uncorrected value (OPEN, reopened by QA)

### Symptom (Jira comment, Emilio Polliotti, production QA re-validation)

> "El filtro no usa el mismo cálculo que la columna — La grilla muestra el porcentaje corregido,
> pero al filtrar por 'Estado de facturación' / 'Estado de recepción' el filtro se resuelve contra
> el valor clásico de `C_Order`, que sigue contando la línea de descuento total. Ej: filtrando
> 100%, PC1000001 y PC1000002 no aparecen aunque la grilla les muestra 100%; sí aparecen al filtrar
> por 50% / 91%."

Flagged as **Severidad: alta**. Also noted: the column **sort** order likely has the same problem
(not separately confirmed by Emilio, but called out for review).

### Reproduced locally (`localhost:3100`, 2026-09-24, via Claude in Chrome)

Purchase Order grid, local dev environment:

1. Unfiltered grid: order **1000002** (2 lines, Fernet qty 3 + qty 2, 25% total discount, invoice
   **and** receipt both completed) shows `Estado de facturación 100%` / `Estado de recepción 100%`
   in the grid — and the form's own status bar independently confirms `Recibido 100%` /
   `Facturado 100%`. Both sides agree, exactly as Part 1 intended.
2. Applied `Filtros → Estado de facturación → Es → 100`. Result: **order 1000002 disappears** from
   the filtered list. Only orders with no discount line (1000008, 1000007, 1000006, 1000004) are
   returned — all of which happen to be genuinely 100% under both the old and new calculation, so
   they don't distinguish the bug on their own; 1000002's absence is the tell.

This confirms Part 1's fix and Part 2's bug coexist exactly as QA described: the **displayed**
value is correct, the **queried** value (filter, and presumably sort) is not.

### Root cause of Part 2

This is a direct instance of the anti-pattern this repo's own `CLAUDE.md` already documents under
**"List Columns Must Be Real Columns"**:

> "Never inject a synthetic field into the NEO response from `afterHandle()` to feed a list
> column. The field is invisible to the backend query, so it cannot be filtered or sorted... "

The Part 1 fix does exactly this — by necessity, given the "no core changes" constraint at the
time, but it means:

- **Grid display** reads the **patched JSON** value (`afterHandle()` overwrite) → correct.
- **Advanced filter** (`AdvancedFilterBuilder`, core) and **column sort** both resolve against the
  **real `C_Order.InvoiceStatus`/`DeliveryStatus`/`DeliveryStatusPurchase` AD columns in the
  database** — i.e., the original, uncorrected `SQLLOGIC` — because those operations happen in the
  SQL query itself, before any NEO Headless post-processing runs. The JSON patch is invisible to
  them.

So Part 1 fixed *what the user sees*, but not *what the user can filter or sort by* — and per the
same doc's "self-test": *"if a user could plausibly want to filter or sort by it, it is not
presentational."* Invoice/delivery status percentages are exactly the kind of field users filter
and sort dashboards by, so this was foreseeable, and the corrected value belongs in a real,
queryable column, not only in the response body.

### Why this wasn't done in Part 1

At the time, the user explicitly ruled out:
1. Touching core (`"no, no podemos tocar core"`).
2. Touching shared frontend components (`"no me agrada la idea de tocar un componente
   compartido"`).
3. The classic Etendo backoffice window (`"la ventana clasica de etendo no me interesa en
   absoluto, solo trabajamos para go"`).

`InvoiceStatus`/`DeliveryStatus`/`DeliveryStatusPurchase` are **core-owned** columns
(`AD_MODULE_ID = 0`, confirmed by inspecting `src-db/database/sourcedata/AD_COLUMN.xml`) with
`Computation_Mode = 'V'`. Converting them in place to `Computation_Mode = 'S'` (stored computed,
per the `EPL-1807` engine — see
`{etendo_root}/modules/com.etendoerp.go/docs/STORED-COMPUTED-COLUMNS.md`) with corrected SQL would
be the textbook fix per this repo's **Computed Column Policy** ("stored whenever possible") — but
editing a core-owned `AD_COLUMN` row's computation mode is, at minimum, a change that has to ship
*through* core's own dictionary export, which reads as "tocar core" under the same constraint that
scoped Part 1. This needs the user's explicit sign-off before it's attempted, given how firmly that
boundary was drawn originally.

### Candidate solutions (not implemented — for discussion)

**Option A — Convert the existing core columns to stored computed (`S`).**
Fixes the column, the filter, and the sort in one place — the canonical outcome per this repo's own
policy. Downside: requires modifying `AD_MODULE_ID = 0` (core-owned) `AD_COLUMN` rows'
`Computation_Mode`/`Computation_Function`/dependency rows, which is a core dictionary change. Under
the standing "no core" constraint this needs explicit re-authorization from the user before any
code is written — it is flagged here, not started.

**Option B — New GO-owned stored computed columns, mirrored into the grid config (recommended
starting point for discussion; validated end-to-end 2026-09-24 against a real shipped reference
implementation — TicketBAI status, ETP-5216/ETP-5229).**

The user's own question ("¿por qué no replicamos lo que ya hicimos con TicketBAI status?") is
answered concretely: `EM_ETGO_Tbai_Status` on `C_Invoice` is exactly this pattern, already in
production, and it demonstrably delivers filter + sort + direct list display from one stored
value. Full trace of the reference implementation, read end to end:

- **Function** — `modules/com.etendoerp.go/src-db/database/model/functions/ETGO_GET_TBAI_STATUS.xml`:
  `ETGO_GET_TBAI_STATUS(p_c_invoice_id VARCHAR) RETURNS VARCHAR STABLE`. A **total function**
  (every edge case — null id, zero rows, several rows, a NULL/blank result, an unrecognized value,
  and an `EXCEPTION WHEN OTHERS` catch-all — resolves to a value, never raises), per this repo's
  `stored-computed-column` skill's Trap 2. This is the template to follow for the percentage
  functions: `calculatePercentage`'s existing zero-denominator/cancelled-order handling already
  covers the "total function" requirement, it just needs to move from Java into SQL.
- **`AD_COLUMN`** (`sourcedata/AD_COLUMN.xml`, id `F580979CD28F42B8BFD32B2BC9E65DAD`,
  `AD_MODULE_ID = 94E1B433CF55451EABB764750AC5902A` — **`com.etendoerp.go`'s own module, not
  core's `0`** — this is the concrete proof that a GO-owned stored computed column is a normal,
  already-practiced extension, not a special case): `COMPUTATION_MODE=S`, `REFRESH_MODE=S`,
  `COMPUTATION_FUNCTION=etgo_get_tbai_status`, `COMPUTATION_SEQUENCE_NUMBER=10`, and —
  **the two flags that matter most for this investigation** — `ALLOWSORTING=Y`,
  `ALLOWFILTERING=Y`, both explicitly `Y` on the AD_COLUMN itself. A real column defaults to
  filterable/sortable by virtue of being real; TicketBAI status ships with both flags set
  affirmatively, confirming the intended, supported outcome.
- **Dependencies** (`AD_COLUMN_COMP_DEPENDENCY.xml` + `AD_COMPDEP_WATCHED_COL.xml`) — **two source
  tables feed one column**, exactly the shape our case needs (`C_OrderLine` for quantities, same
  as the existing `batchComputeStatusPercentages` query already reads):
  - `tbai_syncinvoice` (immutable-FK `COALESCE(...) FROM dual` resolver), watching one column
    (`ESTADO`).
  - `tbai_config` (fan-out resolver keyed on `ad_client_id`/`ad_org_id`, no `FROM dual` needed —
    it selects from a real table), watching two columns (`TBAISYSTEMDATE`, `ISACTIVE`).
  
  Our case needs exactly **one** dependency, on `C_OrderLine`, watching `qtyordered`,
  `qtyinvoiced`, `qtydelivered`, `qtyreserved`, `m_product_id`, `c_order_discount_id` — simpler
  than TBAI's two-source case, closer to the pilot module's single-dependency
  `EM_ETSCC_LINETOTAL` (`C_OrderLine → C_Order`, same parent/child shape as `C_OrderLine → C_Order`
  here).
- **Frontend — the generated grid auto-detects it for free.** `generated/web/sales-invoice/HeaderTable.jsx:17`:
  ```
  { key: 'eTGOTbaiStatus', column: 'EM_ETGO_Tbai_Status', type: 'status', label: 'EM_ETGO_Tbai_Status', computed: {"mode":"stored","refresh":"synchronous"} }
  ```
  generated automatically, with **no `decisions.json` entry needed** — because it is now a real AD
  column, the pipeline's extractor picks it up the same as any other field. This directly confirms
  the answer to "tendríamos las columnas para que el filtro pueda buscar y ordenar": yes, by
  construction, with zero extra wiring on the filter/sort side.
- **Frontend — the custom badge cell keeps filter/sort alive.** `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx:113-161`
  overrides the generated column with `type: 'custom'` (needed only for the `FiscalStatusBadge`
  render and the "not applicable" dash), but **keeps `column: 'em_etgo_tbai_status'` and adds
  `filterMode: 'enumLabel'`** — the exact pairing this repo's "List Columns Must Be Real Columns"
  policy prescribes for a presentational cell that must stay filterable (same pattern as
  `transactionDocument`). The comment at line 115-122 documents the *before* state explicitly: a
  synthetic `key: '_tbaiStatus'` fed by a response injector, silently dropped from the advanced
  filter by `isFilterableColumn` for months (ETP-4391) — **this is the same failure mode Part 1's
  `afterHandle()` patch has today**, already diagnosed and already fixed once in this exact
  codebase for a different field.
- For our percentage fields (numeric 0–100, `AD_REFERENCE_ID = 11` / Integer on the classic
  columns, confirmed by inspecting `AD_COLUMN.xml`), the equivalent cell would use the default
  numeric filter behavior — no `enumLabel` needed, since there's no closed catalogue of values.

**Concrete plan (finalized 2026-09-24, all facts below confirmed by reading the actual repo state —
no ids guessed):**

Scope is exactly 3 fields, matching the 3 the ticket describes and the 3 Part 1's `afterHandle()`
patch already targets — `InvoiceStatus` (shared by Purchase and Sales orders), `DeliveryStatus`
(Sales/Quotation), `DeliveryStatusPurchase` (Purchase). New columns replicate the **exact classic
formula**, adding only the one missing exclusion:

```sql
-- Classic SQLLOGIC (all 3, read from src-db/database/sourcedata/AD_COLUMN.xml — the <numerator>
-- placeholder is qtyinvoiced / qtydelivered / qtyreserved respectively; note DeliveryStatusPurchase
-- uses qtyreserved, NOT qtydelivered):
(coalesce((select case when sum(abs(ol.qtyordered)) = 0 or iscancelled = 'Y' or cancelledorder_id is not null then 0 else
round(coalesce(sum(abs(ol.<numerator>)), 0)/sum(abs(ol.qtyordered)) * 100, 0) end
from c_orderline ol where ol.c_order_id=c_order_id and ol.c_order_discount_id is null), 0))

-- New: same formula, same edge cases, + one additional exclusion in the WHERE:
--   AND ol.m_product_id <> 'E4BC94E71D664E73A066DAF78BF39DB3'   -- TotalDiscountService.DISCOUNT_PRODUCT_ID
```

1. **`modules/com.etendoerp.go/src-db/database/model/functions/`** — three new total functions
   (mirroring `ETGO_GET_TBAI_STATUS.xml`'s structure exactly: `RETURNS INTEGER STABLE`, one `VARCHAR`
   param, `EXCEPTION WHEN OTHERS THEN RETURN 0` catch-all):
   - `ETGO_GET_ORDER_INVOICE_STATUS.xml` (`p_c_order_id`, numerator `qtyinvoiced`)
   - `ETGO_GET_ORDER_DELIVERY_STATUS.xml` (numerator `qtydelivered`)
   - `ETGO_GET_ORDER_DELIVERY_STATUS_PURCHASE.xml` (numerator `qtyreserved`) — **renamed to
     `ETGO_GET_PO_DELIVERY_STATUS.xml` during implementation**, see "Implementation status" below.
2. **`modules/com.etendoerp.go/src-db/database/model/modifiedTables/C_ORDER.xml`** — append 3
   `<column>` entries to the file that **already exists and already adds 2 custom columns to
   `C_Order`** (`EM_ETGO_TOTAL_DISCOUNT`, `EM_ETGO_CURRENCY_RATE`), same file, same convention:
   `EM_ETGO_INVOICE_STATUS`, `EM_ETGO_DELIVERY_STATUS`, `EM_ETGO_DELIV_STATUS_PURCHASE` (renamed
   from `..._DELIVERY_..._PURCHASE`, 32 chars, during implementation — see "Implementation status"
   below, bug #2: Etendo's ~30-char physical column name limit), each
   `type="DECIMAL"` — **not** `"INT"`/`"INTEGER"` (see "Implementation status" below: `update.database`
   rejected `INT` with `Unknown JDBC type INT`; grepping every `modifiedTables/*.xml` in the whole
   checkout found zero precedent for `INT`/`INTEGER`, but a clear one for `DECIMAL` on every other
   "Integer"-reference custom column in this module, e.g. `EM_ETGO_AMORTIZATION_STATUS`,
   `EM_ETGO_LINE_COUNT`). The `AD_COLUMN` metadata still matches the classic columns'
   `AD_REFERENCE_ID=11`/`FIELDLENGTH=4` — only the DDLUtils physical `type` attribute differs from
   what one might guess.
3. **No new index needed.** `C_OrderLine.C_Order_ID` (`src-db/database/model/tables/C_ORDERLINE.xml`)
   already carries 2 indexes covering it — confirmed by reading the table definition — so the
   dependency's target-id resolver walks an already-indexed FK, satisfying the skill's index
   requirement (Trap-adjacent step 3) with no new file.
4. **`sourcedata/AD_COLUMN.xml`** — three new `AD_COLUMN` rows, `AD_TABLE_ID = 259` (`C_Order`,
   confirmed), `AD_MODULE_ID` = `com.etendoerp.go`'s own module id (`94E1B433CF55451EABB764750AC5902A`
   — the same id already on `EM_ETGO_Tbai_Status`, never core's `0`), `COMPUTATION_MODE=S`,
   `REFRESH_MODE=S`, `COMPUTATION_SEQUENCE_NUMBER=10`, `ALLOWSORTING=Y`, `ALLOWFILTERING=Y`,
   `AD_REFERENCE_ID=11`, `FIELDLENGTH=4`. Plus matching **`AD_ELEMENT.xml`** entries (label/help).
5. **`sourcedata/AD_COLUMN_COMP_DEPENDENCY.xml`** — one dependency per new column, `SOURCE_TABLE_ID`
   = `C_OrderLine`'s table id (`260`, confirmed), all 3 events (`Y`/`Y`/`Y`), resolver
   `SELECT COALESCE(NEW.c_order_id, OLD.c_order_id) FROM dual` (Pattern 1, immutable FK — a line
   never reparents to a different order) — **`FROM dual` is mandatory** per the skill's Trap 1, or
   the dependency silently deploys with no trigger.
6. **`sourcedata/AD_COMPDEP_WATCHED_COL.xml`** — 6 watched-column rows per dependency:
   `QtyOrdered`, `QtyInvoiced`/`QtyDelivered`/`QtyReserved` (the one that differs per column),
   `M_Product_ID`, `C_Order_Discount_ID` — an update to any of these six is what should trigger a
   recompute; an update to, say, a line's description should not.
7. **`decisions.json` DOES need a change here — correcting an earlier claim in this document.**
   TBAI status needed zero `decisions.json` footprint because it was a field the grid had never
   shown before. This case is different: `artifacts/purchase-order/decisions.json` and
   `artifacts/sales-order/decisions.json` already declare `invoiceStatus`/`deliveryStatus`/
   `deliveryStatusPurchase` explicitly (`grid: true`, `gridOrder`, `section`, plus translated
   labels under `fieldLabels`/`fieldLabels_en`) — confirmed by grepping both files. The new
   `EM_ETGO_*` columns will surface under **new, distinct camelCase field keys** once the pipeline
   re-extracts the schema from a DB that actually has them (their exact derived key names —
   presumably `eTGOInvoiceStatus`/`eTGODeliveryStatus`/`eTGODeliveryStatusPurchase`, matching the
   already-observed `eTGOTbaiStatus` derivation from `EM_ETGO_Tbai_Status` — must be **read from a
   real extract, not guessed**). The old keys' `decisions.json` entries then need `grid: false` (or
   `visibility: discarded`), and the new keys need the `grid: true`/`gridOrder`/labels the old ones
   currently carry. **This step cannot be done as a static file edit** — it requires `extract-from-
   db.js` to run against a database that has already had `update.database` applied (step 9 below),
   so the pipeline can report the real generated field names. Deferred until the DB deploy step.
8. **`AbstractOrderHeaderHandler`'s `applyCorrectedStatusPercentages`/`batchComputeStatusPercentages`
   /`StatusPercentages`/`calculatePercentage`** (and their tests) — removed entirely once the stored
   columns are live and backfilled. The stored value is always correct at read time, so the
   `afterHandle()` patch becomes redundant, closing Part 1 and Part 2 with one source of truth
   instead of two independently-maintained code paths.
9. Deploy: `./gradlew update.database` (generates triggers, backfills inline — `C_Order` row counts
   are nowhere near the 100k inline-backfill threshold) then `./gradlew export.database`. Verify per
   the skill's 3-step check (trigger exists, `ad_scd_check` returns 0, a real source-row edit
   changes the stored value) before touching any Java.
10. New UUIDs for every new `AD_COLUMN`/`AD_ELEMENT`/`AD_COLUMN_COMP_DEPENDENCY`/
    `AD_COMPDEP_WATCHED_COL` row generated with `make uuid` at implementation time — none fabricated
    here, per this repo's mandatory UUID policy.

Advantages over Option A: entirely inside `com.etendoerp.go` (confirmed by the TBAI column's own
`AD_MODULE_ID`, not core's `0`), respects every constraint from the original scoping conversation,
and is strictly more correct than Part 1 (filter and sort get fixed too, and the `afterHandle()`
patch — a legitimate but narrower workaround, now confirmed to be the exact ETP-4391 anti-pattern
under a different name — goes away).

Open questions for Option B, to resolve before implementation — **first one now resolved, see
"Implementation status" below**:
- ~~Whether the grid's existing `Estado de facturación`/`Estado de recepción` display columns need
  any `decisions.json`/custom-table change.~~ **Resolved: yes, they do** — unlike TBAI (a
  brand-new field), `invoiceStatus`/`deliveryStatus`/`deliveryStatusPurchase` are already
  explicitly declared in `artifacts/purchase-order/decisions.json` and
  `artifacts/sales-order/decisions.json` (`grid: true`, `gridOrder`, labels). The old keys need
  `grid: false` once the new `EM_ETGO_*` keys take over grid display — exact new key names TBD from
  a real extract (see plan step 7 above), also confirming no other window/report reads the classic
  fields directly before anything is hidden.
- Whether `EM_ETGO_DeliveryStatusPurchase` needs to exist as a genuinely separate column from
  `EM_ETGO_DeliveryStatus`, matching the existing core split (Sales Order reuses `DeliveryStatus`,
  Purchase Order uses `DeliveryStatusPurchase`), or whether a single stored column can serve both
  windows.
- Confirm the `S`/synchronous refresh cost is acceptable given `C_OrderLine` is a write-heavy
  source table — TBAI's own dependencies watch `C_Invoice`-adjacent tables at comparable write
  frequency with `Refresh_Mode=S` in production today, which is a real existence proof this is
  viable at this module's actual scale, not just a theoretical concern.

**Option C — Query-time filter rewrite in `com.etendoerp.go`, no computed-column migration
(investigated 2026-09-24, no core changes — fixes the FILTER only, not sort).**

Investigated with a full read of the request path: `NeoCrudHandler.handleWindowEntityCrud` →
`buildDalParams` → core's `DefaultJsonDataService`/`AdvancedQueryBuilder`
(`modules_core/org.openbravo.service.json/.../AdvancedQueryBuilder.java`).

- **Confirmed: core's `AdvancedQueryBuilder.parseCriteria`/`buildFieldClause` resolves every
  `criteria.fieldName` against the DAL `Property`.** For a virtual `AD_COLUMN` that property is a
  Hibernate *formula* property, so any HQL built off it — filter or sort — transparently re-runs the
  original `SQLLOGIC`. This is 100% core code; `com.etendoerp.go` never touches it, and there is no
  SQLLogic-aware branch to hook into there.
- **Confirmed: NEO does not build its own WHERE clause.** It only ANDs one extra fragment on top,
  via `_neoWhere` (`NeoCrudHelper.NEO_WHERE_PARAM`, applied in `NeoCrudHandler.applyWhereClause`).
  This fragment is additive — it cannot replace or suppress a condition core's parser already built
  from `criteria.fieldName`.
- **Real precedent exists for using `_neoWhere` this way:** `UserRoleAssignmentHandler`
  (ETP-5188, `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/UserRoleAssignmentHandler.java`).
  Its own javadoc records that the generic `criteria=` filter could not express the needed
  condition (confirmed empirically — a 500 error), so **the frontend was changed to send two
  dedicated query params instead of a `criteria` condition on the real field** (`RoleIds`,
  `NoRole`); a `NeoHandler.handle()` pre-hook then reads those dedicated params and splices a
  corrected HQL predicate into `_neoWhere` **before** the query runs.
- **The load-bearing detail:** this only works because the frontend deliberately avoids sending
  `criteria` on the broken field. If the frontend still sends
  `criteria: {fieldName:'invoiceStatus', operator:'equals', value:100}`, core resolves it against
  the broken SQLLogic regardless of anything `_neoWhere` adds — the two conditions AND together,
  they don't replace each other. So a working Option C requires **both halves**: (a) a frontend
  change giving these 3 fields a dedicated-param redirect (the existing `backendFilterKey` /
  `toQueryParams` mechanism in `schema_forge/tools/app-shell/src/lib/gridQuery.js`, same pattern
  ETP-5188 used) instead of a plain `criteria`, and (b) a `NeoHandler.handle()` pre-hook on
  `AbstractOrderHeaderHandler`'s entities that reads that param and injects a `_neoWhere` predicate
  excluding `m_product_id = ETGO_DTO`, mirroring the exclusion already proven correct in
  `batchComputeStatusPercentages`. `_neoWhere` has no bind-parameter mechanism (raw HQL splice), so
  any inlined value needs the same strict-pattern validation `UserRoleAssignmentHandler` uses for
  its ids.
- **Confirmed: no equivalent mechanism exists for SORT.** `_sortBy`/`_orderBy`
  (`JsonConstants.SORTBY_PARAMETER`/`ORDERBY_PARAMETER`) flow through unmodified — `applyWhereClause`
  only ever extends `WHERE_AND_FILTER_CLAUSE`, never an order-by clause. A handler could redirect
  `_sortBy` to a *different* property name (same shared-mutable-`queryParams`-map trick that makes
  `_neoWhere` possible), but only if some other real, queryable column already held the corrected
  value — which loops straight back to needing Option A/B. **Sort cannot be corrected at the query
  level without a real backing column.**

Net: Option C is real and buildable entirely inside `com.etendoerp.go`, and would close the filter
gap Emilio reported without touching core. It does **not** close the sort gap QA also flagged
("revisar también el ordenamiento") — that remains Option A/B territory regardless.

### Recommendation

**Updated after the 2026-09-24 TicketBAI-status investigation: Option B is now the primary
recommendation, not just the "if sort must be fixed" fallback.** Before that investigation, Option
B looked like it might require touching something core-adjacent; now it's confirmed, file-by-file,
to be exactly the same shape as `EM_ETGO_Tbai_Status` — a column already living in
`com.etendoerp.go`'s own module (`AD_MODULE_ID = 94E1B433CF55451EABB764750AC5902A`, not core's
`0`), already shipping with `ALLOWSORTING=Y`/`ALLOWFILTERING=Y` in production. (One correction found
during implementation: unlike TBAI, `invoiceStatus`/`deliveryStatus`/`deliveryStatusPurchase` DO
already have explicit `decisions.json` entries for `purchase-order`/`sales-order` — see plan step 7
— so this path is not entirely free of frontend-config work, though it is still confined to
declarative JSON, not code.) That still removes the main uncertainty that made Option C attractive
as the "smaller, safer" choice.

**Still two defensible paths, both requiring user sign-off before code:**

- **Option B (stored computed column) — recommended.** Closes both the filter and sort gaps,
  converges display/filter/sort onto one source of truth, eliminates the `afterHandle()` patch
  entirely (which is now confirmed to be the exact ETP-4391 anti-pattern under a different name),
  and follows a pattern this module already operates in production with three real columns
  (`EM_ETSCC_LINETOTAL`/`_Q`/`_avg_price` in the pilot, `EM_ETGO_Tbai_Status` in `sales-invoice`).
  Larger scope than Option C (new function + AD_COLUMN + dependency × 3 fields), but no longer a
  larger *risk* — it's the well-trodden path.
- **Option C (`_neoWhere` + dedicated-param redirect)** — still viable if the team wants the filter
  fix shipped fast and is fine deferring sort, or wants to avoid a synchronous trigger on
  `C_OrderLine` for now. Smaller diff, keeps `afterHandle()` as-is, precedented separately
  (ETP-5188). Now the "smaller, incremental" option rather than the "safer" one — Option B's safety
  profile turned out to be just as good once traced end-to-end.

Either path should go through the same file-by-file scoping step Part 1 went through before any
code is written. Option A is not recommended — it carries all of Option B's core-adjacency risk
(editing a core-owned `AD_COLUMN`) with none of its "stays inside `com.etendoerp.go`" advantage,
now that Option B is confirmed to need no core changes at all.

---

## Next steps (not started)

1. User sign-off on a direction: Option B (fixes filter + sort, larger scope) vs. Option C (fixes
   filter only, smaller scope, sort stays a known gap) — see Recommendation above.
2. If Option B: investigate its open questions, then scope file-by-file (`AD_COLUMN` inserts,
   `AD_COLUMN_COMP_DEPENDENCY` + `AD_COMPDEP_WATCHED_COL` rows, the SQL computation function,
   `decisions.json` changes for `purchase-order`/`sales-order`, and whether
   `AbstractOrderHeaderHandler`'s `applyCorrectedStatusPercentages`/`batchComputeStatusPercentages`
   can be deleted once the stored columns are live) — mirroring the process used for Part 1.
   If Option C: scope the frontend dedicated-param redirect (`gridQuery.js` /
   `backendFilterKey`/`toQueryParams` for the 3 fields) plus the new `NeoHandler.handle()` pre-hook
   and its `_neoWhere` predicate + input validation, following the `UserRoleAssignmentHandler`
   precedent.
3. Investigate and report to the team, separately, the duplicate-invoice-document-number issue
   found live on `app.etendo.software` during Part 1 verification (unrelated to this fix,
   pre-existing in that shared environment).

---

## Implementation status (2026-09-24) — Option B, database layer

User approved Option B and authorized implementation, with two explicit constraints honored
throughout:
1. **No `AD_FIELD`/`AD_TAB`/`AD_WINDOW` entries in classic.** These are pure physical `AD_COLUMN`s
   — no classic tab exposes them, exactly like `EM_ETGO_Tbai_Status` (confirmed: grepped
   `AD_FIELD.xml` for both column ids, zero matches for either). Classic's own `InvoiceStatus`/
   `DeliveryStatus`/`DeliveryStatusPurchase` columns and windows are completely untouched.
2. **No commits** — everything below is uncommitted, in the working tree of `com.etendoerp.go`
   (branch `feature/ETP-5317`, fast-forwarded to `develop` before starting).

### Files created

- `src-db/database/model/functions/ETGO_GET_ORDER_INVOICE_STATUS.xml`
- `src-db/database/model/functions/ETGO_GET_ORDER_DELIVERY_STATUS.xml`
- `src-db/database/model/functions/ETGO_GET_PO_DELIVERY_STATUS.xml` (renamed from
  `ETGO_GET_ORDER_DELIVERY_STATUS_PURCHASE.xml` — see "Implementation status" below, bug #3)

Each: `RETURNS NUMERIC STABLE` (matching this module's own convention — no existing function here
uses `type="INTEGER"`, all numeric ones use `NUMERIC`; `TBAI`'s reference used `VARCHAR` because it
returns text). One `VARCHAR` param (`p_c_order_id`). Total functions per the skill's Trap 2: null
id → 0, order row gone (`SELECT...INTO`, not `INTO STRICT`) → 0, cancelled/voided → 0, zero
`qtyordered` → 0 (division guard), `EXCEPTION WHEN OTHERS THEN RETURN 0` catch-all. Each reproduces
its classic column's exact `SQLLOGIC` (read verbatim from `AD_COLUMN.xml` before writing), adding
only `AND ol.m_product_id <> 'E4BC94E71D664E73A066DAF78BF39DB3'` to the existing
`ol.c_order_discount_id IS NULL` filter.

### Files modified

- **`src-db/database/model/modifiedTables/C_ORDER.xml`** — 3 new `<column>` entries
  (`EM_ETGO_INVOICE_STATUS`, `EM_ETGO_DELIVERY_STATUS`, `EM_ETGO_DELIV_STATUS_PURCHASE`,
  `type="DECIMAL"`) appended to the file that already adds `EM_ETGO_TOTAL_DISCOUNT`/
  `EM_ETGO_CURRENCY_RATE` to this same table. Final column name is `EM_ETGO_DELIV_STATUS_PURCHASE` (not
  `..._DELIVERY_..._PURCHASE` — see bug #2 below).

  **Two real bugs found and fixed across two `update.database` attempts, both against a live DB,
  neither guessable from reading the skill alone:**

  1. **`type="INT"` is not a valid DDLUtils JDBC type.** First attempt failed with
     `Unknown JDBC type INT` (`ValueObject.setType`), escalating to
     `Unsupported column data type for column EM_ETGO_INVOICE_STATUS in table C_ORDER`. Grepped the
     entire checkout (core + every module's `modifiedTables/*.xml`): zero files use `INT` or
     `INTEGER` anywhere; every existing "Integer"-reference custom column in this module
     (`EM_ETGO_AMORTIZATION_STATUS`, `EM_ETGO_LINE_COUNT`, `EM_ETGO_MATCHED_COUNT`, etc.) uses
     `type="DECIMAL"`. Fixed to match that convention — the `AD_COLUMN` metadata
     (`AD_REFERENCE_ID=11`, `FIELDLENGTH=4`) is unaffected, only the DDLUtils physical-column
     `type` attribute was wrong.
  2. **Physical column names over ~30 characters get silently mangled, not rejected.** Second
     attempt: `EM_ETGO_DELIVERY_STATUS_PURCHASE` (32 chars) built successfully overall, but one
     `COMMENT ON COLUMN` statement failed — `column "em_etgo_delivery_status_purchase" of relation
     "c_order" does not exist` — which alone flipped the whole `update.database` task to FAILED
     (`checkErrors`: "at least one foreign key was not activated successfully"), even though FKs
     and triggers had actually enabled fine. Querying `information_schema.columns` directly (the
     `\d` psql meta-command itself failed with an unrelated client/server catalog version mismatch,
     `column c.relhasoids does not exist` — irrelevant to this bug, worked around with a plain
     `information_schema` query) showed the column had actually been created as
     `em_etgo_deliver_tatus_purchase` — **exactly 30 characters**, with `y_s` silently dropped from
     the middle of `delivery_status`. `EM_ETGO_INVOICE_STATUS` (22 chars) and
     `EM_ETGO_DELIVERY_STATUS` (23 chars) were unaffected — both under the apparent limit. This is
     Etendo's long-standing Oracle-compatibility identifier-length constraint (historically 30
     chars) applied inconsistently: DDLUtils' `ADD COLUMN` path silently shortens an over-length
     name, but the `COMMENT ON COLUMN` it generates right after uses the full, un-shortened name —
     a real product inconsistency, not something documented in the `stored-computed-column` skill
     (which should probably gain a warning about this). Fixed by manually renaming to
     `EM_ETGO_DELIV_STATUS_PURCHASE` (29 chars) in all three files (`modifiedTables/C_ORDER.xml`,
     `AD_COLUMN.xml` `NAME`/`COLUMNNAME`, `AD_ELEMENT.xml` `COLUMNNAME`) rather than relying on
     whatever the generator's own mangling algorithm would produce. **Cleanup required before
     retrying:** the stray mis-named column had to be dropped by hand
     (`ALTER TABLE c_order DROP COLUMN em_etgo_deliver_tatus_purchase;`, confirmed empty first —
     0 non-null values across 1982 rows — before dropping, user confirmed the drop explicitly) —
     `update.database` does not appear to detect/rename/drop a column whose XML definition changed
     name between runs, it would have left it orphaned.
  3. **The exact same ~30-char limit hit the SQL FUNCTION name too, on the third attempt — same
     root cause, different identifier.** With the column bug fixed, `update.database`'s DDL phase
     completed cleanly (all 3 columns created correctly this time), but the
     `GenerateStoredComputedTriggers` post-update module script's own build-time validator
     (`StoredComputedValidator`, §12 of the skill's reference doc) then failed:
     `[ERROR] ETGO_ScdFunctionMissing: column C_Order.EM_ETGO_Deliv_Status_Purchase —
     Computation_Function 'etgo_get_order_delivery_status_purchase' does not exist in the
     database`. `etgo_get_order_delivery_status_purchase` is **39 characters** — querying
     `pg_proc` directly showed it had been silently created as `etgo_get_order_tatus_purchase`
     (29 chars, same "drop characters from the middle" mangling pattern as the column bug,
     `delivery_s` dropped this time). The other two functions,
     `etgo_get_order_invoice_status` (29 chars) and `etgo_get_order_delivery_status` (30 chars —
     exactly at the limit, still fine), deployed correctly, confirming the threshold is the same
     ~30 chars for function names as for column names. **This is genuinely useful to know for next
     time: the limit applies uniformly across identifier kinds in this build tooling, not just
     physical columns** — worth adding to the `stored-computed-column` skill as a named trap
     alongside `FROM dual` and the total-function requirement. Fixed by renaming the function (and
     its file) to `ETGO_GET_PO_DELIVERY_STATUS`/`etgo_get_po_delivery_status` (27 chars, comfortable
     margin — "PO" for Purchase Order, matching the classic field's actual scope) and updating
     `AD_COLUMN.xml`'s `COMPUTATION_FUNCTION` to match. Cleanup: dropped the stray
     `etgo_get_order_tatus_purchase(varchar)` function from the DB before retrying, same reasoning
     as the column cleanup — an unreferenced leftover, not something `update.database` would clean
     up on its own.
- **`sourcedata/AD_COLUMN.xml`** — 3 new records, `AD_TABLE_ID=259` (`C_Order`), `AD_REFERENCE_ID=11`
  (Integer, matching the classic columns), `FIELDLENGTH=4`, `ISUPDATEABLE=N`, `ALLOWSORTING=Y`,
  `ALLOWFILTERING=Y`, `COMPUTATION_MODE=S`, `REFRESH_MODE=S`, `COMPUTATION_SEQUENCE_NUMBER=10`,
  `AD_MODULE_ID=94E1B433CF55451EABB764750AC5902A` (com.etendoerp.go's own module — verified this is
  the same id already on `EM_ETGO_Tbai_Status` and `EM_Etgo_Total_Discount`, never core's `0`).
  `SEQNO`/`POSITION` continue the existing `EM_ETGO_*` sequence on this table (890/98, 891/99 →
  892/100, 893/101, 894/102).
- **`sourcedata/AD_ELEMENT.xml`** — 3 new records (label/help text), same `AD_MODULE_ID`.
- **`sourcedata/AD_COLUMN_COMP_DEPENDENCY.xml`** — 3 new records, one per column, all on
  `SOURCE_TABLE_ID=260` (`C_OrderLine`), all 3 events (`Y`/`Y`/`Y`), resolver
  `SELECT COALESCE(NEW.c_order_id, OLD.c_order_id) FROM dual` (Pattern 1 — verified `C_OrderLine`
  never reparents to a different order; `FROM dual` included per the skill's Trap 1, confirmed not
  omitted).
- **`sourcedata/AD_COMPDEP_WATCHED_COL.xml`** — 12 new records (4 per dependency): `QtyOrdered`
  (id `2224`) + the dependency-specific quantity (`QtyInvoiced` `2227` / `QtyDelivered` `2226` /
  `QtyReserved` `2225`) + `M_Product_ID` (`2221`) + `C_Order_Discount_ID`
  (`68142DE975336AAFE040007F01012F8D`) — all existing core `AD_COLUMN_ID`s on `C_OrderLine`, looked
  up from `AD_COLUMN.xml`, none guessed.

All 21 new UUIDs generated with `make uuid` (schema_forge's target), zero collisions confirmed
(each id's opening-tag record count = 1 across all of `src-db`). All 8 touched/created XML files
re-validated as well-formed with `xml.etree.ElementTree` after every edit — including catching and
fixing one real bug: the last `AD_COLUMN_COMP_DEPENDENCY` insertion (the alphabetically-last of the
3 new ids) initially landed *after* the file's closing `</data>` tag, because the insertion
script's "no successor found" fallback appended at end-of-file without accounting for that closing
tag. Caught by the well-formedness check, fixed by hand before moving on — flagged here in case the
same insertion approach is reused for the frontend piece.

### `update.database` — DONE and verified (2026-09-24)

Ran to completion after fixing bugs #1–#3 above (2 retries). The 3-step verification from the
`stored-computed-column` skill was run in full against the local DB, directly via `psql` — not
inferred from a green build:

1. **Triggers exist.** `pg_trigger` on `c_orderline` shows exactly 3 `ad_scd_*_trg` triggers,
   matching the 3 new `AD_COLUMN_COMP_DEPENDENCY` ids (`9a15deae…`, `84817938…`, `ff7d8a2f…`).
2. **`ad_scd_check` returns 0 for all 3 columns** — no stale/un-backfilled rows.
3. **Live reactivity, proven with a real committed DML change, not just the initial backfill**
   (per the skill's own warning that a correct backfill alone isn't proof the trigger works). Used
   the exact same order verified live in the browser earlier this session — purchase order 1000002
   local (`c_order_id = BC8566A7AA164EF3B193463D9F97C6D4`: 2 real lines, 3+2 units, 25% total
   discount, invoice and receipt both completed):
   - **Before any change:** `em_etgo_invoice_status = 100`, `em_etgo_delivery_status = 100`,
     `em_etgo_deliv_status_purchase = 100` — matching the form's own `Facturado 100%`/`Recibido
     100%` badges exactly.
   - **Root-cause proof, side by side:** the classic (buggy) formula, run manually with the
     discount line still included (`ol.c_order_discount_id IS NULL` only, no `m_product_id`
     exclusion) → **83%** (5/6 — the exact ETP-5317 symptom shape). The new stored column, with the
     exclusion → **100%**. Confirms the fix does what it's supposed to, on real data.
   - **Perturbation test:** `UPDATE c_orderline SET qtyinvoiced=2 WHERE c_orderline_id=
     '99D74E88EBC74A6296C5879571260CF0'` (one of the 2 real lines, was 3) → **committed** →
     `em_etgo_invoice_status` dropped to **80** (4/5) while `em_etgo_delivery_status` and
     `em_etgo_deliv_status_purchase` stayed at **100**, unaffected — confirms each column's watched-
     column set is correctly isolated (an invoice-qty change doesn't spuriously recompute
     delivery-qty columns). Reverted (`qtyinvoiced=3`), committed again →
     `em_etgo_invoice_status` returned to **100**. Final `ad_scd_check` on all 3 columns: **0** —
     no drift left behind by the test.

No app-server restart was needed for any of this — the engine is pure PostgreSQL (deferred
constraint triggers + PL/pgSQL), independent of Tomcat.

### `export.database` — DONE (2026-09-24)

Ran with no resulting diff — the hand-written `sourcedata/*.xml` already matched the DB's actual
state exactly (file mtimes unchanged; confirmed independently by querying `ad_column` directly:
`computation_mode='S'`, `refresh_mode='S'`, `allowsorting='Y'`, `allowfiltering='Y'`, correct
`computation_function` per column, `ad_module_id=94E1B433CF55451EABB764750AC5902A` for all 3 — not
core's `0`). Nothing left to reconcile. (`model/functions/*.xml` and `modifiedTables/*.xml` are not
export targets — they're DDL source, not AD dictionary data, so `export.database` never touches
them; only the `sourcedata/AD_*.xml` files are two-way synced.)

### `schema_forge` grid wiring — DONE (2026-09-24), user chose grid-only scope (see below)

**Extract tooling bug found and worked around.** Running the published CLI bins directly
(`node_modules/.bin/sf-extract-db`, `sf-menu-cache`) failed silently / connected to the wrong DB
(`resolveDbDefaults()` fell back to hardcoded defaults, `source: "defaults"`,
`localhost:5432/etendo_dev`, instead of reading the real `gradle.properties` at
`localhost:5434/etendocoremerge`). Root cause, read directly from
`node_modules/@etendosoftware/schema-forge-cli/src/db.js`: its `findGradleProperties()` fallback
(`join(__dirname, '..', '..')`) assumes the LOCAL_CORE dev layout (2 levels up from
`cli/src/db.js`); once installed inside `node_modules/@etendosoftware/schema-forge-cli/src/`,
`__dirname` is far deeper, so the fallback resolves to a meaningless path — the code's own comment
says `SF_ROOT` (set by the consuming repo's `Makefile`) must be used instead, but I was invoking
the bins directly, bypassing `make`. Fixed by exporting `SF_ROOT="$(pwd)"` (from the `schema_forge`
repo root) before calling the raw bins directly — though the real fix, and what worked cleanly, was
switching to `make regen` (its `Makefile` already does `export SF_ROOT := $(CURDIR)` — this was
avoidable entirely by reaching for `make` first, per this repo's own stated convention). Also:
`sf-menu-cache`'s own `isMainModule` check (`endsWith('sf-menu')`) doesn't match its actual bin name
(`sf-menu-cache`), so it silently no-ops when invoked as installed — not blocking (window names
were found another way, via each artifact's own `schema-raw.json`), but worth reporting upstream.

**Ran the real pipeline** (`sf-extract-db --menu-name "Purchase Order"` /
`"Sales Order"`, then `make regen ONLY=purchase-order,sales-order SKIP_EXTRACT=1`). The extractor
found the 3 new columns immediately and derived their field keys — **not guessed, read from
`schema-raw.json`**: `eTGOInvoiceStatus` (`EM_ETGO_Invoice_Status`), `eTGODeliveryStatus`
(`EM_ETGO_Delivery_Status`, sales-order only), `eTGODelivStatusPurchase`
(`EM_ETGO_Deliv_Status_Purchase`, purchase-order only) — all `visibility: "system"` by default,
`isFilterable: true`, matching TBAI's own raw shape exactly.

**Correction to an earlier claim in this document:** TBAI status was earlier said to need "zero
`decisions.json` footprint" — **that was wrong**, caught only by actually grepping
`artifacts/sales-invoice/decisions.json` for `eTGOTbaiStatus` (not the old-style `tbaiStatus` key I
had grepped for originally). It has an entry: `{"visibility": "readOnly", "form": false, "grid":
true}`. Every `visibility: "system"` field needs an explicit `decisions.json` entry to appear in
the generated grid at all — there is no free auto-inclusion. Updated both `purchase-order/
decisions.json` and `sales-order/decisions.json`: the 3 old field keys (`invoiceStatus`,
`deliveryStatus`, `deliveryStatusPurchase`) got `grid: false` (kept — the form's status badge
still reads them, see below), and the 3 new keys got `visibility: "readOnly"`, `grid: true`, the
same `gridOrder`/`columnType: "percent"` the old ones had, plus `labelOverrides` entries
(`es_ES`/`en_US`) reusing the exact existing label text, keyed by the new `AD_COLUMN.NAME`
(`EM_ETGO_Invoice_Status` etc., confirmed by reading how the existing `InvoiceStatus`/
`DeliveryStatusPurchase` keys resolve — `labelOverrides` is keyed by `AD_COLUMN.NAME`, not by the
camelCase field key). `make regen` confirmed both windows' generated `HeaderTable.jsx` now declare
`{ key: 'eTGOInvoiceStatus', column: 'EM_ETGO_Invoice_Status', type: 'percent', computed:
{"mode":"stored","refresh":"synchronous"}, ... }` and the old keys are gone from the generated
table.

**A second, more consequential discovery — user asked directly "does this affect the form? should
we migrate that too?", which surfaced it.** The generated `HeaderTable.jsx` above is **not what the
live app actually renders** for either window. Both `tools/app-shell/src/windows/custom/
purchase-order/index.jsx` and `.../sales-order/index.jsx` define a hand-maintained `LIST_COLUMNS`
constant (with its own parallel `LABEL_OVERRIDES`, documented in-file as existing on purpose:
*"The list view here bypasses the generated HeaderPage and renders ListView directly, so the
generator-emitted labelOverrides do not reach it"*) and pass it explicitly to a `CustomHeaderTable`
wrapper, overriding the generated component's own defaults entirely. **Fixing `decisions.json`
alone would not have fixed the real running grid** — this was still pointing `column: 'InvoiceStatus'`
/`'DeliveryStatus'`/`'DeliveryStatusPurchase'` at the classic columns. Fixed both files: `LIST_COLUMNS`
entries repointed at `column: 'EM_ETGO_*'` (keys renamed to match, `eTGOInvoiceStatus` etc.), and
their local `LABEL_OVERRIDES` constants got the same new-key entries added (old ones kept, unused
now but harmless). Verified both files parse (`esbuild`, since a full `vite build` fails here on an
unrelated pre-existing issue — `vite.config.js` importing a missing module,
`@etendosoftware/schema-forge-cli/src/report-auth.js`, from the published package — confirmed
unrelated by reproducing before touching anything).

**Answering the user's actual question, now with the code read, not guessed:** the FORM's status
badges (`PurchaseOrderTopbar.jsx`, and sales-order's equivalent) are a **third, independent** place
that reads these fields — hardcoded, reading `data.invoiceStatus`/`data.deliveryStatusPurchase`/
`data.deliveryStatus` directly from the API response object, with no `decisions.json` involvement
at all. **This was deliberately left untouched.** The classic fields the form reads are still
patched correctly by Part 1's `afterHandle()` Java code, so the form's percentages are completely
unaffected by any of today's work and will keep showing the right number. The grid (now reading the
new stored columns) and the form (still reading the Java-patched classic columns) **coexist
correctly** — same numbers today, two different code paths. **User's explicit decision (asked via
`AskUserQuestion`): grid-only scope for now.** Migrating the form's topbar components to read the
new fields too — which would be needed to ever delete the Java patch — is left as documented future
work, not started.

### Live browser verification — DONE (2026-09-25), Part 2 closed

Claude-in-Chrome stayed disconnected; fell back to plain Playwright MCP per the user's own
documented fallback instruction from earlier in this ticket's session. Logged in manually by the
user (no credentials ever typed by the agent), then drove `localhost:3100` directly.

**One more real bug found and fixed before anything worked: NEO never knew the new fields
existed.** First reload of the Purchase Order grid showed **0% on every row**, including
1000002 (previously confirmed 100/100/100 at the DB layer) — a real regression, not a rendering
quirk. Root cause, confirmed by querying `etgo_sf_field` directly: **zero rows** for the 3 new
`AD_COLUMN_ID`s. `make regen` (run earlier, twice) never included `PUSH_TO_NEO=1`, so
`contract.json`/the generated frontend knew about `eTGOInvoiceStatus` etc., but the **NEO Headless
backend itself** — which serves the API from `ETGO_SF_FIELD`, not from `AD_COLUMN` directly — had
no record of them, so it silently returned nothing for those keys. Fixed with
`make regen ONLY=purchase-order,sales-order SKIP_EXTRACT=1 PUSH_TO_NEO=1`, confirmed after: 6 rows
in `etgo_sf_field` (`isincluded='Y'`/`visibility='readOnly'` for the window each field belongs to,
`'N'`/`'discarded'` for the other — e.g. `EM_ETGO_Deliv_Status_Purchase` is `Y` for purchase-order,
`N` for sales-order, correctly). This is exactly the `push-to-neo.js` step this repo's own
`CLAUDE.md` already calls out ("After running push-to-neo.js, always remind to run
`./gradlew export.database`") — skipped because the DB-layer verification the day before had
looked complete enough on its own; the frontend regen steps were run without re-reading that rule.
**`./gradlew export.database` still needs to be re-run** to persist this NEO push (not done as
part of this browser-verification pass — see "To resume").

**After the fix, verified live, matching the DB-level numbers exactly:**

| Order | Grid before fix | Grid after fix | DB value (previously verified) |
|---|---|---|---|
| 1000002 (discount, PO) | 0%/0% | **100%/100%** | 100/100/100 ✅ |
| 1000001 (partial qty, PO) | 0%/0% | **40%/40%** | matches |
| 1000000 (PO) | 0%/0% | **0%/100%** | matches |
| 1000005 (PO) | 0%/0% | **61%/61%** | matches |
| 1000008/1000007/1000006/1000004 (PO, no discount) | 0%/0% | **100%/100%** | matches |

**Emilio's exact filter repro, closed:** `Filtros → Estado de facturación → Es → 100` on Purchase
Order returned **5 orders — including 1000002**, the discount-bearing order that was the entire
point of the reopened bug. Before Part 2, this exact order was invisible under this exact filter
(only findable by filtering the old, wrong percentage). This is the QA report, confirmed fixed,
live, not inferred.

**Sort, also closed:** clicking the `Estado de facturación` column header sorted ascending
correctly — `0% → 40% → 61% → 100%×5`, with 1000002 sitting properly among the other 100% rows.
Before the fix, its classic raw value (~83%, the exact ETP-5317 symptom shape) would have placed it
between 61% and 100%, visibly out of place.

**Form regression check, passed:** opened 1000002's detail panel — `Facturado: 100%` /
`Entregado: 100%` badges unchanged, confirming the form (still reading the Part 1 Java-patched
classic fields, untouched today) shows the same number as the grid, via a completely different code
path, exactly as designed.

**Sales Order, spot-checked too:** grid renders correctly (0%/100%, 100%/100%, 67%/67%, etc.).
Found a local sales order with a discount line (1000000, `em_etgo_invoice_status=0`,
`em_etgo_delivery_status=100`) via direct DB query, filtered `Estado de entrega = 100`, and it
correctly appeared — same fix, same result, second window.

**Both advanced-filter and sort are now confirmed closed for both windows** — the actual, complete
resolution of Emilio's QA reopening, not just the underlying stored-column plumbing.

### Extended live verification with newly-created orders (2026-09-25)

At the user's request, went beyond spot-checking pre-existing data: created and fully confirmed
brand-new orders myself (Playwright MCP, `localhost:3100`, user logged in manually), replicating
Emilio's exact repro shape (a line + a total discount), then re-ran the grid/filter/sort checks
against them specifically — not just against orders that already existed before the fix.

**New orders created and confirmed end-to-end (order → invoice → shipment/receipt):**

| Order | Window | Lines | Result |
|---|---|---|---|
| PO #1000003 | Purchase Order | Fernet qty 1, 15% total discount | Factura #10000002 + albarán #10000003, both confirmed → **100%/100%** |
| PO #1000004 | Purchase Order | Fernet qty 10, 45% total discount | Albarán #10000004 confirmed (**100%** recepción); factura blocked by a pre-existing, unrelated duplicate-document-number bug (known/expected, not part of this ticket) → **0%/100%** |
| SO #1000001 | Sales Order | Fernet qty 10, 45% total discount, contact Juan Perez | Factura #10000000 + albarán #1000001, both confirmed → **100%/100%** |
| SO #1000002 | Sales Order | Fernet qty 1, 15% total discount, contact Laura Morat | Factura #10000001 + albarán #1000002, both confirmed → **100%/100%** |

**Purchase Order grid**, re-checked with the two new orders present: both appear with the correct
values (1000003 → 100%/100%, 1000004 → 0%/100%), correctly positioned in the existing ascending
sort by `Estado de facturación`: `0%, 0%, 40%, 61%, 100%×6`.

**Purchase Order filter**, `Estado de recepción = 100`: correctly returned both 1000000 and 1000004
— two independently discount-bearing orders with **0% facturación but 100% recepción** — confirming
the filter evaluates each stored column independently, not tied to invoice completion.

**Sales Order grid**, re-checked with the two new orders present: both appear at 100%/100%,
consistent with their fully-confirmed invoice+shipment state.

**Sales Order filter**, `Estado de facturación = 0`: correctly returned exactly one row — pre-existing
order 1000000 (0%/100%, uninvoiced) — and correctly excluded every other order, including the two
new discount-bearing ones that are fully invoiced. Screenshot-verified.

**Sales Order sort**, clicking the `Estado de facturación` column header: ascending order came back
as `0%, 67%, 100%×5`, with the discount-bearing new orders (1000001, 1000002) sitting correctly among
the other 100% rows rather than being pulled down by their discount lines. Screenshot-verified.

This closes the remaining gap from the previous verification pass (which had spot-checked existing
data but not driven a discount-bearing order through its full document lifecycle live, nor tested
the Sales Order filter/sort explicitly). Both windows' grid, advanced filter, and sort are now
confirmed against orders created and confirmed within this same session, in addition to the
previously-existing data.

### Local verification log — historical record (2026-09-24/25)

The 19 checks below are the exact, order-by-order log of everything run locally across both sessions
(`localhost:3100`, Playwright MCP + manual login), all passed. This is the historical record — for
the checklist to re-run against **prod**, see "Production deployment — regression test checklist"
further below, which generalizes these same 19 checks into prod-appropriate steps (create fresh
orders there rather than reusing these dev-only IDs).

| # | Window | Test type | Case / Order | Expected result |
|---|---|---|---|---|
| 1 | Purchase Order | Grid value | #1000002 (discount, partial qty) | 0%/0% → **100%/100%** |
| 2 | Purchase Order | Grid value | #1000001 (partial qty, no discount) | 0%/0% → **40%/40%** |
| 3 | Purchase Order | Grid value | #1000000 | 0%/0% → **0%/100%** |
| 4 | Purchase Order | Grid value | #1000005 | 0%/0% → **61%/61%** |
| 5 | Purchase Order | Grid value | #1000008/1000007/1000006/1000004 (no discount) | 0%/0% → **100%/100%** |
| 6 | Purchase Order | Advanced filter | `Estado de facturación = 100` | 5 orders returned, including #1000002 (previously invisible under this filter) |
| 7 | Purchase Order | Sort | Click `Estado de facturación` column header | Ascending `0% → 40% → 61% → 100%×5`, #1000002 correctly placed among the 100% group |
| 8 | Purchase Order (form) | Regression | Detail panel of #1000002 | `Facturado 100%` / `Entregado 100%` badges unchanged (Part 1 Java patch still feeding the form, untouched) |
| 9 | Sales Order | Grid value (spot-check) | #1000000 (with discount) | **0%/100%** |
| 10 | Sales Order | Advanced filter (spot-check) | `Estado de entrega = 100` | #1000000 appears correctly |
| 11 | Purchase Order | Full document lifecycle (order created live) | **#1000003** (Fernet qty 1, 15% total discount) | Invoice #10000002 + receipt #10000003, both confirmed → **100%/100%** |
| 12 | Purchase Order | Full document lifecycle (order created live) | **#1000004** (Fernet qty 10, 45% total discount) | Receipt #10000004 confirmed → **0%/100%** (invoice blocked by a pre-existing, unrelated duplicate-document-number bug — not this ticket) |
| 13 | Sales Order | Full document lifecycle (order created live) | **#1000001** (Juan Perez, qty 10, 45% discount) | Invoice #10000000 + shipment #1000001, both confirmed → **100%/100%** |
| 14 | Sales Order | Full document lifecycle (order created live) | **#1000002** (Laura Morat, qty 1, 15% discount) | Invoice #10000001 + shipment #1000002, both confirmed → **100%/100%** |
| 15 | Purchase Order | Grid re-check with new orders | #1000003, #1000004 | Correctly positioned in the existing ascending sort: `0%, 0%, 40%, 61%, 100%×6` |
| 16 | Purchase Order | Advanced filter | `Estado de recepción = 100` | Returns #1000000 and #1000004 — both 0% invoicing but 100% receiving, filter evaluates each column independently |
| 17 | Sales Order | Grid re-check with new orders | #1000001, #1000002 | **100%/100%** both |
| 18 | Sales Order | Advanced filter | `Estado de facturación = 0` | Returns exactly #1000000, correctly excludes the 2 new fully-invoiced discount orders |
| 19 | Sales Order | Sort | Click `Estado de facturación` column header | Ascending `0%, 67%, 100%×5`, discount orders #1000001/#1000002 correctly placed among the 100% group |

**Not yet covered by this suite (add before/after prod deploy too):**
- Sales Quotation — out of scope per the ticket (doesn't display these fields at all), but worth a
  quick confirmation nothing regressed there.
- A Purchase/Sales Order with a **partial** discount combined with a **partial** delivery/invoice
  (i.e. discount line + some-but-not-all lines invoiced) — none of the 19 checks above hit that
  exact combination; all discount cases so far are either 0% or 100%.
- `AD_COMPDEP_WATCHED_COL` perturbation re-test in prod: edit a line's quantity on a confirmed order
  and confirm the 3 new stored columns actually recompute (the dirty-row/trigger mechanism) — this
  was verified once in the local DB during implementation but not re-verified through this browser
  suite.

### NOT done yet

1. **`./gradlew export.database`** — needs to be re-run to persist the `push-to-neo.js` config
   change (the `ETGO_SF_FIELD` rows) discovered and fixed during this browser-verification pass.
   Without it, the NEO config only lives in the local DB and would be lost on a DB rebuild.
2. **Migrating the form's topbar badges** (`PurchaseOrderTopbar.jsx` + sales-order equivalent) to
   read the new `EM_ETGO_*` fields — explicitly deferred by user choice, not a blocker for anything
   done today. Needed only if/when the goal becomes deleting the Java patch entirely.
3. **Removing `AbstractOrderHeaderHandler`'s `applyCorrectedStatusPercentages`/
   `batchComputeStatusPercentages`/`StatusPercentages`/`calculatePercentage`** — still deliberately
   untouched, blocked on item 2 (the form still depends on it) — a scope decision, not an oversight.
4. Live re-verification of the rest of Part 1's original full test matrix (Sales Quotation is out
   of scope entirely — confirmed the ticket never mentions it, and it doesn't display these fields).

### To resume

1. `./gradlew export.database` in the Etendo root — persist the `push-to-neo.js` config change.
2. Decide whether to migrate the form's topbar badges (item 2 above) — if yes, scope it the same
   file-by-file way this whole ticket has been scoped, then only afterward remove the
   `AbstractOrderHeaderHandler` Java patch and its tests.
3. Nothing in `schema_forge` or `com.etendoerp.go` has been committed — both working trees only,
   per explicit instruction throughout. `build.xml` at the Etendo root also carries an uncommitted,
   unrelated fix (ETP-5395's `aarch64`/`arm64` heap-size PR, applied verbatim at the user's request
   after an unrelated `OutOfMemoryError` during a full `smartbuild`).

---

## Production deployment — regression test checklist

Run this exact sequence again against production after deploying this ticket. Every row below was
executed live at `localhost:3100` during development (2026-09-24/25) and passed; re-running the same
steps against prod data is the acceptance criteria for closing ETP-5317 there. `id`s below are dev-only
— on prod, create fresh equivalents (a line + a **Descuento total**, per row 11–14) and substitute.

| # | Window | Test type | Case | Expected result |
|---|---|---|---|---|
| 1 | Purchase Order | Grid value | Order with discount, qty fully invoiced/delivered | Grid % matches form (**100%/100%**), not the old under-reported value |
| 2 | Purchase Order | Grid value | Order with discount, partial qty | Grid % matches the corrected fraction (e.g. **40%/40%**), not core's raw SQLLOGIC value |
| 3 | Purchase Order | Grid value | Order with zero invoicing but full reception | **0%** facturación / **100%** recepción shown independently (not coupled) |
| 4 | Purchase Order | Grid value | Orders without any discount line | Unaffected — still **100%/100%** as before the fix |
| 5 | Purchase Order | Advanced filter | `Estado de facturación = 100` | Returns every fully-invoiced order **including discount-bearing ones** (this is Emilio's exact QA repro) |
| 6 | Purchase Order | Advanced filter | `Estado de recepción = 100` | Returns orders with 100% recepción regardless of facturación % (independent columns) |
| 7 | Purchase Order | Sort | Click `Estado de facturación` header | Ascending order is numerically correct end to end, discount-bearing orders sit in their real percentile, not shifted by the old under-reported value |
| 8 | Purchase Order | Form regression | Open a discount-bearing completed order | `Facturado X%` / `Entregado X%` badges (still on the Part-1 Java path) show the SAME number as the grid |
| 9 | Sales Order | Grid value | Discount-bearing orders, various completion states | Grid % matches expected value, independent per column |
| 10 | Sales Order | Advanced filter | `Estado de facturación = 0` | Returns only genuinely-unbilled orders; excludes fully-invoiced discount-bearing orders |
| 11 | Sales Order | Sort | Click `Estado de facturación` header | Ascending order correct; discount-bearing orders sit among their real percentile |
| 12 | Purchase Order | End-to-end lifecycle | Create order (product line + **Descuento total** %), complete, generate factura + albarán, confirm both | Final grid state **100%/100%**; filter/sort from rows 5–7 still hold with this new order included |
| 13 | Purchase Order | End-to-end lifecycle, partial | Create order (line + discount), complete, confirm only the albarán (skip/fail factura) | Grid shows **0% facturación / 100% recepción** — independent columns confirmed again on fresh data |
| 14 | Sales Order | End-to-end lifecycle | Create order (line + **Descuento total** %), complete, generate factura + albarán, confirm both | Final grid state **100%/100%**; filter/sort from rows 10–11 still hold with this new order included |
| 15 | Sales Order | End-to-end lifecycle | Create order (different contact, different qty/discount %) | Same as row 14, confirms the fix isn't tied to one specific product/qty/discount-% combination |
| 16 | Purchase Order + Sales Order | Prerequisite check | `./gradlew export.database` ran, app restarted/redeployed | `ETGO_SF_FIELD` has rows for `EM_ETGO_Invoice_Status`/`EM_ETGO_Delivery_Status`/`EM_ETGO_Deliv_Status_Purchase` (see "NEO never knew the new fields existed" bug above) — grid must NOT show 0% on every row after deploy |

**Notes for whoever runs this in prod:**
- Rows 12–15 are the important ones: don't just re-check existing data, create a real order through
  the real document lifecycle (order → complete → invoice → shipment/receipt → confirm both), exactly
  as Emilio's original repro did. This is what actually exercises the stored-computed-column triggers
  (`ad_scd_*`) end to end, not just a read of already-correct data.
- Row 16 is the single most likely deployment failure mode seen in this ticket (see "NEO never knew
  the new fields existed" above) — a `make regen`/deploy that pushes `contract.json` and the frontend
  but skips `push-to-neo.js`'s NEO config sync (or skips `export.database` after it) will show every
  order at 0% in the grid, a full regression that looks nothing like the original bug. Check
  `ETGO_SF_FIELD` directly if row 1 fails after deploy — don't assume the DB function itself is broken.

---

## Audit: is the Part 1 `afterHandle` Java patch still needed? (2026-09-25, CORRECTED same day)

**This section's first pass (below, struck through in spirit but kept for the record) was wrong on
its central claim. A second, deeper investigation — triggered by the user asking for the cost of
migrating the form badge, and explicitly asking to double-check for regressions — found the real
dependency, which is materially more serious than a display badge.**

### First pass (WRONG on the critical point — kept for transparency, do not act on this)

Originally concluded `PurchaseOrderTopbar.jsx` was the form's live dependency on the Java patch,
reading `data.invoiceStatus`/`data.deliveryStatusPurchase` directly. **This file is never imported
anywhere in the app** — dead code, unrelated to any live surface. The conclusion was reached by
reading the file's contents in isolation without checking whether anything actually renders it. The
component actually wired into the Purchase Order form via `decisions.json`'s
`customComponents.topbarExtra` is `PurchaseOrderDraftChips.jsx`, which — like Sales Order's
`OrderDraftChips.jsx` — computes its badge independently, client-side, and was never affected by the
Java patch or by ETP-5317 at all (confirmed by the Java patch's own Javadoc at
`AbstractOrderHeaderHandler.java:538-541`, which says so explicitly).

### Second pass — the real dependency (2026-09-25)

**Verdict: the Java patch is NOT dead code, but the thing that actually depends on it is not a form
badge — it's 4 cross-window import-picker modals whose gating logic has real functional
consequences if this regresses, not just a wrong number on screen.**

`AbstractOrderHeaderHandler.afterHandle()` runs on every GET of the `header` NEO entity, list or
single-record, regardless of caller. Confirmed live against the running API (`GET
/sws/neo/purchase-order/header/...` and the list variant) that the corrected classic fields
(`invoiceStatus`, `deliveryStatusPurchase`) are present and correct on **every** response through
this entity — not just the ones the grid/form explicitly render. Four modals consume this list
response and use the classic field to decide which orders are eligible to import lines into a new
document:

| File | Reads | Gate |
|---|---|---|
| `artifacts/purchase-invoice/custom/ImportFromPurchaseOrderModal.jsx:31` | `o.invoiceStatus` | order importable only if `< 100` |
| `artifacts/sales-invoice/custom/ImportFromOrderModal.jsx:31` | `o.invoiceStatus` | same, Sales Order |
| `artifacts/goods-receipt/custom/ImportFromPurchaseOrderModal.jsx:70` | `o.deliveryStatusPurchase` | same, receipts |
| `artifacts/goods-shipment/custom/ImportFromSalesOrderModal.jsx:70` | `o.deliveryStatus` | same, shipments |

**Why this is worse than a display bug:** if the Java patch were removed without touching these 4
files, a discount-bearing order that is already fully invoiced/delivered would revert to core's
inflated (wrong, `< 100`) percentage here, and could still show up as "importable" — letting a user
create a **duplicate invoice or shipment** against an already-closed order. None of this is covered
by the 19-check verification suite above (or the prod checklist below, as originally written) —
every existing test target's the grid/form/filter/sort, never these 4 modals.

**Good news found in the same pass — the new stored columns are already exposed on this exact
response, no extra work needed:** `decisions.json`'s `form: false` only tells the frontend generator
not to render an input in the auto-generated form; it does not remove the field from the NEO
payload. Confirmed live: `eTGOInvoiceStatus`/`eTGODelivStatusPurchase` are present on both the
single-record and list `header` responses today, and are bit-identical to the Java-corrected
`invoiceStatus`/`deliveryStatusPurchase` for every order checked (0%, 40%, 100% cases, both
windows) — same cancelled-order guard, same `ETGO_DTO` exclusion. No parity gap found.

**Cost to do this properly — small, 4 one-line JS edits, then the Java removal:**
1. `ImportFromPurchaseOrderModal.jsx:31` (purchase-invoice) — `o.invoiceStatus` → `o.eTGOInvoiceStatus`
2. `ImportFromOrderModal.jsx:31` (sales-invoice) — `o.invoiceStatus` → `o.eTGOInvoiceStatus`
3. `ImportFromPurchaseOrderModal.jsx:70` (goods-receipt) — `o.deliveryStatusPurchase` → `o.eTGODelivStatusPurchase`
4. `ImportFromSalesOrderModal.jsx:70` (goods-shipment) — `o.deliveryStatus` → `o.eTGODeliveryStatus`

Only after all 4 are live-verified: delete `applyCorrectedStatusPercentages` /
`batchComputeStatusPercentages` / `StatusPercentages` / `calculatePercentage` and their call site in
`afterHandle()` (`AbstractOrderHeaderHandler.java`, method body ~lines 464, 507–649).
`PurchaseOrderTopbar.jsx` can be deleted separately, any time, zero risk — it is unreferenced dead
code, unrelated to this ticket.

**Regression risks, ranked:**
1. **(Medium)** The 4 import modals have zero existing test coverage in this ticket. Needed before
   removing the Java patch: create a discount-bearing order, fully invoice/deliver it, confirm it
   does **not** appear as importable in all 4 modals — both before and after the JS edit, and again
   after the Java removal.
2. **(Low)** The Java method's implicit `StatusPercentages.ZERO` fallback for edge cases is
   independently covered by each SQL function's own total-function guard
   (`EXCEPTION WHEN OTHERS THEN RETURN 0`) — parity confirmed for normal cases, but a cancelled/
   zero-line order through the 4 modals specifically hasn't been exercised yet.
3. **(Very low)** `PurchaseOrderTopbar.jsx` deletion — no consumers, no risk.

**Rollback:** the 4 JS edits and the Java removal are fully independent changes — either can be
reverted alone without touching the other.

**Conclusion:** "migrate the form badge" was the wrong framing — there is no form badge depending on
the patch. The actual scope is 4 import-modal files plus the Java removal, is small, and the new
columns already have full data parity confirmed live. Not yet implemented — this is analysis only,
per the user's request, no files changed.
