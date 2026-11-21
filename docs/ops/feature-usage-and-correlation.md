# Feature Usage Analytics and Backend Request Correlation (ETP-5646)

Extends the shared observability facade of ETP-5605 / ETP-6228
(`tools/app-shell/src/lib/observability`, backend `NeoTelemetryService`). Nothing here replaces
CloudWatch Logs transport or ConfigCat, and nothing here enables infrastructure: every item that
needs a deployment, a credential or a purchase is labelled **pending**.

## 1. Analytics boundaries

| Question | Source of truth | Not the source |
|---|---|---|
| Which features are opened, by whom, how often; adoption, retention, behavioural funnels | **Frontend Product Analytics** (`feature_opened`, Mixpanel channel) | server logs |
| Did the operation commit, fail, or roll back; diagnostics; cross-product correlation | **Backend structured logs** and the `backend_*` events emitted after commit | frontend clicks |

* CloudWatch-forwarded logs **do not become Product Analytics events**. Forwarding and parsing
  never claim an automatic conversion into product events.
* A consolidated product funnel that needs server steps requires a **dedicated Product Analytics
  server intake**, separate from CloudWatch transport. That is an optional follow-up, not included
  and not configured by log forwarding.
* Frontend and server numbers answer different questions and are never added together:
  `feature_opened` counts opens; `backend_write_operation_completed` and the `backend_*` business
  events count committed operations; the `neo_request` log line counts HTTP responses.

## 2. Feature key (canonical spec)

One stable key per actionable menu entry, derived from `menu.json` by
`tools/app-shell/src/lib/featureCatalog.js`:

| Kind | Menu entry | Key |
|---|---|---|
| `window` | has `windowId`, or is a `routeOnly` spec window | `window.<name>` |
| `process` | has `obuiappProcessId` | `process.<name>` |
| `report` | has `reportId` (route `report-viewer?report=<id>`) | `report.<reportId>` |
| `custom` | any other page (dashboard, inbox, settings, report category lists) | `custom.<name>` |

Pattern `^(window|process|report|custom)\.[a-z0-9][a-z0-9-]{0,62}$`, at most 80 characters. An
entry with `redirect` resolves to its target, so an alias is never a second feature. A route outside
the menu has no feature. The key never holds a record id, label or user input. Renaming a menu
`name` changes the key: treat it as a breaking change of the analytics series.

## 3. Instrumentation (frontend)

`ObservabilityRouteTracker` resolves the feature of every location (menu click, in-app link,
**direct URL**, or a query-only change such as `?report=`) and calls `enterFeature`
(`observability/featureUsage.js`):

1. emits `feature_opened {category: product_usage, featureKey, source}` **once** per open;
   `source` is `direct_url` for the first route of a page load, `navigation` afterwards;
2. sets `featureKey` in the observability context, so Datadog RUM views, actions, errors and
   resources carry it as global context (through the gateway allowlist);
3. binds the key to this tab for first-party requests.

Not counted: re-renders, list to record inside the same feature, query/hash changes inside it,
routes outside the menu. Counted again: returning to a feature after leaving it, and the first
screen of a new identity after an identity switch or logout. Two tabs are two JS realms and count
their own opens. `window_opened` and `invoice_inbox_opened` predate this event; use
`feature_opened` and do not sum them with it.

User and tenant ids are not set here: the common identity context (ETP-6228: `ad_user_id`,
`ad_client_id`, `etgo_account_id`) already travels on every event.

### Request attribution

`apiFetch` (`app-shell-core`, `auth/featureContext.js`) adds `X-Etendo-Feature: <key>` to
**first-party** requests only (relative URL, or the configured base's origin). The `feature`
request option overrides the tab's feature for one request; an invalid key is dropped, never
repaired. The key is bound to the account it was set under: another account, or no session, never
carries it. It is read when the request is dispatched: a read carries the feature current when it was
issued; a queued write (serialised per record) carries the one current when it leaves the queue.

Tooling note: `@etendosoftware/app-shell-core` must be released with `auth/featureContext.js`
before this app builds against the published package; until then build and test with `LOCAL_CORE=1`.

## 4. Backend context (com.etendoerp.go)

See `modules/com.etendoerp.go/docs/backend-observability.md`, section *Feature context and request
correlation*. Summary of the trust model:

* user and `AD_Client_ID` come from the authenticated session (bound in
  `EnvironmentRequestAuthenticator.bind`), never from a header;
* `X-Etendo-Feature` is honoured only without `Origin` or from an allowlisted `Origin`
  (`CorsUtils`), validated against the pattern above, else ignored;
* per-request log context is cleared in `finally` (normal, error status, exception) and for async
  work via `NeoRequestLogContext.wrap`;
* `Access-Control-Allow-Headers` includes `X-Etendo-Feature` and `X-Request-Id`.

### Log line (`logger com.etendoerp.go.telemetry.NeoRequest`)

```json
{"event":"neo_request","feature_key":"window.sales-order","ad_user_id":"100",
 "ad_client_id":"23C59575B9CF467C9620760EB255B389","request_id":"2d25ec33-...","operation":"write",
 "outcome":"success","dd.trace_id":"1234567890123456789","dd.span_id":"987654321",
 "frontend_trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","service":"etendo-go","env":"production",
 "version":"1.2.3","http_status":200,"latency_ms":41}
```

`outcome`: `success` (<400), `rejected` (4xx), `error` (5xx), `rollback` (an exception left the
chain; the DAL request filter rolls back). `operation` is only `read`/`write`: no path, query,
payload, name, e-mail or secret. `dd.*` appear only when the Datadog Java agent is attached.

**Committed successes** are counted from the business event emitted after commit (the `backend_*`
events), not from this line: `success` here means the response was below 400.

## 5. Datadog forwarding and parsing (CloudWatch transport kept)

Pending: nothing below is configured by this change.

* Transport stays CloudWatch Logs; forward with the Datadog Forwarder Lambda (or Amazon Data
  Firehose) subscribed to the ECS log groups (`scripts/tail-logs.sh` lists them).
* The line is JSON: use a Datadog log pipeline with the JSON preprocessor; map `request_id` to
  `@request_id`, `service`/`env`/`version` to the reserved attributes.
* **IDs are strings.** Add a *Trace ID remapper* on `dd.trace_id` and a *Span ID remapper* on
  `dd.span_id` (they are 64-bit and overflow a JSON number or JavaScript double; the line already
  emits them quoted). Declare `@ad_user_id`, `@ad_client_id`, `@request_id`, `@frontend_trace_id`
  as **string** facets. Never cast them to numbers.
* `frontend_trace_id` is the W3C trace id from the browser; it is attribution and is only joined
  to RUM, it does not replace the APM trace id.
* Parsed logs stay logs. They are **not** converted into Product Analytics events.

## 6. Java APM prerequisites (pending, not claimed as configured)

CloudWatch logs alone are not Java APM. For a RUM resource to link to a Java trace and its log:

1. `dd-java-agent` attached to Tomcat (`-javaagent:...`) with `DD_SERVICE`, `DD_ENV`, `DD_VERSION`
   and `DD_LOGS_INJECTION=true` (writes `dd.trace_id`/`dd.span_id` into the log4j2 context), or an
   OTel collector with compatible W3C propagation. Neither is enabled by this change.
2. Browser: `VITE_DATADOG_TRACE_API_BASES` set to the NEO API origin(s) so RUM injects trace
   headers on those requests, and `VITE_DATADOG_TRACE_SAMPLE_RATE` (default 20).
3. CORS: the API must allow the tracing headers (`traceparent`, `tracestate`, `x-datadog-*`) in
   `Access-Control-Allow-Headers` for cross-origin calls, and any proxy / CloudFront / ALB must
   forward them and `X-Etendo-Feature` / `X-Request-Id` untouched (see `cloudfront-alb-routing.md`).
   Same-origin deployments need no preflight.
4. Sampling: APM head sampling decides the trace; a request not sampled still logs
   `neo_request` (without `dd.*`), so a log can exist without a trace.

## 7. Analytics, adoption and cardinality

**Adoption denominator (explicit):** distinct `ad_user_id` with `session_started` in the period, in
the same tenant (`ad_client_id`), excluding internal and support sessions (`internal`,
`support_session`). Adoption of a feature = distinct users with `feature_opened` for its key over
that denominator. Tenant adoption = distinct tenants with the feature over tenants active
(`session_started`) in the period.

| Metric | Query (Mixpanel Product Analytics) |
|---|---|
| Unique active users | unique `distinct_id`, `feature_opened`, by `featureKey` |
| Frequency | average `feature_opened` per active user per week |
| Retention | `feature_opened` (same key) retention by week |
| Funnel | `feature_opened` -> `record_created` / `document_completed`, same `featureKey` / `entity` |

**Cardinality rules.** User and tenant ids are **not** tags on custom Datadog timeseries/metrics.
Metrics carry `featureKey`, `outcome`, `operation`, `env` only (about 100 keys). Per-user and
per-tenant views are **scoped event/log queries** (Mixpanel breakdown, Datadog Logs Analytics
filtered by `@ad_client_id` / `@ad_user_id`, optionally with a log-based metric limited to
`feature_key`). The opaque ids stay on events and logs for correlation.

**Sampling.** Product events: not sampled. RUM sessions: `VITE_DATADOG_SESSION_SAMPLE_RATE`; RUM
resources/traces: `VITE_DATADOG_TRACE_SAMPLE_RATE`; `neo_request` lines: not sampled (one per
feature-tagged request; set a Datadog index exclusion filter if volume requires it).

## 8. Dashboards

`docs/ops/dashboards/feature-usage.dashboard.json` is a Datadog dashboard definition with
template variables `feature`, `tenant`, `user` (log scoped), and widgets: interactions per feature (RUM; opens come from `feature_opened` in Mixpanel),
requests / errors / rollbacks / p95 latency per feature (logs), and per-tenant and per-user feature
breakdowns (log analytics, scoped, no custom-metric tags). **Pending import**: no Datadog
credentials were available, so it has not been created or rendered. The Mixpanel boards
(adoption, frequency, retention, funnel) are built from the queries in section 7.

## 9. External evidence status

| Evidence | Status |
|---|---|
| Deterministic tests (menu, direct URL, missing context, tabs, concurrency, identity switch/logout, failure/rollback, MDC cleanup, trusted origins) | Done: core `featureContext.test.js`, app-shell `featureCatalog.vitest.js`, `featureUsage.vitest.js`, `ObservabilityRouteTracker.vitest.jsx`, backend `NeoRequestContextFilterTest` |
| Live RUM resource -> Java APM trace -> CloudWatch-forwarded log | **Pending**: needs Datadog credentials, the Java agent on Tomcat and the Forwarder |
| Dashboard rendered with live data | **Pending** (definition committed) |
| Product Analytics server intake for server-side funnel steps | Optional follow-up, not included |
