# 10 -- Production Observability

Monitoring, logging, alerting, and dashboards for Schema Forge generated modules running on the Etendo platform.

---

## 1. Current State: Level 0

| Capability | Status |
|-----------|--------|
| Structured logging | None. Tomcat writes to `catalina.out` (unstructured) |
| Metrics collection | None. No JMX export, no Prometheus endpoint |
| Alerting | None. Failures discovered by user reports |
| Health checks | None. No endpoint to verify system health |
| Distributed tracing | None. No request correlation across components |
| Log aggregation | None. Logs exist only on the server filesystem |
| Dashboards | None |

**Log file locations (default Etendo/Tomcat installation):**

| File | Contents |
|------|----------|
| `$CATALINA_HOME/logs/catalina.out` | Tomcat stdout/stderr, application logs via log4j2 |
| `$CATALINA_HOME/logs/localhost.YYYY-MM-DD.log` | Web application deployment events |
| `/var/log/postgresql/postgresql-14-main.log` | PostgreSQL query logs, errors, slow queries |
| `/var/log/nginx/access.log` | HTTP request log (if nginx reverse proxy is used) |
| `/var/log/nginx/error.log` | nginx errors |

---

## 2. Target Architecture

Five layers, each building on the previous one. Implement in order.

```
Layer 5: Dashboards          (visualize everything)
Layer 4: Alerting             (notify on anomalies)
Layer 3: Metrics              (quantify behavior)
Layer 2: Structured Logging   (understand events)
Layer 1: Health Checks        (is the system alive?)
```

---

## 3. Layer 1: Health Checks

Three endpoints, each serving a different purpose.

### 3.1 Liveness: `GET /health/live`

**Purpose:** Is the JVM process alive and responding to HTTP requests?

**Response:**
```json
{ "status": "UP" }
```

**Implementation:** A minimal servlet or RequestHandler that returns 200 immediately. No database calls, no dependency checks. If this endpoint does not respond, the process is dead or hung.

**Used by:** Process manager (systemd), load balancer (basic check).

### 3.2 Readiness: `GET /health/ready`

**Purpose:** Is the application ready to serve traffic? (After startup, DB connections established, modules loaded.)

**Response:**
```json
{
  "status": "UP",
  "checks": {
    "database": "UP",
    "moduleLoaded": true,
    "startupComplete": true
  }
}
```

**Implementation:** Verify that a simple query (`SELECT 1`) succeeds against PostgreSQL, and that the generated module's AD_Module record exists in the database.

**Used by:** Load balancer (only route traffic after readiness), deployment scripts (wait for readiness after restart).

### 3.3 Full Health: `GET /health`

**Purpose:** Comprehensive system health for operators and dashboards.

**Response:**
```json
{
  "status": "UP",
  "timestamp": "2026-03-11T14:30:00Z",
  "checks": {
    "database": {
      "status": "UP",
      "responseTimeMs": 3
    },
    "connectionPool": {
      "status": "UP",
      "active": 12,
      "idle": 38,
      "max": 50
    },
    "diskSpace": {
      "status": "UP",
      "freeBytes": 52428800000,
      "totalBytes": 107374182400,
      "usagePercent": 51
    },
    "jvm": {
      "heapUsedMb": 412,
      "heapMaxMb": 2048,
      "gcPausesLastMinute": 2
    }
  }
}
```

**Status logic:**
- `UP`: all checks pass
- `DEGRADED`: non-critical check failing (e.g., disk above 80%)
- `DOWN`: critical check failing (e.g., database unreachable)

**Used by:** Monitoring dashboards, external uptime services, on-call engineers.

### 3.4 Implementation Notes

The health endpoints should be implemented as a standard Etendo `HttpBaseServlet` mapped to `/health/*`. They must not require authentication (they are called by load balancers and monitoring tools).

```java
// Simplified structure
@WebServlet("/health/*")
public class HealthServlet extends HttpServlet {
  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
    String path = req.getPathInfo();
    if ("/live".equals(path)) {
      // Return 200 immediately
    } else if ("/ready".equals(path)) {
      // Check DB + module loaded
    } else {
      // Full health check
    }
  }
}
```

---

## 4. Layer 2: Structured Logging

### 4.1 Log Format

All logs from generated code (RequestHandlers, EventHandlers, DalProcesses) should use JSON format:

```json
{
  "timestamp": "2026-03-11T14:30:00.123Z",
  "level": "INFO",
  "logger": "com.etendoerp.go.salesorder.api.v1.SalesOrderHandler",
  "requestId": "req-a1b2c3d4",
  "userId": "100",
  "orgId": "0",
  "action": "GET_LIST",
  "entity": "SalesOrder",
  "durationMs": 45,
  "resultCount": 25,
  "message": "List query completed"
}
```

### 4.2 Log Fields

| Field | Source | Purpose |
|-------|--------|---------|
| `timestamp` | System clock (ISO 8601 with milliseconds) | Temporal ordering |
| `level` | log4j2 level | Severity filtering |
| `logger` | Java class name | Component identification |
| `requestId` | Generated UUID per HTTP request | Correlation across log entries for one request |
| `userId` | `OBContext.getOBContext().getUser().getId()` | Identify which user triggered the action |
| `orgId` | `OBContext.getOBContext().getCurrentOrganization().getId()` | Multi-org filtering |
| `action` | Application code (GET_LIST, GET_BY_ID, SAVE, DELETE, PROCESS) | Operation type |
| `entity` | Application code | Which business entity |
| `durationMs` | `System.currentTimeMillis()` diff | Performance tracking |
| `error` | Exception message + class (if applicable) | Error diagnosis |
| `stackTrace` | Exception stack trace (ERROR level only) | Root cause analysis |

### 4.3 Request ID Correlation

Every HTTP request gets a unique `requestId` at the RequestHandler entry point. This ID is passed through to EventHandlers and DalProcesses via a ThreadLocal or MDC (Mapped Diagnostic Context in log4j2).

```
[req-a1b2c3d4] RequestHandler: POST /salesorder/save
[req-a1b2c3d4] EventHandler: beforeSave triggered for SalesOrder
[req-a1b2c3d4] EventHandler: derived documentNo = SO-2026-00142
[req-a1b2c3d4] EventHandler: derived totalAmount = 1500.00
[req-a1b2c3d4] RequestHandler: save completed in 120ms
```

This allows tracing one user action across all components.

### 4.4 Log Levels

| Level | When to Use | Example |
|-------|------------|---------|
| **ERROR** | Operation failed, user impact | Unhandled exception in RequestHandler, DB connection failure |
| **WARN** | Degraded but functional | Connection pool above 80%, slow query (>1s), deprecated API version called |
| **INFO** | Normal operations worth recording | Request completed (with duration), process executed, session created |
| **DEBUG** | Development/troubleshooting detail | EventHandler field derivation steps, HQL query text, entity field values |

**Production log level: INFO.** Switch to DEBUG only for active troubleshooting.

### 4.5 Integration with Etendo Logging

Etendo uses log4j2 (configured via `log4j2-web.xml` or `log4j2.properties`). The generated module's loggers should:

1. Use the module's package prefix: `com.etendoerp.go.{window}.*`
2. Configure a JSON appender for structured output
3. Route to a separate log file: `logs/schemaforge-{window}.log`
4. Keep the default Etendo logging configuration unchanged

```xml
<!-- Example log4j2 appender for generated module -->
<RollingFile name="SchemaForgeLog"
  fileName="logs/schemaforge-salesorder.log"
  filePattern="logs/schemaforge-salesorder-%d{yyyy-MM-dd}.log.gz">
  <JsonLayout compact="true" eventEol="true" />
  <Policies>
    <TimeBasedTriggeringPolicy interval="1" />
    <SizeBasedTriggeringPolicy size="100MB" />
  </Policies>
  <DefaultRolloverStrategy max="30" />
</RollingFile>
```

### 4.6 Transactional Email Logging

Email contract logs must be structured and redacted. Include `requestId`, `auditId`, `contract`, `version`, `tenantId`, `userId`, `recordId` when applicable, `status`, `throttleBucket`, `providerStatus`, and `durationMs`.

Do not log provider API keys, reset tokens, raw custom HTML, full message bodies, or secrets derived from provider configuration. See [../ops/transactional-email-security.md](../ops/transactional-email-security.md).

The Etendo Go email executor emits one terminal observability event for each
contract attempt. The default implementation writes redacted structured logs;
future sinks can forward the same event to Prometheus, OpenTelemetry, or another
metrics backend. Events include `recipientDomain` and `recipientHash` instead of
the raw destination address, plus optional `providerDurationMs`,
`throttleScope`, `killSwitchScope`, and `errorClass`.

---

## 5. Layer 3: Metrics

### 5.1 Application Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `sf_api_request_duration_seconds` | Histogram | endpoint, method, status | API response time distribution (p50, p95, p99) |
| `sf_api_request_total` | Counter | endpoint, method, status | Total request count, error rate calculation |
| `sf_api_active_requests` | Gauge | endpoint | Currently in-flight requests |
| `sf_eventhandler_duration_seconds` | Histogram | entity, event_type | EventHandler execution time |
| `sf_process_duration_seconds` | Histogram | process_name, status | DalProcess execution time |
| `sf_active_sessions` | Gauge | -- | Number of active AD_Session records |

### 5.2 Transactional Email Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `sf_email_send_total` | Counter | contract, version, tenant, status | Send outcomes and error rate |
| `sf_email_provider_duration_seconds` | Histogram | provider, contract, status | Provider latency and timeout behavior |
| `sf_email_throttle_total` | Counter | contract, tenant, throttle_bucket | Abuse control visibility |
| `sf_email_duplicate_total` | Counter | contract, tenant | Idempotency effectiveness |
| `sf_email_suppression_total` | Counter | contract, tenant, reason | Bounce, complaint, and manual suppression impact |
| `sf_email_kill_switch_total` | Counter | scope, contract, tenant | Kill switch activations |
| `sf_email_provider_error_total` | Counter | provider, contract, error_class | Provider failure analysis |

Implementation notes:

- `sf_email_send_total` is emitted for every terminal executor outcome,
  including validation failures before provider submission.
- `sf_email_provider_duration_seconds` is emitted only when a provider call is
  attempted.
- `sf_email_provider_error_total` distinguishes provider rejection,
  unconfigured provider, and transport/serialization failures through
  `error_class`.
- `sf_email_throttle_total`, `sf_email_duplicate_total`,
  `sf_email_suppression_total`, and `sf_email_kill_switch_total` are derived
  from the same terminal event, so dashboards can correlate controls without
  joining separate logs.
- Keep recipient-level analysis in logs with `recipientHash`; do not create
  high-cardinality metrics labels for raw recipients.

### 5.3 Infrastructure Metrics

| Metric | Source | Purpose |
|--------|--------|---------|
| JVM heap usage, GC pauses | JMX (via Prometheus JMX exporter) | Memory health, GC tuning |
| Tomcat thread pool (active, max, queue) | JMX | Thread exhaustion detection |
| HikariCP pool (active, idle, pending, max) | JMX or HikariCP metrics | Connection pool health |
| PostgreSQL connections, query time, lock waits | `pg_stat_activity`, `pg_stat_statements` | Database health |
| Disk usage, CPU, memory | Node exporter (Prometheus) | System resource monitoring |

### 5.4 Business Metrics

| Metric | Purpose |
|--------|---------|
| Records created/updated per window per hour | Usage patterns, peak detection |
| Most active windows | Prioritize performance optimization |
| Process execution frequency | Identify heavy processes |
| User session duration | Engagement, session timeout tuning |
| Error rate per window | Identify problematic windows |

### 5.5 Metric Exposition

**Recommended approach:** Prometheus JMX exporter (sidecar or javaagent) for JVM/Tomcat/HikariCP metrics. Custom Prometheus servlet endpoint (`/metrics`) for application metrics using the Prometheus Java client library.

```
# Prometheus scrape config
scrape_configs:
  - job_name: 'etendo-schemaforge'
    scrape_interval: 15s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['etendo-server:8080']
```

---

## 6. Layer 4: Alerting

### 6.1 Alert Definitions

| Severity | Condition | Action |
|----------|-----------|--------|
| **CRITICAL** | `/health` returns DOWN or unreachable for > 2 min | Page on-call engineer immediately |
| **CRITICAL** | API error rate (5xx) > 5% for 5 minutes | Page on-call engineer |
| **CRITICAL** | Disk usage > 90% | Page on-call engineer |
| **CRITICAL** | PostgreSQL unreachable | Page on-call engineer |
| **WARNING** | API p95 response time > 2 seconds for 10 minutes | Notify ops channel |
| **WARNING** | HikariCP pool utilization > 80% for 5 minutes | Notify ops channel |
| **WARNING** | JVM heap usage > 85% for 10 minutes | Notify ops channel |
| **WARNING** | Disk usage > 80% | Notify ops channel |
| **WARNING** | GC pause > 500ms | Notify ops channel |
| **WARNING** | Email provider failure rate above threshold for 5 minutes | Notify ops channel and check email runbook |
| **WARNING** | Email throttle or suppression spike for one tenant/contract | Notify ops channel and investigate abuse or misconfiguration |
| **INFO** | Email kill switch activated | Notify ops channel with scope and actor |
| **INFO** | Deployment completed (health check transitions DOWN -> UP) | Notify ops channel |
| **INFO** | Unusual session spike (>2x normal for time of day) | Log for review |

### 6.2 Alert Routing

| Severity | Channel | Response Time |
|----------|---------|--------------|
| CRITICAL | PagerDuty / SMS / phone call | < 15 minutes |
| WARNING | Slack #ops-alerts | < 1 hour (business hours) |
| INFO | Slack #ops-info | Review next business day |

### 6.3 Alert Fatigue Prevention

- Do not alert on single transient errors (use sustained thresholds)
- Group related alerts (DB down + API errors = one incident, not two)
- Review and tune alert thresholds monthly based on actual traffic patterns
- Every alert must have a documented runbook (what to check, how to fix)

---

## 7. Layer 5: Dashboards

### 7.1 Operational Dashboard

**Audience:** On-call engineer, ops team.

Panels:
1. **Health status** -- green/yellow/red for each health check component
2. **API error rate** -- time series, last 24 hours, broken down by endpoint
3. **API response time** -- p50, p95, p99 time series
4. **Active sessions** -- current count vs. historical average
5. **Connection pool** -- active/idle/pending connections
6. **JVM memory** -- heap used vs. max, GC pauses
7. **Disk usage** -- percentage with threshold lines at 80% and 90%

### 7.2 Business Dashboard

**Audience:** Product owner, business stakeholders.

Panels:
1. **Records per window per day** -- bar chart showing most active areas
2. **User activity** -- unique users per hour, session duration distribution
3. **Process executions** -- count per process, success/failure rate
4. **Peak hours** -- heatmap of activity by hour and day of week
5. **Error impact** -- which windows/processes have the most user-facing errors

### 7.3 SRE Dashboard

**Audience:** Reliability engineering.

Panels:
1. **SLI: Availability** -- percentage of successful health checks over rolling 30 days
2. **SLI: Latency** -- percentage of requests under 1s (target: 95%)
3. **Error budget** -- remaining error budget for the month
4. **Deployment markers** -- vertical lines on time series showing when deployments occurred
5. **Incident log** -- recent alerts with resolution time

---

## 8. Implementation Options

| Tool | Purpose | Complexity | Cost | Notes |
|------|---------|-----------|------|-------|
| **Prometheus + Grafana** | Metrics + dashboards | Medium | Free (self-hosted) | Industry standard. Good JMX integration. Requires server to run Prometheus and Grafana |
| **ELK Stack** (Elasticsearch + Logstash + Kibana) | Centralized logging + search | High | Free (self-hosted) | Powerful but resource-heavy. Consider Loki as a lighter alternative for log aggregation |
| **Grafana Loki** | Log aggregation | Medium | Free (self-hosted) | Pairs with Grafana. Lighter than ELK. Good for structured JSON logs |
| **Datadog / New Relic** | All-in-one (metrics, logs, APM) | Low | $$-$$$ per month | Fastest to deploy, highest ongoing cost. Good if ops team is small |
| **Uptime Robot / Pingdom** | External health checks | Very low | Free tier available | Can monitor `/health` endpoint from outside the network. Good starting point |
| **Simple JSON logs + scripts** | MVP monitoring | Low | Free | Parse JSON logs with `jq`, alert with cron scripts. Not scalable but works for small deployments |

---

## 9. Recommended Phased Approach

### Phase 1: Basics (Week 1-2)

| Task | Effort | Impact |
|------|--------|--------|
| Implement `/health`, `/health/ready`, `/health/live` endpoints | 1 day | Enables all monitoring |
| Configure external uptime monitoring (Uptime Robot free tier) | 1 hour | Immediate availability alerts via email/SMS |
| Switch generated code to JSON log format (log4j2 JsonLayout) | 1 day | Enables log parsing and aggregation |
| Add `requestId` MDC to RequestHandlers | 0.5 day | Request correlation |

**Outcome:** You know within 2 minutes when the system goes down. You can search logs by requestId.

### Phase 2: Metrics (Week 3-4)

| Task | Effort | Impact |
|------|--------|--------|
| Deploy Prometheus + Grafana (single server or Docker Compose) | 0.5 day | Metrics infrastructure ready |
| Attach JMX exporter to Tomcat | 1 hour | JVM, thread pool, HikariCP metrics |
| Add Prometheus client to generated RequestHandlers | 1 day | API response time and error rate metrics |
| Create operational Grafana dashboard | 0.5 day | Visual monitoring |
| Configure PostgreSQL `pg_stat_statements` | 1 hour | Query performance visibility |

**Outcome:** You can see response times, error rates, and resource utilization in real time.

### Phase 3: Alerting (Month 2)

| Task | Effort | Impact |
|------|--------|--------|
| Configure Grafana alerting rules (from section 6.1) | 1 day | Proactive issue detection |
| Set up alert routing (Slack + PagerDuty or email) | 0.5 day | On-call notification |
| Write runbooks for each alert | 2 days | Faster incident resolution |
| Log aggregation (Loki or ELK) | 1-2 days | Centralized log search |

**Outcome:** On-call engineers are notified before users report issues. Incidents have documented resolution steps.

### Phase 4: Maturity (Month 3+)

| Task | Effort | Impact |
|------|--------|--------|
| Business metrics dashboard | 1 day | Product visibility |
| SRE dashboard with SLI/SLO tracking | 1 day | Reliability engineering |
| Custom application metrics (EventHandler duration, process execution) | 1 day | Deeper performance insight |
| Alert tuning based on real traffic patterns | Ongoing | Reduce alert fatigue |

**Outcome:** Full operational visibility. Data-driven capacity planning. Reliability targets tracked and measured.
