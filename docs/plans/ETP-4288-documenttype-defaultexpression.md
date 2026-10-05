# ETP-4288 — documentType schema exposes defaultExpression "0" on sales-order/purchase-order

**Status:** Investigation / plan only — no code changed, no branch created.
**Jira:** https://etendoproject.atlassian.net/browse/ETP-4288 (assignee: Valentin Vivaldi, In Progress, label `validacion-agentica`, severity Low)
**Repo:** `com.etendoerp.go`

## 1. Problem analysis

### Ticket description (verbatim)

> Round 3 (Juan Carlos, 2026-06-19) found documentType keeps defaultExpression="0" in the schema
> of sales-order and purchase-order. neo_defaults resolves to a valid ID correctly, but an agent
> reading only the schema would use "0" as an invalid ID. Low severity (defaults DO resolve
> correctly).
>
> Scope: neo_schema / defaults should not surface "0" as a usable default; reflect the resolved
> default ID, or omit the default. Fix in NeoDefaultsService or in how the schema reports
> defaultExpression. Can be folded with G3 metadata accuracy.
>
> Acceptance criteria: The schema for documentType on sales-order/purchase-order does not present
> "0" as a usable default (either the resolved ID or no default). Test.

### Reproduction (LOCAL MCP, `etendo-go-local`)

**Request 1 — `neo_schema` (verbatim tool call):**
```json
{"tool": "neo_schema", "arguments": {"spec": "sales-order", "entity": "header"}}
```

**Response (relevant excerpt, verbatim):**
```json
{
  "name": "documentType",
  "column": "C_DocType_ID",
  "label": "Document Type",
  "type": "foreignKey",
  "required": true,
  "readOnly": false,
  "defaultExpression": "0",
  "businessCritical": false,
  "hasSelector": true,
  "selectorType": "TableDir"
}
```

**Request 2 — `neo_defaults` (same spec/entity, verbatim tool call):**
```json
{"tool": "neo_defaults", "arguments": {"spec": "sales-order", "entity": "header"}}
```

**Response (relevant excerpt, verbatim):**
```json
{
  "defaults": {
    "documentType": "CB6EEA256BBC41109911215C5A14D39B",
    "documentType$_identifier": "** New **",
    "transactionDocument": "CB6EEA256BBC41109911215C5A14D39B",
    "transactionDocument$_identifier": "Standard Order"
  }
}
```

This confirms the ticket exactly: `neo_schema` reports `defaultExpression: "0"` for `documentType`
(`C_DocType_ID`), while `neo_defaults` resolves the real record ID
(`CB6EEA256BBC41109911215C5A14D39B`, "Standard Order"). An agent that reads only `neo_schema`
(e.g. to pre-fill a form without calling `neo_defaults`) would treat `"0"` as a usable FK value and
fail on `neo_create`/`neo_update`.

### Root cause — traced to exact code

The `"0"` is the **raw `AD_Column.DefaultValue`** for `C_DocType_ID` on `C_Order` (and the
equivalent column on `C_Invoice` etc.) — a long-standing Etendo classic-UI convention: FK columns
with no real default get the literal string `"0"` in the AD, which the classic Swing/OB UI never
renders as a "usable" default; it's a sentinel meaning "compute this via callout/session logic
instead."

**`neo_schema` builds its `defaultExpression` field naively from the raw column, with no
sentinel handling:**

`modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpToolRouterSupport.java:407-412`
```java
private static void addDefaultExpression(JSONObject fieldObj, Column col) throws JSONException {
  String defaultExpr = col.getDefaultValue();
  if (defaultExpr != null && !defaultExpr.trim().isEmpty()) {
    fieldObj.put("defaultExpression", defaultExpr.trim());
  }
}
```
Called from `buildSchemaField()` at `McpToolRouterSupport.java:344`, which is invoked by
`buildSchemaFieldsArray()` (`:312-324`) — the function backing the `neo_schema` tool's field list.
No knowledge of the `"0"` FK sentinel exists anywhere in this file.

**The write path (`neo_defaults` / `neo_create`) already has this exact special case**, proving the
product itself knows `"0"` is not a real ID:

`modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/NeoDefaultsService.java:973-984`
```java
private static void applyResolvedDefault(JSONObject body, Column col,
    String propName, Object resolved, NeoContext ctx) throws Exception {
  ...
  // FK columns with legacy "0" default — OBDal cannot resolve "0" as an entity ID.
  // For doctype columns, try to resolve the actual default from C_DocType table.
  if ("0".equals(String.valueOf(resolved))
      && col.getDBColumnName().toUpperCase().endsWith("_ID")) {
    String docTypeId = DocTypeResolver.resolveDefaultDocTypeId(col, ctx);
    if (docTypeId != null) {
      body.put(propName, docTypeId);
      ...
```
`DocTypeResolver.resolveDefaultDocTypeId(Column, NeoContext)`
(`modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/DocTypeResolver.java:169-186`) queries
`C_DocType` by `DocBaseType` + `IsSOTrx` + client/org + the tab's HQL subtype filter — a
**session/context-dependent SQL resolution**, not something derivable from the `Column` metadata
alone. This is why `neo_schema`, which only has `Column`/`Tab`/`Entity` in scope
(`buildSchemaFieldsArray` signature, `McpToolRouterSupport.java:312-315` — no `NeoContext`), cannot
trivially replicate the full resolution without being threaded a request context.

**Corrected root-cause category** (superseding the categorization already recorded in
`docs/agentic-validation/mcp-ticket-knowledge.md` line 28, which listed ETP-4288 under
`upstream-config`): this is a **code-bug** in the MCP Java layer
(`com.etendoerp.go`), not an upstream schema_forge/decisions issue. There is no `decisions.json`
knob that controls `defaultExpression` — it is generated live, per-request, by
`McpToolRouterSupport` reading the raw `AD_Column` value. `mcp-ticket-knowledge.md` should be
corrected in the same change that resolves this ticket.

## 2. Root-cause category

**code-bug** (MCP/NEO Java layer, `com.etendoerp.go`).

## 3. Proposed solution (revised — structural metadata, no literal ID)

**Design decision reversed from the original Option A.** The initially-favored fix (resolve the
real `C_DocType_ID` — e.g. `CB6EEA256BBC41109911215C5A14D39B` — and put it directly in
`neo_schema`'s `defaultExpression`) was **rejected**. Rationale:

> **A resolved default ID is tenant-scoped data, not structure.** `neo_schema` is a *stable
> structural contract* — the same response shape should describe the field's type/format
> regardless of which tenant, client, or org is asking. `DocTypeResolver.resolveDefaultDocTypeId`
> resolves per `AD_Client_ID`/`AD_Org_ID`/`IsSOTrx` — the ID it returns is correct **only for the
> calling tenant's current org/client** and would be wrong (or simply a different real record) in
> any other tenant, or even the same tenant's other orgs. Baking it into the schema risks an agent
> reading `neo_schema` once and hardcoding that ID into later `neo_create` calls across sessions —
> exactly the failure mode ETP-4279 already flagged for a different field ("assuming cardinality/
> value from a static read instead of querying live"). The schema must stay tenant-agnostic;
> **only `neo_selectors`/`neo_defaults` are context-aware and may return real values.**

The revised fix therefore does two things, both **generic across any `_ID` FK column carrying the
legacy `"0"` sentinel** — no `documentType`/`sales-order`/`purchase-order`-specific branching:

1. **Never emit `"0"` (or any resolved instance ID) as `defaultExpression`.**
2. **Replace it with a structural/format descriptor** so an agent still knows *what shape* the
   default will take, plus an explicit pointer to the tool that resolves it, without exposing an
   instance value.

**File to change:** `modules/com.etendoerp.go/src/com/etendoerp/go/mcp/McpToolRouterSupport.java`
(repo: `com.etendoerp.go`, confirmed — not schema_forge; no `decisions.json`/generator role here).

### What `neo_schema` already exposes for FK fields today (investigated)

For `documentType` (and every FK field), `buildSchemaField()` (`McpToolRouterSupport.java:330-355`)
already emits, from data available with **zero extra queries**:
- `type: "foreignKey"` — from `mapColumnType(refId)` (`:118-156`), keyed off `col.getReference()`'s
  AD_Reference id (18/19/30/`OBUISEL`).
- `hasSelector: true` + `selectorType: "TableDir"` — from `addSelectorInfo()` (`:422-428`) +
  `mapSelectorType(refId)` (`:158-...`), when `refId` is in the tracked `selectorRefs` set.
- `column: "C_DocType_ID"` — the raw DB column name, which **already encodes the target table** by
  Etendo's universal `<Table>_ID` naming convention (confirmed generic: `C_BPartner_ID` →
  `C_BPartner`, `M_Warehouse_ID` → `M_Warehouse`, etc. — visible throughout the `neo_schema`
  reproduction in §1).

**Nothing today emits an explicit "this default is server/context-resolved" signal**, and nothing
emits a value-format hint (e.g. "32-char hex ID") — `defaultExpression` is the only field that
currently tries (and fails) to communicate the default. There is also no reusable "resolve target
table name" call already wired into the schema path — `NeoSelectorService`/`SelectorQueryExecutor`
resolve the target table via `column.getReferenceSearchKey()` + `AD_Reference_Value`/HQL metadata
(`NeoSelectorService.java:257-266`), but that machinery is a heavier selector-query path, not a
cheap schema-time lookup — reusing it is not necessary here, since the `<Table>_ID` naming
convention on `column` already gives an agent (or a human) the target table for free.

### Recommended shape — replace `defaultExpression:"0"` with a dynamic-default descriptor

For any `_ID`-suffixed FK column whose raw `AD_Column.DefaultValue` is the literal sentinel `"0"`,
stop emitting `defaultExpression` and instead emit a small structural block, e.g.:

```json
{
  "name": "documentType",
  "column": "C_DocType_ID",
  "type": "foreignKey",
  "required": true,
  "readOnly": false,
  "defaultSource": "server",
  "defaultFormat": "32-char hex ID (FK)",
  "defaultHint": "Resolved per-tenant at request time — call neo_defaults to get the value",
  "businessCritical": false,
  "hasSelector": true,
  "selectorType": "TableDir"
}
```

Field names above are proposed, not final — align with whatever naming the team prefers, but the
**shape contract** is: no literal value, only (a) a marker that the default is dynamically
resolved, and (b) the value's format/type, and (c) which tool actually resolves it. This is
symmetric with how `hasSelector`/`selectorType` already tell an agent "don't guess this value,
call `neo_selectors`" without embedding a selectable row.

Sketch of the change (fully generic — no window/spec/`documentType`-specific branch, matches the
`@Named`/generic-service rule since this lives in the shared schema-building path, not a
`NeoHandler`):

```java
private static void addDefaultExpression(JSONObject fieldObj, Column col) throws JSONException {
  String defaultExpr = col.getDefaultValue();
  if (defaultExpr == null || defaultExpr.trim().isEmpty()) {
    return;
  }
  defaultExpr = defaultExpr.trim();
  if (isLegacyZeroFkSentinel(defaultExpr, col)) {
    addDynamicDefaultHint(fieldObj);
    return; // never emit "0", never emit a resolved instance ID (tenant-scoped data)
  }
  fieldObj.put("defaultExpression", defaultExpr);
}

private static boolean isLegacyZeroFkSentinel(String defaultExpr, Column col) {
  return "0".equals(defaultExpr) && col.getDBColumnName().toUpperCase().endsWith("_ID");
}

private static void addDynamicDefaultHint(JSONObject fieldObj) throws JSONException {
  fieldObj.put("defaultSource", "server");
  fieldObj.put("defaultFormat", "32-char hex ID (FK)");
  fieldObj.put("defaultHint", "Resolved per-tenant at request time — call neo_defaults to get the value");
}
```

No signature change to `addDefaultExpression`/`buildSchemaField`/`buildSchemaFieldsArray` is
needed — this stays fully local to `McpToolRouterSupport.java`, unlike the rejected Option A which
required threading `NeoContext`/`SFEntity` in to call `DocTypeResolver`. That coupling is now
avoided entirely: **the schema path never calls `DocTypeResolver`**, which is correct, since
`DocTypeResolver` is inherently tenant/context-resolving and belongs only on the `neo_defaults`/
`neo_create` write path (`NeoDefaultsService.java:973-984`, unchanged by this fix).

**Generality check:** `isLegacyZeroFkSentinel` triggers on *any* `_ID` column with raw default
`"0"`, not just `C_DocType_ID`/`C_DocTypeTarget_ID`. This also generically covers other tables with
the same classic-AD "0" FK sentinel pattern, without new per-table logic — satisfying the
"apply to all `_ID` FK sentinel cases, no window/spec-specific branches" requirement.

**Non-FK `"0"` defaults must stay untouched.** The reproduction in §1 also showed legitimate,
non-misleading `"0"` defaults on non-`_ID` columns — `etgoTotalDiscount` (`EM_Etgo_Total_Discount`,
type `number`) and `chargeAmount` (`ChargeAmt`, type `number`) both correctly report
`defaultExpression: "0"` as a real numeric zero default. `isLegacyZeroFkSentinel`'s
`_ID`-suffix check already excludes these — confirmed no regression risk there.

### Why this layer, not schema_forge

`defaultExpression` in `neo_schema` output is computed live from `AD_Column.DefaultValue` at
request time (`McpToolRouterSupport.addDefaultExpression`) — it is not sourced from
`ETGO_SF_FIELD`/`decisions.json` at all. There is no generated contract field, no
`decisions.json` key, and no generator step involved. `make regen` would not touch this. The fix
is 100% in `com.etendoerp.go`'s MCP Java layer.

## 4. Testing approach

Add regression tests to `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/mcp/McpToolRouterSupportTest.java`
(existing file, already has a `@Test`-per-scenario pattern with mocked `Column`/`Tab`):

1. **Unit test — sentinel replaced with structural hint, never a literal value:** mock a `Column`
   with `getDefaultValue()` returning `"0"` and `getDBColumnName()` returning `"C_DocType_ID"`;
   assert the built field JSON has **no `defaultExpression` key**, carries the new
   `defaultSource: "server"` / `defaultFormat` / `defaultHint` fields, and — critically — assert
   the response contains **no 32-char-hex-looking value anywhere for this field** (i.e. explicitly
   assert the absence of a resolved instance ID, not just the absence of `"0"`), to guard against
   a future regression that reintroduces a tenant-scoped value here.
2. **Unit test — non-FK "0" defaults preserved:** mock a numeric/boolean column whose literal
   default is legitimately `"0"` (e.g. `ChargeAmt`/`EM_Etgo_Total_Discount`, both seen in the raw
   `neo_schema` reproduction with `defaultExpression: "0"` and non-`_ID` columns) — assert these
   are **unaffected** (still report `defaultExpression: "0"`, no dynamic-default fields added), so
   the fix only targets `_ID`-suffixed FK columns.
3. **Unit test — legitimate FK default preserved:** mock an `_ID` column with a real non-"0"
   default (e.g. `@C_Currency_ID@` on `currency`, seen in the reproduction) — assert unaffected
   (`defaultExpression` still reports the literal expression, no dynamic-default fields added).
4. **Unit test — generality across tables:** mock a second `_ID` FK column unrelated to doctype
   (e.g. a hypothetical `C_BPartner_ID` with raw default `"0"`) to confirm the fix is column-name
   generic and not special-cased to `C_DocType_ID`/`C_DocTypeTarget_ID`.
5. **Integration test:** extend an `McpToolRouterTest`/`McpToolRouterSupportTest` scenario hitting
   `neo_schema` end-to-end for `sales-order` and `purchase-order` to confirm `documentType`'s field
   object carries the dynamic-default descriptor and no `defaultExpression`/literal ID, and that
   `neo_defaults` (unchanged, `NeoDefaultsService`/`DocTypeResolver` untouched by this fix) still
   resolves the real per-tenant ID correctly.

Delegate substantial test authoring to the Tester agent per project policy once implementation
starts.

## 5. Feedback note for the bot team (② per Tracer's dual mandate)

**Ticket quality:** high — this was one of the more complete ETP-4288-family tickets. It named the
exact field (`documentType`), the exact specs (`sales-order`, `purchase-order`), the exact
symptom (`defaultExpression="0"`), contrasted it against the working `neo_defaults` behavior, and
gave a concrete acceptance criterion.

**Rubric gaps (minor, did not block resolution but would have sped it up):**
- **#3 verbatim JSON-RPC request/response** — the ticket describes the symptom in prose
  ("documentType keeps defaultExpression='0' in the schema") but does not paste the actual
  `neo_schema` request/response JSON. Reconstructing and confirming the exact reproduction (this
  doc's §1) took one extra tool round-trip. **Ask:** paste the raw `neo_schema` output snippet for
  the `documentType` field next time — it's a single field, cheap to include verbatim.
- **#7 contract/spec version** — not stated; not load-bearing here since the bug is live-computed
  (not contract-driven), but the omission meant an extra step to confirm this wasn't a stale-push
  issue.
- **#11 self-classification** — the ticket suggests "Fix in NeoDefaultsService or in how the schema
  reports defaultExpression," which is a good instinct but doesn't commit to one of the 6 canonical
  categories. It happened to be right in spirit (pointed at the correct two candidate files) — this
  is close to what field #11 is meant to produce and worth citing as a near-exemplary case for
  "vague root-cause guess is still useful when it names the right files."

**Note to bot team:** when a ticket already narrows the bug to specific candidate files/services (as
this one did), including the verbatim tool call/response for the one field in question turns a
"good" ticket into a "resolve in one pass" ticket. This is the single highest-value addition for
tickets in this shape.

## 6. Correction to internal knowledge base (to apply alongside the fix)

`docs/agentic-validation/mcp-ticket-knowledge.md` line 28 currently lists:
> **upstream-config (schema_forge decisions/generators):** ... ETP-4288 (`defaultExpression="0"`
> surfaced in schema).

This is a **misclassification** — confirmed by tracing the code: `defaultExpression` is generated
live from `AD_Column.DefaultValue` in `McpToolRouterSupport.addDefaultExpression`
(`com.etendoerp.go`), with zero involvement from `decisions.json`/`ETGO_SF_FIELD`/generators. When
this ticket is actually resolved, move the ETP-4288 entry from the `upstream-config` bullet to the
`code-bug (MCP/NEO Java)` bullet, and add a dated correction note under "Misclassifications
corrected" in that file per the agent's self-improvement protocol.
