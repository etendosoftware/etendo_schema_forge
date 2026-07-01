# NEO Headless Extensibility Guide

How to extend, customize, and hook into NEO Headless endpoints without modifying the core module.

**Target audience:** Developers building on top of `com.etendoerp.go` who need per-entity, per-endpoint, or per-field custom logic.

---

## Overview

NEO Headless is metadata-driven: three DB tables (`ETGO_SF_SPEC`, `ETGO_SF_ENTITY`, `ETGO_SF_FIELD`) control what is exposed and how. For most use cases, configuration alone is enough. When configuration isn't sufficient, the **NeoHandler CDI hook** system lets you inject custom Java logic at any endpoint.

```
Configuration-only          Code-based
(zero Java)                 (NeoHandler)
─────────────────           ─────────────────
Field visibility            Pre-hook validation
Read-only fields            Post-hook transformation
HTTP method flags           Custom business logic
Default value overrides     Cross-entity side effects
Selector filtering (HQL)    Audit logging
```

## Golden Rule

**Never add window-specific logic to generic services.**

`NeoSelectorService`, `NeoDefaultsService`, `NeoCrudHandler`, and `NeoServlet` are shared by every window. Do NOT add `if (entity.equals("..."))` guards there. Any logic specific to one window belongs in a `NeoHandler` bean or a custom UI component.

| Wrong | Right |
|-------|-------|
| `if (entity.equals("internalConsumptionLine"))` inside `NeoSelectorService` | `InternalConsumptionLineHandler implements NeoHandler` |
| Patching `artifacts/*/generated/` files directly | Fix the generator (`cli/src/generate-frontend.js`) |
| Window-specific JSX in `tools/app-shell/src/components/` | Custom component in `tools/app-shell/src/windows/custom/{window}/` |

---

## 1. Configuration-Only Extension Points

### 1.1 Field Visibility and Read-Only Control

Control which fields appear in API responses and which can be written.

| Flag | Effect on GET | Effect on POST/PUT/PATCH |
|------|---------------|--------------------------|
| `IsIncluded = Y` | Field appears in response | Field accepted in request body |
| `IsIncluded = N` | Field hidden from response | Field silently stripped from request |
| `IsReadOnly = Y` | Field appears in response | Field silently stripped from request |
| `IsReadOnly = N` | Field appears in response | Field accepted in request body |

Configure via webhook:
```
SFUpsertField?EntityID=...&ColumnID=...&IsIncluded=Y&IsReadOnly=Y
```

Or via `push-to-neo.js` from Schema Forge artifacts.

### 1.2 HTTP Method Control

Enable or disable HTTP methods per entity. Disabled methods return `405 Method Not Allowed`.

| Flag | Endpoint |
|------|----------|
| `IsGet` | `GET /{spec}/{entity}` (list) |
| `IsGetbyid` | `GET /{spec}/{entity}/{id}` (single) |
| `IsPost` | `POST /{spec}/{entity}` (create) |
| `IsPut` | `PUT /{spec}/{entity}/{id}` (full update) |
| `IsPatch` | `PATCH /{spec}/{entity}/{id}` (partial update) |
| `IsDelete` | `DELETE /{spec}/{entity}/{id}` |

Example: read-only entity (list + get, no writes):
```
SFUpsertEntity?SpecID=...&TabID=...&IsGet=Y&IsGetbyid=Y&IsPost=N&IsPut=N&IsPatch=N&IsDelete=N
```

### 1.3 Default Value Overrides

`ETGO_SF_FIELD.DefaultValue` overrides the AD_Column default when creating records via `GET /{spec}/{entity}/defaults`.

Supported formats (resolved by Etendo's `Utility.getDefault`):
- Literal: `"DR"`, `"N"`, `"0"`
- Session variable: `@#AD_Org_ID@`, `@#Date@`
- SQL: `@SQL=SELECT MAX(line) + 10 FROM ...`
- Document number: `@#DocumentNo@`

### 1.4 Selector Filtering

FK selectors are auto-detected from AD_Reference types (TableDir `19`, Table `18`, Search `30`, OBUISEL). For OBUISEL selectors, custom HQL in the selector definition is respected, including `@param@` placeholders:
- `@AD_Org_ID@`, `@AD_Client_ID@`, `@AD_User_ID@`, `@AD_Role_ID@` — resolved from session
- Any other `@param@` — passed as query parameters from the frontend

---

## 2. NeoHandler: CDI Hook System

For logic that can't be expressed via configuration, implement `NeoHandler`.

### 2.1 Interface

```java
public interface NeoHandler {

  /**
   * Pre-hook: called BEFORE the default service.
   * Return NeoResponse to take full control, or null to delegate to default.
   */
  NeoResponse handle(NeoContext context);

  /**
   * Post-hook: called AFTER the default service executed.
   * context.getPreviousResult() contains the service result.
   * Return NeoResponse to replace it, or null to keep the original.
   */
  default NeoResponse afterHandle(NeoContext context) {
    return null;
  }
}
```

### 2.2 Registration

1. Annotate your class with `@Named("qualifierName")` **only** — do **not** add `@ApplicationScoped` or any other normal scope (see the warning below).
2. Set `JAVA_QUALIFIER = 'qualifierName'` on the ETGO_SF_Entity record.

```java
@Named("purchaseOrderHandler")
public class PurchaseOrderHandler implements NeoHandler { ... }
```

```
SFUpsertEntity?SpecID=...&TabID=...&JavaQualifier=purchaseOrderHandler
```

Or in `src-db/database/sourcedata/ETGO_SF_ENTITY.xml`:
```xml
<JAVA_QUALIFIER><![CDATA[purchaseOrderHandler]]></JAVA_QUALIFIER>
```

Discovery: `NeoServlet.lookupHandler()` calls `WeldUtils.getInstances(NeoHandler.class)` and
matches by `@Named` value — no servlet restart needed (just compile + deploy).

> **⚠️ Never annotate a NeoHandler with `@ApplicationScoped` (or any normal scope).**
> `lookupHandler()` reads the qualifier via `handler.getClass().getAnnotation(Named.class)`.
> For a normal-scoped bean, `WeldUtils.getInstances(...)` returns a **Weld client proxy** — a
> generated subclass — and `@Named` is **not `@Inherited`**, so `getAnnotation()` returns `null`
> on the proxy and the handler is silently skipped (`"No NeoHandler found with @Named(...)"`).
> The module's `beans.xml` uses `bean-discovery-mode="all"`, so a `@Named`-only class is still a
> bean; it just defaults to `@Dependent`, which is **not** proxied — so its real class carries the
> `@Named` annotation and the lookup matches. This bit ETP-4244 (GL Journal): the handler was
> deployed but `@ApplicationScoped` made it undiscoverable, so completion fell through to the
> broken default dispatch.

Place handlers in: `src/com/etendoerp/go/schemaforge/handlers/` (one class per window/entity).

### 2.3 Hook Dispatch Flow

```
Request arrives
    |
    v
handler.handle(context)
    |
    +-- Returns NeoResponse?
    |       |
    |       +-- YES: set as previousResult, call afterHandle()
    |       |         afterHandle returns NeoResponse? Use it. Else use handle's result.
    |       |         (Default service is SKIPPED)
    |       |
    |       +-- NO (null): execute default service
    |                       set result as previousResult, call afterHandle()
    |                       afterHandle returns NeoResponse? Use it. Else use default result.
    |
    v
Final response written to client
```

**Key insight:** One handler receives ALL endpoint types for that entity. Use `context.getEndpointType()` to discriminate.

### 2.4 NeoContext: What Your Handler Receives

| Field | Type | Description |
|-------|------|-------------|
| `specName` | String | Spec name from URL |
| `entityName` | String | Entity name from URL |
| `httpMethod` | String | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `endpointType` | NeoEndpointType | `CRUD`, `SELECTOR`, `ACTION`, `EVALUATE_DISPLAY`, `CALLOUT`, `DEFAULTS` |
| `fieldName` | String | For SELECTOR: the column being queried. For ACTION: the button column. Null otherwise. |
| `recordId` | String | Record UUID from URL (null for list/create) |
| `requestBody` | JSONObject | Parsed JSON body (POST/PUT/PATCH). Null for GET/DELETE. |
| `queryParams` | Map | URL query parameters |
| `adTab` | Tab | Resolved AD_Tab |
| `sfEntity` | SFEntity | The ETGO_SF_Entity config record |
| `obContext` | OBContext | Current user/role/org/client |
| `previousResult` | NeoResponse | Set before afterHandle() is called |

| `token` | String | Auth Bearer token |
| `apiBaseUrl` | String | Base URL for outbound API calls |

**Note:** For sub-endpoints (selector, callout, etc.), `requestBody`, `recordId`, and `queryParams` are not populated in the hook context. The handler receives `endpointType` and `fieldName` for routing; the underlying service handles request parsing.

### 2.5 NeoResponse: Building Responses

```java
NeoResponse.ok(jsonObject)                    // 200 + body
NeoResponse.created(jsonObject)               // 201 + body
NeoResponse.noContent()                       // 204, no body
NeoResponse.error(status, "message")          // Any status + error JSON
NeoResponse.error(status, jsonObject)         // Any status + custom body

response.withHeader("X-Custom", "value")      // Add response headers
```

### 2.6 NeoEndpointType: Routing Within a Handler

A single handler can serve different logic per endpoint type:

```java
@Named("salesOrderHandler")
public class SalesOrderHandler implements NeoHandler {

  @Override
  public NeoResponse handle(NeoContext ctx) {
    switch (ctx.getEndpointType()) {
      case CRUD:
        return handleCrud(ctx);
      case DEFAULTS:
        return handleDefaults(ctx);
      case CALLOUT:
        return handleCallout(ctx);
      default:
        return null; // let all other endpoints pass through
    }
  }

  @Override
  public NeoResponse afterHandle(NeoContext ctx) {
    if (ctx.getEndpointType() == NeoEndpointType.DEFAULTS) {
      // Enrich defaults with business-specific values
      JSONObject defaults = ctx.getPreviousResult().getBody();
      defaults.put("warehouse", resolvePreferredWarehouse(ctx));
      return NeoResponse.ok(defaults);
    }
    if (ctx.getEndpointType() == NeoEndpointType.SELECTOR
        && "businessPartner".equals(ctx.getFieldName())) {
      // Filter selector results based on custom criteria
      return filterByActiveContracts(ctx.getPreviousResult());
    }
    return null; // keep default for everything else
  }
}
```

**Granularity levels** available from a single `JAVA_QUALIFIER` on one entity:
- **Per entity** — one handler per tab
- **Per endpoint type** — `switch` on `endpointType`
- **Per field** — `if` on `fieldName` (selectors, actions)
- **Pre vs Post** — `handle()` vs `afterHandle()`

---

## 3. Endpoint Reference

### Window Specs (`SPEC_TYPE = 'W'`)

| Endpoint | Method | Hook Type | fieldName |
|----------|--------|-----------|-----------|
| `/{spec}/{entity}` | GET | CRUD | null |
| `/{spec}/{entity}` | POST | CRUD | null |
| `/{spec}/{entity}/{id}` | GET/PUT/PATCH/DELETE | CRUD | null |
| `/{spec}/{entity}/selectors` | GET | SELECTOR | null |
| `/{spec}/{entity}/selectors/{col}` | GET | SELECTOR | column name |
| `/{spec}/{entity}/{id}/action` | GET | ACTION | null |
| `/{spec}/{entity}/{id}/action/{col}` | POST | ACTION | button column |
| `/{spec}/{entity}/evaluate-display` | POST | EVALUATE_DISPLAY | null |
| `/{spec}/{entity}/callout` | POST | CALLOUT | null |
| `/{spec}/{entity}/defaults` | GET | DEFAULTS | null |

### Process Specs (`SPEC_TYPE = 'P'`)

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/{spec}` | GET | Describe (parameters, metadata) |
| `/{spec}` | POST | Execute process |

### Report Specs (`SPEC_TYPE = 'R'`)

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/{spec}` | GET | Describe (parameters) |
| `/{spec}` | POST | Generate report (binary response) |

Process and report specs do not pass through NeoHandler hooks (they have no ETGO_SF_Entity).

---

## 4. Common Patterns

### Pre-hook: Input Validation

```java
@Override
public NeoResponse handle(NeoContext ctx) {
  if (ctx.getEndpointType() == NeoEndpointType.CRUD
      && "POST".equals(ctx.getHttpMethod())) {
    JSONObject body = ctx.getRequestBody();
    if (body != null && body.optDouble("grandTotal", 0) > 100000) {
      return NeoResponse.error(400, "Orders over 100k require approval");
    }
  }
  return null;
}
```

### Post-hook: Response Enrichment

```java
@Override
public NeoResponse afterHandle(NeoContext ctx) {
  if (ctx.getEndpointType() == NeoEndpointType.CRUD
      && "GET".equals(ctx.getHttpMethod())) {
    JSONObject body = ctx.getPreviousResult().getBody();
    body.put("_computedMargin", calculateMargin(body));
    return NeoResponse.ok(body);
  }
  return null;
}
```

### Pre-hook: Full Override

```java
@Override
public NeoResponse handle(NeoContext ctx) {
  if (ctx.getEndpointType() == NeoEndpointType.DEFAULTS) {
    // Skip the default service entirely, provide custom defaults
    JSONObject defaults = new JSONObject();
    defaults.put("warehouse", getSmartWarehouse(ctx));
    defaults.put("priceList", getPriceListForRole(ctx));
    defaults.put("paymentTerms", "30 days");
    return NeoResponse.ok(defaults);
  }
  return null;
}
```

### Post-hook: Selector Filtering

```java
@Override
public NeoResponse afterHandle(NeoContext ctx) {
  if (ctx.getEndpointType() == NeoEndpointType.SELECTOR
      && "warehouse".equals(ctx.getFieldName())) {
    // Filter warehouse selector to only show user's assigned warehouses
    JSONObject result = ctx.getPreviousResult().getBody();
    JSONArray filtered = filterByUserWarehouses(result.getJSONArray("data"));
    result.put("data", filtered);
    return NeoResponse.ok(result);
  }
  return null;
}
```

---

## 5. Database Tables Quick Reference

### ETGO_SF_SPEC

| Column | Type | Notes |
|--------|------|-------|
| `NAME` | VARCHAR | Unique. Used in URL: `/sws/neo/{NAME}/...` |
| `SPEC_TYPE` | CHAR(1) | `W` = Window, `P` = Process, `R` = Report |
| `AD_WINDOW_ID` | FK | Required when `W` |
| `AD_PROCESS_ID` | FK | Required when `P` or `R` |

### ETGO_SF_ENTITY

| Column | Type | Notes |
|--------|------|-------|
| `NAME` | VARCHAR | Used in URL: `/sws/neo/{spec}/{NAME}/...` |
| `AD_TAB_ID` | FK | Links to AD_Tab |
| `ISINCLUDED` | Y/N | If N, entity returns 404 |
| `ISGET`, `ISPOST`, etc. | Y/N | Per-method enable/disable |
| `JAVA_QUALIFIER` | VARCHAR | CDI `@Named` value for NeoHandler |

### ETGO_SF_FIELD

| Column | Type | Notes |
|--------|------|-------|
| `AD_COLUMN_ID` | FK | Links to AD_Column |
| `ISINCLUDED` | Y/N | Controls field visibility in responses |
| `ISREADONLY` | Y/N | Controls writability on POST/PUT/PATCH |
| `DEFAULTVALUE` | VARCHAR | Override AD_Column default |

---

## 6. Webhook Configuration API

| Webhook | Purpose | Key Parameters |
|---------|---------|----------------|
| `SFUpsertSpec` | Create/update spec | `Name`, `SpecType`, `WindowID`/`ProcessID`, `ModuleID` |
| `SFUpsertEntity` | Create/update entity | `SpecID`, `TabID`, `Name`, method flags, `JavaQualifier` |
| `SFUpsertField` | Create/update field | `EntityID`, `ColumnID`, `IsIncluded`, `IsReadOnly` |
| `SFPopulateSpec` | Auto-populate from AD | `SpecID`, `ExcludeSystemColumns`, `IncludeAllMethods` |
| `SFListWindows` | List available windows | `q` (search) |
| `SFListProcesses` | List available processes | `q` (search) |
| `SFListMenu` | Full menu tree | -- |

All webhooks are invoked via HTTP (see `push-to-neo.js` for programmatic usage from Schema Forge).

---

## Related Documentation

- **API Reference:** `modules/com.etendoerp.go/docs/neo-headless.md`
- **Architecture Overview:** `docs/architecture-overview.md`
- **Research Notes:** `docs/brainstorming-2026-03-10.md`
