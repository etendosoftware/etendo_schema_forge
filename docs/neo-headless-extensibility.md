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

### 1.5 Process Precondition Validation

Some legacy processes (PL/pgSQL / classic) only validate their requirements **after** they start running, returning late, opaque errors. Example: "Create Amortization" (AD_Process `800125`, `Processed` button on `A_Asset`) fails inside `A_ASSET_POST` with `Period not defined.` (missing usable life) or `The Currency field must be defined...` (missing currency), without telling you which field to fix.

**Precondition Validation** is a **generic, declarative** choke-point in `NeoProcessService.executeProcess` that runs right after `validateMandatoryParams` and **before** the process executes. If any precondition is unmet it returns a structured `400` **before** firing the legacy process, listing the missing NEO fields.

**There is no per-window logic in Java** — everything is declared as data in `ETGO_SF_ENTITY.PRECONDITIONS`. The validator (`NeoProcessPreconditionValidator`) is static and pure; the condition evaluator (`PreconditionConditionEvaluator`) is a dedicated server-side evaluator (NOT the browser's `DynamicExpressionParser`, which emits JavaScript).

#### JSON shape (`ETGO_SF_ENTITY.PRECONDITIONS`)

Keyed by `AD_Process_ID`. Each rule: `field` (required), `requiredWhen` (optional), `message` (optional).

```json
{
  "800125": [
    { "field": "usableLifeMonths", "requiredWhen": "@calculateType@ != 'PE' && @amortize@ != 'YE'" },
    { "field": "usableLifeYears",  "requiredWhen": "@amortize@ == 'YE'" },
    { "field": "currency" }
  ]
}
```

- `field` — NEO field identifier (camelCase DAL property), not the raw DB column.
- `requiredWhen` — optional condition; if absent the precondition is unconditional; if present and it evaluates to `false`, the rule is skipped.
- `message` — **reserved / not yet surfaced.** Accepted for forward-compatibility but the runtime returns only a single generic `"Preconditions not met"` message plus the `missing` field list; this per-rule value is not read or emitted.

> **Assets mapping (verified against `Asset.java`):** `@amortize@` = DB `Assetschedule` (values `YE`/`MO`, "Amortize"). It is NOT `depreciationType` (that is a different column, `Amortizationtype`). `@calculateType@` = DB `amortizationcalctype` (values `PE`/`TI`).

#### `requiredWhen` syntax

References record fields with `@prop@`, quoted literals, and operators `==`, `!=`, `&&`/`&` (AND), `||` (OR). String-based comparison; a null field is never equal to a non-null literal.

#### Response when preconditions are unmet

```json
{
  "error": {
    "code": "PRECONDITIONS_UNMET",
    "status": 400,
    "message": "Preconditions not met",
    "missing": ["usableLifeMonths", "currency"]
  }
}
```

#### Behavior (no-op / fail-open)

- No tab context (`inpTabId`), no `SFEntity` matching that tab, or no resolvable record → **no-op** (continues; standalone process-specs already use `validateMandatoryParams`).
- The record is resolved by `params.recordId` / `inpRecordId` / the table's key column.
- Any unexpected validator error is swallowed (**fail-open**): the process runs and the legacy guards remain the backstop — execution is never blocked by a validator bug.

#### How it is declared (reusable)

The declaration is written to the column via the Schema Forge pipeline (`decisions.json` → `push-to-neo.js`), so any window can declare preconditions without touching Java. Assets is the **first consumer**, not a special case in code.

#### When to declare preconditions (scope)

Preconditions fit a **narrow** case: a field that is **conditionally required but NOT AD-mandatory** — the record saves fine without it, yet a specific process needs it (e.g. an asset's `usableLifeMonths` / `currency` for Create Amortization). Do **not** use them for:

- **AD-mandatory fields** — they can never reach the process null, so there is nothing to check.
- **Failures that are not about a missing record field** — `no lines`, `already processed`, `period closed`, `business partner blocked`, org/doctype config, stock. These are line/state/environment checks **outside** this model.

A review of the NEO-exposed PL processes (Process Order / Invoice / Shipment, period open-close, movements, amortization posting, BOM explode) found that **Create Amortization is essentially the only good fit** — every other process fails on the out-of-model conditions above. Surfacing those up front would require extending the model with new check types (child-rows-exist, document-status, related-state), which is not implemented.

> **Cross-reference:** for genuinely custom process logic (beyond validating declarative preconditions) use the `NeoHandler` pattern (`@Named` qualifier on `ETGO_SF_ENTITY.JAVA_QUALIFIER`) described in [§2. NeoHandler: CDI Hook System](#2-neohandler-cdi-hook-system).

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
> broken default dispatch. See §4 "Pre-hook: Intercept Completion to Preserve Classic Hooks/Extension
> Points" for the general shape of the fix this handler implements.

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

### Post-hook: Sync a Related Entity from a Parent Field

**Trigger condition:** suspect this problem whenever a single-value column on the saved entity
is meant to drive rows in a *different* table that real backend logic actually reads (login,
access checks, reporting), but the Go SPA can only sensibly expose a single-select control for
it — the target table's own selector may be unusable for populating that control (e.g.
restricted to values that already exist, useless for assigning a *new* one).

**Example (ETP-4512):** `AD_User.Default_Ad_Role_ID` is the only column the Go SPA's
single-role-per-user dropdown can write to, but real login/window-access checks read
`AD_User_Roles`, not `Default_Ad_Role_ID`. `UserRoleAssignmentHandler` (`@Named("user")`)
deletes any existing `AD_User_Roles` row(s) for the saved user and inserts exactly one new row
for the role currently in `Default_Ad_Role_ID`, keeping the two in sync and enforcing at most
one active role:

```java
@Override
public NeoResponse afterHandle(NeoContext context) {
  if (context.getEndpointType() != NeoEndpointType.CRUD) return null;
  String method = context.getHttpMethod();
  if (!"PUT".equalsIgnoreCase(method) && !"PATCH".equalsIgnoreCase(method)) return null;
  String userId = context.getRecordId();
  if (userId == null) return null;
  try {
    OBContext.setAdminMode(true);
    try {
      syncUserRole(userId); // delete existing AD_User_Roles rows, insert one for defaultRole
    } finally {
      OBContext.restorePreviousMode();
    }
  } catch (Exception e) {
    log.warn("sync error for user {}: {}", userId, e.getMessage(), e);
  }
  return null; // side effect only, never replaces the response
}
```

Real implementation: `UserRoleAssignmentHandler` (ETP-4512, `AD_User_Roles` from
`Default_Ad_Role_ID`). Never fail the parent request over this side effect — log and swallow,
same as `TbaiConfigSequenceHandler`'s sequence-assignment pattern.

### Post-hook: Guard a Field Against Callout Cross-Updates

**Trigger condition:** suspect this problem whenever a field must be *independent* from another
field on the same document, but a classic Etendo callout on that other field auto-fills it as a
side effect. `NeoCalloutService` re-executes the same classic callout server-side that Classic UI
runs client-side, so the coupling reproduces in NEO even though the frontend never asked for it —
editing field A silently overwrites field B's value (or the user's own prior edit to it) the next
time A's callout fires.

This was first solved narrowly for currency (ETP-4029, `blockCalloutCurrencyUpdate`: block a
callout-driven currency change unless the user edited currency directly) and generalized into a
reusable, field-name-parameterized helper in ETP-4531 to decouple `accountingDate` (`DateAcct`)
from each document's own date (`invoiceDate`/`movementDate`/etc.) on Sales Invoice, Purchase
Invoice, Goods Receipt, and Goods Shipment — four unrelated classic callouts
(`SifInvoiceOperationDateCallout`/`SE_Invoice_AccountingDate`, `SL_InOut_AccountingDate`, ...) all
carrying the exact same anti-pattern on every postable-document table.

**The guard, generalized:** `NeoHandlerUtils.blockCalloutFieldUpdate(updates, triggerField,
fieldName)` removes a callout-driven update to `fieldName` from the callout response's `updates`
map, *unless* `fieldName` is itself the field that triggered the callout (in which case the user
edited it directly and the update must pass through). Call it from your handler's `afterCallout()`:

```java
@Override
public NeoResponse afterCallout(NeoContext context) {
  NeoHandlerUtils.CalloutFields fields = NeoHandlerUtils.extractCalloutFields(context);
  if (fields == null) return null;
  NeoHandlerUtils.blockCalloutFieldUpdate(fields.updates(), fields.triggerField(), "accountingDate");
  return null; // keep the (mutated) previous result
}
```

**⚠️ One guard point is not enough — the same classic callout also fires outside the interactive
callout endpoint.** `afterCallout()` only covers `POST /{spec}/{entity}/callout` (the per-field
interactive callout). Two other paths execute the identical classic callout and are *not* routed
through any `NeoHandler` hook:
- `GET /{spec}/{entity}/defaults` (new-record form bootstrap) — `NeoDefaultsService` runs the
  callout cascade to resolve field defaults before the form ever renders.
- `POST` create — the callout cascade re-runs during record creation, and relying on "the field
  survives if it was already a body key" is not a real guarantee.

Both paths funnel through the single choke point `NeoDefaultsCascadeHelper.processCalloutForField`,
so the fix is a second call to the *same* `blockCalloutFieldUpdate` helper there — a table/property-name
check, not a per-window branch, alongside the other cross-cutting invariants already hardcoded in
that helper family (PK/audit-column skips, `AD_Reference_ID` literals). Guarding only `afterCallout()`
and skipping `processCalloutForField` leaves the GET `/defaults` and POST create paths silently
unprotected — cover all three entry points for any field-independence guard of this shape.

Real implementations: `AbstractInvoiceHeaderHandler#blockCalloutCurrencyUpdate` (ETP-4029, currency).

**⚠️ Superseded (2026-07-17):** the `accountingDate` implementation of this pattern —
`AbstractInvoiceHeaderHandler#afterCallout` (shared by `SalesInvoiceHeaderHandler` and
`PurchaseInvoiceHeaderHandler`), `GoodsReceiptHeaderHandler#afterCallout`,
`GoodsShipmentHeaderHandler#afterCallout`, and the `accountingDate` call into
`NeoDefaultsCascadeHelper#processCalloutForField` — is being removed. ETP-4531 was redefined from
"keep document date and accounting date independent" to "unify them: show a single visible date,
write it to both columns internally." The native classic-AD callout cascade
(`SE_Invoice_AccountingDate` / `SL_InOut_AccountingDate`) is now intentionally left unguarded so it
flows through on save. See `docs/feedback.md` ("[2026-07-17] ETP-4531 — Scope redefinition...") and
the frontend-side change (`accountingDate` → `visibility: system` in
`sales-invoice`/`purchase-invoice`/`goods-shipment`/`goods-receipt`/`purchase-order`'s
`decisions.json`, in `etendo_schema_forge`). The generic `blockCalloutFieldUpdate` helper and its
three-entry-point coverage requirement above remain valid guidance for the next field-independence
guard (e.g., currency, ETP-4029) — only the `accountingDate` application of it is obsolete.

### Pre-hook: Intercept Completion to Preserve Classic Hooks/Extension Points

**Trigger condition:** suspect this problem whenever a document's `DocAction` column is backed by
an AD_Process that NEO's generic classic-process dispatch cannot correctly invoke. This shows up in
two ways:
- The process **NPEs** under NEO's contextless dispatch, because the Java class it runs expects a
  fully-populated `ProcessContext` that NEO never builds (GL Journal / `FIN_AddPaymentFromJournal`,
  ETP-4244).
- The process is a **raw DB procedure with no `JavaClassName`**, so NEO's dispatch calls the
  procedure directly and silently skips the Java wrapper Classic UI uses — and with it, any
  CDI-based extension point that wrapper invokes (AP/AR Invoice / `ProcessInvoiceUtil` →
  `ProcessInvoiceHook`, ETP-4388).

In both cases the symptom is the same: completing the document through NEO "works" (the row's
`DocStatus` changes) but side effects that Classic UI performs on completion are missing.

**General shape of the fix** — a `NeoHandler.handle()` pre-hook that:
1. Detects the completion request: CRUD `PATCH`/`PUT` with `documentAction=CO` in the body, OR an
   ACTION endpoint (`fieldName == "documentAction"`) with `fieldValues.documentAction=CO`.
2. Builds `VariablesSecureApp`/`ConnectionProvider` via
   `NeoDefaultsService.buildVariablesSecureApp(context.getObContext())` and
   `new DalConnectionProvider(false)`.
3. Obtains the real classic-code entry point — **the mechanism varies with what kind of class it
   is**, not just `ProcessBundle`:
   - `ProcessBundle`-based process class (e.g. `FIN_AddPaymentFromJournal`, invoked as
     `new FIN_AddPaymentFromJournal().execute(bundle)`) — see
     `GlJournalHeaderHandler#completeJournal`.
   - Plain CDI-injected utility class (e.g. `ProcessInvoiceUtil`, invoked as
     `processInvoiceUtil.process(...)`) obtained via
     `WeldUtils.getInstanceFromStaticBeanManager(ProcessInvoiceUtil.class)` — see
     `AbstractInvoiceHeaderHandler#completeInvoiceIfNeeded`. Do not assume `ProcessBundle` is the
     only route; a class with its own `@Inject` fields needs a Weld-managed instance instead.
4. Translates the classic result (`OBError` / `ProcessBundle.getResult()`) via
   `NeoProcessService.translateClassicResult(...)`.
5. Short-circuits `handle()` by returning that `NeoResponse` — the default dispatch never runs.

```java
@Override
public NeoResponse handle(NeoContext ctx) {
  if (isCompleteAction(ctx)) {
    return completeMyDocument(ctx); // builds vars/conn, runs the classic entry point,
                                     // translates the result, returns it
  }
  return null;
}
```

> **⚠️ If the classic entry point has its own CDI-injected extension-point collection, you MUST
> obtain it through Weld.** `ProcessInvoiceUtil` has an `@Inject @Any Instance<ProcessInvoiceHook>
> hooks` field that is only populated when the instance itself is CDI-managed.
> `new ProcessInvoiceUtil()` would leave `hooks` empty and silently skip every hook — reproducing
> the exact bug this pattern fixes, just moved one layer down. Always resolve such classes via
> `WeldUtils.getInstanceFromStaticBeanManager(...)`, never `new`.

> **⚠️ Ordering: run the completion intercept AFTER other pre-completion side effects, not before.**
> If `handle()` already has other steps that must mutate the document before it completes (e.g.
> `AbstractOrderHeaderHandler.applyTotalDiscountBeforeComplete` recalculating a discount line), the
> completion-intercepting call must come after them. Short-circuiting `handle()` early returns
> straight to the caller, so any side-effecting step queued after it silently never runs. This exact
> ordering bug was caught in ETP-4388's review cycle — `completeInvoiceIfNeeded` must be called after
> `validateLineQtyBeforeComplete` and after `applyTotalDiscountBeforeComplete` in both
> `SalesInvoiceHeaderHandler` and `PurchaseInvoiceHeaderHandler`.

Real implementations: `GlJournalHeaderHandler#completeJournal` (ETP-4244),
`AbstractInvoiceHeaderHandler#completeInvoiceIfNeeded` (ETP-4388, shared by
`SalesInvoiceHeaderHandler` and `PurchaseInvoiceHeaderHandler`).

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
