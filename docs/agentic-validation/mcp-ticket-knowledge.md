# MCP Ticket Knowledge Base — Internal (Tracer)

**Audience:** the `mcp-ticket-resolver` (Tracer) agent itself — institutional memory to resolve MCP tickets faster.
**Inward-facing.** The outward report for the bot team is `ticket-feedback.md` — keep the two distinct.

> Read this FIRST on every ticket (orientation step 2). Append a dated bullet whenever you learn something durable. Never delete a correction; supersede it with a newer dated note.

## Retrieving the ticket backlog

All tickets filed by the agentic-validation bot carry the label `validacion-agentica`. To pull the current backlog:

- **JQL:** `labels = "validacion-agentica"`
- **Saved filter:** https://etendoproject.atlassian.net/issues/?jql=labels%20%3D%20%22validacion-agentica%22

---

## Recurring root-cause categories

How a reported symptom usually maps to a real cause. The point: **not every "failure" is an MCP code bug.**

| Symptom pattern | Most likely category | Where to look first |
|---|---|---|
| Tool/entity "not found" / "access denied" | RBAC gap **or** module not installed | role's window/process access; is the module deployed? |
| Selector / defaults returns empty or wrong rows | upstream context metadata **or** `McpSelectorContextHelper` | contract `context.required`; selector context builder |
| 500 / stack trace on a tool call | MCP code bug | the router branch for that tool + its handler |
| Field unexpectedly editable/hidden/required | upstream contract (decisions/generators) | `decisions.json` → `make regen`, not the MCP |
| Action/process not discoverable or rejected | contract `apiPrediction.actions[]` **or** RBAC | generated contract; role process access |

**The canonical 6 root-cause categories** are defined in `.claude/agents/mcp-ticket-resolver.md` `<ticket_quality_rubric>`: code-bug, upstream-config, RBAC/scope, missing-module/data, **validator-side/agent-knowledge**, **test-data/environment gap**. Only the first two are code fixes in this repo pair.

- **2026-06-23 — Evidenced baseline (ETP-3938 / JuanCarlos Round 1):** of 15 reported findings, **5 were NOT code bugs** — `bp-location` access denied (RBAC), `verifactu-config` / `tbai-facturas-enviadas` entity not found (modules not installed), dashboard widgets + report specs not agent-accessible (API not exposed). → When triaging, *always* rule out RBAC / missing-module / un-exposed-API before reading MCP code.

- **2026-06-23 — Round 3 (Juan Carlos, 2026-06-19, 15 tickets, label `validacion-agentica`) categorized (analysis only — NOT resolved):**
  - **code-bug (MCP/NEO Java):** ETP-4274 (neo_create ignores non-mandatory defaults — defaults/create asymmetry, `NeoDefaultsService.injectMandatoryDefaults:824-825`), ETP-4275 (no generic process-precondition validation), ETP-4285 (document actions not semantically exposed), ETP-4286 (neo_selectors lacks recordContext passthrough), ETP-4287 (GET-only entities not flagged in discovery), ETP-4284 (widgets not wrapped as `neo_widget`; were misrouted through CRUD), ETP-4255 (Jasper runtime must be removed; report callability metadata).
  - **upstream-config (schema_forge decisions/generators):** ETP-4278 (empty `prompt` field on contacts/financial-account), ETP-4276 (assets conditional userRequired not declared), ETP-4254 (W-vs-R spec misclassification).
  - **validator-side / agent-knowledge:** **ETP-4279** — the validating agent claimed FIN_Financial_Account has 2 types (read from `SeedReferenceDataStep.java`) instead of querying `neo_selectors` (3 types: B/C/CA). Pure bot defect, no product fix. Pattern: agents assuming enum/list cardinality from source/docs instead of runtime selectors.
  - **test-data / environment gap:** ETP-4289 — 6 specs (`return-from-customer`, `return-to-vendor`, `sii-config`, `sii-monitor`, `simple-g-l-journal`, `tbai-config`) unevaluable for lack of records.
  - **opaque / diagnostic gap:** ETP-4280 — Card financial-account create failed but the validator captured NO error message/HTTP status/body. The ticket is itself about the missing diagnostic. Canonical evidence for rubric #3/#4.
  - **under-specified:** ETP-4242 — "no W spec for ERP entities" with no entity/tool/repro named.

---

## ETGO_SF_FIELD agent-facing flags → fix upstream, not in Java

A ticket asking to change something the agent *sees* per field — `businessCritical`, the
per-field agent prompt, `visibility`, a per-field `defaultValue`, or `Java_Qualifier` — is
**upstream-config**, NOT an MCP code bug. These are `ETGO_SF_FIELD` values driven from
`decisions.json`; the Java only surfaces them. Full table, pipeline path, fix recipe, and
the advisory-only note on `businessCritical` are in
**`docs/agentic-validation/mcp-field-flags-pipeline.md`** — read it only when a ticket
actually concerns one of those flags.

---

## MCP code map (where tools resolve)

(See the table in `.claude/agents/mcp-ticket-resolver.md` `<where_fixes_live>` for the authoritative file→responsibility map.)

### RECIPE — adding a new MCP tool (the "expose a new tool" code-bug) — verified 2026-06-30 (ETP-4284 investigation)

A new tool touches the **same 4-5 files** every time. Use an existing tool as the template:
- **CRUD-style / static tool** (no per-spec name) → copy `neo_selectors` or `docs`.
- **Per-spec tool** (one tool per spec) → copy the process (`buildProcessTool`) or report (`buildReportTool`) path.

End-to-end wiring (all in `src/com/etendoerp/go/mcp/`):
1. **`McpConstants.java`** — add `TOOL_<NAME>` and any `PARAM_*` constants.
2. **`ToolRegistry.java`** — add a `build<Name>Tool()` that returns a `McpToolDefinition(name, description, schema)`.
   - Schema is built with the local helpers: `buildObjectSchema(props, required)`, `stringProp`, `intProp`,
     `objectProp`, `objectPropWithProperties`, and **`enumProp(description, values)`** for enum params.
   - **Enums are declared right here** — `enumProp` puts `{type:"string", description, enum:[...]}`. The CRUD `spec`
     param is the canonical enum example (`buildListTool` etc., enum = accessible spec names).
   - Register the built tool inside `generateTools()` / `registerCrudTools()` under the correct scope block
     (`permissions.canRead`/`canWrite`/`canProcess`/`canReport`).
   - If the tool is spec-less/shared, add its name to **`isCrudTool()`** so `resolveSpecName()` treats it as static
     (returns the `spec` arg or `null`). The `docs` tool is the precedent for a fully spec-less static tool.
3. **`McpAuthorizationService.requiredScopeFor()`** — add a `case "<name>":` to the right scope group
   (`SCOPE_READ`/`WRITE`/`PROCESS`/`REPORT`). Missing this → `OBSecurityException` at call time.
4. **`McpToolRouter.route()`** — add `case "<name>": return handle<Name>(args);` to the switch (~L114), and write the
   `handle<Name>` method. Note `route()` first calls `authorizeToolCall` then `resolveSpecName` + `authorizeSpecAccess`
   — a static tool must tolerate a `null` spec (the `docs` case is the precedent).
5. **Tests** (`src-test/.../mcp/`) — `ToolRegistryTest` (tool emitted, schema/enum correct), `McpAuthorizationServiceTest`
   (scope), `McpToolRouterTest` (dispatch + handler payload).

**Data-fetch paths (two distinct patterns — pick by what the tool wraps):**
- **Generic CRUD/DAL data** → the router reconstructs NEO logic itself via `DefaultJsonDataService.getInstance().fetch(params)`
  (see `handleList` ~L269). It needs an `AD_Tab` (`getAdTabOrThrow`) — this is why **handler-only entities with no AD_Tab
  fail through the CRUD path**.
- **A `NeoHandler` CDI bean** (widgets, custom window handlers) → resolve the bean via the BeanManager and call it directly.
  The reusable seam is **`McpHookExecutor.resolveEntityHandler()`**: `WeldUtils.getStaticInstanceBeanManager()` →
  `bm.getBeans(NeoHandler.class, WeldUtils.ANY_LITERAL)` → match on **`Bean.getName()`** (CDI-standard `@Named` read) →
  `bm.getReference(bean, NeoHandler.class, ...)`. Then build a `NeoContext.builder()...build()` and call `handler.handle(ctx)`.
  Do NOT re-implement the lookup; reuse `McpHookExecutor`.

**`NeoContext` gotchas (verified):**
- `NeoContext` is built with a fluent `NeoContext.builder()` (see `NeoContext.java`). Key setters: `specName`,
  `entityName`, `httpMethod`, `recordId`, `requestBody`, `queryParams(Map<String,String>)`, `obContext`.
- Handlers branch on `"GET".equals(context.getHttpMethod())` and return 405 otherwise — **always set `httpMethod`**.
- Optional params (e.g. widget `range`) are read via `context.getQueryParams().get("range")`, NOT from request body.
- **CDI scope gotcha (also in CLAUDE.md):** `NeoHandler` beans are `@Named`-only (defaults to `@Dependent`). Lookup
  reads `@Named` off the bean; a normal-scoped bean (`@ApplicationScoped`) resolves to a proxy whose subclass drops the
  non-`@Inherited` `@Named` and is silently skipped.

### Dashboard / widgets architecture (verified 2026-06-30, ETP-4284)

- There are **NO `widget-*` specs**. The 9 widgets are **9 entities under the single `dashboard` spec**
  (`ETGO_SF_SPEC_ID = DA5HB0ARD00000000000000000000001`, `SPEC_TYPE = W`), each with a `JAVA_QUALIFIER`
  (`widgetKpisHandler`, `widgetRevenueTrendHandler`, `widgetPendingTasksHandler`, `widgetActivityHandler`,
  `widgetRecentInvoicesHandler`, `widgetBestProductsHandler`, `widgetBestSellersHandler`,
  `widgetPendingAmountsHandler`, `widgetTopClientsHandler`). dashboard entity names: `kpis`, `trends`,
  `pending-tasks`, `activity`, `recent-invoices`, `best-products`, `best-sellers`, `pending-amounts`, `top-clients`.
- Defined in `src-db/database/sourcedata/ETGO_SF_SPEC.xml` (~L547) and `ETGO_SF_ENTITY.xml` (~L4029-4198).
- These entities have **no `AD_Tab`** (the `@Named` handler takes over fully). So routing them through the generic CRUD
  path throws `No AD_Tab linked to entity` — that is the ETP-4284 "block", a misrouting, not a data bug.
- Widget handlers were stabilized by **ETP-3584**: shared `WidgetQueryHelper` (`resolveQuery`, `rangeToSqlDateFrom`,
  `buildDataResponse`) and normalized empty states (`{response:{data:[],count:0}}` when no activity).

- _Append durable findings about specific router branches, scope mappings, session/context behavior as you learn them._

---

## Misclassifications corrected

- **2026-07-01 — ETP-4288 was mis-triaged as `upstream-config` (schema_forge decisions/generators) during Round 3 batch analysis; correct category is `code-bug` (MCP/NEO Java).** The `documentType` `defaultExpression="0"` reported by `neo_schema` is generated live from `AD_Column.DefaultValue` inside `McpToolRouterSupport.addDefaultExpression` (`mcp/McpToolRouterSupport.java:407-412`) — it has zero involvement from `decisions.json`/`ETGO_SF_FIELD`/generators, so `make regen` cannot fix it. The write path (`NeoDefaultsService.applyResolvedDefault` + `DocTypeResolver.resolveDefaultDocTypeId`, `schemaforge/NeoDefaultsService.java:973-984`) already special-cases the same `"0"` legacy FK sentinel — proof the schema-reporting path is simply missing the equivalent handling. **How to apply:** when a ticket's symptom is "schema/discover output shows a wrong/misleading value" for a field that also has a *working* counterpart in `neo_defaults`/`neo_create`, check whether the read path (`McpToolRouterSupport`, `ToolRegistry`) is just missing logic the write path (`NeoDefaultsService`, `DocTypeResolver`) already has — before assuming the contract/generator is the source. Full trace: `docs/plans/ETP-4288-documenttype-defaultexpression.md`.

---

## MCP code / config quirks

- **2026-07-23 — ETP-4287 discovery read-only semantics:** `McpToolRouterSupport.buildEntitySummaryArray` already includes each entity's configured `methods` (`GET`, `GET_BY_ID`, `POST`, `PUT`, `PATCH`, `DELETE`). `buildDiscoverEntity` additionally emits the established camel-case `readOnly` flag. It is true only when at least one read method is enabled and all mutation methods are disabled; derive it from configuration, never from entity names. In local sourcedata `bp-stats` and `bp-trend` are GET-only, while all `tax` entities are writable and correctly report `readOnly: false`.

- **2026-07-23 — ETP-4280 diagnostic trace:** `FinancialAccountHandler.normalizeType` preserves `"CA"` (Card), and `McpToolRouter.handleCreate` invokes the entity's `NeoHandler` pre-hook before generic persistence. A report that omits the literal request/response cannot establish a Card-type code bug: valid `CA` may coexist with an independent invalid currency, duplicate-name, RBAC, deployment, or environment failure. Apply the rubric before changing this handler.

---

## User corrections

- _None yet._
