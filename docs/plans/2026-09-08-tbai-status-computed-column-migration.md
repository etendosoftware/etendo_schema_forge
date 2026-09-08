# ETP-5216 — Migration plan: replace the synthetic `tbaiSyncEstado` with a real computed column on `c_invoice`

**Status:** active
**Jira:** ETP-5216
**Date:** 2026-09-08
**Repos:** `schema_forge` + `com.etendoerp.go` (read-only investigation; no code changed)

---

## 0. Executive summary

The TicketBAI status column in the invoice lists cannot be filtered or sorted, because it is a
purely client-side synthetic cell fed by a Java response injector rather than by a queryable
backend property. This plan evaluates replacing it with a real Application Dictionary computed
column.

**Decision: `Computation_Mode = 'S'` (stored) with `Refresh_Mode = 'S'` (synchronous).** This follows
the project's **Computed Column Policy** (`CLAUDE.md:255-270`), which is mandatory and settles the
axis without a per-case debate: stored whenever possible, and within stored, synchronous whenever
possible. `Q` is reserved for genuinely heavy computations — the reference case is
stock / `m_storage_detail` — not a cheap derived status like this one. `V` is reserved for values
that genuinely cannot be stored (e.g. a value depending on `now()`).

The human decisions that were open in the first revision of this plan are now closed:

| Question | Decision |
|---|---|
| `S` vs `V` vs `Q` | **`S` / `S`** — per `CLAUDE.md:255-270` |
| The cross-module dependency on `com.smf.ticketbai` | **Declare it.** `com.etendoerp.go` is always deployed alongside TicketBAI. Adding the `AD_MODULE_DEPENDENCY` row is a step of this plan (§8 Step 1), and it is what makes the `AD_COLUMN_COMP_DEPENDENCY` towards `TBAI_SyncInvoice` legal. `CLAUDE.md:270` states the rule: declare the dependency, do not hide a cross-module read inside raw SQL. |
| Oracle portability | **Not applicable.** `com.etendoerp.go` targets PostgreSQL exclusively (`CLAUDE.md:268`). Oracle caveats are not a cost in this module and have been removed from this plan. |

Three findings still drive the implementation:

1. **The synchronous refresh mode means a computation error rolls back the whole business
   transaction.** The computation function must therefore be **total** — it must return a value for
   every input, never raise. This is the single most important design constraint of the change and
   is specified in §5.8.
2. **The dependency wiring must be exact**: which events on `tbai_syncinvoice` dirty the invoice,
   which watched columns matter, and how the target-id resolver maps a sync row back to its
   `c_invoice_id`. Specified in §5.9.
3. **Historical invoices need a backfill** through the *Rebuild Stored Column* process. Specified
   in §8 Step 8.

Also found along the way, and worth its own ticket: **`McpQuerySupport` returns HTTP 500 for a filter
on any `V` column** (runtime-verified, §3.2). That defect does not affect this migration once the
column is `S` — a stored column is a plain physical column — but it still breaks MCP filtering on
`em_etgo_delivery_status` and `em_etgo_due_date` today.

---

## 1. The bug being fixed

`artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx:76-81` injects the TicketBAI column as:

```jsx
if (targets.showTbai) {
  fiscalCols.push({
    key: '_tbaiStatus', type: 'custom', label: tbaiColLabel,
    render: (row) => <FiscalStatusBadge status={row.tbaiSyncEstado ?? 'Pendiente'} />,
  });
}
```

`tbaiSyncEstado` is **not** a column of `c_invoice`. It is injected per-row, server-side, by
`TbaiSyncStatusInjector.inject()` (`com.etendoerp.go/src/com/etendoerp/go/schemaforge/TbaiSyncStatusInjector.java:55`)
called from `SalesInvoiceHeaderHandler.java:198` and — since ETP-5087 — `PurchaseInvoiceHeaderHandler.java:227`.

Because the column is `type: 'custom'` with neither `column` nor `backendFilterKey`, it is dropped
silently by the advanced filter builder
(`node_modules/@etendosoftware/app-shell-core/src/components/contract-ui/AdvancedFilterBuilder.jsx:167-184`):

```js
function isFilterableColumn(col) {
  if (!col?.key) return false;
  if (col.type === 'discarded' || col.type === 'system') return false;
  if (col.filterable === false) return false;
  if (col.type === 'custom' && !col.column && !col.backendFilterKey && col.filterable !== true) {
    return false;
  }
  return true;
}
```

And even if it were offered, the criteria `fieldName` is taken from `col.key`
(`gridQuery.js:578-584`, `getFilteredKey`) — here `_tbaiStatus`, a name that exists nowhere in the
DAL model.

Related history: ETP-4391 (`docs/feedback.md:1328-1341`) documents that this same injector was
silently broken for months on the purchase side, and that the `?? 'Pendiente'` fallback rendered
"no producer is wired" as plausible-looking data.

---

## 2. Decision

> **`Computation_Mode = 'S'` (stored), `Refresh_Mode = 'S'` (synchronous),
> `Computation_Sequence_Number = 10`.**
> A real physical column on `c_invoice`: filterable, sortable, indexable, recomputed inside the same
> transaction that changes its source data, and impossible to break silently the way the injector did.

This is not a per-case judgement — it is the project's **Computed Column Policy**
(`CLAUDE.md:255-270`), which is mandatory:

- `Computation_Mode`: **`S`** by default. `V` only when the value genuinely cannot be stored.
  A TicketBAI status derived from the newest `tbai_syncinvoice` row is perfectly storable.
- `Refresh_Mode`: **`S`** by default. `Q` only for *genuinely heavy or complex* computations, the
  reference case being stock / `m_storage_detail`. A single-row lookup ordered by `created` is the
  cheap per-row function that `S`/`S` exists for. `CLAUDE.md:264` is explicit: do not reach for `Q`
  because the computation "might be slow".

The same policy also settles what the first revision of this plan treated as open questions.
`CLAUDE.md:270`: a computed column reading another module's table **needs that module declared in
`AD_MODULE_DEPENDENCY`** — required for `S`, and "equally real but invisible" for `V`; declare it,
do not hide a cross-module read inside raw SQL. And `CLAUDE.md:268`: the PostgreSQL-only caveat on
synchronous refresh does not apply, because this module targets PostgreSQL exclusively.

`CLAUDE.md:266` names the one fact to design around — not a reason to avoid `S`/`S`: a computation
error in synchronous mode rolls back the whole transaction, so **make the computation function
total**. §5.8 does exactly that.

---

## 3. Background: how computed columns behave in queries (`V` vs `S`)

> **This section no longer gates the decision.** With `Computation_Mode = 'S'` the column is a plain
> physical column on `c_invoice` — no Hibernate formula, no `_computedColumns` proxy entity, no
> special handling anywhere in the query stack. Filtering, sorting and indexing work exactly as they
> do for `DocumentNo`. That is precisely why the policy prefers `S`.
>
> The material below documents the `V` path, kept because (a) it explains why the two existing `V`
> columns in the same grid behave the way they do, and (b) it records a real MCP defect found while
> investigating. **Verification status, stated plainly:** sorting on a `V` column is verified at
> runtime; filtering on a `V` column through the UI path is **NOT VERIFIED** (code reading only);
> filtering on a `V` column through the MCP path is verified **broken**.

### 3.1 Code path — verified

| Layer | Evidence |
|---|---|
| Hibernate mapping | `src/org/openbravo/dal/core/DalMappingGenerator.java:192-204` — every property with `SqlLogic` is removed from the main mapping and emitted in a **separate entity** `<Entity>_ComputedColumns` (`:219-251`), reachable only through the `many-to-one` proxy `_computedColumns` (`:254-264`). Emitted as `formula="…"` at `:292-297`. |
| Proxy property name | `src/org/openbravo/base/model/Entity.java:104` — `COMPUTED_COLUMNS_PROXY_PROPERTY = "_computedColumns"` |
| **Filter (WHERE)** | `modules_core/org.openbravo.service.json/src/org/openbravo/service/json/AdvancedQueryBuilder.java:658-661` — `if (useProperty.isComputedColumn()) useFieldName = "_computedColumns." + useFieldName;` |
| **Sort (ORDER BY)** | same file `:1479-1481` — the prefix is prepended in the `orderBy` branch (a **different** branch from the filter one) |
| Joins / distinct | same file `:1836-1843`, `:1864-1866`, `:271-273` |
| NEO UI list fetch | `NeoCrudHandler.java:258-276` → `handleDefault` → `executeJsonServiceAndBuildResponse` → `jsonService.fetch(params)` (`:529`). The `criteria` param is passed through untouched except for boolean normalization (`:1218-1239`) → `DefaultJsonDataService` → `AdvancedQueryBuilder`. |
| Used in production today | `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx:214` — `{ key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' }`, and `:118-121` `eTGODueDate` with `filterMode: 'date'`. Both are `V` columns and both pass `isFilterableColumn`. |

### 3.2 Runtime verification (MCP `etendo-go-experimental`)

Dataset: 4 sales invoices. `neo_schema` confirms the DAL property names —
`eTGODeliveryStatus` (`em_etgo_delivery_status`, number) and `eTGODueDate` (`em_etgo_due_date`, date).

| Test | Result |
|---|---|
| Baseline `neo_list` (no filter, no order) | 200, `totalRows: 4`, order `10000016, 10000018, 10000019, 10000017` (server default `order by e.id desc`) |
| `orderBy: eTGODueDate` (**`V` column**) | **200 — sort really applied.** Returned `10000018` (the only row with a date, `2026-09-23`) **first**, then the three nulls. Different from baseline, and consistent with `ASC NULLS LAST`. |
| `orderBy: documentNo` (control, plain column) | 200, correctly ascending — proves `orderBy` is honored in general, so the previous row is a real sort and not a coincidence |
| `filters: {eTGODeliveryStatus: {gt: 0}}` (**`V` column**) | **HTTP 500.** `Exception when creating query select e from Invoice as e where ( … and (e.eTGODeliveryStatus > 0) ) …` |
| `filters: {eTGODueDate: {gte: "2026-01-01"}}` (**`V` column**) | **HTTP 500.** `… (e.eTGODueDate >= to_date('2026-01-01','YYYY-MM-DD')) …` |

**Reading of the 500s — this is a THIRD query path, not the UI's.** The failing HQL is hand-built by
`com.etendoerp.go/src/com/etendoerp/go/mcp/McpQuerySupport.java:105-152`, which emits
`e.<propertyName>` with **no** `_computedColumns` handling anywhere in the file. So the MCP failure
does **not** falsify the UI filter path — but it is a real, separate defect worth its own ticket:
**any MCP agent filtering on any `V` column of any spec gets a 500 today.**

**Not verified:** the UI's `criteria` → `DefaultJsonDataService` → `AdvancedQueryBuilder` filter path
could not be exercised at runtime — the MCP does not expose a raw `criteria` passthrough, and I did
not have (and did not pursue) credentials to call `/sws/neo/*` directly. Confidence rests on the
code path in §3.1 plus the runtime proof that **sorting** on a `V` column works. The cheapest human
check is to open the sales-invoice list in the UI and filter by "Estado de entrega".

**NOT VERIFIED, stated explicitly:** that a UI filter on `em_etgo_delivery_status` returns a
correctly reduced row set.

---

## 4. The stored-computed-column engine — what must be declared

Reference: `com.etendoerp.go/docs/STORED-COMPUTED-COLUMNS.md` (673 lines).

**The engine is present in this checkout** (verified):

- Tables: `src-db/database/model/tables/{AD_COLUMN_COMP_DEPENDENCY,AD_COMPDEP_WATCHED_COL,AD_STOREDCOLUMN_DIRTY}.xml`
- `AD_COLUMN` fields: `src-db/database/model/tables/AD_COLUMN.xml:228,232,236,240` —
  `COMPUTATION_FUNCTION`, `REFRESH_MODE`, `COMPUTATION_SEQUENCE_NUMBER`, `COMPUTATION_MODE`
- ModuleScripts: `src-util/modulescript/src/org/openbravo/modulescript/{StoredComputedValidator,StoredComputedValidatorChecks,GenerateStoredComputedTriggers,ValidateStoredComputedColumns,EnforceStoredComputedReadOnly}.java`
- Processes: `src/org/openbravo/erpCommon/ad_process/{StoredColumnQueueProcessor,StoredColumnRebuild,StoredColumnRecomputer}.java`

### 4.1 What a module author declares for an `S` column

1. A physical column in `src-db/database/model/modifiedTables/<TABLE>.xml`
2. `AD_ELEMENT` + `AD_COLUMN` with `COMPUTATION_MODE='S'`, `COMPUTATION_FUNCTION`, `REFRESH_MODE`
   (`S`/`Q`/`M`), `COMPUTATION_SEQUENCE_NUMBER` (default 10), and `SQLLOGIC` **empty** (rule V1)
3. A SQL function in `src-db/database/model/functions/<NAME>.xml`: arity 1 (the target id),
   return type compatible with the column reference, `volatility="STABLE"` (rules V5, V6, V7)
4. At least one `AD_COLUMN_COMP_DEPENDENCY` (rule V8), with exactly one of
   `TARGET_ID_RESOLVER_SQL` / `TARGET_LINK_COLUMN_ID` (rule V11)
5. At least one `AD_COMPDEP_WATCHED_COL` per dependency that has `UPDATE_EVENT='Y'` (rule V9)
6. `./gradlew update.database` (validates V1–V17, generates the `ad_scd_*` triggers, backfills if
   the target table has < 100 000 rows) then `./gradlew export.database`

### 4.2 Refresh modes (doc §4)

| Mode | Drain | Consistency | Notes |
|---|---|---|---|
| `S` | deferred constraint trigger, before COMMIT | transactional, always exact | **The mode chosen here.** Relies on PostgreSQL deferred constraint triggers — not a constraint in this module, which is PostgreSQL-only (`CLAUDE.md:268`) |
| `Q` | background `StoredColumnQueueProcessor` | eventual, bounded by the schedule | needs a Process Request per client, **one drainer per client** |
| `M` | operator runs **Rebuild Stored Column** | only after a manual run | one-off population |

### 4.3 Two corrections to `STORED-COMPUTED-COLUMNS.md`

These were found while verifying the doc against the code and should be fixed in the same change:

- **§8 Step 3 is wrong about watched columns.** The doc presents `Watched_Columns` as a *field* of
  `AD_COLUMN_COMP_DEPENDENCY`. It is not: `src-db/database/model/tables/AD_COLUMN_COMP_DEPENDENCY.xml`
  has no such column. Watched columns are a **child table**,
  `src-db/database/model/tables/AD_COMPDEP_WATCHED_COL.xml`
  (`AD_COLUMN_COMP_DEPENDENCY_ID` + `AD_COLUMN_ID` + `SEQNO` + `AD_MODULE_ID`), and that is how the
  real records in `com.etendoerp.go/src-db/database/sourcedata/AD_COMPDEP_WATCHED_COL.xml` are shaped.
- **§7 overstates the Schema Forge enforcement.** The doc claims `resolve-curated.js` forces
  `readOnly`, `push-to-neo.js` sets `Is_ReadOnly` in `ETGO_SF_FIELD`, and the pipeline validator
  blocks a non-read-only contract field backed by a stored computed column. **None of that exists in
  `@etendosoftware/schema-forge-cli@0.3.47`** — grepping `storedComputed` / `isStoredComputed` in
  `resolve-curated.js`, `push-to-neo.js` and `validate-pipeline.js` returns zero hits. Read-only must
  be set by hand in `decisions.json`.

### 4.4 What the Schema Forge pipeline DOES support

Computed columns are already first-class in the published CLI:

- `node_modules/@etendosoftware/schema-forge-cli/src/extract-fields.js:389-401` — `applyComputationHints()`
  copies `Computation_Mode` → `computedMode`, `Refresh_Mode` → `refreshMode`,
  `Computation_Function` → `computationFunction` whenever the mode is not `'N'`
- `.../resolve-curated.js:275-284` — those three keys are in `FIELD_RAW_COPY_PROPS`
- `.../generate-contract.js:361-375` — `applyComputedHint()` emits
  `computed: { mode: 'stored', refresh: … }` for `computedMode === 'S'`
- `.../extract-fields.js:618` and `:693` — both the AD_Field query and the **orphan-column** query
  select the three computation columns, so **an `AD_FIELD` record is not required**. Confirmed by
  precedent: `em_etgo_delivery_status` has no `AD_FIELD` row anywhere in
  `com.etendoerp.go/src-db/database/sourcedata/AD_FIELD.xml`.

---

## 5. Template XML — a real existing example from this repo

The closest real precedent is `EM_ETGO_Purchase_Price` on `M_Product`
(`AD_TABLE_ID = 208`), a `COMPUTATION_MODE='S'`, `REFRESH_MODE='S'` column. Four of these already
exist in `com.etendoerp.go`:

| Column | Table | Function | Refresh |
|---|---|---|---|
| `EM_ETGO_Purchase_Price` | 208 `M_Product` | `etgo_product_purchase_price` | `S` |
| `EM_ETGO_Sale_Price` | 208 `M_Product` | `etgo_product_sale_price` | `S` |
| `EM_ETGO_Stock` | 208 `M_Product` | `etgo_product_stock` | `Q` |
| `EM_ETGO_Pending_Count` | `B129E53BC0E747879F7BA17F0AECEC32` `FIN_Financial_Account` | `etgo_account_pending_count` | `S` |

### 5.1 Physical column — `src-db/database/model/modifiedTables/M_PRODUCT.xml:8-11`

```xml
<column name="EM_ETGO_PURCHASE_PRICE" primaryKey="false" required="false" type="DECIMAL" autoIncrement="false">
  <default/>
  <onCreateDefault/>
</column>
```

### 5.2 `AD_ELEMENT` — `src-db/database/sourcedata/AD_ELEMENT.xml:2269-2281`

```xml
<AD_ELEMENT>
  <AD_ELEMENT_ID><![CDATA[FE75405A35724F9F810CE0AC5B2CAA9A]]></AD_ELEMENT_ID>
  <AD_CLIENT_ID><![CDATA[0]]></AD_CLIENT_ID>
  <AD_ORG_ID><![CDATA[0]]></AD_ORG_ID>
  <ISACTIVE><![CDATA[Y]]></ISACTIVE>
  <COLUMNNAME><![CDATA[EM_ETGO_Purchase_Price]]></COLUMNNAME>
  <NAME><![CDATA[Purchase Price]]></NAME>
  <PRINTNAME><![CDATA[Purchase Price]]></PRINTNAME>
  <DESCRIPTION><![CDATA[Purchase unit price (PriceStd) of the default purchase price-list version, maintained by Etendo GO.]]></DESCRIPTION>
  <HELP><![CDATA[Read-only value kept up to date by the Etendo GO stored-computed-column engine. Resolves the standard price of the purchase-side (IsSOPriceList=N) default price-list version whose ValidFrom is on or before today, so it can feed list views, sorting and filtering without a per-row fetch.]]></HELP>
  <AD_MODULE_ID><![CDATA[94E1B433CF55451EABB764750AC5902A]]></AD_MODULE_ID>
  <ISGLOSSARY><![CDATA[N]]></ISGLOSSARY>
</AD_ELEMENT>
```

### 5.3 `AD_COLUMN` — `src-db/database/sourcedata/AD_COLUMN.xml:4510-4550`

```xml
<AD_COLUMN>
  <AD_COLUMN_ID><![CDATA[4E5E594900C84D10B02E12D254388499]]></AD_COLUMN_ID>
  <AD_CLIENT_ID><![CDATA[0]]></AD_CLIENT_ID>
  <AD_ORG_ID><![CDATA[0]]></AD_ORG_ID>
  <ISACTIVE><![CDATA[Y]]></ISACTIVE>
  <NAME><![CDATA[EM_ETGO_Purchase_Price]]></NAME>
  <COLUMNNAME><![CDATA[EM_ETGO_Purchase_Price]]></COLUMNNAME>
  <AD_TABLE_ID><![CDATA[208]]></AD_TABLE_ID>
  <AD_REFERENCE_ID><![CDATA[12]]></AD_REFERENCE_ID>
  <FIELDLENGTH><![CDATA[22]]></FIELDLENGTH>
  <ISKEY><![CDATA[N]]></ISKEY>
  <ISPARENT><![CDATA[N]]></ISPARENT>
  <ISMANDATORY><![CDATA[N]]></ISMANDATORY>
  <ISUPDATEABLE><![CDATA[N]]></ISUPDATEABLE>
  <ISIDENTIFIER><![CDATA[N]]></ISIDENTIFIER>
  <SEQNO><![CDATA[991]]></SEQNO>
  <ISTRANSLATED><![CDATA[N]]></ISTRANSLATED>
  <ISENCRYPTED><![CDATA[N]]></ISENCRYPTED>
  <ISSELECTIONCOLUMN><![CDATA[N]]></ISSELECTIONCOLUMN>
  <AD_ELEMENT_ID><![CDATA[FE75405A35724F9F810CE0AC5B2CAA9A]]></AD_ELEMENT_ID>
  <ISSESSIONATTR><![CDATA[N]]></ISSESSIONATTR>
  <ISSECONDARYKEY><![CDATA[N]]></ISSECONDARYKEY>
  <ISDESENCRYPTABLE><![CDATA[N]]></ISDESENCRYPTABLE>
  <DEVELOPMENTSTATUS><![CDATA[RE]]></DEVELOPMENTSTATUS>
  <AD_MODULE_ID><![CDATA[94E1B433CF55451EABB764750AC5902A]]></AD_MODULE_ID>
  <POSITION><![CDATA[991]]></POSITION>
  <ISTRANSIENT><![CDATA[N]]></ISTRANSIENT>
  <ISAUTOSAVE><![CDATA[Y]]></ISAUTOSAVE>
  <VALIDATEONNEW><![CDATA[Y]]></VALIDATEONNEW>
  <IMAGESIZEVALUESACTION><![CDATA[N]]></IMAGESIZEVALUESACTION>
  <ISUSEDSEQUENCE><![CDATA[N]]></ISUSEDSEQUENCE>
  <ALLOWSORTING><![CDATA[Y]]></ALLOWSORTING>
  <ALLOWFILTERING><![CDATA[Y]]></ALLOWFILTERING>
  <ALLOWED_CROSS_ORG_LINK><![CDATA[N]]></ALLOWED_CROSS_ORG_LINK>
  <IS_CHILD_PROPERTY_IN_PARENT><![CDATA[N]]></IS_CHILD_PROPERTY_IN_PARENT>
  <COMPUTATION_FUNCTION><![CDATA[etgo_product_purchase_price]]></COMPUTATION_FUNCTION>
  <REFRESH_MODE><![CDATA[S]]></REFRESH_MODE>
  <COMPUTATION_SEQUENCE_NUMBER><![CDATA[10]]></COMPUTATION_SEQUENCE_NUMBER>
  <COMPUTATION_MODE><![CDATA[S]]></COMPUTATION_MODE>
</AD_COLUMN>
```

### 5.4 `AD_COLUMN_COMP_DEPENDENCY` — `src-db/database/sourcedata/AD_COLUMN_COMP_DEPENDENCY.xml:136-153`

```xml
<AD_COLUMN_COMP_DEPENDENCY>
  <AD_COLUMN_COMP_DEPENDENCY_ID><![CDATA[CF0B4512A549407FA2937F8E1BF1B141]]></AD_COLUMN_COMP_DEPENDENCY_ID>
  <AD_CLIENT_ID><![CDATA[0]]></AD_CLIENT_ID>
  <AD_ORG_ID><![CDATA[0]]></AD_ORG_ID>
  <ISACTIVE><![CDATA[Y]]></ISACTIVE>
  <CREATED><![CDATA[2026-07-23 18:20:02.879868]]></CREATED>
  <CREATEDBY><![CDATA[0]]></CREATEDBY>
  <UPDATED><![CDATA[2026-07-23 18:20:02.879868]]></UPDATED>
  <UPDATEDBY><![CDATA[0]]></UPDATEDBY>
  <AD_COLUMN_ID><![CDATA[E307979CE47A48BAAA63F411BDBD0A29]]></AD_COLUMN_ID>
  <AD_MODULE_ID><![CDATA[94E1B433CF55451EABB764750AC5902A]]></AD_MODULE_ID>
  <SEQNO><![CDATA[10]]></SEQNO>
  <SOURCE_TABLE_ID><![CDATA[295]]></SOURCE_TABLE_ID>
  <INSERT_EVENT><![CDATA[Y]]></INSERT_EVENT>
  <UPDATE_EVENT><![CDATA[Y]]></UPDATE_EVENT>
  <DELETE_EVENT><![CDATA[Y]]></DELETE_EVENT>
  <TARGET_ID_RESOLVER_SQL><![CDATA[SELECT DISTINCT pp.m_product_id FROM m_productprice pp WHERE pp.m_pricelist_version_id = NEW.m_pricelist_version_id OR pp.m_pricelist_version_id = OLD.m_pricelist_version_id]]></TARGET_ID_RESOLVER_SQL>
</AD_COLUMN_COMP_DEPENDENCY>
```

### 5.5 `AD_COMPDEP_WATCHED_COL` — `src-db/database/sourcedata/AD_COMPDEP_WATCHED_COL.xml:3-16`

```xml
<AD_COMPDEP_WATCHED_COL>
  <AD_COMPDEP_WATCHED_COL_ID><![CDATA[0C090940A3BF4CE586C40C92BB639E58]]></AD_COMPDEP_WATCHED_COL_ID>
  <AD_CLIENT_ID><![CDATA[0]]></AD_CLIENT_ID>
  <AD_ORG_ID><![CDATA[0]]></AD_ORG_ID>
  <ISACTIVE><![CDATA[Y]]></ISACTIVE>
  <CREATED><![CDATA[2026-07-23 18:20:02.879868]]></CREATED>
  <CREATEDBY><![CDATA[0]]></CREATEDBY>
  <UPDATED><![CDATA[2026-07-27 09:40:04.356]]></UPDATED>
  <UPDATEDBY><![CDATA[0]]></UPDATEDBY>
  <AD_COLUMN_COMP_DEPENDENCY_ID><![CDATA[CF0B4512A549407FA2937F8E1BF1B141]]></AD_COLUMN_COMP_DEPENDENCY_ID>
  <AD_COLUMN_ID><![CDATA[2997]]></AD_COLUMN_ID>
  <SEQNO><![CDATA[20]]></SEQNO>
  <AD_MODULE_ID><![CDATA[94E1B433CF55451EABB764750AC5902A]]></AD_MODULE_ID>
</AD_COMPDEP_WATCHED_COL>
```

### 5.6 A computation function — `src-db/database/model/functions/ETGO_ACCOUNT_PENDING_COUNT.xml`

The closest analogue in shape (a value derived from another table, per target record):

```xml
<?xml version="1.0"?>
  <database name="FUNCTION ETGO_ACCOUNT_PENDING_COUNT">
    <function name="ETGO_ACCOUNT_PENDING_COUNT" type="NUMERIC" volatility="STABLE">
      <parameter name="p_fin_financial_account_id" type="VARCHAR" mode="in">
        <default/>
      </parameter>
      <body><![CDATA[v_bank NUMBER;
v_cash NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_bank
  FROM   fin_bankstatementline bsl
  JOIN   fin_bankstatement bs ON bs.fin_bankstatement_id = bsl.fin_bankstatement_id
  WHERE  bs.fin_financial_account_id = p_fin_financial_account_id
    AND  bsl.fin_finacc_transaction_id IS NULL
    AND  bsl.isactive = 'Y'
    AND  bs.isactive  = 'Y';
  ...
  RETURN COALESCE(v_bank, 0) + COALESCE(v_cash, 0);
END ETGO_ACCOUNT_PENDING_COUNT
]]></body>
    </function>
  </database>
```

### 5.7 Concrete values for the TBAI case

| Datum | Verified value |
|---|---|
| Target table `C_Invoice` | `AD_TABLE_ID = 318` |
| Source table `TBAI_SyncInvoice` | `AD_TABLE_ID = CA28C1BA7831461E860E468010C92A08` (`com.smf.ticketbai/src-db/database/sourcedata/AD_TABLE.xml:8-10`) |
| Watched column `Estado` | `AD_COLUMN_ID = 7075587E27424353B3FC6E42F6C8D187`, `AD_REFERENCE_ID = 10` (`com.smf.ticketbai/src-db/database/sourcedata/AD_COLUMN.xml:1150-1160`) |
| Module `com.etendoerp.go` | `AD_MODULE_ID = 94E1B433CF55451EABB764750AC5902A` |
| Target-id resolver | `SELECT COALESCE(NEW.c_invoice_id, OLD.c_invoice_id)` — the FK is immutable, so the `COALESCE` pattern applies (doc §5) |
| New UUIDs | **`make uuid` is mandatory.** Never hand-type or copy an Etendo id. |

### 5.8 The computation function — and why it must be TOTAL

**This is the most important part of the change.** In `Refresh_Mode = 'S'`, the recompute runs inside
the business transaction, immediately before COMMIT (doc §5, §15 Q1). Per doc §4 and `CLAUDE.md:266`:
*a computation error rolls back the entire transaction.*

Concretely: `tbai_syncinvoice` is written by TicketBAI in the same transaction that completes or
sends an invoice. If `ETGO_GET_TBAI_STATUS` raised for any reason, **the invoice itself would fail to
save**. An invoice that cannot be saved because computing its fiscal *display status* failed is far
worse than the filtering bug this plan fixes. The function must therefore be **total**: defined for
every possible input, returning a value in all cases, raising never.

`com.etendoerp.go/src-db/database/model/functions/ETGO_GET_TBAI_STATUS.xml`:

```xml
<?xml version="1.0"?>
  <database name="FUNCTION ETGO_GET_TBAI_STATUS">
    <function name="ETGO_GET_TBAI_STATUS" type="VARCHAR" volatility="STABLE">
      <parameter name="p_c_invoice_id" type="VARCHAR" mode="in">
        <default/>
      </parameter>
      <body><![CDATA[v_estado character varying;
BEGIN
  -- TOTAL FUNCTION. Refresh_Mode = 'S' runs this inside the business transaction,
  -- so ANY exception raised here rolls back the invoice save itself. Every edge
  -- case below must therefore resolve to a value, never to an error.

  -- Edge case 1 - null/blank target id. Cannot happen through the engine (it
  -- always passes a PK), but a NULL argument must not propagate as a NULL-handling
  -- surprise: answer the "no submission" state explicitly.
  IF p_c_invoice_id IS NULL THEN
    RETURN 'Pendiente';
  END IF;

  -- Edge case 2 - invoice with NO row in tbai_syncinvoice (never submitted, or
  -- TicketBAI simply not used for this invoice). SELECT ... INTO in PL/pgSQL
  -- assigns NULL for zero rows and does NOT raise (unlike SELECT ... INTO STRICT,
  -- which raises NO_DATA_FOUND - deliberately not used here).
  -- Edge case 3 - SEVERAL rows, including several sharing the same `created`
  -- timestamp. LIMIT 1 makes the result single-valued no matter how many rows
  -- match, so the multi-row case cannot raise TOO_MANY_ROWS. The tie-break on
  -- tbai_syncinvoice_id makes the choice DETERMINISTIC rather than arbitrary,
  -- which matters because the engine writes the value unconditionally on every
  -- recompute: without it, two recomputes of unchanged data could store different
  -- values and ad_scd_check would report permanent phantom drift.
  SELECT s.estado
    INTO v_estado
    FROM tbai_syncinvoice s
   WHERE s.c_invoice_id = p_c_invoice_id
   ORDER BY s.created DESC, s.tbai_syncinvoice_id DESC
   LIMIT 1;

  -- Edge case 4 - a row exists but ESTADO is NULL (the column is nullable, and a
  -- row is created before the response is parsed - see SynchronizeUtils.java:374-385,
  -- which builds the row first and sets ESTADO only in determineInvoiceState).
  -- Same answer as "no row": submission not resolved yet.
  IF v_estado IS NULL OR btrim(v_estado) = '' THEN
    RETURN 'Pendiente';
  END IF;

  -- Edge case 5 - an UNEXPECTED status value (TicketBAI adds a new state, or a
  -- tenant has legacy data). Pass it through UNCHANGED rather than mapping it to
  -- a known state or raising. The frontend badge already degrades gracefully:
  -- FiscalStatusBadge.jsx:59-60 renders any unmapped value as its raw text with a
  -- neutral tone. Normalising here would invent information; raising would block
  -- the save. Passing through is the only option that neither lies nor breaks.
  RETURN v_estado;

-- Belt and braces. Nothing above should be able to raise, but an unforeseen
-- runtime error (a type change in a future TicketBAI version, say) must not take
-- the invoice down with it. Degrading to the "unknown" state keeps writes working;
-- the wrong badge is visible and recoverable, a failed save is not.
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'Pendiente';
END ETGO_GET_TBAI_STATUS
]]></body>
    </function>
  </database>
```

Notes on the declaration itself:

- `volatility="STABLE"` — required by validator rule V7 (`VOLATILE` is rejected); the function is a
  pure read.
- Arity 1, `VARCHAR` in / `VARCHAR` out — rules V5 and V6, matching `AD_REFERENCE_ID = 10` (String)
  on the column.
- **No `to_regclass` guard and no dynamic `EXECUTE`.** Both were only needed to survive a tenant
  without TicketBAI installed; with the module dependency declared (§8 Step 1) the table always
  exists. A plain static `SELECT` is simpler and lets PostgreSQL plan it properly. See §7 for the
  historical note.
- Returning the literal `'Pendiente'` puts the frontend's former fallback into the database, which
  is what makes the column self-describing: `'Pendiente'` now means "no resolved submission",
  authored in one place instead of being invented by a `??` in two JSX files.

### 5.9 Dependency wiring — events, watched columns, resolver

One `AD_COLUMN_COMP_DEPENDENCY` row, source table `TBAI_SyncInvoice`
(`AD_TABLE_ID = CA28C1BA7831461E860E468010C92A08`):

| Field | Value | Why |
|---|---|---|
| `SOURCE_TABLE_ID` | `CA28C1BA7831461E860E468010C92A08` | `TBAI_SyncInvoice` — legal only once the module dependency of §8 Step 1 exists |
| `INSERT_EVENT` | **`Y`** | The first submission creates the row. This is the event that moves an invoice off `'Pendiente'`. |
| `UPDATE_EVENT` | **`Y`** | `SynchronizeUtils.determineInvoiceState` (`:382-390`) sets `ESTADO` on an existing row, so the state transition `NULL → Recibido/Rechazado` is an UPDATE, not an INSERT. Omitting this event would freeze every invoice at `'Pendiente'`. |
| `DELETE_EVENT` | **`Y`** | Removing the newest sync row must fall back to the previous one, or to `'Pendiente'` if none remains. Without it the column would keep a value whose source no longer exists. |
| Watched columns (`AD_COMPDEP_WATCHED_COL`) | **`Estado`** (`AD_COLUMN_ID = 7075587E27424353B3FC6E42F6C8D187`) | Required by rule V9 for any UPDATE dependency. `Estado` is the only column the function reads whose change can alter the result. `Descripcion` is not read; `Created` is not updated after insert. Watching only `Estado` means an unrelated UPDATE on the sync row enqueues nothing (doc §5, phase 1). |
| `TARGET_ID_RESOLVER_SQL` | `SELECT COALESCE(NEW.c_invoice_id, OLD.c_invoice_id)` | Maps the changed sync row back to its invoice. The `COALESCE` form is the doc §5 "Pattern 1 — single, immutable target": `NEW` on insert/update, `OLD` on delete. |
| `SEQNO` | `10` | Only one dependency row; ordering is irrelevant. |

**Why `COALESCE` and not the `UNION` reparenting form.** Doc §5 requires `UNION` when the FK to the
target can be *reassigned* on update — a line moved to another parent leaves two stale aggregates.
That cannot happen here: `TBAI_SYNCINVOICE.C_INVOICE_ID` is `required="true"`
(`TBAI_SYNCINVOICE.xml:44`) and nothing in `com.smf.ticketbai` re-points an existing sync row at a
different invoice — `SynchronizeUtils.createTbaiSyncInvoice` (`:374-379`) sets the invoice once at
construction. **NOT VERIFIED** by exhaustive audit of the TicketBAI module; if a re-pointing path is
ever found, the resolver must switch to the `UNION` form.

**Watched columns and rule V9.** The `Estado` row goes in `AD_COMPDEP_WATCHED_COL`, the child table —
not in a `Watched_Columns` field, which does not exist. See §4.3.

### 5.10 Historical note — the `to_regclass` guard (no longer needed)

The first revision of this plan proposed a `V`/`SQLLogic` column whose function opened with a
`to_regclass('tbai_syncinvoice') IS NULL` guard and a dynamic `EXECUTE … USING`, so that a tenant
without TicketBAI would degrade to `NULL` instead of breaking every invoice list query.

**That guard is now unnecessary and has been removed from the design.** With `com.smf.ticketbai`
declared in `AD_MODULE_DEPENDENCY` (§8 Step 1), the table is guaranteed to exist wherever
`com.etendoerp.go` is installed. Recorded here only so the reasoning is not rediscovered: the guard
was a workaround for an *undeclared* dependency, and `CLAUDE.md:270` says to declare the dependency
instead of hiding a cross-module read inside raw SQL.

### 5.11 The `AD_COLUMN` values for this change

Physical column, `src-db/database/model/modifiedTables/C_INVOICE.xml` (added alongside the two
columns already there):

```xml
<column name="EM_ETGO_TBAI_STATUS" primaryKey="false" required="false" type="VARCHAR" size="10" autoIncrement="false">
  <default/>
  <onCreateDefault/>
</column>
```

`AD_COLUMN` — same shape as §5.3, with these values:

| Field | Value |
|---|---|
| `COLUMNNAME` | `EM_ETGO_Tbai_Status` |
| `AD_TABLE_ID` | `318` (`C_Invoice`) |
| `AD_REFERENCE_ID` | `10` (String) |
| `FIELDLENGTH` | `10` (matches `TBAI_SYNCINVOICE.ESTADO`; see §9-R6) |
| `ISUPDATEABLE` | `N` |
| `ALLOWSORTING` / `ALLOWFILTERING` | `Y` / `Y` |
| `COMPUTATION_MODE` | **`S`** |
| `COMPUTATION_FUNCTION` | `etgo_get_tbai_status` |
| `REFRESH_MODE` | **`S`** |
| `COMPUTATION_SEQUENCE_NUMBER` | `10` |
| `SQLLOGIC` | **empty** — a stored column carrying both is a hard error (rule V1) |

No `AD_FIELD` record is needed (§4.4).

---

## 6. `tbai_syncinvoice` — schema and current semantics

`modules/com.smf.ticketbai/src-db/database/model/tables/TBAI_SYNCINVOICE.xml`

| Column | Type | Note |
|---|---|---|
| `TBAI_SYNCINVOICE_ID` | VARCHAR(32) | PK |
| `ESTADO` | VARCHAR(10), **nullable** | the status |
| `DESCRIPCION` | VARCHAR(20) | `"00"` success / `"01"` failure |
| `C_INVOICE_ID` | VARCHAR(32), **required** | FK `TBAI_SYNCINVOICE_INVOICEID` (`:54-56`) |
| `CREATED` | TIMESTAMP | the "latest" discriminator |

**Possible `ESTADO` values** — there is no check constraint; the values come only from code:

- `"Recibido"` / `"Rechazado"` — `com.smf.ticketbai/src/com/smf/ticketbai/utils/SynchronizeUtils.java:385`
- `"Error"` — `com.smf.ticketbai/src/com/smf/ticketbai/hooks/ProcessInvoiceTbaiHook.java:51,164`
- constants at `com.smf.ticketbai/src/com/smf/ticketbai/utils/TbaiConstants.java:50,51,53`
- `"Pendiente"` and `"Enviada"` are **frontend-only fallbacks** and never appear in the database

**Current "latest row per invoice" logic** — `TbaiSyncStatusInjector.java:96-104`:

```sql
SELECT c_invoice_id, estado FROM (
  SELECT c_invoice_id, estado,
    ROW_NUMBER() OVER (PARTITION BY c_invoice_id ORDER BY created DESC) AS rn
  FROM tbai_syncinvoice
  WHERE c_invoice_id IN (:invoiceIds)
) t WHERE rn = 1
```

One round trip for the whole page. A `V` column replaces this with **N** per-row subqueries.

**⚠️ There is no index on `tbai_syncinvoice.c_invoice_id`** — only the foreign key (`:54-56`), and
PostgreSQL does not index FKs automatically. Added in §8 Step 6: it is what makes each recompute an
index lookup instead of a scan, and it is validator rule V16.

---

## 7. The module boundary — resolved by declaring the dependency

**Resolution: `com.etendoerp.go` declares a module dependency on `com.smf.ticketbai`.** The human
confirms Etendo GO is always deployed together with TicketBAI, so the dependency reflects reality
rather than adding a constraint. This is also what `CLAUDE.md:270` mandates:

> A computed column that reads a table from **another module** needs that module declared in
> `AD_MODULE_DEPENDENCY` — required for `S` (an `AD_COLUMN_COMP_DEPENDENCY` cannot point at an
> undeclared module's table), and equally real but invisible for `V`. Declare the dependency; do not
> hide a cross-module read inside raw SQL.

Current state, verified: `com.etendoerp.go/src-db/database/sourcedata/AD_MODULE_DEPENDENCY.xml`
declares four dependencies — Core (`0`), *Etendo Go - Spanish Fiscal Taxes Data*
(`E727AB0AF0924E719D425AF685AD28E1`), *OpenAPI Implementation*
(`E692D086EFC140F488614A2C8ACE1764`) and *Extended Database Utilities*
(`502453E6AD584DF4A0527C156FA0E800`). **TicketBAI is not among them.** Adding it is §8 Step 1, and
it is the step that makes everything downstream legal.

Once declared, the consequences of the analysis below invert: the dependency is visible to the
module system, `update.database` can resolve the `AD_TABLE` foreign key, and no `to_regclass` guard
is needed because the table is guaranteed to exist.

### 7.1 Why this mattered (retained analysis)

**Answer to "does `V` also cross the module boundary?" — yes, and there is no precedent for it here.**

`S` declares the dependency in AD metadata: `AD_COLUMN_COMP_DEPENDENCY.SOURCE_TABLE_ID` is a real
foreign key (`AD_COLCOMP_DEP_SOURCE_TBL` → `AD_TABLE`). On a tenant without TicketBAI that row
cannot be imported, so `com.etendoerp.go` would have to declare a module dependency on
`com.smf.ticketbai` — making a paid/optional fiscal module a hard requirement of Etendo GO. Its
`AD_MODULE_DEPENDENCY.xml` declares four dependencies and none is TicketBAI.

`V` moves the same dependency into the function body, where it is **not declared anywhere**. It
becomes a real dependency that no tool can see:

- **No precedent.** Every SQL function in `com.etendoerp.go/src-db/database/model/functions/`
  (`ETGO_GET_DELIVERY_STATUS`, `ETGO_GET_DUE_DATE`, `ETGO_GET_LOCATION`,
  `ETGO_ACCOUNT_PENDING_COUNT`, `ETGO_PRODUCT_PURCHASE_PRICE`, `ETGO_PRODUCT_SALE_PRICE`,
  `ETGO_PRODUCT_STOCK`) reads **only core tables**: `c_invoiceline`, `m_matchinv`, `m_matchsi`,
  `fin_payment_schedule`, `c_bpartner_location`, `fin_bankstatement*`, `fin_finacc_transaction`,
  `fin_financial_account`, `m_pricelist*`, `m_productprice`, `m_storage_detail`.
- Across **all** modules in the checkout there are eight `SQLLogic` expressions in total. Two read
  `ad_orginfo` (core), two read `etcop_app_info` (owned by the same module that declares them), one
  reads `aeatsii_conexion` (owned by `org.openbravo.module.sii`, the same module that declares the
  column), three are the Etendo GO functions above. **Not one crosses a module boundary.**
- **The codebase already has an established, opposite convention for this exact problem.**
  `com.etendoerp.go/src/com/etendoerp/go/schemaforge/SifSubRecordAttachments.java:50` states it
  outright: each fiscal lookup "is independent and fails safely: if a fiscal module is not installed
  the underlying table does not exist". `TbaiSyncStatusInjector.java:71-73` implements the same
  contract with an explicit `catch (SQLGrammarException)` that logs at DEBUG and returns the
  response unmodified. Deleting the injector in favour of AD metadata **reverses a deliberate
  architectural decision**, it does not merely refactor it.

The `to_regclass` guard in §5.8 restores the graceful degradation the injector had. It is a sound
mitigation — but it is a new pattern in this codebase, not an existing one, and it is PostgreSQL-only.

**Resolved.** The dependency is declared (§7 above), so the "undeclared" objection disappears: with
`S` the dependency lives in AD metadata where the module system can see it, which is the outcome
`CLAUDE.md:270` asks for. The `V` variant's undeclared raw-SQL read — the part with zero precedent —
is not being adopted.

---

## 8. Migration steps

All open decisions are closed (§0), so the plan is executable. Steps are ordered by dependency — each
one is only legal once the previous ones are in place.

### Step 0 — Informative check (not a blocker)

No longer a gate on the design: with `S` the column is a plain physical column, so its filterability
is not in question. Worth doing anyway, because it costs two minutes and tells us whether the two
existing `V` columns in the same grid behave correctly:

1. Open the **sales invoice** list, filter on **"Estado de entrega"** (`em_etgo_delivery_status`).
2. Confirm the row count changes versus the unfiltered list and that returned rows satisfy the
   condition — a 200 with every row still present means the criteria was silently ignored, the same
   failure mode as ETP-4391.
3. Sort by it ascending and descending.

If it fails, it does **not** block this plan; it opens a separate bug about the two `V` columns
already shipped, alongside the MCP defect in Step 13.

### Repo `com.etendoerp.go`

1. **Declare the module dependency** — the step that unblocks everything else. Add an
   `AD_MODULE_DEPENDENCY` row to `src-db/database/sourcedata/AD_MODULE_DEPENDENCY.xml`:
   `AD_MODULE_ID = 94E1B433CF55451EABB764750AC5902A` (Etendo GO),
   `AD_DEPENDENT_MODULE_ID = FBE9C48778FC42638F71AAB355EBEE02` (*TicketBAI Integration*, current
   version `3.1.0`), `DEPENDANT_MODULE_NAME = TicketBAI Integration`, `ISINCLUDED = N`,
   `DEPENDENCY_ENFORCEMENT = MAJOR`, `STARTVERSION` per the minimum supported TicketBAI release
   (`3.0.0` unless the human specifies otherwise). Copy the shape of the existing row at
   `AD_MODULE_DEPENDENCY.xml:3-16`. New `AD_MODULE_DEPENDENCY_ID` via `make uuid`.
2. **Create the computation function** — `src-db/database/model/functions/ETGO_GET_TBAI_STATUS.xml`,
   verbatim from §5.8. Review the totality argument before moving on; it is the part that can break
   invoice saves if it is wrong.
3. **Add the physical column** — `EM_ETGO_TBAI_STATUS VARCHAR(10)` in
   `src-db/database/model/modifiedTables/C_INVOICE.xml` (§5.11).
4. **Add `AD_ELEMENT` + `AD_COLUMN`** — `AD_ELEMENT` for `EM_ETGO_Tbai_Status` in
   `src-db/database/sourcedata/AD_ELEMENT.xml`; `AD_COLUMN` in
   `src-db/database/sourcedata/AD_COLUMN.xml` with the values tabulated in §5.11
   (`COMPUTATION_MODE=S`, `COMPUTATION_FUNCTION=etgo_get_tbai_status`, `REFRESH_MODE=S`,
   `COMPUTATION_SEQUENCE_NUMBER=10`, **empty `SQLLOGIC`**). New ids via `make uuid`.
5. **Declare the dependency and its watched column** — one `AD_COLUMN_COMP_DEPENDENCY` row and one
   `AD_COMPDEP_WATCHED_COL` row, exactly as specified in §5.9 (source `TBAI_SyncInvoice`,
   insert/update/delete all `Y`, watched column `Estado`, resolver
   `SELECT COALESCE(NEW.c_invoice_id, OLD.c_invoice_id)`). New ids via `make uuid`.
6. **Add an index on `tbai_syncinvoice.c_invoice_id`** — validator rule V16 flags a missing
   supporting index as a SOFT warning, and both the trigger's resolver and the computation function
   scan by this column (§6). Cheap, and it removes the only real performance concern.
7. **Build** — the human runs `./gradlew update.database`, then `./gradlew export.database`.
   `update.database` validates V1–V17, generates the `ad_scd_*` triggers, and — because this is a
   *first activation* — backfills existing rows inline if `c_invoice` has fewer than 100 000 rows.
8. **Backfill historical invoices** — see the sizing note below. If Step 7's inline backfill did not
   run (over the threshold), run the **Rebuild Stored Column** AD process
   (`Value = StoredColumnRebuild`, `AD_Process_ID = DA0CCF7EF06F46588AD5E7EF5073FC81`). Then verify
   with `SELECT ad_scd_check('<AD_Column_ID>');`, which must return `0` stale rows.
9. **Delete the injector** — `src/com/etendoerp/go/schemaforge/TbaiSyncStatusInjector.java`.
10. **Unwire it** — remove `TbaiSyncStatusInjector.inject(dataArr);` from
    `SalesInvoiceHeaderHandler.java:198` and `PurchaseInvoiceHeaderHandler.java:227`, plus imports.
11. **Delete its tests** — `src-test/src/com/etendoerp/go/schemaforge/TbaiSyncStatusInjectorTest.java`
    (241 lines) and `TbaiSyncStatusInjectorIntegrationTest.java` (125 lines).
12. **Rewrite, do not delete** the `afterHandle — tbaiSyncEstado injection (ETP-5087)` block of
    `PurchaseInvoiceHeaderHandlerTest.java:294-360` so it asserts the column arrives via the
    contract instead of mocking the injector (coverage gate).
13. **Fix the docs** — the two errors in `docs/STORED-COMPUTED-COLUMNS.md` (§4.3). And open a
    **separate** ticket for the MCP defect (§3.2): `McpQuerySupport.java:105-152` must prefix
    computed-column properties with `_computedColumns.` (mirroring
    `AdvancedQueryBuilder.java:658-661`) or return a 400 instead of a 500.

#### Backfill sizing (Step 8)

Cost is driven by the row count of `c_invoice`, not of `tbai_syncinvoice`: `ad_scd_rebuild` iterates
**every row of the target table** and calls the function once per row (doc §15 Q3), so a tenant with
few sync rows but many invoices still pays per invoice.

| `c_invoice` rows | What happens | Action |
|---|---|---|
| < 100 000 (`LARGE_TABLE_THRESHOLD`) | `update.database` rebuilds inline, in-build | Nothing — Step 7 covers it |
| ≥ 100 000 | The build logs a WARN and enqueues a per-client sentinel instead of blocking | Run **Rebuild Stored Column** once, off-hours |

With the index from Step 6 each per-row call is an index lookup plus a `LIMIT 1`, so the rebuild is
roughly linear and cheap per row; without it, each call scans `tbai_syncinvoice`. Prefer the AD
process over raw `SELECT ad_scd_rebuild(...)` on a multi-client tenant: the process is client-scoped
(a System caller rebuilds all clients), whereas the raw SQL function touches every row with no client
filter (doc §15 Q3). Both are idempotent and safe to re-run.

**NOT VERIFIED:** the actual row counts of `c_invoice` and `tbai_syncinvoice` in the target
environments — the sizing above is a decision table, not a measurement.

### Repo `schema_forge`

14. `artifacts/sales-invoice/decisions.json` — promote the new field to
    `{ "visibility": "readOnly", "grid": true, "gridOrder": N, "form": false }` and add
    `labelOverrides.es_ES` / `.en_US` for `em_etgo_tbai_status`. Same in
    `artifacts/purchase-invoice/decisions.json`.
14. `make regen ONLY=sales-invoice,purchase-invoice` (a full re-extract is required — there is a new
    AD column), then run Step 3 of the Window Change Integrity Protocol to verify contract integrity.
16. `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx:76-81` — replace the synthetic column:
    ```jsx
    key: 'eTGOTbaiStatus', column: 'em_etgo_tbai_status', type: 'custom',
    filterMode: 'text', label: tbaiColLabel,
    render: (row) => <FiscalStatusBadge status={row.eTGOTbaiStatus ?? 'Pendiente'} />,
    ```
    `filterMode` is honored first by `resolveFilterMode` (`gridQuery.js:441`) and ignored by
    `DataTable` — the same technique already used at `:118-121` for `eTGODueDate`.
17. `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx:101-118` —
    same change, **keeping the fallback**:
    `row.eTGOTbaiStatus ?? (isSent(row.tbaiIssent) ? 'Enviada' : 'Pendiente')` (§10).
18. Update the tests that mock `tbaiSyncEstado` in the NEO response — it now arrives as a contract
    field: `artifacts/sales-invoice/custom/__tests__/InvoiceHeaderTable.test.js` (2 refs),
    `tools/app-shell/src/windows/custom/purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.vitest.jsx`
    (8 refs), `artifacts/purchase-invoice/__tests__/contract-integrity.test.js` (7 refs),
    `e2e/tests/flows/purchase-invoice-batuz-column.mocked.spec.js` (6 refs). Delegate to Tester.
19. Add a regression test that guards the defect that motivated this: the column passes
    `isFilterableColumn` (it has `column`) and the emitted criteria `fieldName` is the DAL property,
    not `_tbaiStatus`.
20. Update `docs/generated-custom-windows/sales-invoice.md` and `purchase-invoice.md` (atomic
    documentation policy) and close out the ETP-4391 entry in `docs/feedback.md:1328-1341`.

---

## 9. Risks

All human decisions are closed — see §0. What remains are implementation risks.

**R1 — A computation error rolls back the invoice save. THE risk of this change.**
`Refresh_Mode = 'S'` recomputes inside the business transaction, so a raise in
`ETGO_GET_TBAI_STATUS` aborts whatever write dirtied the row — including the TicketBAI submission
that writes `tbai_syncinvoice` in the first place. `CLAUDE.md:266` names this as the fact to design
around rather than a reason to downgrade to `Q`. Mitigation is the total function in §5.8: zero rows
answers `'Pendiente'` (plain `SELECT … INTO`, never `INTO STRICT`), several rows are collapsed by
`LIMIT 1` with a deterministic tie-break, a NULL/blank `ESTADO` answers `'Pendiente'`, an unknown
status value passes through unchanged, and a catch-all `WHEN OTHERS` returns `'Pendiente'` rather
than letting anything escape. **This function must be reviewed as the highest-risk artefact of the
change, and it needs its own SQL test covering all five edge cases.**

**R2 — A missed event freezes the column, silently.** If `UPDATE_EVENT` were left `N`, every invoice
would stick at `'Pendiente'` forever, because TicketBAI sets `ESTADO` on an already-inserted row
(`SynchronizeUtils.java:382-390`) — an UPDATE, not an INSERT. That is exactly the ETP-4391 failure
shape: plausible-looking data, nothing visibly broken. §5.9 specifies insert + update + delete, all
`Y`, watching `Estado`. Verify after deployment with `SELECT ad_scd_check('<AD_Column_ID>');` — it
returns the number of rows whose stored value differs from a fresh computation, and it must be `0`.

**R3 — Deterministic tie-break is not optional.** `ad_scd_recompute` writes the value
**unconditionally** on every recompute, with no `IS DISTINCT FROM` guard (doc §15 Q1). If the
function could return different values for unchanged data — which a bare `ORDER BY created DESC
LIMIT 1` can, when two rows share a `created` timestamp — the column would flap and `ad_scd_check`
would report phantom drift forever. The `, s.tbai_syncinvoice_id DESC` tie-break in §5.8 is what
prevents this.

**R4 — Reparenting assumption.** The `COALESCE` resolver is correct only while a sync row's
`C_INVOICE_ID` never changes. `TBAI_SYNCINVOICE.C_INVOICE_ID` is `required="true"` and
`SynchronizeUtils.createTbaiSyncInvoice` (`:374-379`) sets the invoice once at construction.
**NOT VERIFIED** by an exhaustive audit of `com.smf.ticketbai`. If a re-pointing path exists, the
resolver must become the `UNION` form of doc §5, or one invoice keeps a stale status.

**R5 — Write-path overhead on `tbai_syncinvoice`.** Every insert/update-of-`Estado`/delete now pays
a dirty-row insert plus one deferred recompute at commit. The recompute is a single indexed lookup
(with Step 6's index), so the cost is small — but it is new cost on TicketBAI's submission path, not
on Etendo GO's. Doc §14 flags "write-heavy source, read-light target" as the anti-pattern; this is
the opposite (a low-frequency write, a frequently-read list), so `S`/`S` is the right side of that
trade-off.

**R6 — Backfill.** Covered in §8 Step 8 with its sizing table. `update.database` auto-populates only
on *first activation* and only under 100 000 rows; any later change to the function requires a
manual **Rebuild Stored Column** (doc §15 Q2, Case B) — a trap worth remembering the next time the
function is edited.

**R7 — The MCP filter path is broken for `V` columns.** Runtime-proven (§3.2). It does **not** affect
this migration — a stored column is a plain physical column — but `em_etgo_delivery_status` and
`em_etgo_due_date` still return 500 to MCP filters today. Tracked as a separate ticket in §8 Step 13.

**R8 — Two-repo coordination.** Strict ordering: the AD column must exist in the database *before*
`make regen` in Schema Forge, because the extractor reads it from `AD_COLUMN`. A `feature/ETP-5216`
branch in both repos with the human running `update.database` / `export.database` in between.
**No `schema_forge_core` package bump is needed** — no generator, no `app-shell-core` component and
no validator rule changes; `computedMode` is already supported in
`@etendosoftware/schema-forge-cli@0.3.47`, and it is `'S'` that the contract generator understands
natively (`generate-contract.js:361-375` emits `computed: { mode: 'stored', refresh: 'synchronous' }`).

**R9 — Read-only enforcement is weaker than the doc claims.** Doc §7 says Schema Forge forces
`readOnly` for stored columns at three layers; §4.3 shows none of that exists in
`schema-forge-cli@0.3.47`. So `"visibility": "readOnly"` in `decisions.json` (§8 Step 14) is the only
thing standing between the pipeline and an editable input bound to a column the DAL maps
`insert="false" update="false"`. Do not omit it.

**R10 — DAL property name.** `eTGOTbaiStatus` is inferred by analogy with `eTGODeliveryStatus`, whose
mapping from `em_etgo_delivery_status` was **confirmed at runtime** via `neo_schema`. The new one is
still only inferred; Step 15 fixes it and Steps 16-17 carry a placeholder until then.

**R11 — Field length.** `TBAI_SYNCINVOICE.ESTADO` is `VARCHAR(10)` and `"Rechazado"` is 9 characters
— no headroom. Pre-existing, not introduced here. `EM_ETGO_TBAI_STATUS` is sized to match at
`VARCHAR(10)`; note that `'Pendiente'` (9) fits, and any future longer status would be truncated at
the source anyway.

---

## 10. Gating and backward compatibility

**The visibility gating does not change and does not require reverting to a synthetic column.**
Today `targets.showTbai` (`tools/app-shell/src/windows/custom/shared/fiscalTargets.js:34-61`) decides
whether the column **enters the `columns` array** — not whether the data exists. A real AD column
changes the *source of the value*, not the *conditional push*. The
`if (targets.showTbai) fiscalCols.push({...})` at `InvoiceHeaderTable.jsx:76` and
`PurchaseInvoiceHeaderTable.jsx:101` stays verbatim; only the pushed object gains a real
`key` / `column`.

The purchase-side Bizkaia restriction is likewise untouched: `getInvoiceFiscalTargets` computes
`showTbaiForDoc = isSales || (isPurchase && territory === 'BIZKAIA')` (`fiscalTargets.js:37`), and
TicketBAI genuinely only accepts purchase invoices through Batuz/LROE.

Consequence, deliberately accepted: the value now travels in the contract on every row even when the
fiscal profile hides the column. Cost is one `VARCHAR(10)` per row, consistent with
`em_etgo_delivery_status`.

**The purchase fallback stays exactly as it is.**
`row.tbaiSyncEstado ?? (isSent(row.tbaiIssent) ? 'Enviada' : 'Pendiente')` only changes its first
half to `row.eTGOTbaiStatus`. The reasoning at `docs/feedback.md:1337` holds word for word: the sync
status answers "what was the outcome of the submission?" and is the only source that can say
*rejected*; `tbaiIssent` only answers "was it submitted?". Reading the flag first would let a
rejection render as a cheerful "Enviada". The fallback covers an invoice with no
`tbai_syncinvoice` row yet.

`FiscalStatusBadge.jsx:11-22` needs **no change** — the `Recibido` / `Rechazado` / `Error` /
`Enviada` / `Pendiente` map already covers every value.

**Collateral improvement:** with a real column, the `??` can no longer mask "no producer is wired" —
the root cause of ETP-4391. If the field is missing it is missing from the contract, and
`sf-validate-pipeline` sees it.

---

## 11. Files touched

| File | Repo | Role |
|---|---|---|
| `src-db/database/sourcedata/AD_MODULE_DEPENDENCY.xml` | .go | **+1 dependency on TicketBAI Integration** — Step 1, unblocks everything else |
| `src-db/database/model/functions/ETGO_GET_TBAI_STATUS.xml` | .go | **NEW** — the total computation function (§5.8), highest-risk artefact |
| `src-db/database/model/modifiedTables/C_INVOICE.xml` | .go | +1 physical column `EM_ETGO_TBAI_STATUS VARCHAR(10)` |
| `src-db/database/sourcedata/AD_ELEMENT.xml` | .go | +1 element |
| `src-db/database/sourcedata/AD_COLUMN.xml` | .go | +1 stored computed column (`S`/`S`) |
| `src-db/database/sourcedata/AD_COLUMN_COMP_DEPENDENCY.xml` | .go | +1 dependency on `TBAI_SyncInvoice` (§5.9) |
| `src-db/database/sourcedata/AD_COMPDEP_WATCHED_COL.xml` | .go | +1 watched column `Estado` (§5.9) |
| `src-db/database/model/tables/…` (index on `tbai_syncinvoice.c_invoice_id`) | .go or ticketbai | rule V16; makes recompute and rebuild cheap |
| SQL test for `ETGO_GET_TBAI_STATUS` (5 edge cases) | .go | **NEW** — required by R1 |
| `src/com/etendoerp/go/schemaforge/TbaiSyncStatusInjector.java` | .go | **DELETE** |
| `src/com/etendoerp/go/schemaforge/SalesInvoiceHeaderHandler.java:198` | .go | remove call + import |
| `src/com/etendoerp/go/schemaforge/PurchaseInvoiceHeaderHandler.java:227` | .go | remove call + import |
| `src-test/.../TbaiSyncStatusInjectorTest.java` | .go | **DELETE** (241 lines) |
| `src-test/.../TbaiSyncStatusInjectorIntegrationTest.java` | .go | **DELETE** (125 lines) |
| `src-test/.../PurchaseInvoiceHeaderHandlerTest.java:294-360` | .go | rewrite the ETP-5087 block |
| `src/com/etendoerp/go/mcp/McpQuerySupport.java:105-152` | .go | separate ticket — `_computedColumns` prefix |
| `docs/STORED-COMPUTED-COLUMNS.md` §7, §8 | .go | fix two documented inaccuracies |
| `artifacts/sales-invoice/decisions.json` | SF | promote field to grid |
| `artifacts/sales-invoice/contract.json` + `generated/` | SF | regenerated by `make regen` |
| `artifacts/sales-invoice/custom/InvoiceHeaderTable.jsx:76-81` | SF | real column instead of synthetic |
| `artifacts/sales-invoice/custom/__tests__/InvoiceHeaderTable.test.js` | SF | 2 refs |
| `artifacts/purchase-invoice/decisions.json` | SF | same |
| `artifacts/purchase-invoice/__tests__/contract-integrity.test.js` | SF | 7 refs |
| `tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx:101-118` | SF | real column + fallback |
| `tools/app-shell/.../purchase-invoice/__tests__/PurchaseInvoiceHeaderTable.vitest.jsx` | SF | 8 refs |
| `e2e/tests/flows/purchase-invoice-batuz-column.mocked.spec.js` | SF | 6 refs (NEO mock) |
| `tools/app-shell/src/windows/custom/shared/FiscalStatusBadge.jsx` | SF | **NO CHANGE** — status map already covers every value |
| `tools/app-shell/src/windows/custom/shared/useFiscalStatus.js:90` | SF | **NO CHANGE** — only a comment mentions it; different flow (`monitor-*`) |
| `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx:154-158` | SF | **NO CHANGE** — consumes `useFiscalStatus`, not `tbaiSyncEstado` |
| `docs/generated-custom-windows/{sales,purchase}-invoice.md` | SF | mandatory (atomic doc policy) |
| `docs/feedback.md:1328-1341` | SF | close out the ETP-4391 entry |
