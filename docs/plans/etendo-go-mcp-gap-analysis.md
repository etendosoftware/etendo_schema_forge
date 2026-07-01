# Etendo GO ↔ MCP — Gap Analysis

**Autor:** Forge (Coordinator)
**Fecha:** 2026-04-28 (revisado 2026-04-29)
**Para:** Reunión con Sebas — 2026-04-29
**Rama de referencia:** `epic/ETP-3504` en `com.etendoerp.go` (ETP-3591 mergeado vía PR #88, commit `a91f53d`)
**Epic:** ETP-3504

---

## 1. Objetivo

Hacer Etendo GO **full agent-compatible**: que cualquier agente (Claude, ChatGPT, custom) pueda operar el ERP con la misma fidelidad que la UI, vía MCP.

La base MCP (servlet, OAuth2, Tool Registry dinámico desde `ETGO_SF_*`) ya está mergeada en `epic/ETP-3504`. Este informe mapea **qué está expuesto**, **qué falta**, y propone una priorización.

> **Nota de revisión 2026-04-29:** desde la versión inicial del informe no hubo cambios en `src/com/etendoerp/go/mcp/` ni en `oauth2/` — el catálogo MCP es idéntico al descrito en §2.2. Sin embargo, el runtime NEO subyacente avanzó (callouts, field filter, session service, filtros, onboarding accounting). Esos cambios mueven el costo de cerrar varios gaps — ver §2.3.

---

## 2. Lo que YA existe en la rama

### 2.1 Infraestructura MCP

- **Servlet:** `McpServlet` en `/sws/mcp` — Streamable HTTP (POST JSON-RPC 2.0, sin SSE porque los filters de Etendo no soportan async).
- **Auth:** `OAuth2Filter` + `OAuth2Servlet` — soporta `client_credentials` y `authorization_code`. Tabla `ETGO_OAUTH2_CLIENT` / `ETGO_OAUTH2_TOKEN`.
- **Sesión:** `McpSessionManager` con header `Mcp-Session-Id`.
- **Resources MCP:** `McpResourceProvider` — `resources/list` + `resources/read`.
- **Discovery dinámico:** `ToolRegistry` lee `ETGO_SF_SPEC` activos y filtra por RBAC del rol + scopes OAuth2.
- **Scopes:** `neo:read`, `neo:write`, `neo:process`, `neo:report`, `neo:*`.

### 2.2 Tools registradas

| Tool | Servicio Etendo GO subyacente | Scope |
|---|---|---|
| `neo_discover` | `ToolRegistry` | `neo:read` |
| `neo_list` | `NeoCrudHandler` / `DataSourceServlet` | `neo:read` |
| `neo_get` | `NeoCrudHandler` | `neo:read` |
| `neo_create` | `NeoCrudHandler` | `neo:write` |
| `neo_update` | `NeoCrudHandler` | `neo:write` |
| `neo_delete` | `NeoCrudHandler` | `neo:write` |
| `neo_selectors` | `NeoSelectorService` | `neo:read` |
| `neo_defaults` | `NeoDefaultsService` + `NeoDefaultsCascadeHelper` | `neo:read` |
| `neo_schema` | metadata interna | `neo:read` |
| `<spec_snake>` | `NeoProcessService` (1 por proceso) | `neo:process` |
| `generate_<spec_snake>` | `NeoReportService` (1 por reporte) | `neo:report` |

CRUD se registra **una sola vez** con un `enum` de `spec` accesibles para evitar colisiones de nombres.

### 2.3 Runtime NEO: avances post-ETP-3591 (relevantes para los gaps)

Estos cambios viven en `epic/ETP-3504` y aún **no están expuestos vía MCP**, pero acortan el camino para cerrar varios gaps del §3.

| Cambio | Jira | Impacto en gap |
|---|---|---|
| `NeoCalloutService` refactor: cache de metadata + `afterCallout` hook + DAL property matcher + `LineCalloutTaxRateHelper` | ETP-3875, ETP-3836 | **G1** — el servicio de callouts está mucho más maduro; falta solo el wrapper MCP |
| `NeoFieldFilter` reescrito (240 líneas modificadas) | ETP-3836, ETP-3660 | **G3** — más metadata interna disponible para anunciar visibility/readOnly |
| Nuevo `NeoSessionService` expuesto en `GET /sws/neo/session` (currency, organización, dirección, logo) | ETP-3662 | **G17** — el endpoint existe; falta envolverlo como tool `neo_whoami` |
| `NeoFiltersService` en `/sws/neo/filters` (filter presets) y endpoint `?_distinct` para valores únicos | ETP-3788 | Nuevo capability — debería entrar al catálogo MCP |
| `NeoFavoritesService` / `NeoFavoritesServlet` | (varios) | Nuevo capability personal del usuario — candidato a tool MCP |
| Patrón `NeoHandler` (CDI bean por `Java_Qualifier`) con implementaciones para BusinessPartner, ContactsLocation, OrderLine, InvoiceLine, InventoryLine, InternalConsumptionLine, Sales/PurchaseOrderHeader, Sales/PurchaseInvoiceHeader, SalesQuotationHeader, PriceList | ETP-3660, ETP-3836 | Cambia G6/G9 — la lógica específica por entidad ahora tiene un punto de extensión limpio para inyectar metadata semántica |
| Nuevos process handlers: `CreateGoodsReceiptHandler`, `CreatePurchaseInvoiceHandler`, `NeoCloneRecordHandler` (sumados a `CreateDraftInvoiceHandler`, `CreateShipmentHandler`, `RegisterPaymentHandler/Out`) | (varios) | **G6** — más acciones específicas, mismo problema semántico |
| `WidgetQueryHelper` extrae lógica común de los 9 widgets; empty states normalizados | ETP-3584 | **G4** — superficie estabilizada, más fácil de envolver como tool MCP |
| Onboarding: `GoInitialOrgSetupAccountingHandler` + `OnboardingDatasetImportService` + `SeedReferenceDataStep` + `AccountingPackageCloner/Resolver/Validator` | ETP-3828 | **G7** — el flujo cubre ahora también accounting setup; sigue sin tool MCP |
| `NeoSelectorService` y `NeoDefaultsService` ampliados (~600 y ~750 líneas modificadas), con cascada deduplicada en POST | ETP-3875, varios | **G2** indirectamente (más datos disponibles para display logic) |

---

## 3. Gaps detectados

### 3.1 Tabla resumen

| # | Capa Etendo GO | Estado MCP | Impacto agéntico | Prioridad |
|---|---|---|---|---|
| G1 | Callouts (`NeoCalloutService`) | ❌ no expuesto | Forms con cálculos rotos (precios/totales) | **Alta** |
| G2 | Display logic (`NeoDisplayLogicHandler`) | ❌ no expuesto | Agente envía campos ocultos → 400 | **Alta** |
| G3 | Field filtering (`NeoFieldFilter`) | ⚠️ se aplica pero no se anuncia | Agente no sabe readOnly/hidden a priori | Media |
| G4 | Widgets / KPIs (9 handlers) | ❌ sin tool | Info analítica invisible | **Alta** |
| G5 | Reportes embebidos sin spec (`AgingReport`, `InventoryStockReport`, etc.) | ⚠️ parcial | No invocables si no hay spec | Media |
| G6 | Acciones específicas (`CreateDraftInvoice`, `CreateShipment`, `RegisterPayment`) | ⚠️ funcional sin descripción semántica | Agente improvisa cuándo usarlas | **Alta** |
| G7 | Onboarding flow (7 steps) | ❌ no expuesto | No se puede provisionar tenant agénticamente | Baja |
| G8 | JWT bridging (`EtendoGoJwtServlet`) | ❌ MCP solo OAuth2 | Sesiones JWT existentes no pueden hablar MCP | Baja |
| G9 | Capa semántica (intent/examples/preconditions) | ❌ descripciones genéricas | Agente decide a ciegas | **Alta** |
| G10 | Prompts MCP (`prompts/list`, `prompts/get`) | ❌ no implementado | No hay workflows pre-armados | Media |
| G11 | Bulk / batch | ❌ uno-a-uno | 20 líneas = 20 calls | Media |
| G12 | Transacciones explícitas (begin/commit/rollback) | ❌ implícito | Falla a media orden = data parcial | Media |
| G13 | Dry-run en writes | ❌ no hay flag | No se puede previsualizar | **Alta** |
| G14 | Audit log de invocaciones MCP | ⚠️ logs estándar | Compliance / debugging difícil | Media |
| G15 | Rate limiting por sesión MCP | ❌ no hay | Loop agéntico = DB hammered | Media |
| G16 | Streaming / progreso (reports largos) | ❌ request/response | Timeouts en reportes grandes | Baja |
| G17 | Context primer (cliente/org/rol activos, fecha) | ⚠️ en OBContext, no se devuelve | Agente no sabe en qué tenant está | **Alta** |
| G18 | Webhooks reverse / subscriptions | ❌ solo polling | No se puede notificar al agente | Baja |
| G19 | Colisiones de tool names en multi-tenant | ⚠️ resuelto en CRUD, no en procesos | Ambigüedad cross-client | Baja |
| G20 | Doc agent-friendly del catálogo | ⚠️ docs humanos | Falta `neo_help` o `agent-guide.md` | Media |

### 3.2 Detalle de los gaps de prioridad alta

**G1 — Callouts**
Hoy `NeoCalloutService` recalcula campos (precio unitario al cambiar producto, total al cambiar cantidad, descuentos por BP). Si un agente arma una orden sin invocar el callout, los campos derivados quedan inconsistentes y el server tira validation errors. **Propuesta:** tool `neo_callout(spec, entity, triggerField, currentRecord)` → devuelve los cambios sugeridos. *Update 2026-04-29: el servicio fue refactorizado por ETP-3875/ETP-3836 (cache de metadata, `afterCallout` hook, helper de DAL match) — el wrapper MCP es ahora un envoltorio fino sobre la lógica ya estable.*

**G2 — Display logic**
El frontend hoy oculta campos según reglas (ej: "warehouse solo visible si docType=Standard"). El agente no tiene esa info, intenta llenar campos ocultos, y el server los rechaza. **Propuesta:** tool `neo_display_logic(spec, entity, currentRecord)` → devuelve `{visibleFields, requiredFields, readOnlyFields}`.

**G4 — Widgets**
Existen 9 handlers (`WidgetKpis`, `WidgetActivity`, `WidgetTopClients`, `WidgetRevenueTrend`, `WidgetBestSellers`, `WidgetBestProducts`, `WidgetRecentInvoices`, `WidgetPendingAmounts`, `WidgetPendingTasks`). Son oro para análisis de negocio pero invisibles para el agente. **Propuesta:** tool `neo_widget(name, params)` con `enum` de widgets disponibles, o un tool por widget con descripciones semánticas. *Update 2026-04-29: ETP-3584 extrajo `WidgetQueryHelper` y normalizó empty states / filtros por rango de fechas — la superficie de los 9 widgets ya está estable y consistente para envolverla.* *Update 2026-06-30 (ETP-4284, investigación): los 9 widgets NO son specs `widget-*` separados — son 9 entidades del único spec `dashboard` (type `W`, `DA5HB0ARD00000000000000000000001`), cada una con `JAVA_QUALIFIER` → su `@Named("widget…Handler")`. Esas entidades no tienen `AD_Tab`, por eso el path CRUD genérico lanza "No AD_Tab linked to entity" (es misrouting, no bug de datos). Plan e implementación: `docs/plans/ETP-4284-neo-widget-tool.md`. Decisión tomada: 1 tool `neo_widget(widget, params)` con enum, + excluir `dashboard` del catálogo W de discovery. Complejidad estimada: M.*

**G6 — Acciones específicas con descripción semántica**
`CreateDraftInvoiceHandler`, `CreateShipmentHandler`, `RegisterPaymentHandler/Out` están como procesos pero el `description` que ve el agente es lo que esté en `AD_Process.Help` — frecuentemente vacío o técnico. **Propuesta:** bloque `agent` en `decisions.json` (o columna en `ETGO_SF_SPEC`) con `description`, `whenToUse`, `examples`, `preconditions`. *Update 2026-04-29: el catálogo creció con `CreateGoodsReceiptHandler`, `CreatePurchaseInvoiceHandler` y `NeoCloneRecordHandler`. Además, el patrón `NeoHandler` (CDI bean por `Java_Qualifier`) abre una vía limpia para que cada handler aporte su propia metadata semántica vía un método opcional `describeForAgent()`.*

**G9 — Capa semántica**
Es el mismo origen que G6 generalizado. Sin esto, las descripciones son genéricas ("List records from a NEO Headless API spec") y el agente no distingue entre listar facturas vs órdenes vs movimientos. **Propuesta:** extender `decisions.json → window.agent` con metadata semántica que `ToolRegistry` lea al construir el `description`.

**G13 — Dry-run**
Crítico para confianza. Agente quiere validar antes de commit. **Propuesta:** parámetro opcional `dryRun: true` en `neo_create/update/delete` que ejecute validaciones + callouts pero rollback la transacción.

**G17 — Context primer**
Sin esto el agente no sabe en qué tenant/rol/fecha está. **Propuesta:** tool `neo_whoami` (cheap, primer call recomendado en system prompt) → `{client, org, role, user, currentDate, currency, language}`. *Update 2026-04-29: ETP-3662 ya entregó `NeoSessionService` en `GET /sws/neo/session` (devuelve `currencyCode`, datos de organización, dirección, logo). Cerrar G17 es solo agregar la entrada al `ToolRegistry` y completar lo que falta del payload (rol, user, fecha, idioma).*

---

## 4. Roadmap propuesto (3 sprints)

### Sprint 1 — Foundation semántico + transparencia (quick wins)
- **G9** Bloque `agent` en `decisions.json` (description, whenToUse, examples, preconditions) propagado a tool descriptions
- **G17** Tool `neo_whoami` (envoltorio sobre `NeoSessionService` — ya existe el endpoint `/sws/neo/session`)
- **G13** Flag `dryRun` en writes
- **G4** Tool `neo_widget` con enum (los 9 widgets ya comparten `WidgetQueryHelper` y empty states normalizados)
- **G20** Tool `neo_help` + `docs/agent-guide.md`
- **(nuevo)** Exponer `NeoFiltersService` (`/sws/neo/filters`) y el flag `?_distinct` (de ETP-3788) como tools `neo_filter_presets` y `neo_distinct_values` — ya existen, solo falta registrarlos

**Entregable:** un agente puede orientarse, ver KPIs y previsualizar cambios.

### Sprint 2 — Form fidelity
- **G1** Tool `neo_callout` (sobre el `NeoCalloutService` ya cacheado y con `afterCallout` hook)
- **G2** Tool `neo_display_logic`
- **G3** Anunciar field filtering en `neo_schema` (aprovechar metadata de `NeoFieldFilter` reescrito)
- **G11** Tool `neo_batch` (batch CRUD en una sola llamada)
- **G10** Prompts MCP (al menos 3: "crear orden de venta", "registrar pago", "consultar stock")

**Entregable:** un agente puede armar una orden compleja con la misma fidelidad que la UI.

### Sprint 3 — Production-grade
- **G14** Tabla `ETGO_MCP_INVOCATION` (audit) + dashboard
- **G15** Rate limiting por session/cliente OAuth2
- **G12** Transacciones explícitas (`neo_tx_begin/commit/rollback`)
- **G7** Onboarding flow expuesto (`neo_onboard_*`) — incluye ya `GoInitialOrgSetupAccountingHandler` + `OnboardingDatasetImportService` agregados por ETP-3828

**Entregable:** observabilidad, compliance y multi-tenant provisioning agéntico.

### Investigación / Sprint 4+
- G16 streaming (¿alternativa a SSE en Etendo?)
- G18 webhooks reverse
- G19 desambiguación de tools en multi-tenant
- G8 bridging JWT ↔ MCP

---

## 5. Decisiones a tomar con Sebas

1. **¿La capa semántica (G9) vive en `decisions.json` (Schema Forge) o en `ETGO_SF_SPEC` (runtime)?** Implicancia: ¿quién la edita y cómo se versiona?
2. **¿Soportamos múltiples agent profiles** (ej: "agent-readonly" vs "agent-power")? Esto define cómo modelamos los scopes OAuth2.
3. **¿Dry-run (G13) es flag por tool o un endpoint paralelo `/sws/mcp/dryrun`?** Trade-off entre simplicidad y separación de concerns.
4. **¿Los widgets (G4) se exponen como N tools o 1 tool con enum?** N tools = mejor descubribilidad; 1 tool = menos polución de catálogo.
5. **¿Auditoría (G14) en DB o en log estructurado externo?** Compliance vs cost.
6. **Naming de tools agénticas:** ¿`neo_*` (consistente con lo actual) o introducimos namespace `agent_*` para los nuevos?
7. **Roadmap timing:** ¿metemos los 3 sprints en el epic ETP-3504 o abrimos epic nuevo "Etendo GO Agent-Ready"?

---

## 6. Referencias

- Rama: `epic/ETP-3504` en `etendosoftware/com.etendoerp.go` (ETP-3591 mergeado vía PR #88, commit `a91f53d`)
- Servlet MCP: `src/com/etendoerp/go/mcp/McpServlet.java`
- Tool Registry: `src/com/etendoerp/go/mcp/ToolRegistry.java`
- Router: `src/com/etendoerp/go/mcp/McpToolRouter.java`
- OAuth2: `src/com/etendoerp/go/oauth2/`
- Endpoints NEO referenciados: `GET /sws/neo/session` (`NeoSessionService`), `/sws/neo/filters` (`NeoFiltersService`), `?_distinct` flag (ETP-3788), `NeoFavoritesServlet`
- Patrón de extensión: `NeoHandler` (CDI bean por `Java_Qualifier`) — ver `CLAUDE.md` §"Extending NEO Headless"
- Guía Neo Headless: `docs/neo-headless-guide.md`
- Spec del MCP: protocol version `2024-11-05`, transport Streamable HTTP
