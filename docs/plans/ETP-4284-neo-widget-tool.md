# ETP-4284 — Expose business widgets as `etendo_widget` MCP enum tool (gap G4)

**Status:** Active · **Repo:** `com.etendoerp.go` (MCP layer + NEO Headless) · **Jira:** ETP-4284
**Source:** Round 3 MCP agentic validation (Juan Carlos, 2026-06-19, on `epic/ETP-3504`).

## Context / Problem

The validation bot flagged the `dashboard` spec as "blocked" — every entity fails with
`No AD_Tab linked to entity`. Root cause: `dashboard` is registered as a **type-`W` (CRUD) spec**
but its 9 entities are **handler-backed widget endpoints with no `AD_Tab`**. The MCP router sends
them through the generic CRUD path (`handleList` → `getAdTabOrThrow`), which requires an `AD_Tab`,
so it throws. The data itself is fine — the widgets serve correctly over
`GET /sws/neo/dashboard/{entity}`.

This is gap **G4**: the 9 widget handlers (KPIs, revenue trend, pending tasks, activity, top
clients, best sellers, best products, recent invoices, pending amounts) are gold for business
analysis but **invisible to the agent** because no MCP tool wraps them.

### Key architectural finding (not obvious from the ticket)

The 9 widgets are **NOT 9 separate `widget-*` specs**. They are **9 entities under the single
`dashboard` spec** (`ETGO_SF_SPEC_ID = DA5HB0ARD00000000000000000000001`, `SPEC_TYPE = W`),
each carrying a `JAVA_QUALIFIER` that maps to its `@Named("widget…Handler")` `NeoHandler` bean:

| dashboard entity | `JAVA_QUALIFIER` / `@Named` | Handler class |
|---|---|---|
| `kpis` | `widgetKpisHandler` | `WidgetKpisHandler` |
| `trends` | `widgetRevenueTrendHandler` | `WidgetRevenueTrendHandler` |
| `pending-tasks` | `widgetPendingTasksHandler` | `WidgetPendingTasksHandler` |
| `activity` | `widgetActivityHandler` | `WidgetActivityHandler` |
| `recent-invoices` | `widgetRecentInvoicesHandler` | `WidgetRecentInvoicesHandler` |
| `best-products` | `widgetBestProductsHandler` | `WidgetBestProductsHandler` |
| `best-sellers` | `widgetBestSellersHandler` | `WidgetBestSellersHandler` |
| `pending-amounts` | `widgetPendingAmountsHandler` | `WidgetPendingAmountsHandler` |
| `top-clients` | `widgetTopClientsHandler` | `WidgetTopClientsHandler` |

All are GET-only `NeoHandler` beans, stabilized by ETP-3584 (`WidgetQueryHelper`, normalized empty
states). Several accept an optional `range` query param read via
`context.getQueryParams().get("range")` and resolved through `WidgetQueryHelper.resolveQuery(...)`.
Source-of-truth files: `src-db/database/sourcedata/ETGO_SF_SPEC.xml` (line ~547) and
`ETGO_SF_ENTITY.xml` (lines ~4029-4198).

## Scope

1. Add a single MCP tool `etendo_widget(widget, params)` whose `widget` is an **enum** of the 9 widgets,
   each with a semantic description. Pass through `params` (e.g. `range`). Wrap the existing,
   stable handlers — do **not** modify the widget data handlers.
2. Exclude `dashboard` from the type-`W` discovery catalog so it stops surfacing as a broken W spec.

### Out of scope
- Touching the dashboard aggregate spec/contract beyond removing it from W discovery.
- Modifying the widget data handlers themselves (they already work).

## Acceptance criteria (evidence required)
- Agent discovers `etendo_widget` via MCP discovery.
- Agent invokes `etendo_widget` for each of the 9 widgets and receives REAL metrics; capture responses.
- Automated test validating end-to-end: tool → handler → JSON payload with data (delegate to Tester).
- `dashboard` no longer appears as a type-`W` CRUD spec in MCP discovery.

## Complexity: **M** (medium)

Mechanically straightforward — it follows the exact registration + routing recipe the existing
tools already use, and the data handlers are already built and stable. It is not S because it spans
**four touch points** (registry, router, authorization, discover-exclusion) plus a CDI handler-
invocation seam and an end-to-end test. The cost drivers are correctness of the enum→handler
mapping and the discovery-exclusion side effects, not raw volume.

**Risks / unknowns**
- **Discovery-exclusion blast radius** — `dashboard` must be filtered out of BOTH the
  `ToolRegistry` W-spec enum AND `McpToolRouter.handleDiscover()` /
  `McpToolRouterSupport.hasSpecAccess`. Missing one leaves either a broken enum entry or a broken
  discover row. Need a single shared predicate (e.g. `isWidgetSpec(spec)`) used by all sites.
- **CDI invocation from the router** — the router's CRUD handlers reconstruct NEO logic via
  `DefaultJsonDataService`; they do NOT call `NeoHandler` beans. The handler-invocation seam already
  exists in `McpHookExecutor` (`WeldUtils.getStaticInstanceBeanManager()` → `bm.getBeans(NeoHandler.class)`
  → match by `Bean.getName()` → `bm.getReference(...)`). Reuse that lookup; do NOT re-implement.
- **`NeoContext` for a GET widget** — build via `NeoContext.builder()` with `httpMethod("GET")`,
  `specName("dashboard")`, the entity name, and `queryParams` carrying `range`. Handlers branch on
  `"GET".equals(context.getHttpMethod())`, so the method MUST be set or they return 405.
- **Response unwrapping** — handlers return `NeoResponse.ok(wrapper)` where `wrapper = {response:{data,count}}`.
  Decide whether `etendo_widget` returns the wrapper verbatim or unwraps `response`. (Open question Q2.)
- **Scope** — read-only analytics. Map `etendo_widget` to `neo:read` in `McpAuthorizationService`.

## Implementation plan (ordered)

### 1. Shared widget-spec identity helper
- In `McpToolRouterSupport.java` (or a small new util), add `static boolean isWidgetSpec(SFSpec spec)`
  returning `true` for the `dashboard` spec (match by name `"dashboard"`, the safest stable key).
  Use it everywhere the exclusion is needed so the rule lives in one place.

### 2. Exclude `dashboard` from W discovery
- `ToolRegistry.addWindowSpec()` (~L134): skip adding the spec name to `accessibleWindowSpecs` when
  `isWidgetSpec(spec)` — keeps it out of the CRUD enum.
- `McpToolRouter.handleDiscover()` (~L243-256) and/or `McpToolRouterSupport.hasSpecAccess()`: skip
  emitting the `dashboard` W spec (or re-emit it under a non-CRUD shape — see Q3).

### 3. Register the `etendo_widget` tool
- `McpConstants.java`: add `static final String TOOL_NEO_WIDGET = "etendo_widget";` and a
  `PARAM_WIDGET = "widget"` constant.
- `ToolRegistry.java`:
  - Add `buildWidgetTool()` modeled on `buildSelectorsTool()` / `buildGetTool()`. Use the existing
    `enumProp(description, values)` helper for the `widget` enum (the 9 names) and `objectProp(...)`
    for `params`. Required: `["widget"]`.
  - Register it in `registerCrudTools()` under `if (permissions.canRead)` (same block as
    `buildSelectorsTool`/`buildSchemaTool`). It is **not** spec-gated — register it whenever the
    dashboard widget entities are deployed (guard on their presence, or register unconditionally for
    read scope — see Q1).
  - Add `"etendo_widget"` to `isCrudTool()` so `resolveSpecName` treats it as a static (spec-less) tool.
  - The enum values + semantic descriptions: hardcode the 9 widget names with one-line "when to use"
    text, OR derive them from the `dashboard` spec entities (`SFEntity` rows whose `JAVA_QUALIFIER`
    starts with `widget`). Deriving keeps it DRY but couples to spec config — see Q4.

### 4. Authorization
- `McpAuthorizationService.requiredScopeFor()`: add `case "etendo_widget":` to the `SCOPE_READ` group.

### 5. Route + invoke the handler
- `McpToolRouter.route()` switch (~L114): add `case "etendo_widget": return handleWidget(arguments);`.
  Note: `etendo_widget` resolves no spec via the arg `spec` — it carries `widget`. Either special-case
  `authorizeSpecAccess(null)` or pass the dashboard spec name. Confirm `authorizeSpecAccess` tolerates
  a null/static tool (the `docs` tool already returns `null` from `resolveSpecName`).
- Add `private JSONObject handleWidget(JSONObject args)`:
  1. `validateArgs(args, "widget")`; read `widget` (enum) and optional `params` object.
  2. Map `widget` → dashboard entity name → `JAVA_QUALIFIER`. Look up the `NeoHandler` via the same
     mechanism as `McpHookExecutor.resolveEntityHandler` (BeanManager + `Bean.getName()`), OR resolve
     the `SFEntity` for `dashboard`+entity and read its qualifier, then look up the bean. Reuse, do
     not duplicate, the lookup helper.
  3. Build `NeoContext.builder().specName("dashboard").entityName(<entity>).httpMethod("GET")
     .queryParams(paramsAsStringMap).obContext(OBContext.getOBContext()).build()`.
  4. `NeoResponse resp = handler.handle(ctx);` then serialize: `wrapAsTextContent(resp body .toString(2))`
     on 2xx, `wrapAsErrorContent(...)` otherwise. Decide wrapper vs unwrapped (Q2).
- Keep all window-specific logic OUT of generic services — this lives entirely in the MCP layer +
  the existing handlers (no new `NeoHandler`, no generic-service branch). Compliant with the
  generic-service rule.

### 6. Tests (delegate to Tester)
- **Unit** (`src-test/.../mcp/`):
  - `ToolRegistryTest`: `etendo_widget` is emitted for `neo:read`; `widget` enum has the 9 values;
    `dashboard` is NOT in the CRUD `spec` enum; `isCrudTool("etendo_widget")` is true.
  - `McpAuthorizationServiceTest` (or existing): `etendo_widget` requires `neo:read`.
  - `McpToolRouterTest`: `handleWidget` maps each enum value to the right qualifier and returns the
    handler payload; unknown widget → error content; `range` is forwarded into `queryParams`.
  - Discover: `dashboard` no longer appears as a `W` CRUD spec.
- **End-to-end / integration** (OBBaseTest): invoke `etendo_widget` for each of the 9 widgets against a
  seeded client and assert a non-empty/`count`-bearing payload (or normalized empty state). This is
  AC #2/#3 evidence.

### 7. Docs
- Update `docs/widget-endpoints.md` (add the `etendo_widget` MCP wrapper section + the entity→qualifier
  table) and `{etendo_root}/modules/com.etendoerp.go/docs/neo-headless.md` if it lists MCP tools.
- Mark gap **G4** done in `docs/plans/etendo-go-mcp-gap-analysis.md`.

## Open questions / decisions for the user

- **Q1 — Registration gating.** Register `etendo_widget` unconditionally for `neo:read`, or only when the
  `dashboard` widget entities are deployed? (Unconditional is simpler; gated avoids advertising a
  no-op tool on stripped instances.)
- **Q2 — Response shape.** Return the handler wrapper verbatim (`{response:{data,count}}`) or unwrap to
  `{data,count}` for the agent? Verbatim is least surprising and matches the HTTP endpoint; unwrap is
  cleaner for the agent.
- **Q3 — Dashboard in discover.** Drop `dashboard` from discover entirely, or re-emit it as a
  non-CRUD informational entry pointing the agent to `etendo_widget`? (Drop is simplest and satisfies AC #4.)
- **Q4 — Enum source.** Hardcode the 9 widget names + descriptions in `ToolRegistry`, or derive them
  from the `dashboard` spec's `SFEntity` rows (qualifier `widget*`)? Hardcode gives richer "when to
  use" text; derive stays DRY but yields generic descriptions.
- **Q5 — Param schema.** Expose `params` as a free-form object, or enumerate the known param
  (`range` with its allowed keys from `WidgetQueryHelper.rangeToSqlDateFrom`)? Enumerating `range`
  guides the agent better.
- **Q6 — Tool name for `widget` field.** The CRUD tools key off `spec`; `etendo_widget` uses `widget`.
  Confirm `resolveSpecName`/`authorizeSpecAccess` handle a tool that carries neither a `spec` arg nor
  a name-derived spec (the `docs` tool precedent suggests yes).

## Decisions taken at implementation (2026-06-30, commit on `feature/ETP-4284`)

User chose **Option 1 — dedicated `etendo_widget` enum tool** (as the ticket specifies). Open
questions resolved with the plan's recommended defaults:

- **Q1 (gating):** Register `etendo_widget` **unconditionally for `neo:read`** (in `generateTools()`
  next to `etendo_discover`/`docs`, NOT inside `registerCrudTools` which early-returns on empty specs).
  Rationale: widgets are built-in handlers, not gated on any accessible window spec.
- **Q2 (response shape):** Return the handler wrapper **verbatim** (`{response:{data,count}}`).
  Matches the HTTP `GET /sws/neo/dashboard/{entity}` contract; least surprising for the agent.
- **Q3 (dashboard in discover):** **Dropped entirely** from discovery via
  `McpToolRouterSupport.isWidgetSpec` returning `false` from `hasSpecAccess`. Satisfies AC #4.
- **Q4 (enum source):** **Hardcoded** the 9 widget names + entity mapping + semantic descriptions
  in `ToolRegistry.WIDGET_ENTITY_BY_NAME` / `WIDGET_DESCRIPTION_BY_NAME` (single source of truth,
  reused by the router). Gives richer "when to use" text than deriving generic descriptions.
- **Q5 (params schema):** `params` exposed as a **free-form object**; the description documents
  `range` and its keys. `WidgetQueryHelper.rangeToSqlDateFrom` validates the value downstream.
- **Q6 (spec-less tool):** `etendo_widget` added to `isCrudTool()`, so `resolveSpecName` returns the
  (absent) `spec` arg → `null`; `authorizeSpecAccess(null)` returns early (StringUtils.isBlank guard).
  `handleWidget` resolves the `dashboard` spec internally. Confirmed against the `docs` precedent.

**Enum value → dashboard entity mapping (implemented):** `kpis→kpis`, `revenue-trend→trends`,
`pending-tasks→pending-tasks`, `activity→activity`, `recent-invoices→recent-invoices`,
`best-products→best-products`, `best-sellers→best-sellers`, `pending-amounts→pending-amounts`,
`top-clients→top-clients`. (Note: the `revenue-trend` enum maps to the `trends` entity.)

**Status:** Java implemented + **compiles clean** (`:modules:com.etendoerp.go:compileJava`).
Committed on `feature/ETP-4284` (base `epic/ETP-3504`, commit `185909ac`). NOT pushed; PR not yet
created. **Pending:** tests (Tester) + review/QA. The widget data handlers were NOT modified.

## References
- `docs/plans/etendo-go-mcp-gap-analysis.md` (gap G4)
- `docs/widget-endpoints.md`
- `artifacts/dashboard/aggregate-contract.json`
- `src/com/etendoerp/go/mcp/{ToolRegistry,McpToolRouter,McpToolRouterSupport,McpAuthorizationService,McpConstants,McpHookExecutor}.java`
- `src/com/etendoerp/go/schemaforge/Widget*Handler.java`, `WidgetQueryHelper.java`, `NeoContext.java`
- `src-db/database/sourcedata/ETGO_SF_{SPEC,ENTITY}.xml`
