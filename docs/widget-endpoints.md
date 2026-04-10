# Widget Endpoints Guide

Widget endpoints are independent NEO Headless APIs that serve data for reusable UI components (KPIs, charts, task lists, activity feeds). Each widget is a standalone spec that can be consumed by any page.

## Architecture

```
Frontend Widget          NEO Headless             Handler (Java)
┌──────────────┐   GET  ┌────────────────┐   CDI  ┌──────────────────┐
│ useWidget()  │ ──────▶│ /sws/neo/      │ ──────▶│ @Named("...")     │
│              │◀────── │ {spec}/data    │◀────── │ implements        │
│ { data,      │  JSON  │                │  Neo   │ NeoHandler        │
│   loading,   │        │ Spec + Entity  │  Resp  │                  │
│   error }    │        │ (DB config)    │        │ handle(context)  │
└──────────────┘        └────────────────┘        └──────────────────┘
```

Each widget = **1 Spec** + **1 Entity** + **1 Handler**.

## Existing Widget Endpoints

| Spec Name | URL | Handler | Description |
|-----------|-----|---------|-------------|
| `widget-kpis` | `GET /sws/neo/widget-kpis/data` | `widgetKpisHandler` | KPI summary cards |
| `widget-revenue-trend` | `GET /sws/neo/widget-revenue-trend/data` | `widgetRevenueTrendHandler` | Monthly revenue chart data |
| `widget-pending-tasks` | `GET /sws/neo/widget-pending-tasks/data` | `widgetPendingTasksHandler` | Pending tasks and alerts |
| `widget-activity` | `GET /sws/neo/widget-activity/data` | `widgetActivityHandler` | Recent activity feed |

## Dashboard Entity Endpoints

Dashboard pages can also consume entity endpoints under `/sws/neo/dashboard/{entity}`.

| Entity | URL | Handler | Description |
|--------|-----|---------|-------------|
| `recent-invoices` | `GET /sws/neo/dashboard/recent-invoices` | `widgetRecentInvoicesHandler` | Completed sales invoices (`CO`, `CL`) from the last 7 days, max 10 records |

## Response Format

All widgets follow the standard NEO Headless response wrapper:

```json
{
  "response": {
    "data": [ ... ],
    "count": 4
  }
}
```

The shape of each item in `data` is widget-specific. See [Response Contracts](#response-contracts) below.

## How to Create a New Widget Endpoint

### Step 1: Create the Java Handler

Create a file in `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/`:

```java
package com.etendoerp.go.schemaforge;

import javax.inject.Named;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.codehaus.jettison.json.JSONArray;
import org.codehaus.jettison.json.JSONObject;

@Named("myWidgetHandler")
public class MyWidgetHandler implements NeoHandler {

  private static final Logger log = LogManager.getLogger(MyWidgetHandler.class);

  @Override
  public NeoResponse handle(NeoContext context) {
    if (!"GET".equals(context.getHttpMethod())) {
      return NeoResponse.error(405, "Method not allowed");
    }

    try {
      JSONArray data = new JSONArray();
      // Build your data here
      data.put(new JSONObject().put("key", "value"));

      JSONObject responseData = new JSONObject();
      responseData.put("data", data);
      responseData.put("count", data.length());

      JSONObject wrapper = new JSONObject();
      wrapper.put("response", responseData);

      return NeoResponse.ok(wrapper);
    } catch (Exception e) {
      log.error("Error in widget handler", e);
      return NeoResponse.error(500, e.getMessage());
    }
  }
}
```

Key rules:
- `@Named("qualifier")` must be unique across all handlers
- Return `NeoResponse.ok(wrapper)` — never null (null means fall-through to CRUD)
- GET-only for read widgets; add POST if the widget accepts parameters
- Keep handlers stateless

### Step 2: Register Spec in sourcedata XML

Add to `modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_SPEC.xml`:

```xml
<!--YOUR_UUID--><ETGO_SF_SPEC>
<!--YOUR_UUID-->  <ETGO_SF_SPEC_ID><![CDATA[YOUR_UUID]]></ETGO_SF_SPEC_ID>
<!--YOUR_UUID-->  <AD_CLIENT_ID><![CDATA[0]]></AD_CLIENT_ID>
<!--YOUR_UUID-->  <AD_ORG_ID><![CDATA[0]]></AD_ORG_ID>
<!--YOUR_UUID-->  <ISACTIVE><![CDATA[Y]]></ISACTIVE>
<!--YOUR_UUID-->  <NAME><![CDATA[widget-my-thing]]></NAME>
<!--YOUR_UUID-->  <DESCRIPTION><![CDATA[Widget: description here]]></DESCRIPTION>
<!--YOUR_UUID-->  <AD_MODULE_ID><![CDATA[94E1B433CF55451EABB764750AC5902A]]></AD_MODULE_ID>
<!--YOUR_UUID-->  <POPULATE><![CDATA[N]]></POPULATE>
<!--YOUR_UUID-->  <SPEC_TYPE><![CDATA[W]]></SPEC_TYPE>
<!--YOUR_UUID--></ETGO_SF_SPEC>
```

### Step 3: Register Entity in sourcedata XML

Add to `modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml`:

```xml
<!--ENTITY_UUID--><ETGO_SF_ENTITY>
<!--ENTITY_UUID-->  <ETGO_SF_ENTITY_ID><![CDATA[ENTITY_UUID]]></ETGO_SF_ENTITY_ID>
<!--ENTITY_UUID-->  <AD_CLIENT_ID><![CDATA[0]]></AD_CLIENT_ID>
<!--ENTITY_UUID-->  <AD_ORG_ID><![CDATA[0]]></AD_ORG_ID>
<!--ENTITY_UUID-->  <ISACTIVE><![CDATA[Y]]></ISACTIVE>
<!--ENTITY_UUID-->  <NAME><![CDATA[data]]></NAME>
<!--ENTITY_UUID-->  <ETGO_SF_SPEC_ID><![CDATA[YOUR_SPEC_UUID]]></ETGO_SF_SPEC_ID>
<!--ENTITY_UUID-->  <AD_MODULE_ID><![CDATA[94E1B433CF55451EABB764750AC5902A]]></AD_MODULE_ID>
<!--ENTITY_UUID-->  <ISINCLUDED><![CDATA[Y]]></ISINCLUDED>
<!--ENTITY_UUID-->  <ISGET><![CDATA[Y]]></ISGET>
<!--ENTITY_UUID-->  <ISGETBYID><![CDATA[N]]></ISGETBYID>
<!--ENTITY_UUID-->  <ISPOST><![CDATA[N]]></ISPOST>
<!--ENTITY_UUID-->  <ISPUT><![CDATA[N]]></ISPUT>
<!--ENTITY_UUID-->  <ISPATCH><![CDATA[N]]></ISPATCH>
<!--ENTITY_UUID-->  <ISDELETE><![CDATA[N]]></ISDELETE>
<!--ENTITY_UUID-->  <JAVA_QUALIFIER><![CDATA[myWidgetHandler]]></JAVA_QUALIFIER>
<!--ENTITY_UUID-->  <SEQNO><![CDATA[10]]></SEQNO>
<!--ENTITY_UUID--></ETGO_SF_ENTITY>
```

Important:
- Entity name is always `data` (convention for widget endpoints)
- `JAVA_QUALIFIER` must match the `@Named("...")` on the handler
- `ETGO_SF_SPEC_ID` must reference the spec UUID from Step 2
- No `AD_TAB_ID` needed — the handler takes over completely

### Step 4: Build & Deploy

```bash
cd {etendo_root}
./gradlew update.database   # Load XML into DB
./gradlew smartbuild         # Compile handler
# Restart Tomcat
```

### Step 5: Verify

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/etendo/sws/neo/widget-my-thing/data
```

### Step 6: Consume in Frontend

```jsx
import { useWidget } from '@/hooks/useWidget.js';
import { useAuth } from '@/auth/AuthContext.jsx';

function MyComponent({ apiBaseUrl }) {
  const { token } = useAuth();
  const { data, loading, error, refresh } = useWidget('widget-my-thing', { token, apiBaseUrl });

  if (loading) return <Skeleton />;
  if (error) return <ErrorBadge message={error} />;
  return <MyWidget data={data} />;
}
```

## Response Contracts

### widget-kpis

```json
{
  "response": {
    "data": [
      {
        "key": "revenueThisMonth",
        "label": "Revenue this month",
        "value": 48250,
        "format": "currency",
        "trend": 12.5,
        "icon": "DollarSign"
      }
    ],
    "count": 4
  }
}
```

Fields: `key` (unique id), `label` (display name), `value` (number), `format` (`currency`|`percent`|`number`), `trend` (% change, positive=up), `icon` (Lucide icon name).

### widget-revenue-trend

```json
{
  "response": {
    "data": [
      {
        "labels": ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"],
        "values": [32000,35000,28000,41000,38000,45000,42000,39000,44000,47000,43000,48250]
      }
    ],
    "count": 1
  }
}
```

Single object with parallel `labels` (month abbreviations) and `values` (amounts) arrays.

### widget-pending-tasks

```json
{
  "response": {
    "data": [
      {
        "type": "warning",
        "text": "3 overdue invoices",
        "link": "/sales-invoice",
        "amount": "$12,400"
      }
    ],
    "count": 4
  }
}
```

Fields: `type` (`warning`|`info`), `text` (description), `link` (route path), `amount` (optional formatted string), `detail` (optional extra text).

### widget-activity

```json
{
  "response": {
    "data": [
      {
        "id": "1",
        "author": "System",
        "text": "Invoice INV-2026-0142 was paid by Empresa ABC",
        "timestamp": "2026-03-09T08:30:00",
        "type": "system"
      }
    ],
    "count": 4
  }
}
```

Fields: `id` (unique), `author` (display name), `text` (message), `timestamp` (ISO 8601), `type` (`system`|`note`).

### dashboard/recent-invoices

```json
{
  "response": {
    "data": [
      {
        "id": "A1B2C3",
        "client": "Hotel Buenas Noches",
        "date": "09-04-2026",
        "amount": 2468.9,
        "status": "CO"
      }
    ],
    "count": 1
  }
}
```

Data is filtered to sales invoices (`issotrx = 'Y'`) in completed statuses (`CO`, `CL`) with `dateinvoiced` in the last 7 days, sorted by newest first, limited to 10 rows.

## Transitioning to Real Data

When ready to connect a widget to real Etendo data:

1. Inject `OBDal` or use existing DAL queries in the handler
2. Replace hardcoded JSONArray with query results
3. Keep the same response shape — frontend needs no changes
4. Consider caching for expensive queries (OBDal session-level cache already helps)

Example pattern for real data:

```java
@Override
public NeoResponse handle(NeoContext context) {
  // ... method check ...
  try {
    // Real query
    OBCriteria<Invoice> criteria = OBDal.getInstance().createCriteria(Invoice.class);
    criteria.add(Restrictions.eq(Invoice.PROPERTY_PAYMENTCOMPLETE, false));
    long count = criteria.count();

    JSONArray data = new JSONArray();
    data.put(kpi("pendingInvoices", "Pending Invoices", count, "number", 0, "Clock"));
    // ... more KPIs from real queries ...

    // Same wrapper
    JSONObject responseData = new JSONObject();
    responseData.put("data", data);
    responseData.put("count", data.length());
    JSONObject wrapper = new JSONObject();
    wrapper.put("response", responseData);
    return NeoResponse.ok(wrapper);
  } catch (Exception e) { ... }
}
```

## Naming Convention

Widget specs use the prefix `widget-` followed by a descriptive kebab-case name:
- `widget-kpis` (not `dashboard-kpis` — widgets are page-agnostic)
- `widget-revenue-trend`
- `widget-pending-tasks`
- `widget-activity`

## File Locations

| Component | Path |
|-----------|------|
| Handler Java files | `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/Widget*.java` |
| Spec XML | `modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_SPEC.xml` |
| Entity XML | `modules/com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml` |
| Frontend hook | `tools/app-shell/src/hooks/useWidget.js` |
| Dashboard consumer | `tools/app-shell/src/pages/DashboardPage.jsx` |
