# Plan — Product list: Sale price / Purchase price / Stock as stored computed columns

**Task:** ETP-4603
**Status:** Backend implemented & verified (3 columns, 7 dependencies, 7 `ad_scd_*` triggers generated and inspected). Schema Forge / frontend side (§6) pending.
**Engine reference:** `../modules/com.etendoerp.go/docs/STORED-COMPUTED-COLUMNS.md` (EPL-1807)

---

## 1. Context / goal

Three columns in the **Product list** are currently `type:'custom'`, `sortable:false` cells that each
fetch per row from NEO Headless — a genuine N+1 (one `/price` or `/stock` request per visible row):

| List column | Current cell | Current request | Value |
|---|---|---|---|
| Sale price | `ProductSalePriceCell` | `GET /price?parentId=<id>` | `PriceStd` of the sales-side default price-list version |
| Purchase price | `ProductPurchasePriceCell` | `GET /price?parentId=<id>` (deduped) | `PriceStd` of the purchase-side default price-list version |
| Stock | `ProductStockCell` | `GET /stock?parentId=<id>` | `SUM(QtyOnHand)` across all locators/warehouses |

The goal is to move these three values into **stored computed columns** on `M_Product` (engine from
EPL-1807, living in Etendo core). The column value is a real physical column, computed once when its
dependencies change and persisted — so the list can render them as **real, sortable & filterable**
columns with zero per-row fetches.

**Scope constraints (confirmed with the user):**
- **PostgreSQL only** — synchronous (`S`) refresh relies on PG deferred constraint triggers.
- **Mono-currency, raw `PriceStd`** — no currency conversion; matches current behavior exactly.
- **Keep the `validFrom <= today` filter** in price selection (explicit user decision).

**Environment verified**
- EPL-1807 is **merged in core**: `AD_COLUMN_COMP_DEPENDENCY`, `AD_COMPDEP_WATCHED_COL`,
  `AD_STOREDCOLUMN_DIRTY` tables and the `Computation_Mode` / `Computation_Function` /
  `Refresh_Mode` / `Computation_Sequence_Number` fields on `AD_COLUMN` all exist.
- Module **ETGO** (`AD_Module_ID = 94E1B433CF55451EABB764750AC5902A`, DB prefix `ETGO`) already owns
  `EM_ETGO_*` columns on core tables — naming convention matches.
- Target table **M_Product** = `AD_Table_ID 208`. Source tables: M_ProductPrice `251`,
  M_PriceList_Version `295`, M_PriceList `255`, M_Storage_Detail `800036`.
- Physical source columns confirmed against the core model:
  `M_ProductPrice.PRICESTD / M_PRODUCT_ID / M_PRICELIST_VERSION_ID`,
  `M_PriceList_Version.VALIDFROM / M_PRICELIST_ID`, `M_PriceList.ISSOPRICELIST / ISDEFAULT`,
  `M_Storage_Detail.QTYONHAND / M_PRODUCT_ID`.

---

## 2. Final column names (on M_Product, module ETGO)

Follows the doc's `EM_<DBPrefix>_<Name>` convention for module-owned physical columns. All names are
≤ 30 chars (Oracle identifier limit; longest is `em_etgo_purchase_price` = 22).

| Physical column | Computation_Mode | Refresh_Mode | Computation_Sequence_Number | Return type | Computation function |
|---|---|---|---|---|---|
| `EM_ETGO_Sale_Price` | `S` (stored) | `S` (synchronous, exact at commit) | 10 | NUMERIC · ref **Amount (12)** | `etgo_product_sale_price` |
| `EM_ETGO_Purchase_Price` | `S` (stored) | `S` (synchronous, exact at commit) | 10 | NUMERIC · ref **Amount (12)** | `etgo_product_purchase_price` |
| `EM_ETGO_Stock` | `S` (stored) | `Q` (queued/async) | 10 | NUMERIC · ref **Number (22)** | `etgo_product_stock` |

- **AD_Reference (resolved):** the two prices use **Amount (12)**; stock uses **Number (22)** (not
  Quantity). All three functions return `NUMERIC`; V6 checks the return type against the reference's
  numeric family — `NUMERIC` is compatible with both Amount and Number, so V6 passes for all three.
- `SQLLogic` left **empty** on all three (required by V1).
- Prices are `S` (must be exact when read). Stock is `Q` — stock churns often and instant exactness
  is not required (dashboards/list display tolerate the queue lag).
- No column reads another stored column, so `Computation_Sequence_Number = 10` for all (no chaining,
  V17 n/a).

---

## 3. Computation functions (verbatim, PostgreSQL, `STABLE`)

Each is arity-1 `f(p_m_product_id) → NUMERIC`, pure (no side effects), `STABLE` (V7).

### Sale price — sales-side, prefer default price list, most-recent `VALIDFROM <= now()`

```sql
CREATE OR REPLACE FUNCTION etgo_product_sale_price(p_m_product_id VARCHAR)
RETURNS NUMERIC AS $$
  SELECT pp.pricestd
  FROM   m_productprice pp
  JOIN   m_pricelist_version plv ON plv.m_pricelist_version_id = pp.m_pricelist_version_id
  JOIN   m_pricelist pl          ON pl.m_pricelist_id          = plv.m_pricelist_id
  WHERE  pp.m_product_id = p_m_product_id
    AND  pl.issopricelist = 'Y'
  ORDER  BY (pl.isdefault = 'Y')      DESC,   -- default price lists first
            (plv.validfrom <= now())  DESC,   -- current/past versions before future
            plv.validfrom             DESC,   -- most recent
            pp.m_productprice_id       ASC    -- deterministic tie-break
  LIMIT 1;
$$ LANGUAGE sql STABLE;
```

### Purchase price — identical but `issopricelist = 'N'`

```sql
CREATE OR REPLACE FUNCTION etgo_product_purchase_price(p_m_product_id VARCHAR)
RETURNS NUMERIC AS $$
  SELECT pp.pricestd
  FROM   m_productprice pp
  JOIN   m_pricelist_version plv ON plv.m_pricelist_version_id = pp.m_pricelist_version_id
  JOIN   m_pricelist pl          ON pl.m_pricelist_id          = plv.m_pricelist_id
  WHERE  pp.m_product_id = p_m_product_id
    AND  pl.issopricelist = 'N'
  ORDER  BY (pl.isdefault = 'Y')      DESC,
            (plv.validfrom <= now())  DESC,
            plv.validfrom             DESC,
            pp.m_productprice_id       ASC
  LIMIT 1;
$$ LANGUAGE sql STABLE;
```

### Stock — SUM of QtyOnHand across all locators/warehouses

```sql
CREATE OR REPLACE FUNCTION etgo_product_stock(p_m_product_id VARCHAR)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(sd.qtyonhand), 0)
  FROM   m_storage_detail sd
  WHERE  sd.m_product_id = p_m_product_id;
$$ LANGUAGE sql STABLE;
```

### Resolver helper functions (target-ID walk-back for the price-list dependencies)

The two price-list dependencies (M_PriceList, M_PriceList_Version) are one/two hops from the product,
so their target-ID resolver must walk back to every affected product. Rather than embed the JOIN
inline in the dependency's resolver SQL (which puts complex SQL in the sourcedata XML **and** must
satisfy the generator's portability gate — no `SELECT` without `FROM`), the walk-back is encapsulated
in two versioned `ETGO_`-prefixed `STABLE` functions. Each takes **both** `NEW` and `OLD` as
arguments so reparenting (INSERT / UPDATE-move / DELETE) is handled inside the function; the resolver
in the metadata is then a single `SELECT ... FROM func(NEW.x, OLD.x)` line.

```sql
-- M_PriceList change (issopricelist / isdefault) -> all products priced via that list
CREATE OR REPLACE FUNCTION etgo_scd_products_by_pricelist(p_new VARCHAR, p_old VARCHAR)
RETURNS TABLE(product_id VARCHAR) AS $$
  SELECT DISTINCT pp.m_product_id
  FROM   m_productprice pp
  JOIN   m_pricelist_version plv ON plv.m_pricelist_version_id = pp.m_pricelist_version_id
  WHERE  plv.m_pricelist_id = p_new OR plv.m_pricelist_id = p_old;
$$ LANGUAGE sql STABLE;

-- M_PriceList_Version change (validfrom) -> all products priced via that version
CREATE OR REPLACE FUNCTION etgo_scd_products_by_plversion(p_new VARCHAR, p_old VARCHAR)
RETURNS TABLE(product_id VARCHAR) AS $$
  SELECT DISTINCT pp.m_product_id
  FROM   m_productprice pp
  WHERE  pp.m_pricelist_version_id = p_new OR pp.m_pricelist_version_id = p_old;
$$ LANGUAGE sql STABLE;
```

`= p_new OR = p_old` is NULL-safe by construction: on INSERT `OLD` is NULL (matches only the new
value), on DELETE `NEW` is NULL, on a reparent it fans out to both the old and the new list/version.

**Fidelity vs the current JS (`selectPriceRow` / stock reduce):**
- The price functions reproduce the JS logic: side filter → prefer default price list → most-recent
  `validFrom <= today`, else most-recent overall.
- **Deliberate improvement:** JS's no-default fallback was `sideRows[0]` (nondeterministic); the SQL
  `ORDER BY` makes that path deterministic (most-recent validfrom, then PK). This only changes the
  edge case where a side has price rows but none on a *default* price list.
- Stock returns `0` for an empty set, matching JS `[].reduce(...,0)`.
- `now()` is `STABLE` (transaction timestamp) — valid inside a `STABLE` function and matches "today".

---

## 4. Dependency configuration

Watched columns are stored as `AD_COMPDEP_WATCHED_COL` child rows, each referencing the source
column's real `AD_Column_ID` (resolved from `AD_COLUMN`, never guessed). Required for every UPDATE
dependency (V9) and each must belong to the dependency's source table (V10).

Every dependency sets **exactly one** of `Target_Link_Column_ID` / `Target_ID_Resolver_SQL` (V11).
The design keeps **all complex SQL out of the metadata/XML**:

- **Direct dependencies** (the source row already carries `M_Product_ID`) → set
  **`Target_Link_Column_ID`** = that FK column and leave the resolver empty. The generator
  (`GenerateStoredComputedTriggers.resolveResolverSql`) *renders* the correct portable resolver from
  the FK column itself — `SELECT COALESCE(NEW.fk, OLD.fk) FROM dual` when the column is `IsParent='Y'`
  (immutable FK), or the `NEW … UNION OLD …` form otherwise. Zero SQL in the metadata, and the
  `FROM dual` portability requirement is satisfied automatically.
- **Walk-back dependencies** (price list / version) → set `Target_ID_Resolver_SQL` to a one-line
  `SELECT ... FROM func(NEW.x, OLD.x)` calling the §3 helper functions; the JOIN lives in the function.

### `EM_ETGO_Sale_Price` and `EM_ETGO_Purchase_Price` — identical 3 dependencies each

| # | Source table | INS / UPD / DEL | Watched columns (UPDATE) | Target-ID resolution |
|---|---|---|---|---|
| 1 | M_ProductPrice (251) | Y / Y / Y | `PRICESTD`, `M_PRICELIST_VERSION_ID` | **Link column** → `M_ProductPrice.M_Product_ID` (AD_Column 2064, `IsParent='Y'` → engine renders `SELECT COALESCE(NEW.m_product_id, OLD.m_product_id) FROM dual`) |
| 2 | M_PriceList_Version (295) | Y / Y / Y | `VALIDFROM`, `M_PRICELIST_ID` | **Resolver** → `SELECT product_id FROM etgo_scd_products_by_plversion(NEW.m_pricelist_version_id, OLD.m_pricelist_version_id)` |
| 3 | M_PriceList (255) | Y / Y / Y | `ISSOPRICELIST`, `ISDEFAULT` | **Resolver** → `SELECT product_id FROM etgo_scd_products_by_pricelist(NEW.m_pricelist_id, OLD.m_pricelist_id)` |

### `EM_ETGO_Stock` — 1 dependency

| # | Source table | INS / UPD / DEL | Watched columns (UPDATE) | Target-ID resolution |
|---|---|---|---|---|
| 1 | M_Storage_Detail (800036) | Y / Y / Y | `QTYONHAND` | **Link column** → `M_Storage_Detail.M_Product_ID` (AD_Column 800633, `IsParent='N'` → engine renders the `NEW … UNION OLD … FROM dual` form) |

**Resolver rationale** (doc §5): M_ProductPrice and M_Storage_Detail carry `M_Product_ID` directly →
use the **link column** and let the engine render the resolver (immutable-FK `COALESCE` form for
M_ProductPrice, `UNION` form for M_Storage_Detail — both safe for insert / delete / reparent, both
portable). M_PriceList_Version and M_PriceList are one/two hops from the product → the resolver calls
the §3 walk-back function. `INSERT_EVENT = 'Y'` on those two as well (resolved decision, defensive): a
price list can be inserted already flagged `IsDefault='Y'` / `IsSOPriceList`, so we listen to INSERT
there too. On a truly empty new list/version the function simply returns 0 rows (harmless no-op).

Each dependency row: `SeqNo = 10`, `AD_Module_ID = 94E1B433CF55451EABB764750AC5902A`.

> **Why not inline the walk-back JOIN in the resolver (the original sketch)?** The generator's
> `validateResolverPortability()` rejects resolvers containing `::`, `pg_*`, `ON CONFLICT`, or a
> `SELECT` without a `FROM` — silently *skipping* the dependency (a `log.warn`, not a hard error). The
> first implementation used inline `SELECT NEW.m_product_id WHERE … UNION …` resolvers with no `FROM`,
> which the gate skipped → only 4 of the 7 triggers were generated. Moving the direct deps to
> `Target_Link_Column_ID` (engine renders `FROM dual` correctly) and the walk-back deps to a thin
> function call fixes this at the root and keeps the metadata SQL-free. See §5 note on V15.

---

## 5. Validator rules (V1–V17) and risks

| Rule | Applies | How satisfied / risk |
|---|---|---|
| V1 (HARD) | ✅ | `SQLLogic` empty on all three |
| V2 (HARD) | ✅ | `Computation_Function` set on all three |
| V3 (HARD) | ✅ | `Computation_Sequence_Number = 10 > 0` |
| V4 (HARD) | ✅ | Functions created as module DDL before validation runs |
| V5 (HARD arity / SOFT type) | ✅ | Arity 1, `VARCHAR` id arg |
| V6 (HARD/SOFT) | ✅ | `NUMERIC` return vs the columns' reference families — Amount (12) for the two prices, Number (22) for stock. `NUMERIC` is compatible with both numeric families |
| V7 (SOFT) | ✅ | All functions `STABLE`, not `VOLATILE` |
| V8 (HARD) | ✅ | Each column has ≥ 1 active dependency |
| V9 (HARD) | ✅ | Every UPDATE dependency declares ≥ 1 watched column |
| V10 (HARD) | ✅ | Watched columns belong to their source table |
| V11 (HARD) | ✅ | Exactly one set per dependency: `target_link_column_id` on the 3 direct deps, `target_id_resolver_sql` on the 4 walk-back deps |
| V14 (HARD) | ✅ (n/a) | No column reads another stored column → no cycle |
| V15 (HARD/SOFT) | ✅ | All 7 `ad_scd_*` triggers generated by `GenerateStoredComputedTriggers` on `update.database` and inspected — direct deps render `… FROM dual`, walk-back deps call the §3 functions |
| V16 (SOFT) | ⚠️ | Wants supporting indexes on FK/watched cols — must verify `M_ProductPrice(M_Product_ID)`, `M_ProductPrice(M_PriceList_Version_ID)`, `M_Storage_Detail(M_Product_ID)` exist (core FK indexes). Warning-only. |
| V17 (SOFT) | ✅ (n/a) | No `A → B` edges between stored columns |

**Other risks / notes**
- **Trigger overhead on price tables.** Writes to M_PriceList / M_PriceList_Version fan out to all
  products in the list/version. Price lists change rarely, so `S` refresh is acceptable; called out
  for awareness.
- **Stock `Q` first population.** When the stock column's triggers are first generated, the engine
  enqueues one per-client sentinel; stock shows blank until it is populated. **Resolved:** the initial
  stock population post-deploy is **owner-handled** — the user will trigger it himself (Queue
  Processor run or manual rebuild). This plan does **not** add a Rebuild step to the runbook.
- **Editing an *existing* stored column later** does not recompute already-stored rows — first
  activation auto-populates, but a subsequent definition change needs a manual **Rebuild Stored
  Column**. Not relevant for this first activation but noted for future edits (doc §15 Q2).

---

## 6. Schema Forge side — implementation checklist (after backend deploy)

- [ ] `artifacts/product/decisions.json`: add `EM_ETGO_Sale_Price`, `EM_ETGO_Purchase_Price`,
      `EM_ETGO_Stock` as real list columns — `sortable: true`, `filterable: true`; drop the 3 custom
      N+1 column definitions.
- [ ] Column types/formatting: the two price columns use `type: 'amount'` so they render via the
      existing `renderAmountCell` / `formatAmount` layer as `123.45 €` (identical to today) while
      sorting/filtering on the raw number — **no new `" €"` literal**. Ensure EUR reaches
      `formatAmount` per §6 (constant `currency$_identifier: 'EUR'` on the column, or an optional
      per-column `currency: 'EUR'` hint). Stock uses `type: 'number'` (bare number, unchanged).
- [ ] `make regen ONLY=product` (full, since raw schema must pick up the new physical columns; needs
      DB access — if DB unreachable, stop and report).
- [ ] Remove dead N+1 code from `tools/app-shell/src/windows/custom/product/ProductListCells.jsx`:
      `ProductSalePriceCell`, `ProductPurchasePriceCell`, `ProductStockCell`, `useProductPrices`,
      `fetchProductPrices`, `selectPriceRow`, `inFlightPrices`, `PriceText` (incl. the hard-coded
      `" €"` literal). **Keep `BoxIcon`** — re-exported here and imported by `ProductGallery.jsx`.
- [ ] Remove the wiring for those cells in
      `tools/app-shell/src/windows/custom/product/ProductCustomTable.jsx`.
- [ ] Verify (Window Change Integrity Protocol, steps 2–4): regen clean, contract-integrity python
      check, generated import paths.
- [ ] `npx sf-validate-pipeline --scope=product` → 0 violations.
- [ ] Update `docs/generated-custom-windows/product.md` (self-documentation policy) and remove/adjust
      any tests that covered `selectPriceRow` / the removed cells.

**Currency display (resolved): keep the `" €"` suffix exactly as today.** Only the *fetch* mechanism
changes (stored column instead of N+1 per-row fetch); the visible formatting stays identical —
`123.45 €` for the two price columns. Stock stays a bare number (it never had a suffix).

**How the suffix is kept without a new hard-coded literal:** reuse the existing format layer.
`DataTable.cellRenderers.jsx` already has a column `type: 'amount'` → `renderAmountCell`, which calls
`formatAmount(value, isoCode)` from `@/lib/formatAmount.js`. For `EUR`, `formatAmount` renders
`"123.45 €"` (narrow symbol, space before symbol) — byte-identical to the current custom cell — while
it formats the **underlying numeric value**, so DataTable sort and filter operate on the number, not
the string. So the two price columns are declared with `type: 'amount'` (not a bespoke cell); no new
`" €"` string literal is introduced.

**One implementation detail to finalize:** `renderAmountCell` derives the ISO code from
`row['currency$_identifier']`. Product list rows do not carry a currency field, and with no ISO code
`formatAmount` falls back to a bare number (no `" €"`). Under the confirmed **mono-currency EUR**
assumption, EUR must reach `formatAmount` — options (to settle at implementation): (a) have the
generated column/contract supply a constant `currency$_identifier: 'EUR'` for these two columns, or
(b) add an optional per-column `currency` hint (e.g. `"EUR"`) that `renderAmountCell` reads, defaulting
to `row['currency$_identifier']`. Either keeps the visible result `123.45 €`. Stock uses `type: 'number'`
(bare number).

---

## 7. Resolved decisions / deviations from the original sketch

1. **AD_Reference for the columns.** ✅ **Resolved:** `EM_ETGO_Sale_Price` and
   `EM_ETGO_Purchase_Price` → **Amount (12)**; `EM_ETGO_Stock` → **Number (22)** (not Quantity). V6:
   `NUMERIC` return is valid against both the Amount and Number reference families.
2. **`INSERT_EVENT` on M_PriceList / M_PriceList_Version.** ✅ **Resolved: `Y`** (defensive — a price
   list can be inserted already flagged default / SO). Resolver SQL unchanged; only the INSERT event
   flipped to `Y` (see §4 table).
3. **Stock `Q` initial population.** ✅ **Resolved:** owner-handled. The user triggers the one-time
   post-deploy population himself; no Rebuild step is added to the runbook (see §5, §8).
4. **Price unit suffix in the list.** ✅ **Resolved: keep the `" €"` suffix — display identical to
   today** (`123.45 €`). Only the fetch mechanism changes. Kept via the existing format layer, not a
   new literal: the two price columns use `type: 'amount'` → `renderAmountCell` → `formatAmount(value,
   'EUR')`, which sorts/filters on the raw number while rendering the euro suffix. Stock stays a bare
   number (`type: 'number'`). See §6 for the currency-ISO wiring detail to finalize at implementation.
5. **Deviation from the original sketch — watched columns.** The sketch implied watched columns were a
   field on the dependency row. In the merged core they are a **separate child table**
   (`AD_COMPDEP_WATCHED_COL`, one row per watched source column). Plan reflects the merged reality
   (doc naming note, §16).
6. **Deviation — column naming.** Sketch left naming open ("EM_/module-prefix"). Confirmed final:
   `EM_ETGO_Sale_Price`, `EM_ETGO_Purchase_Price`, `EM_ETGO_Stock`.
7. **Target-ID resolution — link column + helper functions (final).** ✅ **Resolved:** the original
   inline-resolver approach put JOIN SQL in the sourcedata XML and, for the direct deps, tripped the
   generator's portability gate (`SELECT` without `FROM` → dependency silently skipped, only 4/7
   triggers generated). Final design: **direct deps use `Target_Link_Column_ID`** (engine renders the
   portable `FROM dual` resolver itself — zero SQL in metadata) and **walk-back deps call two
   `ETGO_`-prefixed 2-param `STABLE` functions** (`etgo_scd_products_by_pricelist`,
   `etgo_scd_products_by_plversion`) via a one-line `SELECT … FROM func(NEW.x, OLD.x)` resolver. No
   complex SQL remains in the XML; the 2-param `(NEW, OLD)` signature also handles reparenting that the
   earlier `COALESCE(NEW, OLD)` single-value form missed. See §3 and §4.

---

## 8. Deploy flow (DB-first) — DDL/export/build run by the USER, never the agent

**Flow: apply the changes directly in the database, then `export.database` to persist to XML, then
`update.database` to regenerate the triggers.** The objects are created straight in the DB (not by
hand-editing sourcedata XML). `update.database` is still required here — not to apply the metadata,
but to run `GenerateStoredComputedTriggers` and regenerate the `ad_scd_*` triggers from it.

1. **Apply directly in the DB** (SQL — the agent prepares these; the USER executes them):
   - Create the 3 SQL computation functions (§3) **and the 2 resolver helper functions** (§3).
   - Add the 3 physical columns on `M_PRODUCT` via DDL (`EM_ETGO_Sale_Price`,
     `EM_ETGO_Purchase_Price`, `EM_ETGO_Stock` — DECIMAL/NUMERIC, nullable).
   - INSERT the AD metadata rows: `AD_COLUMN` (×3, with Computation_Mode/Function/Refresh_Mode/Seq),
     `AD_ELEMENT` as needed, `AD_COLUMN_COMP_DEPENDENCY` (×7 — 3 with `Target_Link_Column_ID`, 4 with
     `Target_ID_Resolver_SQL`) and `AD_COMPDEP_WATCHED_COL` (watched-column child rows). All new IDs
     via `make uuid`.
2. **USER runs `./gradlew export.database`** in the Etendo root **first** — dumps the DB state back
   into the module's `src-db/` XML (`modifiedTables/M_PRODUCT.xml`, `AD_COLUMN.xml`, the dependency +
   watched-column sourcedata, all 5 function definitions under `model/functions/`) for versioning.
   Exporting **before** `update.database` protects the hand-created functions from being dropped by
   dbsm (they are then part of the model) and keeps the sourcedata XML consistent with the DB. **The
   agent never runs this.**
3. **USER runs `./gradlew update.database`** — the engine's `GenerateStoredComputedTriggers` step
   regenerates the 7 `ad_scd_*` triggers from the metadata (direct deps → `… FROM dual` rendered from
   the link column; walk-back deps → `SELECT … FROM etgo_scd_products_by_*()`); `StoredComputedValidator`
   runs V1–V17.
4. **Stock (`Q`) initial population is owner-handled** — the USER triggers it himself after deploy
   (Queue Processor run or manual **Rebuild Stored Column**). Not part of this runbook. The two `S`
   price columns are populated automatically when their triggers are first generated (inline, ≤ 100k
   products).
5. Push the Schema Forge product config to NEO (`make regen ONLY=product PUSH_TO_NEO=1`); per project
   policy the USER runs `export.database` again if the NEO config changed.

**Actual execution (verified):** functions + columns + metadata applied to the DB, `export.database`
then `update.database` run by the user → all 7 triggers generated and inspected; `Sale`/`Purchase`
values populated (139 / 145 of 185 products; NULL = no price on that side), `Stock` left for the
owner-handled backfill.
