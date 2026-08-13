# 04 — API Layer

REST API architecture for generated Etendo modules in production: endpoint structure, request lifecycle, authentication, error handling, and performance characteristics.

---

## 1. Endpoint Architecture

Each generated window module produces a set of RequestHandler endpoints. These are **not JAX-RS** — they implement `com.etendoerp.go.rest.RequestHandler`, a custom servlet-dispatched interface provided by the base module.

### 1.1 Standard Endpoints

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| `GET` | `/api/{entity}` | List records with pagination, filtering, sorting | JSON array of DTOs |
| `GET` | `/api/{entity}/{id}` | Single record by ID | JSON object (DTO) |
| `POST` | `/api/{entity}` | Create new record | Created DTO (201) |
| `PUT` | `/api/{entity}/{id}` | Update existing record | Updated DTO (200) |
| `DELETE` | `/api/{entity}/{id}` | Delete record | Empty (204) |
| `GET` | `/api/{entity}/selector/{field}` | FK autocomplete search | JSON array of `{id, label}` |

### 1.2 URL Parameters (GET List)

| Parameter | Example | Purpose |
|-----------|---------|---------|
| `_limit` | `_limit=20` | Page size (default: 20, max: 100) |
| `_offset` | `_offset=40` | Skip N records |
| `_sortBy` | `_sortBy=name` | Sort column |
| `_sortDir` | `_sortDir=desc` | Sort direction (asc/desc) |
| `{field}` | `documentStatus=CO` | Equality filter on any visible field |
| `_search` | `_search=widget` | Text search across searchable fields |

### 1.3 Selector Endpoints

Selector endpoints power the FK autocomplete fields in the frontend. When a user types in a foreign key field (e.g., Business Partner), the frontend calls:

```
GET /api/purchaseorder/selector/businessPartner?_search=acme&_limit=10
```

The response is a simplified list:

```json
[
  { "id": "A1B2C3D4...", "label": "Acme Corporation" },
  { "id": "E5F6G7H8...", "label": "Acme Supplies Ltd" }
]
```

The selector query uses the `AD_Reference_Value` configuration to determine which table and identifier column to search.

### 1.4 Transactional Email Contract Endpoint

Transactional email uses a contract command endpoint, not a provider passthrough endpoint:

```
POST /sws/neo/email-contracts/{contractName}/send
```

The request body must contain only the versioned command data required by the contract, such as `recordId`, `intent`, and `idempotencyKey`. The browser must not send provider API keys, sender identity, template names selected outside the contract, or arbitrary `to/template/data` payloads.

Server-side flow:

1. Validate JWT and initialize Etendo context.
2. Resolve the named contract and version.
3. Enforce role, tenant, organization, and record authorization.
4. Resolve recipient and variables from trusted server records.
5. Apply throttle, idempotency, suppression, and kill switches.
6. Write audit state.
7. Call the provider adapter with server-side configuration only.
8. Return a structured status such as `SENT`, `DUPLICATE`, `THROTTLED`, `UNAUTHORIZED`, `NO_RECIPIENT`, `SUPPRESSED`, `KILL_SWITCHED`, or `PROVIDER_FAILED`.

See [../transactional-email-framework.md](../transactional-email-framework.md) and [../email-contracts.md](../email-contracts.md).

---

## 2. Request/Response Flow

### 2.1 Full Request Lifecycle

```
Browser (React SPA)
  │
  │  HTTP request with session cookie
  ▼
Tomcat 9 (port 8080)
  │
  │  Servlet dispatcher matches /api/* pattern
  ▼
RequestHandler Router
  │
  │  Routes to specific entity handler based on URL path
  ▼
Authentication Check
  │
  │  Validates AD_Session, sets OBContext (user, role, org, client)
  ▼
RequestHandler.doGet() / doPost() / doPut() / doDelete()
  │
  │  Builds HQL query or processes request body
  ▼
OBDal (Hibernate wrapper)
  │
  │  Executes HQL → SQL via Hibernate
  ▼
PostgreSQL
  │
  │  Returns ResultSet
  ▼
Entity → DTO Mapping
  │
  │  Maps OBDal entity fields to DTO (only visible fields)
  ▼
JSON Serialization (org.codehaus.jettison)
  │
  │  DTO → JSONObject / JSONArray
  ▼
HTTP Response
  │  Content-Type: application/json
  │  Status: 200 / 201 / 204 / 400 / 404 / 500
  ▼
Browser
```

### 2.2 GET List — Query Construction

The `doGet` handler builds an HQL query combining:

1. **Tab where clause** — hardcoded filter from AD_Tab configuration (e.g., `e.salesTransaction = true`). Applied as an immutable WHERE condition.
2. **Auto-setter fields** — fields automatically set from parent context (e.g., `organization`, `client`). Injected as additional WHERE conditions.
3. **User filters** — query parameters from the URL mapped to HQL conditions.
4. **Pagination** — `LIMIT` and `OFFSET` appended.
5. **Sorting** — `ORDER BY` from `_sortBy` / `_sortDir` parameters.

```java
// Simplified pseudocode
String hql = "SELECT e FROM PurchaseOrder e WHERE 1=1";
hql += " AND e.salesTransaction = false";          // tab where clause
hql += " AND e.organization.id = :orgId";          // org filter from OBContext
hql += " AND e.documentStatus = :statusFilter";    // user filter
hql += " ORDER BY e.documentNo DESC";              // sorting
Query query = OBDal.getInstance().createQuery(hql);
query.setMaxResults(limit);
query.setFirstResult(offset);
```

### 2.3 POST/PUT — Write Flow

```
1. Parse JSON request body
2. Validate required fields (non-null checks)
3. Create or load OBDal entity
4. Set field values from DTO → entity mapping
5. Set auto-setter fields (organization, client from OBContext)
6. OBDal.getInstance().save(entity)
7. Hibernate flush triggers EventHandler (beforeSave)
   → EventHandler computes system field derivations
   → If EventHandler throws → entire transaction rolls back
8. Transaction commits (container-managed)
9. Return created/updated entity as DTO
```

### 2.4 DELETE — Soft vs Hard Delete

Etendo convention is **soft delete** via the `isActive` flag:

- `DELETE /api/{entity}/{id}` sets `isActive = 'N'` rather than removing the row.
- The GET list endpoint filters `WHERE e.active = true` by default.
- Hard delete is reserved for records that have never been committed to a transaction (draft records).

---

## 3. Authentication and Authorization

### 3.1 Session Management

Etendo uses server-side sessions stored in the `AD_Session` table:

```
Browser sends cookie → Tomcat session ID
  → Maps to AD_Session record
  → AD_Session contains: user, role, organization, client, warehouse
  → OBContext initialized from AD_Session for every request
```

**Session lifecycle:**
- Created on login (Etendo login page or API login endpoint).
- Stored in PostgreSQL (`AD_Session` table) with `session_active = 'Y'`.
- Expires after configurable timeout (default: 30 minutes of inactivity).
- Destroyed on logout (sets `session_active = 'N'`).

### 3.2 Per-Request Authorization

Every RequestHandler call checks:

1. **Session valid** — `AD_Session.session_active = 'Y'` and not expired.
2. **Window access** — `AD_Window_Access` table grants the user's current role access to this window. If no row exists, the request returns 403.
3. **Process access** — For process execution endpoints, `AD_Process_Access` is checked.
4. **Organization access** — The user's role has access to the record's organization (via `AD_Role_OrgAccess`). Records from inaccessible organizations are invisible.

### 3.3 Multi-Organization Data Isolation

OBContext automatically filters all HQL queries by organization:

```
User logs in with Role "Spain Sales" → allowed orgs: [ES-BCN, ES-MAD]
  → GET /api/purchaseorder returns only orders from ES-BCN and ES-MAD
  → POST /api/purchaseorder auto-sets organization to user's current org
  → Attempt to access order from US-NYC → 404 (filtered out by OBContext)
```

This is **not application-level filtering** — Hibernate interceptors inject organization conditions into every query. Generated modules inherit this behavior automatically through OBDal.

---

## 4. API Versioning

### 4.1 Current State

The generated modules currently have **no API versioning**. Each entity exposes a single set of endpoints:

```
/api/purchaseorder          (no version prefix)
/api/purchaseorder/{id}
```

DTOs are generated in a versioned package (`dto/v1/PurchaseOrderDTO.java`), but the API routing does not use version prefixes.

### 4.2 Target Architecture (from TDD-anex)

The design documents describe a versioned API model:

```
/api/v1/purchaseorder       (DTO v1)
/api/v2/purchaseorder       (DTO v2 — new fields, changed types)
```

With:
- Multiple DTO versions coexisting in the codebase (`dto/v1/`, `dto/v2/`).
- Version-specific RequestHandlers or a version-routing layer.
- Frontend declares which `apiVersion` it targets.
- Old API versions remain available during migration period.

### 4.3 Current Gap

The version routing infrastructure described in TDD-anex is not yet implemented:
- `check-version.js` (contract test for version compatibility) does not exist.
- No version prefix in URL routing.
- No multi-version DTO coexistence at the API level.

**Practical impact:** Breaking API changes (renamed fields, removed fields, type changes) currently require simultaneous frontend + backend deployment. The frontend cannot gracefully handle API shape mismatches.

---

## 5. Error Handling

### 5.1 Standard Error Response

All errors return a consistent JSON structure via `ErrorSerializer`:

```json
{
  "error": {
    "type": "ValidationError",
    "message": "Field 'documentNo' is required",
    "status": 400
  }
}
```

### 5.2 Exception → HTTP Status Mapping

| Exception | HTTP Status | Meaning |
|-----------|-------------|---------|
| `OBSecurityException` | 403 | Role lacks window/process access |
| `OBObjectNotFoundException` | 404 | Entity with given ID not found (or filtered by org) |
| `OBException` (validation) | 400 | Business rule violation, precondition failure |
| `OBException` (general) | 500 | Unexpected OBDal error |
| `HibernateException` | 500 | Database-level error (constraint violation, deadlock) |
| `JSONException` | 400 | Malformed request body |

### 5.3 Transaction Rollback on Error

OBDal operates in a single-transaction-per-request model:

- If any exception occurs during `doPost` or `doPut`, the entire transaction rolls back.
- EventHandler exceptions (thrown during `flush()`) propagate up and cause rollback.
- The response includes the error message; no partial data is persisted.
- No distributed transactions, no Sagas, no compensation logic needed.

### 5.4 Validation Errors from Processes

`DalProcess` implementations perform precondition checks before executing:

```java
// Pseudocode
if (!preconditionsMet(params)) {
  throw new OBException("Cannot complete: order has no lines");
}
// proceed with process steps
```

The precondition failure surfaces as a 400 response with the message.

---

## 6. Performance Characteristics

### 6.1 HQL Query Efficiency

**Tab where clauses** are static conditions appended to every query. They act as implicit filters but do not leverage database indexes unless the filtered columns are indexed.

**Recommendation:** Ensure PostgreSQL indexes exist on:
- Columns used in tab where clauses (e.g., `salesTransaction`, `documentStatus`).
- Foreign key columns used in selector queries.
- The `isActive` column (filtered on every query).
- The `organization` column (filtered by OBContext on every query).

### 6.2 N+1 Query Problem

List endpoints returning entities with foreign key fields are susceptible to N+1 queries:

```
GET /api/purchaseorder?_limit=20
  → 1 query for 20 purchase orders
  → 20 queries to resolve businessPartner name for each order
  → 20 queries to resolve warehouse name for each order
  → Total: 41 queries instead of 1-3
```

**Mitigation strategies:**
- Use HQL `JOIN FETCH` for commonly displayed FK fields.
- Configure Hibernate batch fetching (`@BatchSize` equivalent in hbm.xml).
- Return FK IDs only; let the frontend resolve names via selector cache.

### 6.3 Connection Pool

Etendo uses **HikariCP** for JDBC connection pooling:

| Setting | Typical Value | Impact |
|---------|---------------|--------|
| `maximumPoolSize` | 10–50 | Max concurrent DB connections |
| `minimumIdle` | 5 | Connections kept warm |
| `connectionTimeout` | 30000ms | Wait time for connection from pool |
| `idleTimeout` | 600000ms | Close idle connections after 10 min |
| `maxLifetime` | 1800000ms | Recycle connections every 30 min |
| `leakDetectionThreshold` | 60000ms | Log warning if connection held > 60s |

**Pool exhaustion** occurs when all connections are in use and new requests wait longer than `connectionTimeout`. This manifests as request timeouts and 500 errors.

### 6.4 Response Size

List endpoints can return large JSON payloads when entities have many visible fields. A 20-record response with 40 fields each produces ~30-50 KB of JSON.

**Mitigations:**
- Enforce server-side `_limit` maximum (100 records).
- Consider field selection (`_fields=id,name,status`) for list views — not currently implemented.
- Enable gzip compression in Tomcat (`compression="on"` in `server.xml`).

### 6.5 Caching

**Current state: No caching.** Every GET request executes a fresh HQL query against PostgreSQL.

Potential caching layers (not yet implemented):
- **Hibernate L2 cache** — entity-level caching. Requires careful invalidation configuration.
- **HTTP cache headers** — `Cache-Control`, `ETag` for list endpoints. Suitable for reference data that changes infrequently.
- **Application-level cache** — in-memory cache for selector data (business partners, products). Invalidated on write.

---

## 7. Critical Failure Points

### Severity: Red (Service Impact)

| Failure | Cause | Detection | Mitigation |
|---------|-------|-----------|------------|
| OBDal session/connection leak | Code path that opens OBDal session without closing (e.g., exception skips `finally` block) | HikariCP `leakDetectionThreshold` warnings in logs; eventual pool exhaustion | Ensure all RequestHandler methods use try-finally for OBDal cleanup; monitor HikariCP metrics |
| HQL injection | Unsanitized user input concatenated into HQL string | Unexpected query results; data exfiltration | Always use parameterized queries (`query.setParameter()`); never concatenate URL params into HQL |
| Transaction timeout | Large batch operation exceeds DB statement timeout | PostgreSQL cancels query; 500 error returned | Set reasonable `statement_timeout` in PostgreSQL; break large operations into batches |

### Severity: Yellow (Performance/Reliability Degradation)

| Failure | Cause | Detection | Mitigation |
|---------|-------|-----------|------------|
| N+1 queries on FK-heavy entities | Lazy loading of related entities in list endpoint | Slow response times (>2s for 20 records); high query count in DB logs | Use JOIN FETCH or batch fetching for commonly accessed FKs |
| No rate limiting | Single client sends hundreds of requests per second | CPU/DB saturation; other users experience timeouts | Implement rate limiting at reverse proxy level (nginx) |
| No API response caching | Every GET hits PostgreSQL, even for identical repeated queries | Unnecessary DB load; slower response times under load | Add HTTP cache headers for read-heavy, rarely-changing data |
| Large result sets without pagination | Client omits `_limit` parameter | Massive JSON response; memory pressure on Tomcat | Enforce default and maximum `_limit` server-side |
| Selector queries on large tables | Autocomplete search on table with millions of rows (e.g., products) | Slow typing response in FK fields (>500ms) | Ensure indexed columns; limit selector result count; consider search-as-you-type debouncing |
