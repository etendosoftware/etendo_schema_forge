# MCP File Guide — Tracer's code map

Lookup table of files relevant to resolving Etendo GO **MCP** validation-bot tickets.
**Consult FIRST** on every ticket to locate code fast; **append** a new row whenever you read a
file not yet listed (path, repo, one-line purpose, key symbols/line anchors).

Line anchors are approximate (`~`) and drift across commits — grep the symbol, don't trust the number.

Repos:
- `etendo-go` = `/Users/futit/Workspace/etendo_develop/modules/com.etendoerp.go/`
- `schema_forge` = `/Users/futit/Workspace/etendo_develop/schema_forge/`

---

## etendo-go — MCP layer (`src/com/etendoerp/go/mcp/`)

### MCP routing / dispatch
| File | What it is / when to read | Key symbols |
|------|---------------------------|-------------|
| `mcp/McpToolRouter.java` | Routes a tool call to the NEO handler (CRUD/process/report). Read for wrong/empty tool results, report execution, discover output. | `handleDiscover() ~158-177`; `handleList() ~184`; `handleReport() ~826-871` (requires `spec.getProcess()`, calls `NeoReportService` — Jasper coupling, ETP-4255); process error `~803-805`; imports `NeoReportService :55` |
| `mcp/McpToolRouterSupport.java` | Helpers for the router: spec access checks + discover spec JSON shape. Read for discover field shape, RBAC on specs. | `buildDiscoverSpec() ~187` (emits only `isReport:true` for `R` — no `callable/status/message`, ETP-4255); `hasSpecAccess()`; `spec.getProcess()` refs `~181,339` |

### Tool registry / discover
| File | What it is / when to read | Key symbols |
|------|---------------------------|-------------|
| `mcp/ToolRegistry.java` | Dynamic tool discovery: reads `ETGO_SF_SPEC` + RBAC + OAuth2 scopes, builds the tool list. Read when a tool is missing / not listed / RBAC-filtered, or generate_* schema is wrong. | `processSpec() ~108-126` (W/P/R branching); `buildReportTool() ~503-516` (process-style param schema, ETP-4255); `buildProcessParamSchema() ~525`; `hasProcessAccess() ~135`; `isCrudTool() ~220`; `buildDiscoverTool() ~243`; scope→permissions `~100-105` |

### Auth / session / hooks
| File | What it is / when to read | Key symbols |
|------|---------------------------|-------------|
| `mcp/McpServlet.java` | HTTP handler, OAuth2 auth, JSON-RPC dispatch, session. Read for auth/transport/dispatch errors. | (not yet traced) |
| `mcp/McpAuthorizationService.java` | OAuth2 scope validation. Read for scope rejections. | `neo_discover` case `~70` |
| `mcp/McpSessionManager.java` | `Mcp-Session-Id` sessions, scoped `OBContext`/Hibernate session. Read for session/context bleed. | `~50-62` scoped-callable exec |
| `mcp/McpHookExecutor.java` | Runs `NeoHandler` hooks. Read for window-specific behavior. | (not yet traced) |
| `mcp/McpSelectorContextHelper.java` | Builds selector context (recordContext/parentContext). Read when `neo_selectors` returns empty/wrong rows. | (not yet traced) |
| `mcp/NeoAccessUtils.java` | RBAC helpers (`hasProcessAccess`, `hasWindowAccess`). Read for access-denied triage. | `hasProcessAccess(id)`, `hasWindowAccess(id)` |

### Resources / definitions / constants
| File | What it is / when to read | Key symbols |
|------|---------------------------|-------------|
| `mcp/McpResourceProvider.java` | `resources/list` + `resources/read`. Read for resource endpoint issues; shares report/process coupling. | `spec.getProcess()` refs `~204,243,291`; error `Spec '...' has no linked AD_Process` `~294` (ETP-4255) |
| `mcp/McpToolDefinition.java` | Value type for an MCP tool (name, desc, schema). | — |
| `mcp/McpToolException.java` | Tool-level exception type. | — |
| `mcp/McpConstants.java` | Shared constant keys (`PARAM_PARAMETERS`, `GENERATE_PREFIX`, tool names). | `GENERATE_PREFIX`, `PARAM_PARAMETERS`, `TOOL_GENERATE_AMORTIZATION_PLAN` |

## etendo-go — report execution (`src/com/etendoerp/go/schemaforge/`)
| File | What it is / when to read | Key symbols |
|------|---------------------------|-------------|
| `schemaforge/util/NeoReportCallability.java` | **NEW (ETP-4255)** — single source of truth for report callability + the canonical non-callable response. Used by NEO router, MCP discover, MCP handleReport, MCP resource provider. | `isReportCallable(spec)`; `resolveReportHandlerQualifier(spec)`; `buildNotConfiguredResponse(name)` → `{name,type:"report",callable:false,status,message}`; `buildNotConfiguredMessage(name)`; `STATUS_NOT_CONFIGURED` |
| `schemaforge/NeoReportService.java` | **STUB after ETP-4255** — Jasper runtime stripped; empty documented shell (`private` ctor) for future NEO-native wiring. No `ReportingUtils`/`exportJR`. | (no methods — placeholder only) |
| `schemaforge/NeoServlet.java` | NEO Headless HTTP servlet — entry point for `/sws/neo/*`. Wires collaborators. | `processReportEndpoint = new NeoProcessReportEndpoint(this) :74`; `NeoPathInfo` inner type; delegates to `NeoRequestRouter` |
| `schemaforge/NeoRequestRouter.java` | **LIVE** top-level spec dispatch (P/R/W). After ETP-4255 the R path is NEO-handler-or-non-callable; Jasper fallback removed. | `handleSpecRequest() ~70-89` (R→`handleReportSpecRequest`); `handleReportSpecRequest()` — `NeoReportCallability.resolveReportHandlerQualifier`→`dispatchReportHandler` (NEO-native), else `NeoResponse.ok(buildNotConfiguredResponse)` (HTTP 200); `dispatchReportHandler() ~176` |
| `schemaforge/NeoProcessReportEndpoint.java` | **LIVE** POST executor. After ETP-4255 only `handleProcessSpec()` remains; report method removed. | `handleProcessSpec() ~48` (process, KEEP) |
| `schemaforge/util/NeoProcessReportHelper.java` | **DELETED (ETP-4255)** — was dead-code duplicate of the report/process logic. Its test `NeoProcessReportHelperTest` must also be deleted. | (removed) |
| `schemaforge/NeoDiscoveryHandler.java` / `util/NeoDiscoveryHelper.java` | NEO `handleDiscovery` (the source the MCP `neo_discover` mirrors). Read for discover/callability shape on the NEO side. | (discovery spec listing — not yet line-traced) |
| `schemaforge/AgingReportHandler.java` | NEO-native report handler (KEEP). `@Named("agingReportHandler")`. GET describes params, POST returns JSON rows (no Jasper). | `@Named :60`; `handle() ~140` GET=`describeReport() ~155` / POST=execute `~180`; doc `/sws/neo/aging-report ~50-51` |
| `schemaforge/InventoryStockReportHandler.java` | NEO-native report handler (KEEP). `@Named("inventoryStockReportHandler")`. POST returns JSON rows. | `@Named :38`; `handle()` |
| `schemaforge/TaxReportHandler.java` | NEO-native report handler (KEEP). `@Named("taxReportHandler")`. GET describes, POST returns JSON rows. | `@Named :51`; `handle()` |
| `schemaforge/handlers/` | `NeoHandler` CDI beans keyed by `ETGO_SF_ENTITY.Java_Qualifier` (`@Named` only, never `@ApplicationScoped`). Window-specific behavior lives here, NOT in generic services. | report handlers live one level up in `schemaforge/`: `agingReportHandler`, `inventoryStockReportHandler`, `taxReportHandler` |

## etendo-go — MCP tests (`src-test/src/com/etendoerp/go/mcp/`)
| File | What it is / when to read | Key symbols |
|------|---------------------------|-------------|
| `src-test/.../mcp/McpToolRouterTest` | Regression tests for router behavior. | (delegate authoring to Tester) |
| `src-test/.../mcp/McpToolRouterRouteTest` | Tests tool-name→handler routing (generate_* → handleReport). | — |
| `src-test/.../mcp/ToolRegistryGenerateToolsTest` | Tests generate_* tool generation for report/process specs (1165 lines — heavy report-tool coverage to update for ETP-4255). | — |
| `src-test/.../mcp/McpConstantsTest` | Constant keys incl. GENERATE_PREFIX. | — |
| `src-test/.../schemaforge/NeoReportServiceTest` | Jasper service tests (567 lines — delete/rewrite with ETP-4255). | — |
| `src-test/.../schemaforge/NeoRequestRouterTest` | Router dispatch tests incl. R-spec Jasper fallback. | — |
| `src-test/.../schemaforge/util/NeoProcessReportHelperTest` | 409-line test for DEAD-CODE helper — delete alongside the helper. | — |

---

## schema_forge — CLI writers
| File | What it is / when to read | Key symbols |
|------|---------------------------|-------------|
| `cli/src/neo-writer.js` | Pushes spec/entity/field config to `ETGO_SF_*` tables. ETP-4255: currently treats P/R specs as process-backed metadata. | P/R spec handling |
| `cli/src/push-to-neo.js` | Push orchestration + `toSpecName()` (kebab-case single source of truth). | `toSpecName()` |
| `cli/src/menu-cache.js` | Menu/window/process/report ID lookup. Never guess IDs — query here. | `search "<name>"` |
| `cli/src/db.js` | DB connectivity (creds auto-resolve from `gradle.properties`). | — |

---

## etendo-go — NEO Headless / handlers (`src/com/etendoerp/go/schemaforge/`)
| File | What it is / when to read | Key symbols |
|------|---------------------------|-------------|
| `schemaforge/NeoServlet.java` | HTTP entry for `/sws/neo/...`. Routes handler-backed entities via `Java_Qualifier`. Read for handler dispatch / fallback to CRUD. | `handleWithHooks(qualifier, ctx,…) ~241`; `lookupHandler(qualifier) ~271` (iterates `WeldUtils.getInstances(NeoHandler.class)`, matches `@Named` off `handler.getClass()`) |
| `schemaforge/NeoContext.java` | Per-request context passed to `NeoHandler`s. Fluent `builder()`. | getters `~62-110`; `builder() ~125`; setters: `specName/entityName/httpMethod/recordId/requestBody/queryParams/obContext` |
| `schemaforge/NeoHandler.java` | CDI interface (`@Named`-only beans). `handle()`=pre-hook, `afterHandle()`=post-hook; `null`→default CRUD. | `handle(NeoContext)`, `afterHandle(NeoContext)` |
| `schemaforge/Widget*Handler.java` | The 9 widget data handlers (`@Named("widget…Handler")`). GET-only; read `range` from `getQueryParams()`. Stable (ETP-3584) — do not modify. | `handle()`; 405 on non-GET; empty state `{response:{data:[],count:0}}` |
| `schemaforge/WidgetQueryHelper.java` | Shared widget query utilities. | `rangeToSqlDateFrom(range) ~35`; `executeRangedQuery ~52`; `resolveQuery(fallbackSql,rangedSql,clientId,range) ~68`; `buildDataResponse ~75` |
| `mcp/McpHookExecutor.java` | Runs `NeoHandler` hooks for MCP writes. **Canonical CDI handler-lookup seam** — reuse for any MCP→handler call. | `resolveEntityHandler(SFEntity) ~59` (`WeldUtils.getStaticInstanceBeanManager()` → `bm.getBeans(NeoHandler.class, ANY_LITERAL)` → match `Bean.getName()` → `bm.getReference`); `buildHookContext ~80`; `buildDefaultsHookContext ~101`; `runPreHook/runPostHook` |
| `src-db/database/sourcedata/ETGO_SF_SPEC.xml` | Spec definitions (source of truth). `dashboard` spec (type W) `~547`. | `<NAME>`, `<SPEC_TYPE>` |
| `src-db/database/sourcedata/ETGO_SF_ENTITY.xml` | Entity defs incl. `JAVA_QUALIFIER` → `@Named`. dashboard widget entities `~4029-4198`. | `<NAME>`, `<JAVA_QUALIFIER>`, `<ETGO_SF_SPEC_ID>` |

| `mcp/McpAuthorizationService.java` | OAuth2 scope per tool. Read/edit when adding a tool's scope. | `authorizeToolCall ~56`; `requiredScopeFor() ~65` (switch: READ/WRITE group + GENERATE_PREFIX→REPORT default→PROCESS) |
| `mcp/McpConstants.java` | Tool-name + param-key constants. Add `TOOL_*`/`PARAM_*` here for a new tool. | `TOOL_GENERATE_AMORTIZATION_PLAN`, `GENERATE_PREFIX`, `PARAM_*` |

---

## Per-ticket trace log (which files each ticket touched)
- **ETP-4255** (code-bug — remove runtime Jasper from Etendo Go): `McpToolRouter.java` (handleReport, handleDiscover), `McpToolRouterSupport.java` (buildDiscoverSpec), `ToolRegistry.java` (processSpec, buildReportTool), `McpResourceProvider.java` (process coupling), `NeoReportService.java` (Jasper exportJR), `cli/src/neo-writer.js` (P/R as process-backed).
- **ETP-4284** (code-bug — expose `neo_widget` enum tool, G4; investigation/plan only): planned touch points `McpConstants.java`, `ToolRegistry.java` (buildWidgetTool + isCrudTool), `McpAuthorizationService.java` (neo:read), `McpToolRouter.java` (route + handleWidget reusing `McpHookExecutor` lookup), `McpToolRouterSupport.java`/`ToolRegistry.addWindowSpec` (exclude `dashboard` from W discovery). Plan: `docs/plans/ETP-4284-neo-widget-tool.md`.
