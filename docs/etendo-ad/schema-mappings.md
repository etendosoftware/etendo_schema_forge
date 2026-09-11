# Etendo AD Schema Mappings

Actual table relationships in Etendo 25/26, corrected from initial TDD assumptions.

## Callouts

- `AD_Column_Callout` junction table **does not exist**.
- `AD_Column` has a direct `AD_Callout_ID` FK to `AD_Callout`.
- `AD_Callout` has **no `Classname` column**. The Java class lives in `AD_Model_Object.Classname` (linked via `AD_Model_Object.AD_Callout_ID`).
- `AD_Column.Callout` (varchar) also exists but is often NULL. `AD_Model_Object` is the authoritative source.

```
AD_Column.AD_Callout_ID → AD_Callout
                           └→ AD_Model_Object.AD_Callout_ID → AD_Model_Object.Classname
```

## Display Logic and ReadOnly Logic

These live in **different tables**:

| Logic | Table | Columns |
|-------|-------|---------|
| Display Logic | `AD_Field` | `displaylogic`, `displaylogic_server`, `displaylogicgrid` |
| ReadOnly Logic | `AD_Column` | `readonlylogic` |

- `displaylogic` — client-side, most common
- `displaylogic_server` — server-side, rare but acts as additional filter when present
- `displaylogicgrid` — grid-specific, very rare

Both DisplayLogic and ReadOnlyLogic use `@variable@` syntax. Variables can be:
- **Window field columns** (e.g. `@Processed@`, `@DocStatus@`) — resolved from the current record
- **Session context variables** (e.g. `@ACCT_DIMENSION_DISPLAY@`, `@#ShowAcct@`, `@OrderType@`) — injected by Etendo at runtime, cannot be evaluated statically

## Tab-Level Clauses

`AD_Tab` has filtering/ordering clauses that define how the tab loads its data:

| Column | Variant | Purpose |
|--------|---------|---------|
| `WhereClause` | SQL | Row filter (e.g. `C_Order.IsSOTrx='Y'`) |
| `OrderByClause` | SQL | Default sort order |
| `FilterClause` | SQL | Additional filter |
| `HQLWhereClause` | HQL | Same as WhereClause in HQL syntax |
| `HQLOrderByClause` | HQL | Same as OrderByClause in HQL syntax |
| `HQLFilterClause` | HQL | Same as FilterClause in HQL syntax |

When both SQL and HQL variants exist, the HQL version takes precedence in the modern client.

## Runtime property name of a new `AD_Column` — derived from `AD_Column.Name`, NOT `AD_Column.ColumnName` (ETP-5187)

When a new `AD_Column` is added to any AD table (core or a custom module table like
`ETGO_Fiscal_Decl` in `com.etendoerp.go`), the Java/DAL property name that
`org.openbravo.base.model.Entity#getProperty()`/`BaseOBObject#set`/`#get` will recognize at
runtime is **computed from `AD_Column.Name`** — the human-readable label — **not** from
`AD_Column.ColumnName` (the physical DB column name).

The derivation (`org.openbravo.base.model.NamingUtil#getPropertyMappingName`, called from
`Property#initializeFromColumn` → `Property#initializeName`, during
`ModelProvider`'s "Building runtime model" step):

1. Start from `Column.getName()` → maps 1:1 to `AD_Column.Name` (see
   `org/openbravo/base/model/Column.hbm.xml`: `<property name="name" not-null="true"/>`).
2. Camel-case on `"_"` separators, then again on `" "` separators (`NamingUtil#camelCaseIt`).
3. Strip illegal characters, lower-case the first letter.

So `AD_Column.Name = "Declaration Sequence"` → runtime property `declarationSequence`, regardless
of what the physical `ColumnName` is (`Decl_Seq` in this case). A column named to *look* like an
abbreviation of the physical column name (`"Decl Seq"` → `declSeq`) would only produce that
property if `AD_Column.Name` were literally spelled that way — it is easy to *assume* the property
mirrors the DB column name and get it wrong, especially when sibling columns on the same table
happen to spell their `Name` out in full (as `declarationType`/`declarationStatus`/
`declarationFileName` do here) while the new one was abbreviated.

**This produces a very specific, easy-to-misdiagnose failure**: a correct, active `AD_Column` row,
a matching physical DB column, and a genuinely fresh `ModelProvider` runtime-model rebuild (visible
in the log as `ModelProvider - Building runtime model`) — yet
`decl.set("declSeq", ...)`/`.get("declSeq")` throws:

```
org.openbravo.base.util.CheckException: Property declSeq does not exist for entity ETGO_Fiscal_Decl
```

It is tempting to chase this as a build/caching problem (stale `ModelProvider`, an incremental
`smartbuild`/`onlyIfModified` skip, a missing "generate model" step) — it is none of those. No
`update.database`, `smartbuild`, or forced/clean rebuild is needed to fix it; it is a pure
Java-string-literal bug.

**How to get the real property name, authoritatively, before writing any `PROPERTY_*` constant:**
check the generated entity bean under `src-gen/<module-package>/data/<Entity>.java` — it is
produced by the exact same `NamingUtil` derivation, so its javadoc states the real registered name
verbatim, e.g.:

```java
/**
 * Property declarationSequence stored in column Decl_Seq in table ETGO_Fiscal_Decl
 */
public static final String PROPERTY_DECLARATIONSEQUENCE = "declarationSequence";
```

Never hand-roll a `PROPERTY_*` string constant by guessing a transform of `AD_Column.ColumnName` —
read it off the generated class (or `AD_Column.Name` directly) instead. This applies equally in
`etendo_schema_forge`/`schema_forge_core` webhook payload builders (`push-to-neo.js`, resolvers)
and in any `com.etendoerp.go` Java handler that reads or writes AD table properties by name.
